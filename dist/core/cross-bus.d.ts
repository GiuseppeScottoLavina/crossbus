/**
 * @fileoverview CrossBus - Main facade for cross-context messaging.
 * Provides a unified API for inter-context communication.
 * @module core/cross-bus
 */
import { EventEmitter } from './event-emitter.js';
export type PeerStatus = import('../common/types.js').PeerStatus;
export type CrossBusOptions = {
    /**
     * - Unique peer identifier (auto-generated if not specified).
     */
    peerId?: string;
    /**
     * - Whether this instance is the hub.
     */
    isHub?: boolean;
    /**
     * - Default request timeout in ms.
     */
    requestTimeout?: number;
    /**
     * - Handshake timeout in ms.
     */
    handshakeTimeout?: number;
    /**
     * - Allowed origins for incoming connections.
     */
    allowedOrigins?: string[];
    /**
     * - Metadata to share with peers.
     */
    meta?: any;
    /**
     * - Supported capabilities.
     */
    capabilities?: string[];
    /**
     * - Preferred serialization format.
     */
    contentType?: string;
    /**
     * - Maximum payload size in bytes (default: 1MB).
     */
    maxPayloadSize?: number;
    /**
     * - Maximum concurrent pending requests.
     */
    maxPendingRequests?: number;
    /**
     * - Enforce strict security (disallows wildcard origins).
     */
    strictMode?: boolean;
    /**
     * - Enable verbose debug logging.
     */
    debug?: boolean;
    /**
     * - Prefix for debug log messages.
     */
    debugPrefix?: string;
};
export type HandlerOptions = {
    /**
     * - Peer IDs allowed to call this handler.
     */
    allowedPeers?: string[];
    /**
     * - Max calls per second from each peer.
     */
    rateLimit?: number;
    /**
     * - Custom payload validator function.
     */
    validatePayload?: Function;
};
export type PeerInfo = {
    /**
     * - Peer identifier.
     */
    peerId: string;
    /**
     * - Peer origin.
     */
    origin: string;
    /**
     * - Peer metadata.
     */
    meta: any;
    /**
     * - Connection status.
     */
    status: PeerStatus;
    /**
     * - Connection timestamp.
     */
    connectedAt: number;
};
export type RequestOptions = {
    /**
     * - Request timeout in ms.
     */
    timeout?: number;
};
export type BroadcastRequestOptions = {
    /**
     * - Per-peer timeout in ms.
     */
    timeout?: number;
    /**
     * - Peer IDs to exclude.
     */
    exclude?: string[];
    /**
     * - Whether to ignore peer errors.
     */
    ignoreErrors?: boolean;
};
export type HookContext = {
    /**
     * - Message type. `error`
     * is passed only to hooks registered with `{ errors: true }`.
     */
    type: 'signal' | 'request' | 'response' | 'error';
    /**
     * - Bound peer ID (if applicable).
     */
    peerId?: string;
    /**
     * - Handler name for requests, or the signal name.
     */
    handlerName?: string;
    /**
     * - Request ID for requests, responses and errors.
     */
    requestId?: string;
    /**
     * - Handler name of the request a response or
     * error answers. Inbound, it is taken from the local pending request.
     */
    requestName?: string;
    /**
     * - Inbound responses: the response success flag.
     */
    success?: boolean;
    /**
     * - Inbound signals re-dispatched locally from a
     * batch whose envelope already passed the inbound hooks.
     */
    batched?: boolean;
    /**
     * - Hook direction.
     */
    direction: 'inbound' | 'outbound';
};
export type HookOptions = {
    /**
     * - Also run this hook on RPC error objects
     * (`{ code, message }`) with context type `error`, in both directions.
     */
    errors?: boolean;
};
export type MessageHook = (payload: any, context: HookContext) => any | Promise<any>;
export type HookEntry = {
    /**
     * - Hook function.
     */
    fn: MessageHook;
    /**
     * - Execution priority (lower = first).
     */
    priority: number;
    /**
     * - Whether the hook also transforms RPC errors.
     */
    errors: boolean;
};
export type RequestHandler = (payload: any, context: any) => Promise<any> | any;
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
 * const result = await bus.request('widget', 'getData', { id: 1 });
 * bus.destroy();
 */
export declare class CrossBus extends EventEmitter {
    #private;
    /**
     * Creates a new CrossBus instance.
     *
     * @param {CrossBusOptions} [options={}]
     */
    constructor(options?: CrossBusOptions);
    /**
     * Gets the local peer ID.
     * @returns {string}
     */
    get peerId(): string;
    /**
     * Gets whether this instance is the hub.
     * @returns {boolean}
     */
    get isHub(): boolean;
    /**
     * Gets connected peer count.
     * @returns {number}
     */
    get peerCount(): number;
    /**
     * Gets all connected peer IDs.
     * @returns {string[]}
     */
    get peers(): string[];
    /**
     * Gets peer info by ID.
     *
     * @param {string} peerId
     * @returns {PeerInfo|undefined}
     */
    getPeer(peerId: string): PeerInfo | undefined;
    /**
     * Sends a signal to all connected peers.
     *
     * @param {string} signalName - Signal name (e.g., 'user:login').
     * @param {*} [payload] - Signal payload.
     * @param {Object} [options={}] - Send options.
     * @param {string[]} [options.exclude] - Peer IDs to exclude.
     * @returns {Promise<{ success: boolean, delivered: number, failed: string[] }>}
     *
     * @example
     * bus.signal('user:login', { userId: 123 });
     */
    signal(signalName: string, payload?: any, options?: {
        exclude?: string[];
    }): Promise<{
        success: boolean;
        delivered: number;
        failed: string[];
    }>;
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
    request(peerId: string, handlerName: string, payload?: any, options?: RequestOptions): Promise<any>;
    /**
     * Broadcasts a request to all peers and collects responses.
     *
     * @param {string} handlerName - Handler to invoke on all peers.
     * @param {*} [payload] - Request payload.
     * @param {BroadcastRequestOptions} [options={}]
     * @returns {Promise<Map<string, *>>} Map of peerId -> `{ success: true, data }`,
 *   or `{ success: false, error }` for failures when `ignoreErrors` is true.
     *
     * @example
     * const responses = await bus.broadcastRequest('getStatus');
     * for (const [peerId, status] of responses) {
     *   if (status.success) console.log(`${peerId}: ${status.data.state}`);
 *   else console.warn(`${peerId} failed: ${status.error}`);
     * }
     */
    broadcastRequest(handlerName: string, payload?: any, options?: BroadcastRequestOptions): Promise<Map<string, any>>;
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
    handle(handlerName: string, handler: RequestHandler, options?: HandlerOptions): Function;
    /**
     * Removes a handler.
     *
     * @param {string} handlerName
     * @returns {boolean} True if handler was removed.
     */
    unhandle(handlerName: string): boolean;
    /**
     * Checks if a handler is registered.
     *
     * @param {string} handlerName
     * @returns {boolean}
     */
    hasHandler(handlerName: string): boolean;
    /**
     * Adds an inbound hook to transform incoming payloads.
     *
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @param {HookOptions} [options={}] - Hook options.
     * @returns {Function} Unregister function.
     *
     * @example
     * // Decrypt incoming messages
     * const unhook = bus.addInboundHook(async (payload, ctx) => {
     *   return await decrypt(payload);
     * });
     */
    addInboundHook(hookFn: MessageHook, priority?: number, options?: HookOptions): Function;
    /**
     * Adds an outbound hook to transform outgoing payloads.
     *
     * @param {MessageHook} hookFn - Hook function.
     * @param {number} [priority=10] - Execution priority (lower = first).
     * @param {HookOptions} [options={}] - Hook options.
     * @returns {Function} Unregister function.
     *
     * @example
     * // Encrypt outgoing messages
     * const unhook = bus.addOutboundHook(async (payload, ctx) => {
     *   return await encrypt(payload);
     * });
     */
    addOutboundHook(hookFn: MessageHook, priority?: number, options?: HookOptions): Function;
    /**
     * Removes an inbound hook.
     *
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeInboundHook(hookFn: MessageHook): boolean;
    /**
     * Removes an outbound hook.
     *
     * @param {MessageHook} hookFn
     * @returns {boolean} True if removed.
     */
    removeOutboundHook(hookFn: MessageHook): boolean;
    /**
     * Adds a peer with a send function.
     * Used for hub mode when managing connections manually.
     *
     * @param {string} peerId - Peer identifier.
     * @param {(message: any) => void} sendFn - Function to send messages.
     * @param {Object} [options={}] - Additional options.
     */
    addPeer(peerId: string, sendFn: (message: any) => void, options?: any): void;
    /**
     * Removes a peer.
     *
     * @param {string} peerId
     * @returns {boolean}
     */
    removePeer(peerId: string): boolean;
    /**
     * Adds a transport and automatically wires up message handling.
     * This is the recommended way to connect transports for AI agents.
     *
     * @param {Object} transport - Transport instance with send() and onMessage() methods.
     * @param {Object} [options={}] - Additional options.
     * @param {string} [options.peerId] - Override peer ID (defaults to transport's peerId or auto-generated).
     * @param {string} [options.origin='*'] - Origin for message validation.
     * @param {boolean} [options.goodbye=false] - On a channel with exactly one remote bus,
     *   tell the other side when this binding ends (cleanup, `removePeer()` or `destroy()`),
     *   and end this binding when the other side says so: its pending requests reject at
     *   once with `ERR_PEER_DISCONNECTED` instead of at their timeout. Both endpoints must
     *   set it. Do not use it on shared channels such as BroadcastChannel, where one
     *   leaving endpoint would end the binding for all.
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
    addTransport(transport: any, options?: {
        peerId?: string;
        origin?: string;
        goodbye?: boolean;
    }): Function;
    /**
     * Registers synchronous resource cleanup for bus destruction.
     * @param {Function} cleanup
     * @returns {() => boolean} Removes the registration without running it.
     */
    addCleanup(cleanup: Function): () => boolean;
    /**
     * Handles an incoming message.
     * Call this when receiving a message from any transport.
     *
     * @param {Object} message - The received message.
     * @param {string} origin - Origin of the message.
     * @param {string} [peerId] - Source peer ID if known.
     * @param {Function} [replyFn] - Function to reply to the sender.
     */
    handleMessage(message: any, origin: string, peerId?: string, replyFn?: Function): Promise<void>;
    /**
     * Destroys the CrossBus, cleaning up all resources.
     */
    destroy(): void;
    /**
     * Checks if the bus has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    /**
     * Gets the maximum payload size.
     * @returns {number}
     */
    get maxPayloadSize(): number;
    /**
     * Gets whether strict mode is enabled.
     * @returns {boolean}
     */
    get strictMode(): boolean;
    /**
     * Gets whether debug mode is enabled.
     * @returns {boolean}
     */
    get debug(): boolean;
    /**
     * Gets the uptime in milliseconds.
     * @returns {number}
     */
    get uptime(): number;
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
     * //   isHub: true,
     * //   uptime: 123456,
     * //   peers: { total: 2, ids: ['widget-1', 'widget-2'] },
     * //   handlers: ['getData', 'setData'],
     * //   pendingRequests: 0,
     * //   destroyed: false,
     * //   memory: { heapUsed: 12345678, heapTotal: 23456789, rss: 34567890 } // Node/Bun only
     * // }
     */
    healthCheck(): any;
    /**
     * Creates a pre-configured secure CrossBus instance.
     * Recommended for production use by AI agents.
     *
     * Enforces:
     * - strictMode (no wildcard origins)
     * - 1MB max payload size (overridable; 0 is rejected)
     * - 100 max pending requests (overridable; 0 is rejected)
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
    static createSecure(options?: CrossBusOptions): CrossBus;
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
    diagnose(): any;
}
