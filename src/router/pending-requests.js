/**
 * @fileoverview Pending requests tracker for request/response pattern.
 * Tracks outgoing requests and matches them with responses.
 * @module router/pending-requests
 */

import { CrossBusError, ErrorCode } from '../common/errors.js';
import { deferred, withTimeout } from '../common/utils.js';

/**
 * @typedef {Object} PendingRequest
 * @property {string} id - Request ID.
 * @property {string} targetPeer - Target peer ID.
 * @property {string} handlerName - Name of the handler.
 * @property {number} createdAt - When request was created.
 * @property {number} timeout - Timeout in ms.
 * @property {Function} resolve - Promise resolve function.
 * @property {Function} reject - Promise reject function.
 * @property {*} [defaultValue] - Value to return on timeout.
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
    /** @type {Map<string, PendingRequest>} Full feature storage */
    #pending = new Map();

    /** @type {Object<string, PendingRequest>} Fast Object-based cache for lookup */
    #cache = Object.create(null);

    /** @type {number} */
    #requestCounter = 0;

    /** @type {number} Default timeout */
    #defaultTimeout;

    /** @type {number} Maximum pending requests */
    #maxPending;

    /**
     * Creates a new pending requests tracker.
     * 
     * @param {Object} [options={}]
     * @param {number} [options.defaultTimeout=30000] - Default timeout in ms.
     * @param {number} [options.maxPending=1000] - Maximum pending requests (0 = unlimited).
     */
    constructor(options = {}) {
        this.#defaultTimeout = options.defaultTimeout ?? 30000;
        this.#maxPending = options.maxPending ?? 1000;
    }

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
    create(targetPeer, handlerName, options = {}) {
        // Enforce max pending limit to prevent memory exhaustion
        if (this.#maxPending > 0 && this.#pending.size >= this.#maxPending) {
            throw CrossBusError.from(ErrorCode.MAX_PENDING, {
                current: this.#pending.size,
                max: this.#maxPending,
                targetPeer,
                handlerName
            });
        }

        const now = Date.now();
        const requestId = `req_${++this.#requestCounter}_${now}`;
        const timeout = options.timeout ?? this.#defaultTimeout;
        const { promise, resolve, reject } = deferred();

        /** @type {PendingRequest} */
        const pending = {
            id: requestId,
            targetPeer,
            handlerName,
            createdAt: now,
            timeout,
            resolve,
            reject,
            defaultValue: options.defaultValue
        };

        this.#pending.set(requestId, pending);
        this.#cache[requestId] = pending;  // Sync fast cache

        // Set up timeout
        const timeoutPromise = withTimeout(promise, timeout).catch(error => {
            // Cleanup on timeout - use cache for fast check
            if (requestId in this.#cache) {
                this.#pending.delete(requestId);
                delete this.#cache[requestId];

                // Return default value if provided
                if ('defaultValue' in options) {
                    return options.defaultValue;
                }

                throw CrossBusError.from(ErrorCode.RESPONSE_TIMEOUT, {
                    requestId,
                    targetPeer,
                    handlerName,
                    timeout
                });
            }
            throw error;
        });

        return { requestId, promise: timeoutPromise };
    }

    /**
     * Resolves a pending request with response data.
     * 
     * @param {string} requestId - Request ID to resolve.
     * @param {ResponseData} response - Response data.
     * @returns {boolean} True if request was found and resolved.
     */
    resolve(requestId, response) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];

        if (response.success) {
            pending.resolve(response.data);
        } else {
            const error = CrossBusError.from(
                response.error?.code ?? ErrorCode.HANDLER_ERROR,
                {
                    requestId,
                    targetPeer: pending.targetPeer,
                    handlerName: pending.handlerName,
                    originalError: response.error
                }
            );
            error.message = response.error?.message ?? 'Handler error';
            pending.reject(error);
        }

        return true;
    }

    /**
     * Rejects a pending request with an error.
     * 
     * @param {string} requestId - Request ID to reject.
     * @param {Error|string} error - Error or error message.
     * @returns {boolean} True if request was found and rejected.
     */
    reject(requestId, error) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];

        const err = error instanceof Error ? error : new Error(error);
        pending.reject(err);

        return true;
    }

    /**
     * Cancels a pending request.
     * 
     * @param {string} requestId - Request ID to cancel.
     * @returns {boolean} True if request was found and cancelled.
     */
    cancel(requestId) {
        const pending = this.#cache[requestId];
        if (!pending) return false;

        // Sync both storages
        this.#pending.delete(requestId);
        delete this.#cache[requestId];
        pending.reject(new Error('Request cancelled'));

        return true;
    }

    /**
     * Cancels all pending requests for a peer.
     * Used when peer disconnects.
     * 
     * @param {string} peerId - Peer ID.
     * @returns {number} Number of requests cancelled.
     */
    cancelForPeer(peerId) {
        let count = 0;

        for (const [requestId, pending] of this.#pending) {
            if (pending.targetPeer === peerId) {
                this.#pending.delete(requestId);
                delete this.#cache[requestId];  // Sync cache
                pending.reject(CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                    peerId,
                    requestId
                }));
                count++;
            }
        }

        return count;
    }

    /**
     * Cancels all pending requests.
     * 
     * @returns {number} Number of requests cancelled.
     */
    cancelAll() {
        const count = this.#pending.size;

        for (const [requestId, pending] of this.#pending) {
            pending.reject(new Error('All requests cancelled'));
        }

        this.#pending.clear();
        // Reset cache to empty object
        for (const key in this.#cache) {
            delete this.#cache[key];
        }
        return count;
    }

    /**
     * Checks if a request is pending.
     * 
     * @param {string} requestId
     * @returns {boolean}
     */
    has(requestId) {
        // Fast Object-based check (faster than Map.has)
        return requestId in this.#cache;
    }

    /**
     * Gets a pending request.
     * 
     * @param {string} requestId
     * @returns {PendingRequest|undefined}
     */
    get(requestId) {
        // Fast Object-based lookup
        return this.#cache[requestId];
    }

    /**
     * Gets count of pending requests.
     * @returns {number}
     */
    get size() {
        return this.#pending.size;
    }

    /**
     * Gets all pending request IDs.
     * @returns {string[]}
     */
    getRequestIds() {
        return Array.from(this.#pending.keys());
    }

    /**
     * Gets pending requests for a specific peer.
     * 
     * @param {string} peerId
     * @returns {PendingRequest[]}
     */
    getForPeer(peerId) {
        const requests = [];
        for (const pending of this.#pending.values()) {
            if (pending.targetPeer === peerId) {
                requests.push(pending);
            }
        }
        return requests;
    }
}
