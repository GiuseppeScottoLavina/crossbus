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
    /** @param {Function} sendFn @param {string} name @param {StreamOptions} [options] */
    constructor(sendFn: Function, name: string, options?: StreamOptions);
    get streamId(): string;
    get name(): string;
    get ended(): boolean;
    /** @param {Object} [meta] @returns {Promise<void>} */
    open(meta?: any): Promise<void>;
    /** Input remains caller-owned until this resolves. @param {string|ArrayBuffer|Uint8Array|Object} data */
    write(data: string | ArrayBuffer | Uint8Array | any): Promise<void>;
    /** Flow-controlled end waits until every chunk is pulled. @param {Object} [meta] */
    end(meta?: any): Promise<void>;
    /** @param {string} [reason] */
    abort(reason?: string): Promise<void>;
    /** Bind only to the authenticated receiver, or use StreamManager. @param {Object} message */
    handleMessage(message: any): void;
    #private;
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
    /** @param {string} streamId @param {string} name @param {Object} [meta] @param {ReadableStreamOptions} [options] */
    constructor(streamId: string, name: string, meta?: any, options?: ReadableStreamOptions);
    get streamId(): string;
    get name(): string;
    get meta(): any;
    get ended(): boolean;
    get bufferedBytes(): number;
    get bufferedChunks(): number;
    /** Invalid input terminates and throws to a direct caller. @param {Object} message */
    push(message: any): void;
    /** @param {Object} [meta] @param {number} [finalCount] */
    end(meta?: any, finalCount?: number): void;
    /** @param {string|Error} reason */
    error(reason: string | Error): void;
    /** @param {string} [reason] */
    cancel(reason?: string): void;
    /** Collection allocates the complete result; iterate for bounded processing. @returns {Promise<Uint8Array|string>} */
    collect(): Promise<Uint8Array | string>;
    /** Credit means pulled, not application processing completed. @returns {AsyncIterableIterator<any>} */
    [Symbol.asyncIterator](): AsyncIterableIterator<any>;
    #private;
}
/** @typedef {Pick<ReadableStreamOptions,'maxBufferedChunks'|'maxBufferedBytes'|'maxOutOfOrderChunks'|'idleTimeout'> & {maxIncomingStreams?:number,maxOutgoingStreams?:number,maxControlBytes?:number}} StreamManagerOptions */
export class StreamManager {
    /** @param {Function} sendFn - (peerId,message)=>Promise on an authenticated channel. @param {StreamManagerOptions} [options] */
    constructor(sendFn: Function, options?: StreamManagerOptions);
    /** @param {string} name @param {string} peerId @param {StreamOptions} [options] */
    createStream(name: string, peerId: string, options?: StreamOptions): WritableSignalStream;
    /** @param {string} name @param {(stream:ReadableSignalStream)=>Promise<void>|void} handler */
    onStream(name: string, handler: (stream: ReadableSignalStream) => Promise<void> | void): () => boolean;
    /** peerId is the authenticated channel identity, never a payload field. @param {Object} message @param {string} peerId */
    handleMessage(message: any, peerId: string): void;
    destroy(): void;
    get activeStreamCount(): number;
    get outgoingStreamCount(): number;
    #private;
}
export type StreamOptions = {
    /**
     * - Raw binary bytes or UTF-16 code units per chunk.
     */
    chunkSize?: number | undefined;
    meta?: any;
    /**
     * - Require a compatible manager to acknowledge consumption.
     */
    flowControl?: boolean | undefined;
    /**
     * - Maximum unconsumed chunks with flow control.
     */
    windowSize?: number | undefined;
    /**
     * - Maximum wait without acknowledgement progress; zero disables.
     */
    ackTimeout?: number | undefined;
    /**
     * - Total lifetime from opening, in milliseconds; zero disables.
     */
    timeout?: number | undefined;
    signal?: AbortSignal | undefined;
    /**
     * - Native requires structured clone.
     */
    binaryEncoding?: "base64" | "native" | undefined;
    onClose?: ((error: Error | null) => void) | undefined;
};
export type ReadableStreamOptions = {
    maxBufferedChunks?: number | undefined;
    /**
     * - Queued and reordered backing storage / UTF-16 estimate.
     */
    maxBufferedBytes?: number | undefined;
    maxOutOfOrderChunks?: number | undefined;
    /**
     * - No accepted data or consumption progress; zero disables.
     */
    idleTimeout?: number | undefined;
    flowControl?: boolean | undefined;
    /**
     * - Authenticated-channel control callback.
     */
    acknowledge?: ((message: any) => void) | undefined;
    onClose?: ((error: Error | null) => void) | undefined;
};
export type StreamManagerOptions = Pick<ReadableStreamOptions, "maxBufferedChunks" | "maxBufferedBytes" | "maxOutOfOrderChunks" | "idleTimeout"> & {
    maxIncomingStreams?: number;
    maxOutgoingStreams?: number;
    maxControlBytes?: number;
};
