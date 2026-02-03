/**
 * @typedef {Object} WebSocketTransportOptions
 * @property {string} url - WebSocket server URL (ws:// or wss://)
 * @property {string} [peerId] - Local peer ID
 * @property {boolean} [autoReconnect=true] - Auto-reconnect on disconnect
 * @property {number} [reconnectDelayMs=1000] - Base delay for reconnection
 * @property {number} [maxReconnectDelayMs=30000] - Max delay with exponential backoff
 * @property {number} [heartbeatIntervalMs=30000] - Heartbeat interval (0 to disable)
 * @property {Object} [protocols] - WebSocket subprotocols
 */
/**
 * WebSocket transport for server communication.
 *
 * @example
 * const transport = new WebSocketTransport({
 *   url: 'wss://api.example.com/crossbus',
 *   peerId: 'client-1'
 * });
 *
 * transport.onMessage((msg) => console.log('Received:', msg));
 * transport.onStateChange((state) => console.log('State:', state));
 *
 * await transport.connect();
 * transport.send({ type: 'hello', payload: { name: 'client' } });
 */
export class WebSocketTransport {
    /**
     * Creates a new WebSocket transport.
     * @param {WebSocketTransportOptions} options
     */
    constructor(options: WebSocketTransportOptions);
    /** @returns {string} */
    get peerId(): string;
    /** @returns {'connecting'|'connected'|'disconnected'|'error'} */
    get state(): "connecting" | "connected" | "disconnected" | "error";
    /** @returns {boolean} */
    get isConnected(): boolean;
    /**
     * Connects to the WebSocket server.
     * @returns {Promise<void>}
     */
    connect(): Promise<void>;
    /**
     * Disconnects from the server.
     */
    disconnect(): void;
    /**
     * Sends a message to the server.
     * @param {Object} message - Message to send
     * @returns {boolean} Whether the message was sent immediately
     */
    send(message: any): boolean;
    /**
     * Sets the message handler.
     * @param {(message: Object) => void} handler
     */
    onMessage(handler: (message: any) => void): void;
    /**
     * Sets the state change handler.
     * @param {(state: string) => void} handler
     */
    onStateChange(handler: (state: string) => void): void;
    /**
     * Destroys the transport.
     */
    destroy(): void;
    #private;
}
export type WebSocketTransportOptions = {
    /**
     * - WebSocket server URL (ws:// or wss://)
     */
    url: string;
    /**
     * - Local peer ID
     */
    peerId?: string | undefined;
    /**
     * - Auto-reconnect on disconnect
     */
    autoReconnect?: boolean | undefined;
    /**
     * - Base delay for reconnection
     */
    reconnectDelayMs?: number | undefined;
    /**
     * - Max delay with exponential backoff
     */
    maxReconnectDelayMs?: number | undefined;
    /**
     * - Heartbeat interval (0 to disable)
     */
    heartbeatIntervalMs?: number | undefined;
    /**
     * - WebSocket subprotocols
     */
    protocols?: any;
};
