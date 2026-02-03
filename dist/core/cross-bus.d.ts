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
 * @property {*} [defaultValue] - Value to return on timeout instead of throwing.
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
 * CrossBus - Zero-leak, high-performance cross-context messaging.
 *
 * Features:
 * - Hub/Mesh routing
 * - Request/Response pattern
 * - Broadcast to all peers
 * - ACK-based reliability
 * - Origin validation
 * - Resource lifecycle management
 *
 * @example
 * // Hub (main page)
 * const hub = new CrossBus({ isHub: true });
 *
 * // Connect iframe
 * hub.connect(iframe.contentWindow, {
 *   targetOrigin: 'https://widget.example.com'
 * });
 *
 * // Register handler
 * hub.handle('getData', async (payload, ctx) => {
 *   return { items: await fetchItems() };
 * });
 *
 * // Emit signal
 * hub.emit('user:login', { userId: 123 });
 *
 * // Request/Response
 * const result = await hub.request('widget-1', 'getStatus');
 *
 * // Cleanup
 * hub.destroy();
 */
export class CrossBus extends EventEmitter {
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
    static createSecure(options?: CrossBusOptions): CrossBus;
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
     * @returns {Promise<{ delivered: number, failed: string[] }>}
     *
     * @example
     * bus.signal('user:login', { userId: 123 });
     */
    signal(signalName: string, payload?: any, options?: {
        exclude?: string[] | undefined;
    }): Promise<{
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
     * @returns {Promise<Map<string, *>>} Map of peerId -> response.
     *
     * @example
     * const responses = await bus.broadcastRequest('getStatus');
     * for (const [peerId, status] of responses) {
     *   console.log(`${peerId}: ${status.state}`);
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
     * @returns {Function} Unregister function.
     *
     * @example
     * // Decrypt incoming messages
     * const unhook = bus.addInboundHook(async (payload, ctx) => {
     *   return await decrypt(payload);
     * });
     */
    addInboundHook(hookFn: MessageHook, priority?: number): Function;
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
    addOutboundHook(hookFn: MessageHook, priority?: number): Function;
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
     * @param {EventListener} sendFn - Function to send messages.
     * @param {Object} [options={}] - Additional options.
     */
    addPeer(peerId: string, sendFn: EventListener, options?: any): void;
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
        peerId?: string | undefined;
        origin?: string | undefined;
    }): Function;
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
     * //   uptime: 123456,
     * //   peers: { total: 5, connected: 4 },
     * //   handlers: ['getData', 'setData'],
     * //   memory: { heapUsed: 12345678 }
     * // }
     */
    healthCheck(): any;
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
    #private;
}
export type CrossBusOptions = {
    /**
     * - Unique peer identifier (auto-generated if not specified).
     */
    peerId?: string | undefined;
    /**
     * - Whether this instance is the hub.
     */
    isHub?: boolean | undefined;
    /**
     * - Default request timeout in ms.
     */
    requestTimeout?: number | undefined;
    /**
     * - Handshake timeout in ms.
     */
    handshakeTimeout?: number | undefined;
    /**
     * - Allowed origins for incoming connections.
     */
    allowedOrigins?: string[] | undefined;
    /**
     * - Metadata to share with peers.
     */
    meta?: any;
    /**
     * - Supported capabilities.
     */
    capabilities?: string[] | undefined;
    /**
     * - Preferred serialization format.
     */
    contentType?: string | undefined;
    /**
     * - Maximum payload size in bytes (default: 1MB).
     */
    maxPayloadSize?: number | undefined;
    /**
     * - Maximum concurrent pending requests.
     */
    maxPendingRequests?: number | undefined;
    /**
     * - Enforce strict security (disallows wildcard origins).
     */
    strictMode?: boolean | undefined;
    /**
     * - Enable verbose debug logging.
     */
    debug?: boolean | undefined;
    /**
     * - Prefix for debug log messages.
     */
    debugPrefix?: string | undefined;
};
export type HandlerOptions = {
    /**
     * - Peer IDs allowed to call this handler.
     */
    allowedPeers?: string[] | undefined;
    /**
     * - Max calls per second from each peer.
     */
    rateLimit?: number | undefined;
    /**
     * - Custom payload validator function.
     */
    validatePayload?: Function | undefined;
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
    timeout?: number | undefined;
    /**
     * - Value to return on timeout instead of throwing.
     */
    defaultValue?: any;
};
export type BroadcastRequestOptions = {
    /**
     * - Per-peer timeout in ms.
     */
    timeout?: number | undefined;
    /**
     * - Peer IDs to exclude.
     */
    exclude?: string[] | undefined;
    /**
     * - Whether to ignore peer errors.
     */
    ignoreErrors?: boolean | undefined;
};
export type HookContext = {
    /**
     * - Message type.
     */
    type: "signal" | "request" | "response";
    /**
     * - Peer ID (if applicable).
     */
    peerId?: string | undefined;
    /**
     * - Handler name (for requests).
     */
    handlerName?: string | undefined;
    /**
     * - Hook direction.
     */
    direction: "inbound" | "outbound";
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
};
export type RequestHandler = (payload: any, context: any) => Promise<any> | any;
import { EventEmitter } from './event-emitter.js';
import { PeerStatus } from '../common/types.js';
