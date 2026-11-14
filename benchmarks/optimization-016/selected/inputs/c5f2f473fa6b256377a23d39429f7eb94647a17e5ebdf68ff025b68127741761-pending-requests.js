/**
 * @fileoverview Pending requests tracker for request/response pattern.
 * Tracks outgoing requests and matches them with responses.
 * @module router/pending-requests
 */

import { CrossBusError, ErrorCode } from '../common/errors.js';
import { deferred } from '../common/utils.js';

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
    /** @type {Map<string, PendingRequest>} Authoritative request storage */
    #pending = new Map();

    /** @type {number} */
    #requestCounter = 0;

    /** @type {number} Default timeout */
    #defaultTimeout;

    /** @type {number} Maximum pending requests */
    #maxPending;

    #coalesceTimeouts;
    /** @type {PendingRequest|null} */
    #head = null;
    /** @type {PendingRequest|null} */
    #tail = null;
    /** @type {ReturnType<typeof setTimeout>|null} */
    #deadlineTimer = null;
    #expireDeadlines = () => {
        this.#deadlineTimer = null;
        try {
            const now = performance.now();
            while (this.#head && this.#head.deadline <= now) {
                const pending = this.#head;
                this.#pending.delete(pending.id);
                this.#release(pending);
                this.#expire(pending);
            }
        } finally {
            if (this.#head && this.#deadlineTimer === null) {
                this.#deadlineTimer = setTimeout(
                    this.#expireDeadlines,
                    Math.max(1, Math.ceil(this.#head.deadline - performance.now()))
                );
            }
        }
    };

    /**
     * Creates a new pending requests tracker.
     *
     * @param {Object} [options={}]
     * @param {number} [options.defaultTimeout=30000] - Default timeout in ms.
     * @param {number} [options.maxPending=1000] - Maximum pending requests (0 = unlimited).
     * @param {boolean} [options.coalesceTimeouts=false] - Share a timer for equal default deadlines; custom deadlines remain independent.
     */
    constructor(options = {}) {
        this.#defaultTimeout = options.defaultTimeout ?? 30000;
        this.#maxPending = options.maxPending ?? 1000;
        this.#coalesceTimeouts = options.coalesceTimeouts ?? false;
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
            timer: /** @type {ReturnType<typeof setTimeout>} */ (/** @type {unknown} */ (null)),
            resolve,
            reject,
            defaultValue: options.defaultValue,
            pooled:
                this.#coalesceTimeouts &&
                timeout === this.#defaultTimeout &&
                Number.isFinite(timeout) &&
                timeout >= 1 &&
                timeout <= 2147483647,
            deadline: 0,
            previous: null,
            next: null,
            options
        };
        if (pending.pooled) {
            pending.deadline = performance.now() + timeout;
            pending.previous = this.#tail;
            if (this.#tail) this.#tail.next = pending;
            else this.#head = pending;
            this.#tail = pending;
            if (this.#deadlineTimer === null)
                this.#deadlineTimer = setTimeout(
                    this.#expireDeadlines,
                    this.#head === pending
                        ? timeout
                        : Math.max(
                              1,
                              Math.ceil(
                                  (this.#head?.deadline ?? pending.deadline) - performance.now()
                              )
                          )
                );
            pending.timer = this.#deadlineTimer;
        } else {
            pending.timer = setTimeout(() => {
                if (this.#pending.delete(requestId)) this.#expire(pending);
            }, timeout);
        }
        this.#pending.set(requestId, pending);
        return { requestId, promise };
    }

    /** Release timer/list ownership in O(1), without retaining settled requests. */
    #release(pending) {
        if (!pending.pooled) {
            clearTimeout(pending.timer);
            return;
        }
        if (pending.previous) pending.previous.next = pending.next;
        else this.#head = pending.next;
        if (pending.next) pending.next.previous = pending.previous;
        else this.#tail = pending.previous;
        pending.previous = pending.next = null;
        if (!this.#head && this.#deadlineTimer !== null) {
            clearTimeout(this.#deadlineTimer);
            this.#deadlineTimer = null;
        }
    }

    #expire(pending) {
        try {
            if ('defaultValue' in pending.options) pending.resolve(pending.options.defaultValue);
            else
                pending.reject(
                    CrossBusError.from(ErrorCode.RESPONSE_TIMEOUT, {
                        requestId: pending.id,
                        targetPeer: pending.targetPeer,
                        handlerName: pending.handlerName,
                        timeout: pending.timeout
                    })
                );
        } catch (error) {
            pending.reject(error);
        }
    }

    /**
     * Resolves a pending request with response data.
     *
     * @param {string} requestId - Request ID to resolve.
     * @param {ResponseData} response - Response data.
     * @param {string} [targetPeer] - If supplied, require the response's bound peer.
     * @returns {boolean} True if request was found and resolved.
     */
    resolve(requestId, response, targetPeer) {
        const pending = this.#pending.get(requestId);
        if (!pending || (targetPeer !== undefined && pending.targetPeer !== targetPeer))
            return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);

        if (response.success) {
            pending.resolve(response.data);
        } else {
            const error = CrossBusError.from(response.error?.code ?? ErrorCode.HANDLER_ERROR, {
                requestId,
                targetPeer: pending.targetPeer,
                handlerName: pending.handlerName,
                originalError: response.error
            });
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
        const pending = this.#pending.get(requestId);
        if (!pending) return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);

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
        const pending = this.#pending.get(requestId);
        if (!pending) return false;

        this.#release(pending);
        // Remove the settled request
        this.#pending.delete(requestId);
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
                this.#release(pending);
                this.#pending.delete(requestId);
                pending.reject(
                    CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                        peerId,
                        requestId
                    })
                );
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

        for (const pending of this.#pending.values()) {
            this.#release(pending);
            pending.reject(new Error('All requests cancelled'));
        }

        this.#pending.clear();
        return count;
    }

    /**
     * Checks if a request is pending.
     *
     * @param {string} requestId
     * @returns {boolean}
     */
    has(requestId) {
        // Query the authoritative request table
        return this.#pending.has(requestId);
    }

    /**
     * Gets a pending request.
     *
     * @param {string} requestId
     * @returns {PendingRequest|undefined}
     */
    get(requestId) {
        // Query the authoritative request table
        return this.#pending.get(requestId);
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
