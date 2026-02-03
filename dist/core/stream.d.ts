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
    /**
     * Creates a new writable stream.
     *
     * @param {Function} sendFn - Function to send messages.
     * @param {string} name - Stream name/type identifier.
     * @param {StreamOptions & { meta?: Object }} [options={}] - Options.
     */
    constructor(sendFn: Function, name: string, options?: StreamOptions & {
        meta?: any;
    });
    /**
     * Gets the stream ID.
     * @returns {string}
     */
    get streamId(): string;
    /**
     * Gets the stream name.
     * @returns {string}
     */
    get name(): string;
    /**
     * Opens the stream (called automatically on first write).
     *
     * @param {Object} [meta] - Additional metadata.
     * @returns {Promise<void>}
     */
    open(meta?: any): Promise<void>;
    /**
     * Writes data to the stream.
     *
     * @param {string | ArrayBuffer | Uint8Array | Object} data - Data to write.
     * @returns {Promise<void>}
     */
    write(data: string | ArrayBuffer | Uint8Array | any): Promise<void>;
    /**
     * Ends the stream.
     *
     * @param {Object} [finalMeta] - Final metadata.
     * @returns {Promise<void>}
     */
    end(finalMeta?: any): Promise<void>;
    /**
     * Aborts the stream with an error.
     *
     * @param {string} [reason] - Error reason.
     * @returns {Promise<void>}
     */
    abort(reason?: string): Promise<void>;
    #private;
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
    /** @type {number} */
    /**
     * Creates a readable stream from open message.
     *
     * @param {string} streamId - Stream ID.
     * @param {string} name - Stream name.
     * @param {Object} [meta] - Stream metadata.
     */
    constructor(streamId: string, name: string, meta?: any);
    /**
     * Gets the stream ID.
     * @returns {string}
     */
    get streamId(): string;
    /**
     * Gets the stream name.
     * @returns {string}
     */
    get name(): string;
    /**
     * Gets stream metadata.
     * @returns {Object}
     */
    get meta(): any;
    /**
     * Gets whether stream has ended.
     * @returns {boolean}
     */
    get ended(): boolean;
    /**
     * Pushes data chunk from message.
     *
     * @param {Object} message - Stream data message.
     */
    push(message: any): void;
    /**
     * Marks stream as ended.
     *
     * @param {Object} [meta] - Final metadata.
     */
    end(meta?: any): void;
    /**
     * Marks stream as errored.
     *
     * @param {string} reason - Error reason.
     */
    error(reason: string): void;
    /**
     * Collects all data into single result.
     *
     * @returns {Promise<Uint8Array | string>}
     */
    collect(): Promise<Uint8Array | string>;
    /**
     * Async iterator for consuming stream.
     *
     * @returns {AsyncIterableIterator<any>}
     */
    [Symbol.asyncIterator](): AsyncIterableIterator<any>;
    #private;
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
    /**
     * Creates a StreamManager.
     *
     * @param {Function} sendFn - Function to send messages: (peerId, message) => Promise.
     */
    constructor(sendFn: Function);
    /**
     * Creates a writable stream to send to a peer.
     *
     * @param {string} name - Stream name/type.
     * @param {string} peerId - Target peer ID.
     * @param {StreamOptions & { meta?: Object }} [options] - Options.
     * @returns {WritableSignalStream}
     */
    createStream(name: string, peerId: string, options?: StreamOptions & {
        meta?: any;
    }): WritableSignalStream;
    /**
     * Registers a handler for incoming streams.
     *
     * @param {string} name - Stream name to handle.
     * @param {(stream: ReadableSignalStream) => Promise<void>} handler - Handler function.
     * @returns {Function} Unregister function.
     */
    onStream(name: string, handler: (stream: ReadableSignalStream) => Promise<void>): Function;
    /**
     * Handles incoming stream message.
     * Call this from CrossBus message handler.
     *
     * @param {Object} message - Stream message.
     * @param {string} peerId - Source peer ID.
     */
    handleMessage(message: any, peerId: string): void;
    /**
     * Gets count of active streams.
     * @returns {number}
     */
    get activeStreamCount(): number;
    #private;
}
export type StreamOptions = {
    /**
     * - Size of each chunk in bytes.
     */
    chunkSize?: number | undefined;
    /**
     * - Timeout for stream operations in ms.
     */
    timeout?: number | undefined;
};
export type StreamMeta = {
    /**
     * - Unique stream identifier.
     */
    streamId: string;
    /**
     * - Stream name/type.
     */
    name: string;
    /**
     * - Total size if known.
     */
    totalSize?: number | undefined;
    /**
     * - MIME type if applicable.
     */
    contentType?: string | undefined;
    /**
     * - Additional metadata.
     */
    meta?: any;
};
export type StreamMessageType = "open" | "data" | "end" | "error" | "ack";
