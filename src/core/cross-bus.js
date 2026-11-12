/**
 * @fileoverview CrossBus - Main facade for cross-context messaging.
 * Provides a unified API for inter-context communication.
 * @module core/cross-bus
 */

import { EventEmitter } from './event-emitter.js';
import { MessageType } from '../common/types.js';
/** @typedef {import('../common/types.js').PeerStatus} PeerStatus */
import { createSignalMessage, createRequestMessage, createResponseMessage } from './message-types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';
import { uuid, assertPayloadSize } from '../common/utils.js';
import { MessageRouter } from '../router/message-router.js';
import { PendingRequests } from '../router/pending-requests.js';
import { Handshake } from '../security/handshake.js';
import { OriginValidator } from '../security/origin-validator.js';

/**
 * @typedef {Object} CrossBusOptions
 * @property {string} [peerId] - Unique peer identifier (auto-generated if not specified).
 * @property {boolean} [isHub=false] - Whether this instance is the hub.
 * @property {number} [requestTimeout=30000] - Default request timeout in ms.
 * @property {number} [handshakeTimeout=10000] - Handshake timeout in ms.
 * @property {string[]} [allowedOrigins=[]] - Allowed origins for incoming connections.
 * @property {Object} [meta={}] - Metadata to share with peers.
 * @property {string[]} [capabilities=[]] - Supported capabilities.
 * @property {string} [contentType='application/json'] - Preferred serialization format.
 * @property {number} [maxPayloadSize=1048576] - Maximum payload size in bytes (default: 1MB).
 * @property {number} [maxPendingRequests=100] - Maximum concurrent pending requests.
 * @property {boolean} [strictMode=false] - Enforce strict security (disallows wildcard origins).
 * @property {boolean} [debug=false] - Enable verbose debug logging.
 * @property {string} [debugPrefix='[CrossBus]'] - Prefix for debug log messages.
 */

/**
 * @typedef {Object} HandlerOptions
 * @property {string[]} [allowedPeers] - Peer IDs allowed to call this handler.
 * @property {number} [rateLimit] - Max calls per second from each peer.
 * @property {Function} [validatePayload] - Custom payload validator function.
 */

/**
 * @typedef {Object} PeerInfo
 * @property {string} peerId - Peer identifier.
 * @property {string} origin - Peer origin.
 * @property {Object} meta - Peer metadata.
 * @property {PeerStatus} status - Connection status.
 * @property {number} connectedAt - Connection timestamp.
 */

/**
 * @typedef {Object} RequestOptions
 * @property {number} [timeout] - Request timeout in ms.
 */

/**
 * @typedef {Object} BroadcastRequestOptions
 * @property {number} [timeout] - Per-peer timeout in ms.
 * @property {string[]} [exclude] - Peer IDs to exclude.
 * @property {boolean} [ignoreErrors=true] - Whether to ignore peer errors.
 */

/**
 * @typedef {Object} HookContext
 * @property {'signal'|'request'|'response'} type - Message type.
 * @property {string} [peerId] - Peer ID (if applicable).
 * @property {string} [handlerName] - Handler name (for requests).
 * @property {'inbound'|'outbound'} direction - Hook direction.
 */

/**
 * @callback MessageHook
 * @param {*} payload - Payload to transform.
 * @param {HookContext} context - Hook context.
 * @returns {*|Promise<*>} Transformed payload.
 */

/**
 * @typedef {Object} HookEntry
 * @property {MessageHook} fn - Hook function.
 * @property {number} priority - Execution priority (lower = first).
 */

/**
 * @callback RequestHandler
 * @param {*} payload - Request payload.
 * @param {Object} context - Request context (peerId, meta, etc).
 * @returns {Promise<*>|*} - Response data.
 */

/**
 * CrossBus coordinates channel-bound peers, signals and request/response.
 * Configure transport origin/source validation and an explicit bus allowlist.
 * addTransport() wires an existing endpoint; it does not negotiate a connection
 * or automatically forward requests to other peers. signal() sends remotely;
 * inherited emit() dispatches locally.
 *
 * @example
 * const bus = CrossBus.createSecure({
 *   peerId: 'app', allowedOrigins: ['https://widget.example.com']
 * });
 * bus.handle('getData', ({ id }) => ({ id, status: 'ready' }));
 * // Attach an initialized transport with bus.addTransport(...).
 * const result = await bus.request('widget', 'getStatus');
 * bus.destroy();
 */
export class CrossBus extends EventEmitter {
    /** @type {string} */
    #peerId;

    /** @type {boolean} */
    #isHub;

    /** @type {MessageRouter} */
    #router;

    /** @type {PendingRequests} */
    #pendingRequests;

    /** @type {Handshake} */
    #handshake;

    /** @type {OriginValidator} */
    #originValidator;

    /** @type {string} */
    #contentType;

    /** @type {Map<string, RequestHandler>} */
    #handlers = new Map();

    /** @type {HookEntry[]} */
    #inboundHooks = [];

    /** @type {HookEntry[]} */
    #outboundHooks = [];

    /** @type {Object} */
    #meta;

    /** @type {string[]} */
    #capabilities;

    /** @type {number} */
    #requestTimeout;

    /** @type {number} */
    #maxPayloadSize;

    /** @type {number} */
    #maxPendingRequests;

    /** @type {boolean} */
    #strictMode;

    /** @type {Map<string, { count: number, resetAt: number }>} */
    #rateLimitCounters = new Map();

    /** @type {Map<string, HandlerOptions>} */
    #handlerOptions = new Map();

    /** @type {boolean} */
    #debug = false;

    /** @type {string} */
    #debugPrefix = '[CrossBus]';

    /** @type {number} */
    #createdAt;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {Set<Function>} */
    #cleanups = new Set();

    /**
     * Creates a new CrossBus instance.
     *
     * @param {CrossBusOptions} [options={}]
     */
    constructor(options = {}) {
        super();

        this.#peerId = options.peerId ?? uuid();
        this.#isHub = options.isHub ?? false;
        this.#meta = options.meta ?? {};
        this.#capabilities = [...(options.capabilities ?? [])];
        this.#requestTimeout = options.requestTimeout ?? 30000;

        if (options.strictMode && options.allowedOrigins?.some(origin => origin.includes('*'))) {
            throw new Error('strictMode: wildcard origins are not allowed');
        }
        for (const limit of [options.maxPayloadSize, options.maxPendingRequests]) {
            if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) throw new RangeError('Resource limits must be nonnegative safe integers');
        }
        // Initialize components
        this.#router = new MessageRouter();
        this.#pendingRequests = new PendingRequests({
            defaultTimeout: this.#requestTimeout,
            maxPending: options.maxPendingRequests ?? 100
        });
        this.#handshake = new Handshake({
            peerId: this.#peerId,
            meta: this.#meta,
            capabilities: this.#capabilities,
            timeout: options.handshakeTimeout ?? 10000
        });
        this.#originValidator = new OriginValidator({
            allowed: options.allowedOrigins ?? []
        });

        // Serialization setup
        this.#contentType = options.contentType ?? 'application/json';
        // this.#serializer = getSerializer(this.#contentType);

        // Security settings
        this.#maxPayloadSize = options.maxPayloadSize ?? 1024 * 1024; // 1MB
        this.#maxPendingRequests = options.maxPendingRequests ?? 100;
        this.#strictMode = options.strictMode ?? false;

        // Debug settings
        this.#debug = options.debug ?? false;
        this.#debugPrefix = options.debugPrefix ?? '[CrossBus]';
        this.#createdAt = Date.now();

        // Development security warnings
        this.#emitSecurityWarnings(options);

        // Initialize handshake capability
        this.#capabilities.push(`serializer:${this.#contentType}`);

        // Wire up router events
        this.#router.on('peer:added', (e) => { this.emit('peer:connected', e.data); });
        this.#router.on('peer:removed', (e) => { this.emit('peer:disconnected', e.data); });
        this.#router.on('peer:status', (e) => { this.emit('peer:status', e.data); });

        if (this.#debug) {
            this.#log('info', `Initialized (isHub: ${this.#isHub})`);
        }
    }

    /**
     * Gets the local peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#peerId;
    }

    /**
     * Gets whether this instance is the hub.
     * @returns {boolean}
     */
    get isHub() {
        return this.#isHub;
    }

    /**
     * Gets connected peer count.
     * @returns {number}
     */
    get peerCount() {
        return this.#router.peerCount;
    }

    /**
     * Gets all connected peer IDs.
     * @returns {string[]}
     */
    get peers() {
        return this.#router.getPeerIds();
    }

    /**
     * Gets peer info by ID.
     *
     * @param {string} peerId
     * @returns {PeerInfo|undefined}
     */
    getPeer(peerId) {
        return this.#router.getPeer(peerId);
    }

    // ─────────────────────────────────────────────────────────────────
    // Messaging API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Sends a signal to all connected peers.
     *
     * @param {string} signalName - Signal name (e.g., 'user:login').
     * @param {*} [payload] - Signal payload.
     * @param {Object} [options={}] - Send options.
     * @param {string[]} [options.exclude] - Peer IDs to exclude.
     * @returns {Promise<{ delivered: number, failed: string[] }>}
     *
     * @example
     * bus.signal('user:login', { userId: 123 });
     */
    async signal(signalName, payload, options = {}) {
        this.#assertNotDestroyed();

        // Apply outbound hooks
        const transformedPayload = this.#outboundHooks.length
            ? await this.#runHooks(this.#outboundHooks, payload, { type: 'signal', direction: 'outbound' })
            : this.#checkedPayload(payload);

        const message = createSignalMessage(
            signalName,
            transformedPayload,
            this.#peerId
        );

        const result = this.#router.broadcast(message, options);

        this.#log('out', `SIGNAL "${signalName}" to ${result.delivered} peers`);

        return result;
    }

    /**
     * Sends a request to a specific peer and waits for response.
     *
     * @param {string} peerId - Target peer ID.
     * @param {string} handlerName - Handler to invoke.
     * @param {*} [payload] - Request payload.
     * @param {RequestOptions} [options={}]
     * @returns {Promise<*>} Handler response.
     *
     * @example
     * const data = await bus.request('widget-1', 'getData', { id: 5 });
     */
    request(peerId, handlerName, payload, options = {}) {
        try {
            this.#assertNotDestroyed();
            this.#log('out', `REQUEST "${handlerName}" to ${peerId}`);
            if (!this.#router.getPeer(peerId)) {
                throw CrossBusError.from(ErrorCode.PEER_NOT_FOUND, { peerId });
            }
            // Return the owned pending promise directly on the common path.
            // Asynchronous hooks retain their ordering and rejection semantics.
            if (this.#outboundHooks.length) {
                return this.#runHooks(this.#outboundHooks, payload,
                    { type: 'request', peerId, handlerName, direction: 'outbound' })
                    .then(transformed => this.#sendRequest(peerId, handlerName, transformed, options));
            }
            return this.#sendRequest(peerId, handlerName, this.#checkedPayload(payload), options);
        } catch (error) {
            // The public API always returns a Promise, including validation,
            // lifecycle and missing-peer failures.
            return Promise.reject(error);
        }
    }

    /**
     * Starts tracking only after outbound validation/hooks have succeeded.
     * @param {string} peerId
     * @param {string} handlerName
     * @param {*} transformedPayload
     * @param {RequestOptions} options
     * @returns {Promise<*>}
     */
    #sendRequest(peerId, handlerName, transformedPayload, options) {
        this.#assertNotDestroyed();
        const { requestId, promise } = this.#pendingRequests.create(
            peerId, handlerName, { timeout: options.timeout ?? this.#requestTimeout }
        );

        // Build request message
        const message = createRequestMessage(
            handlerName,
            transformedPayload,
            this.#peerId,
            peerId,
            requestId // Pass the tracking ID
        );

        // Send request
        const result = this.#router.route({ target: peerId, payload: message });

        if (!result.success) {
            this.#pendingRequests.reject(requestId, CrossBusError.from(ErrorCode.SEND_FAILED, { peerId }));
        }

        return promise;
    }

    /**
     * Broadcasts a request to all peers and collects responses.
     *
     * @param {string} handlerName - Handler to invoke on all peers.
     * @param {*} [payload] - Request payload.
     * @param {BroadcastRequestOptions} [options={}]
     * @returns {Promise<Map<string, *>>} Map of peerId -> response.
     *
     * @example
     * const responses = await bus.broadcastRequest('getStatus');
     * for (const [peerId, status] of responses) {
     *   console.log(`${peerId}: ${status.state}`);
     * }
     */
    async broadcastRequest(handlerName, payload, options = {}) {
        this.#assertNotDestroyed();

        const timeout = options.timeout ?? this.#requestTimeout;
        const ignoreErrors = options.ignoreErrors ?? true;
        const exclude = new Set(options.exclude ?? []);

        const results = new Map();
        const promises = [];

        for (const peerId of this.#router.getPeerIds()) {
            if (exclude.has(peerId)) continue;

            const requestPromise = this.request(peerId, handlerName, payload, { timeout })
                .then(response => {
                    results.set(peerId, { success: true, data: response });
                })
                .catch(error => {
                    if (ignoreErrors) {
                        results.set(peerId, { success: false, error: error.message });
                    } else {
                        throw error;
                    }
                });

            promises.push(requestPromise);
        }

        await Promise.all(promises);
        return results;
    }

    // ─────────────────────────────────────────────────────────────────
    // Handler API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Registers a request handler.
     *
     * @param {string} handlerName - Handler name.
     * @param {RequestHandler} handler - Handler function.
     * @param {HandlerOptions} [options={}] - Security options.
     * @returns {Function} Unregister function.
     *
     * @example
     * // Basic handler
     * const unhandle = bus.handle('getData', async (payload, ctx) => {
     *   return await fetchData(payload.id);
     * });
     *
     * // Secure handler with restrictions
     * bus.handle('sensitiveData', async (payload) => { ... }, {
     *   allowedPeers: ['trusted-agent'],  // Only these peers can call
     *   rateLimit: 10,                    // Max 10 calls/second per peer
     *   validatePayload: (p) => p.id != null  // Custom validation
     * });
     */
    handle(handlerName, handler, options = {}) {
        this.#assertNotDestroyed();
        if (typeof handlerName !== 'string' || typeof handler !== 'function') throw new TypeError('Handler name and function required');
        if (this.#handlers.has(handlerName)) {
            throw CrossBusError.from(ErrorCode.HANDLER_EXISTS, { handlerName });
        }

        // Store handler options for security checks
        if (options.allowedPeers || options.rateLimit || options.validatePayload) {
            this.#handlerOptions.set(handlerName, options);
        }

        this.#handlers.set(handlerName, handler);

        return () => this.unhandle(handlerName);
    }

    /**
     * Removes a handler.
     *
     * @param {string} handlerName
     * @returns {boolean} True if handler was removed.
     */
    unhandle(handlerName) {
        this.#handlerOptions.delete(handlerName);
        for (const key of this.#rateLimitCounters.keys()) {
            if (JSON.parse(key)[0] === handlerName) this.#rateLimitCounters.delete(key);
        }
        return this.#handlers.delete(handlerName);
    }

    /**
     * Checks if a handler is registered.
     *
     * @param {string} handlerName
     * @returns {boolean}
     */
    hasHandler(handlerName) {
        return this.#handlers.has(handlerName);
    }

    // ─────────────────────────────────────────────────────────────────
    // Hook API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds an inbound hook to transform incoming payloads.
     *
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @returns {Function} Unregister function.
     *
     * @example
     * // Decrypt incoming messages
     * const unhook = bus.addInboundHook(async (payload, ctx) => {
     *   return await decrypt(payload);
     * });
     */
    addInboundHook(hookFn, priority = 10) {
        if (typeof hookFn !== 'function') {
            throw new TypeError('hookFn must be a function');
        }

        const entry = { fn: hookFn, priority };
        this.#inboundHooks.push(entry);
        this.#inboundHooks.sort((a, b) => a.priority - b.priority);

        return () => this.removeInboundHook(hookFn);
    }

    /**
     * Adds an outbound hook to transform outgoing payloads.
     *
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @returns {Function} Unregister function.
     *
     * @example
     * // Encrypt outgoing messages
     * const unhook = bus.addOutboundHook(async (payload, ctx) => {
     *   return await encrypt(payload);
     * });
     */
    addOutboundHook(hookFn, priority = 10) {
        if (typeof hookFn !== 'function') {
            throw new TypeError('hookFn must be a function');
        }

        const entry = { fn: hookFn, priority };
        this.#outboundHooks.push(entry);
        this.#outboundHooks.sort((a, b) => a.priority - b.priority);

        return () => this.removeOutboundHook(hookFn);
    }

    /**
     * Removes an inbound hook.
     *
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeInboundHook(hookFn) {
        const index = this.#inboundHooks.findIndex(e => e.fn === hookFn);
        if (index !== -1) {
            this.#inboundHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Removes an outbound hook.
     *
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeOutboundHook(hookFn) {
        const index = this.#outboundHooks.findIndex(e => e.fn === hookFn);
        if (index !== -1) {
            this.#outboundHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    // ─────────────────────────────────────────────────────────────────
    // Connection API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Adds a peer with a send function.
     * Used for hub mode when managing connections manually.
     *
     * @param {string} peerId - Peer identifier.
     * @param {(message: any) => void} sendFn - Function to send messages.
     * @param {Object} [options={}] - Additional options.
     */
    addPeer(peerId, sendFn, options = {}) {
        this.#assertNotDestroyed();
        this.#router.addPeer(peerId, sendFn, options);
    }

    /**
     * Removes a peer.
     *
     * @param {string} peerId
     * @returns {boolean}
     */
    removePeer(peerId) {
        this.#pendingRequests.cancelForPeer(peerId);
        return this.#router.removePeer(peerId);
    }

    /**
     * Adds a transport and automatically wires up message handling.
     * This is the recommended way to connect transports for AI agents.
     *
     * @param {Object} transport - Transport instance with send() and onMessage() methods.
     * @param {Object} [options={}] - Additional options.
     * @param {string} [options.peerId] - Override peer ID (defaults to transport's peerId or auto-generated).
     * @param {string} [options.origin='*'] - Origin for message validation.
     * @returns {Function} Cleanup function to remove the transport.
     *
     * @example
     * // Simple usage
     * const cleanup = bus.addTransport(new PostMessageTransport(iframe.contentWindow));
     *
     * // With options
     * const cleanup = bus.addTransport(transport, { peerId: 'my-agent' });
     *
     * // Cleanup when done
     * cleanup();
     */
    addTransport(transport, options = {}) {
        this.#assertNotDestroyed();

        if (!transport || typeof transport.send !== 'function') {
            throw new TypeError('Transport must have a send() method');
        }

        const peerId = options.peerId || transport.peerId || `transport-${uuid()}`;
        const origin = options.origin || '*';

        this.addPeer(peerId, (message) => transport.send(message), options);
        if (typeof transport.onMessage === 'function') {
            transport.onMessage((message, source) => {
                // Window transports provide the actual event origin. Explicit
                // origin is the trust label for originless channels/native hosts.
                const actualOrigin = source?.origin || origin;
                this.handleMessage(message, actualOrigin, peerId)
                    .catch(error => console.error('[CrossBus] Incoming message rejected:', error));
            });
        }
        const cleanup = () => {
            if (!this.#cleanups.delete(cleanup)) return;
            transport.offMessage?.();
            this.removePeer(peerId);
            transport.destroy?.();
        };
        this.#cleanups.add(cleanup);
        return cleanup;
    }

    /**
     * Registers synchronous resource cleanup for bus destruction.
     * @param {Function} cleanup
     * @returns {() => boolean} Removes the registration without running it.
     */
    addCleanup(cleanup) {
        this.#assertNotDestroyed();
        if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function');
        this.#cleanups.add(cleanup);
        return () => this.#cleanups.delete(cleanup);
    }

    /**
     * Handles an incoming message.
     * Call this when receiving a message from any transport.
     *
     * @param {Object} message - The received message.
     * @param {string} origin - Origin of the message.
     * @param {string} [peerId] - Source peer ID if known.
     * @param {Function} [replyFn] - Function to reply to the sender.
     */
    async handleMessage(message, origin, peerId, replyFn) {
        if (this.#destroyed) return;

        // Validate origin
        if (!this.#originValidator.isAllowed(origin)) {
            console.warn(`[CrossBus] Blocked message from unauthorized origin: ${origin}`);
            return;
        }

        if (!message || typeof message !== 'object') return;
        // Apply inbound hooks to payload
        // Support both standard 'payload'/'data' and legacy 'p'
        const rawPayload = message.payload ?? message.data ?? message.p;
        const msgType = message.type ?? message.t;

        // Normalize fields based on schema
        let handlerOrName = message.handler ?? message.name;
        let dataContent = rawPayload;

        // If ProtocolMessage (has 'payload' object containing metadata), extract from it
        if (message.payload && typeof message.payload === 'object' && !message.p) {
            if (msgType === MessageType.SIGNAL || msgType === MessageType.BROADCAST) {
                handlerOrName = message.payload.name;
                dataContent = message.payload.data;
            } else if (msgType === MessageType.REQUEST) {
                handlerOrName = message.payload.name;
                dataContent = message.payload.data;
            } else if (msgType === MessageType.RESPONSE) {
                // Response payload structure? createResponseMessage puts 'data' in payload
                dataContent = message.payload.data;
            }
        }
        // Handle envelope format: { t, p: { type, payload: { name, data } } }
        // Router creates envelopes with 'p' containing the original signal message
        // Detect by: has 't' (not 'type'), has 'p' with nested 'payload' (ProtocolMessage structure)
        else if (message.t && !message.type && message.p && typeof message.p === 'object' && message.p.payload) {
            const innerMsg = message.p;
            // Extract from nested ProtocolMessage
            handlerOrName = innerMsg.payload.name ?? innerMsg.name;
            dataContent = innerMsg.payload.data ?? innerMsg.data;
        }

        {
            const hookContext = {
                type: msgType === MessageType.SIGNAL ? 'signal' :
                    msgType === MessageType.REQUEST ? 'request' : 'response',
                peerId,
                handlerName: handlerOrName,
                direction: 'inbound'
            };
            // Run hooks
            try {
                dataContent = this.#inboundHooks.length
                    ? await this.#runHooks(this.#inboundHooks, dataContent, hookContext)
                    : this.#checkedPayload(dataContent);
            } catch (/** @type {any} */ error) {
                if (msgType !== MessageType.REQUEST) throw error;
                const response = createResponseMessage(message.id, null, this.#peerId, false, {
                    code: error.code ?? ErrorCode.INVALID_PAYLOAD,
                    message: error.message ?? 'Inbound hook rejected request'
                });
                if (replyFn) replyFn(response);
                else if (peerId) this.#router.route({ target: peerId, payload: response });
                return;
            }
        }

        switch (msgType) {
            case MessageType.BROADCAST:  // Broadcast has same structure as signal
            case MessageType.SIGNAL:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid signal name type');
                    return;
                }
                await this.#handleSignal(handlerOrName, dataContent, peerId, origin);
                break;

            case MessageType.REQUEST:
                if (typeof handlerOrName !== 'string') {
                    console.warn('[CrossBus] Invalid handler name type');
                    return;
                }
                // Pass normalized ID
                // const reqId = message.id ?? (message.payload ? message.payload.id : undefined);
                // Wait, 'id' is top level in ProtocolMessage AND legacy.

                await this.#handleRequest(message.id, handlerOrName, dataContent, peerId, replyFn);
                break;

            case MessageType.RESPONSE: {
                let success = message.success;
                let error = message.error;

                // Extract from ProtocolMessage payload if needed
                if (message.payload && message.payload.success !== undefined) {
                    success = message.payload.success;
                    error = message.payload.error;
                }

                // If legacy response structure inside payload?
                this.#handleResponse(message.payload?.requestId ?? message.id, success, dataContent, error, peerId);
                break;
            }

            case MessageType.HANDSHAKE_INIT:
            case MessageType.HANDSHAKE_ACK:
            case MessageType.HANDSHAKE_COMPLETE:
                this.#handshake.handleMessage(message, origin, /** @type {EventListener} */(replyFn));
                break;

            default:
                console.warn(`[CrossBus] Unknown message type: ${msgType}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────

    /**
     * Destroys the CrossBus, cleaning up all resources.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;

        for (const cleanup of this.#cleanups) {
            try { cleanup(); } catch (error) { console.error('[CrossBus] Cleanup failed:', error); }
        }
        this.#cleanups.clear();
        this.#inboundHooks = [];
        this.#outboundHooks = [];
        this.#handlerOptions.clear();
        this.#rateLimitCounters.clear();
        // Cancel all pending requests
        this.#pendingRequests.cancelAll();

        // Clear handlers
        this.#handlers.clear();

        // Clear peers
        this.#router.clearPeers();

        // Clear event listeners
        this.clear();

        this.emit('destroyed', {});
    }

    /**
     * Checks if the bus has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private handlers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming signal.
     *
     */
    async #handleSignal(name, data, peerId, origin) {
        await this.emit(name, {
            payload: data,
            source: peerId
        }, { peerId, origin });
    }

    /**
     * Handles incoming request.
     *
     */
    async #handleRequest(requestId, handlerName, data, peerId, replyFn) {
        const handler = this.#handlers.get(handlerName);

        let response;

        if (!handler) {
            response = createResponseMessage(
                requestId,
                null,
                this.#peerId,
                false,
                {
                    code: ErrorCode.NO_HANDLER,
                    message: 'Handler not found'
                }
            );
        } else {
            // Check handler security (allowedPeers, rateLimit, validatePayload)
            const securityCheck = this.#checkHandlerSecurity(handlerName, peerId, data);
            if (!securityCheck.allowed) {
                response = createResponseMessage(
                    requestId,
                    null,
                    this.#peerId,
                    false,
                    {
                        code: securityCheck.error?.code ?? ErrorCode.UNAUTHORIZED,
                        message: securityCheck.error?.message ?? 'Security check failed'
                    }
                );
            } else {
                try {
                    const result = await handler(data, {
                        peerId,
                        requestId: requestId,
                        handlerName: handlerName
                    });

                    // Apply outbound hooks to response
                    const transformedResult = this.#outboundHooks.length
                        ? await this.#runHooks(this.#outboundHooks, result, { type: 'response', peerId, handlerName, direction: 'outbound' })
                        : this.#checkedPayload(result);

                    response = createResponseMessage(
                        requestId,
                        transformedResult,
                        this.#peerId,
                        true
                    );
                } catch (/** @type {any} */ error) {
                    response = createResponseMessage(
                        requestId,
                        null,
                        this.#peerId,
                        false,
                        {
                            code: error.code ?? ErrorCode.HANDLER_ERROR,
                            message: error.message
                        }
                    );
                }
            }
        }

        // Send response
        if (replyFn) {
            replyFn(response);
        } else if (peerId) {
            this.#router.route({ target: peerId, payload: response });
        }
    }

    /**
     * Handles incoming response.
     *
     */
    #handleResponse(requestId, success, data, error, peerId) {
        const pending = this.#pendingRequests.get(requestId);
        if (!pending || pending.targetPeer !== peerId) return;
        this.#pendingRequests.resolve(requestId, {
            requestId,
            success,
            data,
            error
        });
    }

    /**
     * Asserts the bus is not destroyed.
     *
     */
    #assertNotDestroyed() {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'CrossBus operation'
            });
        }
    }

    /**
     * Runs a chain of hooks on a payload.
     *
     */
    /** @param {*} payload */
    #checkedPayload(payload) {
        assertPayloadSize(payload, this.#maxPayloadSize);
        return payload;
    }

    async #runHooks(hooks, payload, context) {
        let current = payload;
        if (hooks.length) assertPayloadSize(current, this.#maxPayloadSize);
        for (const { fn } of hooks) {
            current = await fn(current, context);
        }
        assertPayloadSize(current, this.#maxPayloadSize);
        return current;
    }

    // ─────────────────────────────────────────────────────────────────
    // Security Methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Emits security warnings in development mode.
     * @param {CrossBusOptions} options
     */
    #emitSecurityWarnings(options) {
        // Only warn in development
        const isDev = typeof process !== 'undefined'
            ? process.env?.NODE_ENV !== 'production'
            : typeof window !== 'undefined' && window.location?.hostname === 'localhost';

        if (!isDev) return;

        // Warn if allowedOrigins is not specified
        if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
            console.warn(
                '[CrossBus Security] ⚠️ No allowedOrigins specified.\n' +
                'This bus will REJECT all incoming messages from transports.\n' +
                'To receive messages, specify allowed origins:\n' +
                '  allowedOrigins: ["https://trusted-domain.com"]\n' +
                'For development only: allowedOrigins: ["*"]'
            );
        }

        // Warn about wildcard origins
        if (options.allowedOrigins?.includes('*')) {
            console.warn(
                '[CrossBus Security] ⚠️ allowedOrigins: ["*"] accepts messages from ANY origin.\n' +
                'This is INSECURE in production. Use specific origins instead:\n' +
                '  allowedOrigins: ["https://trusted-domain.com"]\n' +
                'For production, use:\n' +
                '  CrossBus.createSecure({ allowedOrigins: ["https://..."] })\n' +
                'Suppress this warning with NODE_ENV=production'
            );

            // In strict mode, throw error
            if (this.#strictMode) {
                throw new Error(
                    'strictMode: allowedOrigins: ["*"] is not allowed. ' +
                    'Use specific origins for security.'
                );
            }
        }
    }

    /**
     * Checks handler security before execution.
     * @param {string} handlerName
     * @param {string} peerId
     * @param {*} payload
     * @returns {{ allowed: boolean, error?: CrossBusError }}
     */
    #checkHandlerSecurity(handlerName, peerId, payload) {
        const options = this.#handlerOptions.get(handlerName);
        if (!options) {
            return { allowed: true };
        }

        // Check peer allowlist
        if (options.allowedPeers && !options.allowedPeers.includes(peerId)) {
            return {
                allowed: false,
                error: CrossBusError.from(ErrorCode.UNAUTHORIZED, {
                    handler: handlerName,
                    peer: peerId,
                    allowedPeers: options.allowedPeers
                })
            };
        }

        // Check rate limit
        if (options.rateLimit) {
            const limitKey = JSON.stringify([handlerName, peerId]);
            if (!this.#checkRateLimit(limitKey, options.rateLimit)) {
                return {
                    allowed: false,
                    error: CrossBusError.from(ErrorCode.RATE_LIMITED, {
                        handler: handlerName,
                        peer: peerId,
                        limit: options.rateLimit
                    })
                };
            }
        }

        // Validate payload
        if (options.validatePayload) {
            try {
                const isValid = options.validatePayload(payload);
                if (!isValid) {
                    return {
                        allowed: false,
                        error: CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                            handler: handlerName
                        })
                    };
                }
            } catch (/** @type {any} */ e) {
                return {
                    allowed: false,
                    error: CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                        handler: handlerName,
                        reason: e?.message ?? 'Validation error'
                    })
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Checks rate limit for a key.
     * @param {string} key - Rate limit key (e.g., "handlerName:peerId")
     * @param {number} maxPerSecond - Maximum calls per second
     * @returns {boolean} - True if allowed, false if rate limited
     */
    #checkRateLimit(key, maxPerSecond) {
        const now = Date.now();
        const counter = this.#rateLimitCounters.get(key);

        if (!counter || now >= counter.resetAt) {
            // Start new window
            this.#rateLimitCounters.set(key, {
                count: 1,
                resetAt: now + 1000
            });
            return true;
        }

        if (counter.count >= maxPerSecond) {
            return false;
        }

        counter.count++;
        return true;
    }



    /**
     * Gets the maximum payload size.
     * @returns {number}
     */
    get maxPayloadSize() {
        return this.#maxPayloadSize;
    }

    /**
     * Gets whether strict mode is enabled.
     * @returns {boolean}
     */
    get strictMode() {
        return this.#strictMode;
    }

    /**
     * Gets whether debug mode is enabled.
     * @returns {boolean}
     */
    get debug() {
        return this.#debug;
    }

    /**
     * Gets the uptime in milliseconds.
     * @returns {number}
     */
    get uptime() {
        return Date.now() - this.#createdAt;
    }

    // ─────────────────────────────────────────────────────────────────
    // Debug Logging
    // ─────────────────────────────────────────────────────────────────

    /**
     * Logs a debug message if debug mode is enabled.
     * @param {'in'|'out'|'info'|'warn'|'error'} type - Log type
     * @param {string} message - Message to log
     */
    #log(type, message) {
        if (!this.#debug) return;

        const arrow = type === 'out' ? '→' :
            type === 'in' ? '←' :
                type === 'warn' ? '⚠️' :
                    type === 'error' ? '❌' : 'ℹ️';

        // eslint-disable-next-line no-console
        console.log(`${this.#debugPrefix} ${arrow} ${message}`);
    }

    // ─────────────────────────────────────────────────────────────────
    // Health Check
    // ─────────────────────────────────────────────────────────────────

    /**
     * Returns the health status of the CrossBus instance.
     * Useful for monitoring and diagnostics.
     *
     * @returns {Object} Health status object
     *
     * @example
     * const health = bus.healthCheck();
     * // {
     * //   status: 'healthy',
     * //   peerId: 'hub-1',
     * //   uptime: 123456,
     * //   peers: { total: 5, connected: 4 },
     * //   handlers: ['getData', 'setData'],
     * //   memory: { heapUsed: 12345678 }
     * // }
     */
    healthCheck() {
        const peerIds = this.#router.getPeerIds();
        const connectedCount = peerIds.length;

        // Determine status
        let status = 'healthy';
        if (this.#destroyed) {
            status = 'unhealthy';
        } else if (connectedCount === 0 && this.#isHub) {
            status = 'degraded';
        }

        // Get memory usage if available
        let memory;
        if (typeof process !== 'undefined' && process.memoryUsage) {
            try {
                const mem = process.memoryUsage();
                memory = {
                    heapUsed: mem.heapUsed,
                    heapTotal: mem.heapTotal,
                    rss: mem.rss
                };
            } catch {
                // Memory info not available
            }
        }

        return {
            status,
            peerId: this.#peerId,
            isHub: this.#isHub,
            uptime: this.uptime,
            peers: {
                total: connectedCount,
                ids: peerIds
            },
            handlers: Array.from(this.#handlers.keys()),
            pendingRequests: this.#pendingRequests.size ?? 0,
            destroyed: this.#destroyed,
            ...(memory && { memory })
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Static Factory Methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Creates a pre-configured secure CrossBus instance.
     * Recommended for production use by AI agents.
     *
     * Enforces:
     * - strictMode (no wildcard origins)
     * - 1MB max payload size
     * - 100 max pending requests
     * - 30s request timeout
     *
     * @param {CrossBusOptions} options - Configuration options
     * @returns {CrossBus} Configured instance
     * @throws {Error} If allowedOrigins contains '*' or is missing
     *
     * @example
     * // For production use
     * const hub = CrossBus.createSecure({
     *   peerId: 'my-hub',
     *   isHub: true,
     *   allowedOrigins: ['https://trusted-domain.com']
     * });
     */
    static createSecure(options = {}) {
        if (!options.allowedOrigins || options.allowedOrigins.length === 0) {
            throw new Error(
                'createSecure() requires allowedOrigins to be specified. ' +
                'For development, use: new CrossBus({ allowedOrigins: ["*"] })'
            );
        }

        if (options.allowedOrigins.some(origin => origin.includes('*'))) {
            throw new Error(
                'createSecure() does not allow wildcard origins. ' +
                'Specify exact origins: allowedOrigins: ["https://example.com"]'
            );
        }

        return new CrossBus({
            maxPayloadSize: 1024 * 1024,
            maxPendingRequests: 100,
            requestTimeout: 30000,
            ...options,
            strictMode: true
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Diagnostics (AI Agent Helper)
    // ─────────────────────────────────────────────────────────────────

    /**
     * Performs diagnostics and returns troubleshooting suggestions.
     * Designed to help AI agents identify and fix common issues.
     *
     * @returns {Object} Diagnostic report with issues and suggestions
     *
     * @example
     * const report = bus.diagnose();
     * if (report.issues.length > 0) {
     *   console.log('Issues found:', report.issues);
     *   console.log('Suggestions:', report.suggestions);
     * }
     */
    diagnose() {
        const issues = [];
        const suggestions = [];
        const warnings = [];

        // Check if destroyed
        if (this.#destroyed) {
            issues.push('Instance is destroyed');
            suggestions.push('Create a new CrossBus instance');
            return { status: 'error', issues, suggestions, warnings };
        }

        // Check peer connections
        const peerCount = this.#router.getPeerIds().length;
        if (peerCount === 0) {
            if (this.#isHub) {
                warnings.push('Hub has no connected peers');
                suggestions.push('Add transports with addTransport() or wait for agents to connect');
            } else {
                issues.push('Agent has no connected peers');
                suggestions.push('Add a transport to connect to hub: bus.addTransport(transport, {peerId: "hub"})');
            }
        }

        // Check handlers
        const handlerCount = this.#handlers.size;
        if (this.#isHub && handlerCount === 0) {
            warnings.push('Hub has no registered handlers');
            suggestions.push('Register handlers with bus.handle("name", fn)');
        }

        // Check pending requests
        const pendingCount = this.#pendingRequests.size ?? 0;
        if (pendingCount > this.#maxPendingRequests * 0.8) {
            warnings.push(`High pending request count: ${pendingCount}/${this.#maxPendingRequests}`);
            suggestions.push('Consider increasing maxPendingRequests or check for slow handlers');
        }

        // Check strict mode in production hints
        if (!this.#strictMode) {
            warnings.push('strictMode is disabled');
            suggestions.push('For production, use CrossBus.createSecure() or set strictMode: true');
        }

        // Determine overall status
        let status = 'healthy';
        if (issues.length > 0) {
            status = 'error';
        } else if (warnings.length > 0) {
            status = 'warning';
        }

        return {
            status,
            peerId: this.#peerId,
            isHub: this.#isHub,
            peerCount,
            handlerCount,
            pendingRequests: pendingCount,
            uptime: this.uptime,
            issues,
            warnings,
            suggestions
        };
    }
}
