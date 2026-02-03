/**
 * @typedef {Object} MessageChannelTransportOptions
 * @property {boolean} [autoTransfer=false] - Auto-detect and transfer transferable objects.
 * @property {string} [contentType='application/json'] - Serialization format.
 */
/**
 * @typedef {Object} ChannelPair
 * @property {MessagePort} local - Local port (we listen on this).
 * @property {MessagePort} remote - Remote port (send this to other context).
 */
/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'channel' for this transport.
 */
/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */
/**
 * MessageChannel-based transport for direct peer-to-peer communication.
 *
 * This transport creates a direct communication channel that bypasses
 * the hub routing, providing lower latency for high-frequency peer pairs.
 *
 * Use cases:
 * - Direct iframe ↔ worker communication
 * - High-frequency data streams
 * - Bypassing hub for performance
 *
 * @example
 * // On hub side: create channel and send to peer
 * const transport = new MessageChannelTransport();
 * iframe.contentWindow.postMessage(
 *   { type: 'channel', port: transport.remotePort },
 *   '*',
 *   [transport.remotePort]
 * );
 *
 * // On peer side: wrap received port
 * window.addEventListener('message', (e) => {
 *   if (e.data.type === 'channel') {
 *     const transport = MessageChannelTransport.fromPort(e.data.port);
 *     transport.onMessage((msg) => console.log('Received:', msg));
 *   }
 * });
 */
export class MessageChannelTransport {
    /**
     * Checks if MessageChannel API is available.
     *
     * @returns {boolean} True if MessageChannel is supported.
     */
    static isSupported(): boolean;
    /**
     * Creates a MessageChannelTransport from an existing port.
     * Use this when receiving a port from another context.
     *
     * @param {MessagePort} port - The received port.
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @returns {MessageChannelTransport}
     */
    static fromPort(port: MessagePort, options?: MessageChannelTransportOptions): MessageChannelTransport;
    /**
     * Creates a new MessageChannel transport (as initiator).
     * The remote port should be sent to the other context via postMessage.
     *
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If MessageChannel is not supported.
     */
    constructor(options?: MessageChannelTransportOptions);
    /**
     * Gets the remote port to send to the other context.
     * This port can only be accessed once and becomes null after transfer.
     *
     * @returns {MessagePort|null} The remote port, or null if already transferred.
     */
    get remotePort(): MessagePort | null;
    /**
     * Marks the remote port as transferred (called automatically when used).
     */
    markRemoteTransferred(): void;
    /**
     * Checks if this transport was created as the channel initiator.
     * @returns {boolean}
     */
    get isInitiator(): boolean;
    /**
     * Sends a message to the connected peer.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects to pass.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message: any, transfer?: Transferable[]): void;
    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Removes the message handler.
     */
    offMessage(): void;
    /**
     * Destroys the transport, closing ports.
     */
    destroy(): void;
    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    #private;
}
export type MessageChannelTransportOptions = {
    /**
     * - Auto-detect and transfer transferable objects.
     */
    autoTransfer?: boolean | undefined;
    /**
     * - Serialization format.
     */
    contentType?: string | undefined;
};
export type ChannelPair = {
    /**
     * - Local port (we listen on this).
     */
    local: MessagePort;
    /**
     * - Remote port (send this to other context).
     */
    remote: MessagePort;
};
export type MessageContext = {
    /**
     * - Always 'channel' for this transport.
     */
    origin: string;
};
export type MessageHandler = (message: any, context: MessageContext) => any;
