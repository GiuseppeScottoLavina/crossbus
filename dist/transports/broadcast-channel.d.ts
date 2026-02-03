/**
 * @typedef {Object} BroadcastChannelTransportOptions
 * @property {string} [channelName='crossbus:default'] - Name of the broadcast channel.
 * @property {string} [contentType='application/json'] - Serialization format.
 */
/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'broadcast' for this transport.
 */
/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */
/**
 * BroadcastChannel-based transport for same-origin communication.
 *
 * Perfect for:
 * - Multiple tabs of the same app
 * - Communication without opening connections
 * - Pub/sub pattern across contexts
 *
 * Limitations:
 * - Same-origin only (no cross-origin)
 * - No guaranteed delivery order
 * - No acknowledgments (fire-and-forget)
 *
 * @example
 * // Create transport
 * const transport = new BroadcastChannelTransport({
 *   channelName: 'myapp:events'
 * });
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received:', msg);
 * });
 *
 * // Send message (to all other tabs)
 * transport.send({ type: 'notification', payload: { text: 'Hello!' } });
 *
 * // Cleanup
 * transport.destroy();
 */
export class BroadcastChannelTransport {
    /**
     * Checks if BroadcastChannel API is available.
     *
     * @returns {boolean} True if BroadcastChannel is supported.
     */
    static isSupported(): boolean;
    /**
     * Creates a new BroadcastChannel transport.
     *
     * @param {BroadcastChannelTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If BroadcastChannel is not supported.
     */
    constructor(options?: BroadcastChannelTransportOptions);
    /**
     * Sends a message to all other tabs/windows.
     *
     * @param {Object} message - Protocol message to send.
     * @throws {CrossBusError} If transport is destroyed.
     *
     * @example
     * transport.send({
     *   t: 'broadcast',
     *   id: 'abc123',
     *   p: { event: 'user:login' }
     * });
     */
    send(message: any): void;
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
     * Destroys the transport, closing the channel.
     */
    destroy(): void;
    /**
     * Gets the channel name.
     * @returns {string}
     */
    get channelName(): string;
    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    #private;
}
export type BroadcastChannelTransportOptions = {
    /**
     * - Name of the broadcast channel.
     */
    channelName?: string | undefined;
    /**
     * - Serialization format.
     */
    contentType?: string | undefined;
};
export type MessageContext = {
    /**
     * - Always 'broadcast' for this transport.
     */
    origin: string;
};
export type MessageHandler = (message: any, context: MessageContext) => any;
