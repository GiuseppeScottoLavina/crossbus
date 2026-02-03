/**
 * @fileoverview Streaming support for CrossBus.
 * Enables efficient transfer of large payloads (files, LLM responses) via chunked messages.
 * @module core/stream
 */

import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../common/types.js';
import { uuid } from '../common/utils.js';

/**
 * @typedef {Object} StreamOptions
 * @property {number} [chunkSize=64000] - Size of each chunk in bytes.
 * @property {number} [timeout=30000] - Timeout for stream operations in ms.
 */

/**
 * @typedef {Object} StreamMeta
 * @property {string} streamId - Unique stream identifier.
 * @property {string} name - Stream name/type.
 * @property {number} [totalSize] - Total size if known.
 * @property {string} [contentType] - MIME type if applicable.
 * @property {Object} [meta] - Additional metadata.
 */

/**
 * @typedef {'open' | 'data' | 'end' | 'error' | 'ack'} StreamMessageType
 */

/**
 * Writable stream for sending large payloads in chunks.
 * 
 * @example
 * const stream = new WritableSignalStream(sendFn, 'upload', {
 *   meta: { filename: 'data.json' }
 * });
 * 
 * for await (const chunk of readFile(file)) {
 *   await stream.write(chunk);
 * }
 * await stream.end();
 */
export class WritableSignalStream {
    /** @type {string} */
    #streamId;

    /** @type {string} */
    #name;

    /** @type {Function} */
    #sendFn;

    /** @type {number} */
    #chunkSize;

    /** @type {number} */
    #seq = 0;

    /** @type {boolean} */
    #ended = false;

    /** @type {boolean} */
    #opened = false;

    /** @type {Object} */
    #meta;

    /**
     * Creates a new writable stream.
     * 
     * @param {Function} sendFn - Function to send messages.
     * @param {string} name - Stream name/type identifier.
     * @param {StreamOptions & { meta?: Object }} [options={}] - Options.
     */
    constructor(sendFn, name, options = {}) {
        this.#streamId = uuid();
        this.#name = name;
        this.#sendFn = sendFn;
        this.#chunkSize = options.chunkSize ?? 64000;
        this.#meta = options.meta ?? {};
    }

    /**
     * Gets the stream ID.
     * @returns {string}
     */
    get streamId() {
        return this.#streamId;
    }

    /**
     * Gets the stream name.
     * @returns {string}
     */
    get name() {
        return this.#name;
    }

    /**
     * Opens the stream (called automatically on first write).
     * 
     * @param {Object} [meta] - Additional metadata.
     * @returns {Promise<void>}
     */
    async open(meta) {
        if (this.#opened) return;

        this.#opened = true;

        await this.#send({
            st: 'open',
            name: this.#name,
            meta: { ...this.#meta, ...meta }
        });
    }

    /**
     * Writes data to the stream.
     * 
     * @param {string | ArrayBuffer | Uint8Array | Object} data - Data to write.
     * @returns {Promise<void>}
     */
    async write(data) {
        if (this.#ended) {
            throw new Error('Stream already ended');
        }

        if (!this.#opened) {
            await this.open();
        }

        // Convert data to sendable format
        let payload;
        let isBase64 = false;

        if (data instanceof ArrayBuffer) {
            payload = this.#arrayBufferToBase64(new Uint8Array(data));
            isBase64 = true;
        } else if (data instanceof Uint8Array) {
            payload = this.#arrayBufferToBase64(data);
            isBase64 = true;
        } else if (typeof data === 'string') {
            // String data - chunk if needed
            const chunks = this.#chunkString(data, this.#chunkSize);
            for (const chunk of chunks) {
                await this.#send({
                    st: 'data',
                    seq: this.#seq++,
                    d: chunk,
                    b64: false
                });
            }
            return;
        } else {
            // Object - serialize to JSON
            payload = JSON.stringify(data);
        }

        // Send (chunk if binary)
        if (isBase64) {
            const chunks = this.#chunkString(payload, this.#chunkSize);
            for (const chunk of chunks) {
                await this.#send({
                    st: 'data',
                    seq: this.#seq++,
                    d: chunk,
                    b64: true
                });
            }
        } else {
            await this.#send({
                st: 'data',
                seq: this.#seq++,
                d: payload,
                b64: false
            });
        }
    }

    /**
     * Ends the stream.
     * 
     * @param {Object} [finalMeta] - Final metadata.
     * @returns {Promise<void>}
     */
    async end(finalMeta) {
        if (this.#ended) return;

        this.#ended = true;

        await this.#send({
            st: 'end',
            seq: this.#seq,
            meta: finalMeta
        });
    }

    /**
     * Aborts the stream with an error.
     * 
     * @param {string} [reason] - Error reason.
     * @returns {Promise<void>}
     */
    async abort(reason) {
        if (this.#ended) return;

        this.#ended = true;

        await this.#send({
            st: 'error',
            reason: reason ?? 'Stream aborted'
        });
    }

    /**
     * Sends a stream message.
     * 
     * @param {Object} payload - Stream payload.
     */
    async #send(payload) {
        const message = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            t: 'stream',
            sid: this.#streamId,
            ...payload
        };

        await this.#sendFn(message);
    }

    /**
     * Chunks a string into smaller pieces.
     * 
     * @param {string} str - String to chunk.
     * @param {number} size - Chunk size.
     * @returns {string[]}
     */
    #chunkString(str, size) {
        const chunks = [];
        for (let i = 0; i < str.length; i += size) {
            chunks.push(str.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Converts Uint8Array to base64.
     * 
     * @param {Uint8Array} bytes 
     * @returns {string}
     */
    #arrayBufferToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
}

/**
 * Readable stream for receiving large payloads.
 * 
 * @example
 * streamManager.onStream('upload', async (stream) => {
 *   for await (const chunk of stream) {
 *     await processChunk(chunk);
 *   }
 * });
 */
export class ReadableSignalStream {
    /** @type {string} */
    #streamId;

    /** @type {string} */
    #name;

    /** @type {Object} */
    #meta;

    /** @type {Array<any>} */
    #buffer = [];

    /** @type {Function|null} */
    #resolveNext = null;

    /** @type {boolean} */
    #ended = false;

    /** @type {Error|null} */
    #error = null;

    /** @type {number} */
    // #expectedSeq = 0;

    /**
     * Creates a readable stream from open message.
     * 
     * @param {string} streamId - Stream ID.
     * @param {string} name - Stream name.
     * @param {Object} [meta] - Stream metadata.
     */
    constructor(streamId, name, meta = {}) {
        this.#streamId = streamId;
        this.#name = name;
        this.#meta = meta;
    }

    /**
     * Gets the stream ID.
     * @returns {string}
     */
    get streamId() {
        return this.#streamId;
    }

    /**
     * Gets the stream name.
     * @returns {string}
     */
    get name() {
        return this.#name;
    }

    /**
     * Gets stream metadata.
     * @returns {Object}
     */
    get meta() {
        return this.#meta;
    }

    /**
     * Gets whether stream has ended.
     * @returns {boolean}
     */
    get ended() {
        return this.#ended;
    }

    /**
     * Pushes data chunk from message.
     * 
     * @param {Object} message - Stream data message.
     */
    push(message) {
        if (this.#ended) return;

        // Decode data
        let data = message.d;
        if (message.b64) {
            data = this.#base64ToUint8Array(data);
        }

        // Add to buffer
        this.#buffer.push(data);

        // Resolve waiting reader
        if (this.#resolveNext) {
            const resolve = this.#resolveNext;
            this.#resolveNext = null;
            resolve();
        }
    }

    /**
     * Marks stream as ended.
     * 
     * @param {Object} [meta] - Final metadata.
     */
    end(meta) {
        this.#ended = true;
        if (meta) {
            this.#meta = { ...this.#meta, ...meta };
        }

        // Resolve waiting reader
        if (this.#resolveNext) {
            const resolve = this.#resolveNext;
            this.#resolveNext = null;
            resolve();
        }
    }

    /**
     * Marks stream as errored.
     * 
     * @param {string} reason - Error reason.
     */
    error(reason) {
        this.#ended = true;
        this.#error = new Error(reason);

        if (this.#resolveNext) {
            const resolve = this.#resolveNext;
            this.#resolveNext = null;
            resolve();
        }
    }

    /**
     * Async iterator for consuming stream.
     * 
     * @returns {AsyncIterableIterator<any>}
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            // Return buffered data first
            while (this.#buffer.length > 0) {
                yield this.#buffer.shift();
            }

            // Check for end/error
            if (this.#ended) {
                if (this.#error) {
                    throw this.#error;
                }
                return;
            }

            // Wait for more data
            await new Promise(resolve => {
                this.#resolveNext = resolve;
            });
        }
    }

    /**
     * Collects all data into single result.
     * 
     * @returns {Promise<Uint8Array | string>}
     */
    async collect() {
        const chunks = [];
        let isBinary = false;

        for await (const chunk of this) {
            chunks.push(chunk);
            if (chunk instanceof Uint8Array) {
                isBinary = true;
            }
        }

        if (isBinary) {
            // Combine binary chunks
            const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.length;
            }
            return result;
        } else {
            // Combine string chunks
            return chunks.join('');
        }
    }

    /**
     * Decodes base64 to Uint8Array.
     * 
     * @param {string} base64 
     * @returns {Uint8Array}
     */
    #base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}

/**
 * Stream manager for CrossBus.
 * Handles creating, sending, and receiving streams.
 * 
 * @example
 * const streams = new StreamManager(bus);
 * 
 * // Create and send stream
 * const stream = await streams.createStream('upload', 'peer-1', {
 *   meta: { filename: 'data.json' }
 * });
 * await stream.write(data);
 * await stream.end();
 * 
 * // Receive streams
 * streams.onStream('upload', async (stream) => {
 *   const data = await stream.collect();
 * });
 */
export class StreamManager {
    /** @type {Map<string, ReadableSignalStream>} */
    #activeStreams = new Map();

    /** @type {Map<string, Function>} */
    #streamHandlers = new Map();

    /** @type {Function} */
    #sendFn;

    /**
     * Creates a StreamManager.
     * 
     * @param {Function} sendFn - Function to send messages: (peerId, message) => Promise.
     */
    constructor(sendFn) {
        this.#sendFn = sendFn;
    }

    /**
     * Creates a writable stream to send to a peer.
     * 
     * @param {string} name - Stream name/type.
     * @param {string} peerId - Target peer ID.
     * @param {StreamOptions & { meta?: Object }} [options] - Options.
     * @returns {WritableSignalStream}
     */
    createStream(name, peerId, options = {}) {
        const sendFn = async (message) => {
            await this.#sendFn(peerId, message);
        };

        return new WritableSignalStream(sendFn, name, options);
    }

    /**
     * Registers a handler for incoming streams.
     * 
     * @param {string} name - Stream name to handle.
     * @param {(stream: ReadableSignalStream) => Promise<void>} handler - Handler function.
     * @returns {Function} Unregister function.
     */
    onStream(name, handler) {
        this.#streamHandlers.set(name, handler);
        return () => this.#streamHandlers.delete(name);
    }

    /**
     * Handles incoming stream message.
     * Call this from CrossBus message handler.
     * 
     * @param {Object} message - Stream message.
     * @param {string} peerId - Source peer ID.
     */
    handleMessage(message, peerId) {
        if (message.t !== 'stream') return;

        const streamId = message.sid;
        const streamType = message.st;

        switch (streamType) {
            case 'open':
                this.#handleOpen(streamId, message, peerId);
                break;
            case 'data':
                this.#handleData(streamId, message);
                break;
            case 'end':
                this.#handleEnd(streamId, message);
                break;
            case 'error':
                this.#handleError(streamId, message);
                break;
        }
    }

    /**
     * Handles stream open message.
     */
    #handleOpen(streamId, message, peerId) {
        const handler = this.#streamHandlers.get(message.name);
        if (!handler) {
            console.warn(`[CrossBus] No handler for stream: ${message.name}`);
            return;
        }

        const stream = new ReadableSignalStream(streamId, message.name, message.meta);
        this.#activeStreams.set(streamId, stream);

        // Call handler asynchronously
        handler(stream).catch(err => {
            console.error('[CrossBus] Stream handler error:', err);
        });
    }

    /**
     * Handles stream data message.
     */
    #handleData(streamId, message) {
        const stream = this.#activeStreams.get(streamId);
        if (!stream) return;

        stream.push(message);
    }

    /**
     * Handles stream end message.
     */
    #handleEnd(streamId, message) {
        const stream = this.#activeStreams.get(streamId);
        if (!stream) return;

        stream.end(message.meta);
        this.#activeStreams.delete(streamId);
    }

    /**
     * Handles stream error message.
     */
    #handleError(streamId, message) {
        const stream = this.#activeStreams.get(streamId);
        if (!stream) return;

        stream.error(message.reason);
        this.#activeStreams.delete(streamId);
    }

    /**
     * Gets count of active streams.
     * @returns {number}
     */
    get activeStreamCount() {
        return this.#activeStreams.size;
    }
}
