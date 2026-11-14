/**
 * @typedef {Object} PendingRequest
 * @property {string} id - Request ID.
 * @property {string} targetPeer - Target peer ID.
 * @property {string} handlerName - Name of the handler.
 * @property {number} createdAt - When request was created.
 * @property {number} timeout - Timeout in ms.
 * @property {ReturnType<typeof setTimeout>} timer - Timer at registration; pooled handles are scheduler-owned. Use tracker cancellation methods.
 * @property {Function} resolve - Promise resolve function.
 * @property {Function} reject - Promise reject function.
 * @property {*} [defaultValue] - Value to return on timeout.
 * @property {boolean} pooled - Whether the default deadline scheduler owns this request.
 * @property {number} deadline - Monotonic expiration time for a pooled request.
 * @property {PendingRequest|null} previous - Previous pooled request.
 * @property {PendingRequest|null} next - Next pooled request.
 * @property {RequestOptions} options - Original timeout options.
 */
/**
 * @typedef {Object} RequestOptions
 * @property {number} [timeout=30000] - Request timeout in ms.
 * @property {*} [defaultValue] - Value to return on timeout instead of throwing.
 */
/**
 * @typedef {Object} ResponseData
 * @property {string} requestId - Original request ID.
 * @property {boolean} success - Whether handler succeeded.
 * @property {*} [data] - Response data if successful.
 * @property {Object} [error] - Error if failed.
 */
/**
 * Tracks pending requests and matches responses.
 *
 * Supports:
 * - Timeout handling
 * - Automatic cleanup
 * - Error propagation
 * - Request cancellation
 *
 * @example
 * const tracker = new PendingRequests();
 *
 * // Create request
 * const { requestId, promise } = tracker.create('peer-1', 'getData', {
 *   timeout: 5000
 * });
 *
 * // Send request via transport...
 * transport.send({ id: requestId, type: 'request', handler: 'getData' });
 *
 * // When response arrives:
 * tracker.resolve(requestId, responseData);
 *
 * // Or wait for response:
 * const result = await promise;
 */
export class PendingRequests {
    /**
     * Creates a new pending requests tracker.
     *
     * @param {Object} [options={}]
     * @param {number} [options.defaultTimeout=30000] - Default timeout in ms.
     * @param {number} [options.maxPending=1000] - Maximum pending requests (0 = unlimited).
     * @param {boolean} [options.coalesceTimeouts=false] - Share a timer for equal default deadlines; custom deadlines remain independent.
     */
    constructor(options?: {
        defaultTimeout?: number | undefined;
        maxPending?: number | undefined;
        coalesceTimeouts?: boolean | undefined;
    });
    /**
     * Creates a new pending request.
     *
     * @param {string} targetPeer - Target peer ID.
     * @param {string} handlerName - Name of the handler to invoke.
     * @param {RequestOptions} [options={}] - Request options.
     * @returns {{ requestId: string, promise: Promise<*> }}
     *
     * @example
     * const { requestId, promise } = tracker.create('widget', 'getState');
     * const result = await promise;
     */
    create(targetPeer: string, handlerName: string, options?: RequestOptions): {
        requestId: string;
        promise: Promise<any>;
    };
    /**
     * Resolves a pending request with response data.
     *
     * @param {string} requestId - Request ID to resolve.
     * @param {ResponseData} response - Response data.
     * @param {string} [targetPeer] - If supplied, require the response's bound peer.
     * @returns {boolean} True if request was found and resolved.
     */
    resolve(requestId: string, response: ResponseData, targetPeer?: string): boolean;
    /**
     * Rejects a pending request with an error.
     *
     * @param {string} requestId - Request ID to reject.
     * @param {Error|string} error - Error or error message.
     * @returns {boolean} True if request was found and rejected.
     */
    reject(requestId: string, error: Error | string): boolean;
    /**
     * Cancels a pending request.
     *
     * @param {string} requestId - Request ID to cancel.
     * @returns {boolean} True if request was found and cancelled.
     */
    cancel(requestId: string): boolean;
    /**
     * Cancels all pending requests for a peer.
     * Used when peer disconnects.
     *
     * @param {string} peerId - Peer ID.
     * @returns {number} Number of requests cancelled.
     */
    cancelForPeer(peerId: string): number;
    /**
     * Cancels all pending requests.
     *
     * @returns {number} Number of requests cancelled.
     */
    cancelAll(): number;
    /**
     * Checks if a request is pending.
     *
     * @param {string} requestId
     * @returns {boolean}
     */
    has(requestId: string): boolean;
    /**
     * Gets a pending request.
     *
     * @param {string} requestId
     * @returns {PendingRequest|undefined}
     */
    get(requestId: string): PendingRequest | undefined;
    /**
     * Gets count of pending requests.
     * @returns {number}
     */
    get size(): number;
    /**
     * Gets all pending request IDs.
     * @returns {string[]}
     */
    getRequestIds(): string[];
    /**
     * Gets pending requests for a specific peer.
     *
     * @param {string} peerId
     * @returns {PendingRequest[]}
     */
    getForPeer(peerId: string): PendingRequest[];
    #private;
}
export type PendingRequest = {
    /**
     * - Request ID.
     */
    id: string;
    /**
     * - Target peer ID.
     */
    targetPeer: string;
    /**
     * - Name of the handler.
     */
    handlerName: string;
    /**
     * - When request was created.
     */
    createdAt: number;
    /**
     * - Timeout in ms.
     */
    timeout: number;
    /**
     * - Timer at registration; pooled handles are scheduler-owned. Use tracker cancellation methods.
     */
    timer: ReturnType<typeof setTimeout>;
    /**
     * - Promise resolve function.
     */
    resolve: Function;
    /**
     * - Promise reject function.
     */
    reject: Function;
    /**
     * - Value to return on timeout.
     */
    defaultValue?: any;
    /**
     * - Whether the default deadline scheduler owns this request.
     */
    pooled: boolean;
    /**
     * - Monotonic expiration time for a pooled request.
     */
    deadline: number;
    /**
     * - Previous pooled request.
     */
    previous: PendingRequest | null;
    /**
     * - Next pooled request.
     */
    next: PendingRequest | null;
    /**
     * - Original timeout options.
     */
    options: RequestOptions;
};
export type RequestOptions = {
    /**
     * - Request timeout in ms.
     */
    timeout?: number | undefined;
    /**
     * - Value to return on timeout instead of throwing.
     */
    defaultValue?: any;
};
export type ResponseData = {
    /**
     * - Original request ID.
     */
    requestId: string;
    /**
     * - Whether handler succeeded.
     */
    success: boolean;
    /**
     * - Response data if successful.
     */
    data?: any;
    /**
     * - Error if failed.
     */
    error?: any;
};
