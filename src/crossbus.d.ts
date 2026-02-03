/**
 * CrossBus TypeScript Declarations
 * Complete type definitions for CrossBus and related modules.
 * @module crossbus
 */

// ─────────────────────────────────────────────────────────────────
// Common Types
// ─────────────────────────────────────────────────────────────────

export declare const PROTOCOL_MARKER: number;
export declare const PROTOCOL_VERSION: number;

export declare const MessageType: {
    readonly SIGNAL: 'sig';
    readonly REQUEST: 'req';
    readonly RESPONSE: 'res';
    readonly HANDSHAKE_INIT: 'hs:init';
    readonly HANDSHAKE_ACK: 'hs:ack';
    readonly HANDSHAKE_COMPLETE: 'hs:ok';
    readonly STREAM_START: 'str:s';
    readonly STREAM_DATA: 'str:d';
    readonly STREAM_END: 'str:e';
    readonly STREAM_ERROR: 'str:err';
    readonly PRESENCE: 'pres';
};

export declare const PeerStatus: {
    readonly UNKNOWN: 'unknown';
    readonly CONNECTING: 'connecting';
    readonly CONNECTED: 'connected';
    readonly DISCONNECTED: 'disconnected';
};

export declare const ErrorCode: {
    readonly TIMEOUT: 'ERR_TIMEOUT';
    readonly PEER_NOT_FOUND: 'ERR_PEER_NOT_FOUND';
    readonly HANDLER_NOT_FOUND: 'ERR_HANDLER_NOT_FOUND';
    readonly HANDLER_ERROR: 'ERR_HANDLER_ERROR';
    readonly TRANSPORT_ERROR: 'ERR_TRANSPORT_ERROR';
    readonly DESTROYED: 'ERR_DESTROYED';
    readonly SERIALIZATION_ERROR: 'ERR_SERIALIZATION_ERROR';
    readonly HANDSHAKE_FAILED: 'ERR_HANDSHAKE_FAILED';
    readonly ORIGIN_REJECTED: 'ERR_ORIGIN_REJECTED';
    readonly PAYLOAD_TOO_LARGE: 'ERR_PAYLOAD_TOO_LARGE';
    readonly RATE_LIMITED: 'ERR_RATE_LIMITED';
    readonly UNAUTHORIZED: 'ERR_UNAUTHORIZED';
    readonly INVALID_PAYLOAD: 'ERR_INVALID_PAYLOAD';
};

// ─────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────

export declare class CrossBusError extends Error {
    readonly code: string;
    readonly details?: Record<string, unknown>;
    readonly retryable: boolean;
    readonly timestamp: number;

    constructor(code: string, message?: string, options?: { details?: Record<string, unknown> });

    static from(code: string, details?: Record<string, unknown>): CrossBusError;
}

export declare function isCrossBusError(error: unknown): error is CrossBusError;
export declare function isRetryable(error: unknown): boolean;

// ─────────────────────────────────────────────────────────────────
// CrossBus Options
// ─────────────────────────────────────────────────────────────────

export interface CrossBusOptions {
    /** Unique peer identifier (auto-generated if not specified) */
    peerId?: string;
    /** Whether this instance is the hub */
    isHub?: boolean;
    /** Default request timeout in ms */
    requestTimeout?: number;
    /** Handshake timeout in ms */
    handshakeTimeout?: number;
    /** Allowed origins for incoming connections */
    allowedOrigins?: string[];
    /** Metadata to share with peers */
    meta?: Record<string, unknown>;
    /** Supported capabilities */
    capabilities?: string[];
    /** Preferred serialization format */
    contentType?: string;
    /** Maximum payload size in bytes (default: 1MB) */
    maxPayloadSize?: number;
    /** Maximum concurrent pending requests (default: 100) */
    maxPendingRequests?: number;
    /** Enforce strict security (disallows wildcard origins) */
    strictMode?: boolean;
    /** Enable verbose debug logging */
    debug?: boolean;
    /** Prefix for debug log messages */
    debugPrefix?: string;
}

export interface HandlerOptions {
    /** Whitelist of peer IDs allowed to call this handler */
    allowedPeers?: string[];
    /** Maximum calls per second per peer */
    rateLimit?: number;
    /** Custom payload validation function */
    validatePayload?: (payload: unknown) => boolean;
}

export interface RequestOptions {
    /** Request timeout in ms */
    timeout?: number;
}

export interface SignalOptions {
    /** Peer IDs to exclude from broadcast */
    exclude?: string[];
}

export interface SignalResult {
    /** Number of peers that received the signal */
    delivered: number;
    /** Peer IDs that failed to receive */
    failed: string[];
}

export interface HealthStatus {
    /** Overall health status */
    status: 'healthy' | 'degraded' | 'unhealthy';
    /** Local peer ID */
    peerId: string;
    /** Whether this is a hub */
    isHub: boolean;
    /** Uptime in milliseconds */
    uptime: number;
    /** Connected peers info */
    peers: {
        total: number;
        ids: string[];
    };
    /** Registered handler names */
    handlers: string[];
    /** Number of pending requests */
    pendingRequests: number;
    /** Whether the bus is destroyed */
    destroyed: boolean;
    /** Memory usage (Node.js only) */
    memory?: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
    };
}

export interface PeerInfo {
    peerId: string;
    status: string;
    meta?: Record<string, unknown>;
    capabilities?: string[];
}

// ─────────────────────────────────────────────────────────────────
// CrossBus Class
// ─────────────────────────────────────────────────────────────────

export declare class CrossBus {
    constructor(options?: CrossBusOptions);

    // Properties
    readonly peerId: string;
    readonly isHub: boolean;
    readonly peers: string[];
    readonly peerCount: number;
    readonly maxPayloadSize: number;
    readonly strictMode: boolean;
    readonly debug: boolean;
    readonly uptime: number;
    readonly isDestroyed: boolean;

    // Static Factory Methods
    static createSecure(options: CrossBusOptions): CrossBus;

    // Peer Management
    addPeer(peerId: string, sendFn: (message: unknown) => void): void;
    removePeer(peerId: string): boolean;
    getPeer(peerId: string): PeerInfo | undefined;
    hasPeer(peerId: string): boolean;

    // Transport Management
    addTransport(transport: Transport, options?: { peerId?: string }): void;
    removeTransport(transport: Transport): boolean;

    // Messaging
    signal(name: string, payload?: unknown, options?: SignalOptions): Promise<SignalResult>;
    request<T = unknown>(peerId: string, handler: string, payload?: unknown, options?: RequestOptions): Promise<T>;

    // Handler Registration
    handle(name: string, handler: (payload: unknown, context: HandlerContext) => unknown | Promise<unknown>, options?: HandlerOptions): () => void;
    unhandle(name: string): boolean;
    hasHandler(name: string): boolean;

    // Event Handling
    on(event: string, handler: (event: SignalEvent) => void, options?: { mode?: 'sync' | 'async' }): () => void;
    off(event: string, handler: (event: SignalEvent) => void): boolean;
    once(event: string, handler: (event: SignalEvent) => void): () => void;
    emit(event: string, data?: unknown): void;

    // Hooks
    addInboundHook(fn: HookFunction, priority?: number): () => void;
    addOutboundHook(fn: HookFunction, priority?: number): () => void;
    removeInboundHook(fn: HookFunction): boolean;
    removeOutboundHook(fn: HookFunction): boolean;

    // Diagnostics
    healthCheck(): HealthStatus;
    handleMessage(message: unknown, origin: string, peerId: string, replyFn?: (response: unknown) => void): Promise<void>;

    // Lifecycle
    destroy(): void;
}

export interface HandlerContext {
    peerId: string;
    requestId: string;
    handlerName: string;
}

export interface HookContext {
    type: 'signal' | 'request' | 'response';
    direction: 'inbound' | 'outbound';
    peerId?: string;
    handlerName?: string;
}

export type HookFunction = (payload: unknown, context: HookContext) => unknown | Promise<unknown>;

export interface SignalEvent {
    type: string;
    data: {
        payload: unknown;
        peerId?: string;
    };
}

// ─────────────────────────────────────────────────────────────────
// Transport Interfaces
// ─────────────────────────────────────────────────────────────────

export interface Transport {
    readonly peerId?: string;
    send(message: unknown): void;
    onMessage(handler: (message: unknown) => void): void;
    destroy(): void;
}

export interface PostMessageTransportOptions {
    targetOrigin?: string;
    allowedOrigins?: string[];
    autoTransfer?: boolean;
    contentType?: string;
}

export declare class PostMessageTransport implements Transport {
    readonly peerId: string;
    constructor(target: Window | Worker | MessagePort, options?: PostMessageTransportOptions);
    send(message: unknown): void;
    onMessage(handler: (message: unknown) => void): void;
    destroy(): void;
}

export interface BroadcastChannelTransportOptions {
    autoClean?: boolean;
}

export declare class BroadcastChannelTransport implements Transport {
    readonly peerId: string;
    constructor(channelName: string, options?: BroadcastChannelTransportOptions);
    send(message: unknown): void;
    onMessage(handler: (message: unknown) => void): void;
    destroy(): void;
}

export interface WebSocketTransportOptions {
    url: string;
    peerId?: string;
    autoReconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    heartbeatInterval?: number;
}

export declare class WebSocketTransport implements Transport {
    readonly peerId: string;
    readonly state: 'connecting' | 'connected' | 'disconnected' | 'error';
    readonly isConnected: boolean;
    constructor(options: WebSocketTransportOptions);
    connect(): Promise<void>;
    disconnect(): void;
    send(message: unknown): boolean;
    onMessage(handler: (message: unknown) => void): void;
    onStateChange(handler: (state: string) => void): void;
    destroy(): void;
}

// ─────────────────────────────────────────────────────────────────
// Testing Utilities
// ─────────────────────────────────────────────────────────────────

export declare class MockTransport implements Transport {
    readonly peerId: string;
    readonly sentMessages: unknown[];
    constructor(peerId?: string);
    send(message: unknown): void;
    onMessage(handler: (message: unknown) => void): void;
    simulateReceive(message: unknown): void;
    destroy(): void;
}

export declare function createConnectedMocks(peerIdA?: string, peerIdB?: string): {
    transport1: MockTransport;
    transport2: MockTransport;
};

// ─────────────────────────────────────────────────────────────────
// Plugins
// ─────────────────────────────────────────────────────────────────

// Schema Validation Plugin
export interface JSONSchema {
    $id?: string;
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, JSONSchema>;
    required?: string[];
    items?: JSONSchema;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
    pattern?: string;
    enum?: unknown[];
}

export interface ValidationResult {
    valid: boolean;
    errors?: Array<{ path: string; message: string }>;
}

export declare function createValidator(schema: JSONSchema): (data: unknown) => ValidationResult;

export declare function withSchemaValidation<T>(
    schema: JSONSchema,
    handler: (payload: unknown, context: HandlerContext) => T | Promise<T>
): (payload: unknown, context: HandlerContext) => Promise<T>;

export declare function createValidationHook(
    schemas: Record<string, JSONSchema>
): HookFunction;

// Retry Plugin
export interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
}

export declare function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T>;

// Encryption Plugin
export declare function withEncryption(key: CryptoKey): {
    encrypt: (data: unknown) => Promise<unknown>;
    decrypt: (data: unknown) => Promise<unknown>;
};

// Compression Plugin
export declare function withCompression(): {
    compress: (data: unknown) => Promise<unknown>;
    decompress: (data: unknown) => Promise<unknown>;
};

// Batch Plugin
export interface BatchOptions {
    maxBatchSize?: number;
    windowMs?: number;
}

export declare function createBatcher(
    sendFn: (messages: unknown[]) => void,
    options?: BatchOptions
): {
    queue: (message: unknown) => void;
    flush: () => void;
    stats: { queued: number; flushed: number };
};

// ─────────────────────────────────────────────────────────────────
// Event Emitter
// ─────────────────────────────────────────────────────────────────

export declare class EventEmitter {
    on(event: string, handler: Function): () => void;
    off(event: string, handler: Function): boolean;
    once(event: string, handler: Function): () => void;
    emit(event: string, data?: unknown): void;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
}

export declare function createFastEmitter(): EventEmitter;

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────

export declare function uuid(): string;
export declare function sleep(ms: number): Promise<void>;
export declare function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>;
export declare function isCloneable(value: unknown): boolean;
export declare function timestamp(): number;

export interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
}

export declare function deferred<T>(): Deferred<T>;
