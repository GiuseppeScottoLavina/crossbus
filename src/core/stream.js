/** Chunked streams with optional consumption acknowledgements and bounded readers. */
import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../common/types.js';
import { uuid, deferred, assertPayloadSize } from '../common/utils.js';
import { viewStorage, storageLength } from '../common/buffer-storage.js';
import { FLOW_VERSION, StreamWindow, positiveInteger, streamFailure } from './stream-flow.js';

// Optional standard APIs; older engines keep the canonical btoa/atob path.
const nativeBase64Encode = /** @type {Uint8Array & {toBase64?:()=>string}} */ (Uint8Array.prototype)
    .toBase64;
const nativeBase64Decode =
    /** @type {typeof Uint8Array & {fromBase64?:(value:string)=>Uint8Array}} */ (Uint8Array)
        .fromBase64;

/**
 * @typedef {Object} StreamOptions
 * @property {number} [chunkSize=64000] - Raw binary bytes or UTF-16 code units per chunk.
 * @property {Object} [meta]
 * @property {boolean} [flowControl=false] - Require a compatible manager to acknowledge consumption.
 * @property {number} [windowSize=16] - Maximum unconsumed chunks with flow control.
 * @property {number} [ackTimeout=30000] - Maximum wait without acknowledgement progress; zero disables.
 * @property {number} [timeout=0] - Total lifetime from opening, in milliseconds; zero disables.
 * @property {AbortSignal} [signal]
 * @property {'base64'|'native'} [binaryEncoding='base64'] - Native requires structured clone.
 * @property {(error:Error|null)=>void} [onClose]
 */
export class WritableSignalStream {
    #streamId = uuid();
    #name;
    #sendFn;
    #options;
    #seq = 0;
    #opened = false;
    #ended = false;
    #endRequested = false;
    /** @type {Error|null} */
    #failure = null;
    #tail = Promise.resolve();
    #cancelled = deferred();
    /** @type {Promise<void>|null} */
    #endPromise = null;
    /** @type {StreamWindow|null} */
    #window = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #timer = null;
    #abortListener = () => {
        void this.abort('Stream aborted by signal').catch(() => {});
    };

    /** @param {Function} sendFn @param {string} name @param {StreamOptions} [options] */
    constructor(sendFn, name, options = {}) {
        if (typeof sendFn !== 'function') throw new TypeError('sendFn must be a function');
        if (typeof name !== 'string' || !name) throw new TypeError('Stream name is required');
        this.#name = name;
        this.#sendFn = sendFn;
        this.#cancelled.promise.catch(() => {});
        this.#options = {
            ...options,
            chunkSize: positiveInteger(options.chunkSize ?? 64000, 'chunkSize'),
            timeout: positiveInteger(options.timeout ?? 0, 'timeout', true),
            binaryEncoding: options.binaryEncoding ?? 'base64'
        };
        if (!['base64', 'native'].includes(this.#options.binaryEncoding))
            throw new TypeError('Unknown binaryEncoding');
        if (options.flowControl)
            this.#window = new StreamWindow(options.windowSize ?? 16, options.ackTimeout ?? 30000);
        if (options.signal?.aborted) throw streamFailure('Stream aborted by signal');
        options.signal?.addEventListener('abort', this.#abortListener, { once: true });
    }
    get streamId() {
        return this.#streamId;
    }
    get name() {
        return this.#name;
    }
    get ended() {
        return this.#ended;
    }
    /** @param {Object} [meta] @returns {Promise<void>} */
    open(meta) {
        return this.#schedule(() => this.#open(meta));
    }
    async #open(meta) {
        if (this.#opened) return;
        this.#opened = true;
        this.#window?.start();
        if (this.#options.timeout)
            this.#timer = setTimeout(() => {
                this.#fail(streamFailure('Stream lifetime timed out', 'ERR_STREAM_TIMEOUT'));
                void this.#notifyError('Stream lifetime timed out');
            }, this.#options.timeout);
        /** @type {Object} */
        const payload = {
            st: this.#window ? 'open-flow' : 'open',
            name: this.#name,
            meta: { ...this.#options.meta, ...meta }
        };
        if (this.#window) payload.flow = FLOW_VERSION;
        await this.#send(payload);
        if (this.#window) await this.#window.ready();
    }
    /** Input remains caller-owned until this resolves. @param {string|ArrayBuffer|Uint8Array|Object} data */
    write(data) {
        if (this.#endRequested || this.#ended)
            return Promise.reject(this.#failure ?? new Error('Stream already ended'));
        return this.#schedule(async () => {
            if (!this.#opened) await this.#open();
            const size = this.#options.chunkSize;
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                for (let offset = 0; offset < bytes.length || offset === 0; offset += size) {
                    const chunk = bytes.subarray(offset, offset + size);
                    // Exact owned storage avoids repeatedly cloning the entire
                    // source allocation and permits application transfer lists.
                    await this.#data(
                        this.#options.binaryEncoding === 'native'
                            ? chunk.slice()
                            : encodeBase64(chunk),
                        this.#options.binaryEncoding !== 'native'
                    );
                }
            } else if (typeof data === 'string') {
                for (let offset = 0; offset < data.length; offset += size)
                    await this.#data(data.slice(offset, offset + size), false);
            } else {
                const encoded = JSON.stringify(data);
                if (typeof encoded !== 'string')
                    throw new TypeError('Stream data must be serializable');
                await this.#data(encoded, false);
            }
        });
    }
    #data(data, b64) {
        if (this.#window && !this.#window.hasCredit)
            return this.#window.credit().then(() => this.#data(data, b64));
        if (this.#failure) return Promise.reject(this.#failure);
        const seq = this.#seq++;
        this.#window?.sent();
        return this.#send({ st: 'data', seq, d: data, b64 });
    }
    /** Flow-controlled end waits until every chunk is pulled. @param {Object} [meta] */
    end(meta) {
        if (this.#endPromise) return this.#endPromise;
        if (this.#ended) return this.#failure ? Promise.reject(this.#failure) : Promise.resolve();
        this.#endRequested = true;
        this.#endPromise = this.#schedule(async () => {
            if (!this.#opened) await this.#open();
            this.#window?.close();
            await this.#send({ st: 'end', seq: this.#seq, meta });
            if (this.#window) await this.#window.ended();
            this.#finish(null);
        });
        return this.#endPromise;
    }
    /** @param {string} [reason] */
    async abort(reason = 'Stream aborted') {
        if (this.#ended) return;
        this.#fail(streamFailure(reason));
        void this.#notifyError(reason);
    }
    /** Bind only to the authenticated receiver, or use StreamManager. @param {Object} message */
    handleMessage(message) {
        if (message.sid !== this.#streamId || message.t !== 'stream' || this.#ended) return;
        if (message.st === 'error')
            this.#fail(
                streamFailure(
                    typeof message.reason === 'string' ? message.reason : 'Remote stream failed'
                )
            );
        else if (message.st === 'ack') this.#window?.acknowledge(message);
    }
    #schedule(operation) {
        const result = this.#tail.then(async () => {
            if (this.#failure) throw this.#failure;
            if (this.#ended) throw new Error('Stream already ended');
            try {
                await Promise.race([operation(), this.#cancelled.promise]);
            } catch (error) {
                const failure = error instanceof Error ? error : new Error(String(error));
                this.#fail(failure);
                void this.#notifyError(failure.message);
                throw error;
            }
        });
        this.#tail = result.catch(() => {});
        return result;
    }
    #fail(error) {
        if (this.#ended) return;
        this.#failure = error;
        this.#cancelled.reject(error);
        this.#window?.fail(error);
        this.#finish(error);
    }
    #finish(error) {
        if (this.#ended) return;
        this.#ended = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#options.signal?.removeEventListener('abort', this.#abortListener);
        this.#options.onClose?.(error);
    }
    async #notifyError(reason) {
        try {
            await this.#send({ st: 'error', reason });
        } catch {
            /* Already terminal locally. */
        }
    }
    async #send(payload) {
        if (this.#failure && payload.st !== 'error') throw this.#failure;
        await this.#sendFn(streamFrame(this.#streamId, payload));
    }
}

/**
 * @typedef {Object} ReadableStreamOptions
 * @property {number} [maxBufferedChunks=1024]
 * @property {number} [maxBufferedBytes=8388608] - Queued and reordered backing storage / UTF-16 estimate.
 * @property {number} [maxOutOfOrderChunks=64]
 * @property {number} [idleTimeout=0] - No accepted data or consumption progress; zero disables.
 * @property {boolean} [flowControl=false]
 * @property {(message:Object)=>void} [acknowledge] - Authenticated-channel control callback.
 * @property {(error:Error|null)=>void} [onClose]
 */
export class ReadableSignalStream {
    #streamId;
    #name;
    #meta;
    #options;
    /** @type {any[]} */
    #buffer = [];
    /** @type {number[]} */
    #bufferSizes = [];
    #readIndex = 0;
    #expected = 0;
    #consumed = 0;
    #bufferedBytes = 0;
    #bufferedChunks = 0;
    #pending = new Map();
    /** @type {number|null} */
    #finalCount = null;
    #ended = false;
    #reading = false;
    #closed = false;
    /** @type {Error|null} */
    #error = null;
    /** @type {Function|null} */
    #resolveNext = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #timer = null;
    /** @param {string} streamId @param {string} name @param {Object} [meta] @param {ReadableStreamOptions} [options] */
    constructor(streamId, name, meta = {}, options = {}) {
        this.#streamId = streamId;
        this.#name = name;
        this.#meta = meta;
        this.#options = {
            ...options,
            maxBufferedChunks: positiveInteger(
                options.maxBufferedChunks ?? 1024,
                'maxBufferedChunks'
            ),
            maxBufferedBytes: positiveInteger(
                options.maxBufferedBytes ?? 8388608,
                'maxBufferedBytes'
            ),
            maxOutOfOrderChunks: positiveInteger(
                options.maxOutOfOrderChunks ?? 64,
                'maxOutOfOrderChunks',
                true
            ),
            idleTimeout: positiveInteger(options.idleTimeout ?? 0, 'idleTimeout', true)
        };
        this.#refresh();
    }
    get streamId() {
        return this.#streamId;
    }
    get name() {
        return this.#name;
    }
    get meta() {
        return this.#meta;
    }
    get ended() {
        return this.#ended;
    }
    get bufferedBytes() {
        return this.#bufferedBytes;
    }
    get bufferedChunks() {
        return this.#bufferedChunks;
    }
    /** Invalid input terminates and throws to a direct caller. @param {Object} message */
    push(message) {
        if (this.#ended) return;
        try {
            const seq = message.seq ?? (this.#options.flowControl ? NaN : this.#expected);
            if (!Number.isSafeInteger(seq) || seq < 0 || seq >= Number.MAX_SAFE_INTEGER)
                throw streamFailure('Invalid stream sequence', 'ERR_STREAM_SEQUENCE');
            if (seq < this.#expected || this.#pending.has(seq)) return;
            if (this.#finalCount !== null && seq >= this.#finalCount)
                throw streamFailure('Data exceeds declared stream end', 'ERR_STREAM_SEQUENCE');
            if (seq - this.#expected > this.#options.maxOutOfOrderChunks)
                throw streamFailure('Stream reorder window exceeded', 'ERR_STREAM_SEQUENCE');
            if (this.#bufferedChunks >= this.#options.maxBufferedChunks)
                throw streamFailure('Stream chunk buffer exceeded', 'ERR_STREAM_OVERFLOW');
            let data = message.d;
            if (message.b64) {
                if (typeof data !== 'string') throw new TypeError('Invalid base64 stream chunk');
                if (
                    data.length >
                    Math.ceil((this.#options.maxBufferedBytes - this.#bufferedBytes) / 3) * 4 + 4
                )
                    throw streamFailure('Stream byte buffer exceeded', 'ERR_STREAM_OVERFLOW');
                data = decodeBase64(data);
            }
            if (typeof data !== 'string' && !(data instanceof Uint8Array))
                throw new TypeError('Expected a string or Uint8Array chunk');
            const bytes = chunkBytes(data);
            if (bytes + this.#bufferedBytes > this.#options.maxBufferedBytes)
                throw streamFailure('Stream byte buffer exceeded', 'ERR_STREAM_OVERFLOW');
            this.#bufferedBytes += bytes;
            this.#bufferedChunks++;
            if (seq === this.#expected) {
                this.#buffer.push(data);
                this.#bufferSizes.push(bytes);
                this.#expected++;
                while (this.#pending.has(this.#expected)) {
                    const pending = this.#pending.get(this.#expected);
                    this.#buffer.push(pending.data);
                    this.#bufferSizes.push(pending.bytes);
                    this.#pending.delete(this.#expected++);
                }
            } else this.#pending.set(seq, { data, bytes });
            this.#refresh();
            this.#maybeEnd();
            this.#wake();
        } catch (error) {
            this.error(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }
    /** @param {Object} [meta] @param {number} [finalCount] */
    end(meta, finalCount) {
        if (this.#ended) return;
        const count = finalCount ?? this.#expected;
        if (
            !Number.isSafeInteger(count) ||
            count < this.#expected ||
            (this.#pending.size && finalCount === undefined) ||
            [...this.#pending.keys()].some((seq) => seq >= count) ||
            (this.#finalCount !== null && this.#finalCount !== count)
        ) {
            this.error(streamFailure('Invalid final stream sequence', 'ERR_STREAM_SEQUENCE'));
            return;
        }
        this.#finalCount = count;
        if (meta) this.#meta = { ...this.#meta, ...meta };
        this.#maybeEnd();
        this.#wake();
    }
    /** @param {string|Error} reason */
    error(reason) {
        if (this.#error || (this.#closed && !this.#bufferedChunks)) return;
        this.#error = reason instanceof Error ? reason : new Error(reason);
        this.#ended = true;
        this.#buffer = [];
        this.#bufferSizes = [];
        this.#pending.clear();
        this.#readIndex = 0;
        this.#bufferedBytes = this.#bufferedChunks = 0;
        this.#wake();
        this.#close(this.#error);
    }
    /** @param {string} [reason] */
    cancel(reason = 'Stream reader cancelled') {
        this.error(streamFailure(reason));
    }
    /** Credit means pulled, not application processing completed. @returns {AsyncIterableIterator<any>} */
    async *[Symbol.asyncIterator]() {
        if (this.#reading) throw new Error('Stream already has a reader');
        this.#reading = true;
        try {
            while (true) {
                if (this.#error) throw this.#error;
                while (this.#readIndex < this.#buffer.length) {
                    if (this.#error) throw this.#error;
                    const chunk = this.#buffer[this.#readIndex],
                        bytes = this.#bufferSizes[this.#readIndex];
                    this.#buffer[this.#readIndex] = undefined;
                    this.#bufferSizes[this.#readIndex++] = 0;
                    this.#bufferedBytes -= bytes;
                    this.#bufferedChunks--;
                    this.#consumed++;
                    if (this.#readIndex >= 1024 && this.#readIndex * 2 >= this.#buffer.length) {
                        this.#buffer = this.#buffer.slice(this.#readIndex);
                        this.#bufferSizes = this.#bufferSizes.slice(this.#readIndex);
                        this.#readIndex = 0;
                    }
                    this.#refresh();
                    this.#acknowledge();
                    yield chunk;
                }
                this.#buffer.length = 0;
                this.#bufferSizes.length = 0;
                this.#readIndex = 0;
                if (this.#ended) {
                    if (this.#error) throw this.#error;
                    return;
                }
                await new Promise((resolve) => {
                    this.#resolveNext = resolve;
                });
            }
        } finally {
            this.#reading = false;
            if (!this.#ended || this.#bufferedChunks || this.#pending.size)
                this.cancel('Stream reader stopped before completion');
        }
    }
    /** Collection allocates the complete result; iterate for bounded processing. @returns {Promise<Uint8Array|string>} */
    async collect() {
        const chunks = [];
        let binary;
        for await (const chunk of this) {
            const kind = chunk instanceof Uint8Array;
            if (binary !== undefined && binary !== kind)
                throw new TypeError('Cannot collect mixed binary and text chunks');
            binary = kind;
            chunks.push(chunk);
        }
        if (!binary) return chunks.join('');
        const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
    #maybeEnd() {
        if (this.#finalCount !== null && this.#expected === this.#finalCount) {
            this.#ended = true;
            if (!this.#options.flowControl) this.#close(null);
            else this.#acknowledge();
        }
    }
    #acknowledge() {
        if (!this.#options.flowControl || this.#error) return;
        const complete = this.#ended && this.#consumed === this.#finalCount;
        this.#options.acknowledge?.({
            st: 'ack',
            seq: this.#consumed,
            ...(complete ? { ended: true } : {})
        });
        if (complete) this.#close(null);
    }
    #wake() {
        const resolve = this.#resolveNext;
        this.#resolveNext = null;
        resolve?.();
    }
    #close(error) {
        if (this.#closed) return;
        this.#closed = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#options.onClose?.(error);
    }
    #refresh() {
        if (this.#closed || !this.#options.idleTimeout) return;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(
            () => this.error(streamFailure('Stream idle timeout', 'ERR_STREAM_TIMEOUT')),
            this.#options.idleTimeout
        );
    }
}
function chunkBytes(data) {
    return typeof data === 'string' ? data.length * 2 : storageLength(viewStorage(data));
}
function encodeBase64(bytes) {
    if (typeof nativeBase64Encode === 'function') return nativeBase64Encode.call(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function decodeBase64(value) {
    if (typeof nativeBase64Decode === 'function') return nativeBase64Decode.call(Uint8Array, value);
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
function streamFrame(sid, payload) {
    return {
        [PROTOCOL_MARKER]: PROTOCOL_VERSION,
        id: `${sid}:${payload.st}:${payload.seq ?? 'control'}`,
        t: 'stream',
        sid,
        ...payload
    };
}

/** @typedef {Pick<ReadableStreamOptions,'maxBufferedChunks'|'maxBufferedBytes'|'maxOutOfOrderChunks'|'idleTimeout'> & {maxIncomingStreams?:number,maxOutgoingStreams?:number,maxControlBytes?:number}} StreamManagerOptions */
export class StreamManager {
    #activeStreams = new Map();
    #outgoingStreams = new Map();
    #streamHandlers = new Map();
    #destroyed = false;
    #sendFn;
    #options;
    /** @param {Function} sendFn - (peerId,message)=>Promise on an authenticated channel. @param {StreamManagerOptions} [options] */
    constructor(sendFn, options = {}) {
        if (typeof sendFn !== 'function') throw new TypeError('sendFn must be a function');
        this.#sendFn = sendFn;
        this.#options = {
            maxIncomingStreams: positiveInteger(
                options.maxIncomingStreams ?? 100,
                'maxIncomingStreams'
            ),
            maxOutgoingStreams: positiveInteger(
                options.maxOutgoingStreams ?? 100,
                'maxOutgoingStreams'
            ),
            maxControlBytes: positiveInteger(options.maxControlBytes ?? 65536, 'maxControlBytes'),
            maxBufferedChunks: positiveInteger(
                options.maxBufferedChunks ?? 1024,
                'maxBufferedChunks'
            ),
            maxBufferedBytes: positiveInteger(
                options.maxBufferedBytes ?? 8388608,
                'maxBufferedBytes'
            ),
            maxOutOfOrderChunks: positiveInteger(
                options.maxOutOfOrderChunks ?? 64,
                'maxOutOfOrderChunks',
                true
            ),
            idleTimeout:
                options.idleTimeout === undefined
                    ? undefined
                    : positiveInteger(options.idleTimeout, 'idleTimeout', true)
        };
    }
    /** @param {string} name @param {string} peerId @param {StreamOptions} [options] */
    createStream(name, peerId, options = {}) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        if (typeof peerId !== 'string' || !peerId)
            throw new TypeError('Target peer ID is required');
        if (this.#outgoingStreams.size >= this.#options.maxOutgoingStreams)
            throw streamFailure('Outgoing stream limit exceeded', 'ERR_STREAM_OVERFLOW');
        const stream = new WritableSignalStream((message) => this.#send(peerId, message), name, {
            ...options,
            onClose: (error) => {
                this.#outgoingStreams.delete(stream.streamId);
                options.onClose?.(error);
            }
        });
        this.#outgoingStreams.set(stream.streamId, { peerId, stream });
        return stream;
    }
    /** @param {string} name @param {(stream:ReadableSignalStream)=>Promise<void>|void} handler */
    onStream(name, handler) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        if (typeof handler !== 'function') throw new TypeError('Stream handler must be a function');
        const registration = { handler };
        this.#streamHandlers.set(name, registration);
        return () =>
            this.#streamHandlers.get(name) === registration && this.#streamHandlers.delete(name);
    }
    /** peerId is the authenticated channel identity, never a payload field. @param {Object} message @param {string} peerId */
    handleMessage(message, peerId) {
        if (
            this.#destroyed ||
            !message ||
            message.t !== 'stream' ||
            typeof message.sid !== 'string' ||
            typeof peerId !== 'string'
        )
            return;
        const sid = message.sid;
        if (sid.length > 256) return;
        const outgoing = this.#outgoingStreams.get(sid);
        const active = this.#activeStreams.get(sid);
        if (message.st !== 'data') {
            try {
                assertPayloadSize(message, this.#options.maxControlBytes);
            } catch {
                const reason = 'Stream control payload exceeds budget';
                if (outgoing?.peerId === peerId)
                    outgoing.stream.handleMessage({ t: 'stream', sid, st: 'error', reason });
                if (active?.peerId === peerId) {
                    this.#activeStreams.delete(sid);
                    active.stream.error(reason);
                }
                // Never reflect malformed errors/ACKs and create a control loop.
                if (message.st !== 'error' && message.st !== 'ack')
                    this.#reject(peerId, sid, reason);
                return;
            }
        }
        if ((message.st === 'ack' || message.st === 'error') && outgoing?.peerId === peerId) {
            outgoing.stream.handleMessage(message);
            return;
        }
        if (message.st === 'open' || message.st === 'open-flow') {
            if (active || outgoing || typeof message.name !== 'string') return;
            if (this.#activeStreams.size >= this.#options.maxIncomingStreams) {
                this.#reject(peerId, sid, 'Incoming stream limit exceeded');
                return;
            }
            const handler = this.#streamHandlers.get(message.name)?.handler;
            if (!handler) {
                this.#reject(peerId, sid, 'No handler for stream');
                return;
            }
            const flow = message.st === 'open-flow';
            if (flow ? message.flow !== FLOW_VERSION : message.flow !== undefined) {
                this.#reject(peerId, sid, 'Unsupported stream flow version');
                return;
            }
            const stream = new ReadableSignalStream(sid, message.name, message.meta, {
                ...this.#options,
                flowControl: flow,
                idleTimeout: this.#options.idleTimeout ?? (flow ? 30000 : 0),
                acknowledge: (ack) => {
                    void this.#send(peerId, {
                        _cb: 1,
                        t: 'stream',
                        sid,
                        flow: FLOW_VERSION,
                        ...ack
                    }).catch((error) => stream.error(error));
                },
                onClose: (error) => {
                    if (this.#activeStreams.get(sid)?.stream !== stream) return;
                    this.#activeStreams.delete(sid);
                    if (error) this.#reject(peerId, sid, error.message);
                }
            });
            this.#activeStreams.set(sid, { peerId, stream });
            if (flow)
                void this.#send(peerId, {
                    _cb: 1,
                    t: 'stream',
                    sid,
                    flow: FLOW_VERSION,
                    st: 'ack',
                    seq: 0,
                    ready: true
                }).catch((error) => stream.error(error));
            try {
                Promise.resolve(handler(stream)).catch((error) =>
                    stream.error(error instanceof Error ? error : new Error(String(error)))
                );
            } catch (error) {
                stream.error(error instanceof Error ? error : new Error(String(error)));
            }
            return;
        }
        if (!active || active.peerId !== peerId) return;
        if (message.st === 'data') {
            try {
                active.stream.push(message);
            } catch {
                /* push already terminates and reports. */
            }
        } else if (message.st === 'end') active.stream.end(message.meta, message.seq);
        else if (message.st === 'error') {
            this.#activeStreams.delete(sid);
            active.stream.error(
                typeof message.reason === 'string' ? message.reason : 'Remote stream failed'
            );
        }
    }
    #reject(peerId, sid, reason) {
        void this.#send(peerId, { _cb: 1, t: 'stream', sid, st: 'error', reason }).catch(() => {});
    }
    async #send(peerId, message) {
        if (this.#destroyed) throw new Error('Stream manager destroyed');
        await this.#sendFn(peerId, message.id ? message : streamFrame(message.sid, message));
    }
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        for (const { stream } of this.#activeStreams.values())
            stream.error('Stream manager destroyed');
        for (const { stream } of this.#outgoingStreams.values())
            void stream.abort('Stream manager destroyed').catch(() => {});
        this.#activeStreams.clear();
        this.#outgoingStreams.clear();
        this.#streamHandlers.clear();
    }
    get activeStreamCount() {
        return this.#activeStreams.size;
    }
    get outgoingStreamCount() {
        return this.#outgoingStreams.size;
    }
}
