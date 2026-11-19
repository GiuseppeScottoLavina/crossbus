/**
 * @fileoverview MessageChannel transport for direct 1:1 peer communication.
 * Uses the MessageChannel API for efficient, low-latency communication.
 * @module transports/message-channel
 */
export type MessageChannelTransportOptions = {
    /**
     * - Auto-detect and transfer transferable objects.
     */
    autoTransfer?: boolean;
    /**
     * - Serialization format.
     */
    contentType?: string;
    /**
     * - Compact requires 0.1.3+ receivers; compact-v2 requires 0.1.6+ receivers.
     */
    wireFormat?: 'standard' | 'compact' | 'compact-v2';
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
export declare class MessageChannelTransport {
    #private;
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
     * @param {MessagePort|null} [port=null] - Internal existing-port construction. Prefer fromPort().
     * @throws {CrossBusError} If MessageChannel is not supported.
     */
    constructor(options?: MessageChannelTransportOptions, port?: MessagePort | null);
    /**
     * Gets the remote port to send to the other context, or to pass to
     * {@link MessageChannelTransport.fromPort} in this one.
     *
     * @returns {MessagePort|null} The remote port, or null after `markRemoteTransferred()`.
     */
    get remotePort(): MessagePort | null;
    /** Gets the selected outgoing encoding. Receivers accept standard and both compact versions. */
    get wireFormat(): "compact" | "compact-v2" | "standard";
    /**
     * Forgets the remote port after it was transferred. `destroy()` closes the
     * remote port only while this transport still holds it and no
     * `fromPort()` transport has adopted it.
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
}
