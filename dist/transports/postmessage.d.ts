/**
 * @typedef {Window|Worker|ServiceWorker|MessagePort} PostMessageTarget
 * Target that supports postMessage API.
 */
/**
 * @typedef {Object} PostMessageTransportOptions
 * @property {string} [targetOrigin='*'] - Expected origin for outgoing messages.
 * @property {string[]} [allowedOrigins=[]] - Allowed origins for incoming messages.
 *                                            Empty = same origin only.
 * @property {boolean} [autoTransfer=false] - Auto-detect and transfer transferable objects.
 * @property {string} [contentType='application/json'] - Serialization format.
 */
/**
 * @typedef {Object} MessageSource
 * @property {string} origin - Origin of the message.
 * @property {PostMessageTarget} source - The window/worker that sent the message.
 */
/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageSource} source - Info about the message source.
 */
/**
 * PostMessage-based transport for cross-context communication.
 *
 * Supports:
 * - Window to Window (iframe, popup)
 * - Main thread to Worker
 * - Main thread to ServiceWorker
 *
 * @example
 * // Connect to iframe
 * const iframe = document.getElementById('widget');
 * const transport = new PostMessageTransport(iframe.contentWindow, {
 *   targetOrigin: 'https://widget.example.com',
 *   allowedOrigins: ['https://widget.example.com']
 * });
 *
 * transport.onMessage((msg, source) => {
 *   console.log('Received:', msg, 'from:', source.origin);
 * });
 *
 * transport.send({ type: 'greeting', payload: { hello: 'world' } });
 *
 * // Cleanup
 * transport.destroy();
 */
export class PostMessageTransport {
    /**
     * Checks if PostMessage API is available.
     *
     * @returns {boolean} True if postMessage is supported.
     */
    static isSupported(): boolean;
    /**
     * Creates a new PostMessage transport.
     *
     * @param {PostMessageTarget} target - The window/worker to communicate with.
     * @param {PostMessageTransportOptions} [options={}] - Configuration options.
     * @throws {TypeError} If target is not a valid postMessage target.
     */
    constructor(target: PostMessageTarget, options?: PostMessageTransportOptions);
    /**
     * Sends a message to the target.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects to pass.
     * @throws {CrossBusError} If transport is destroyed or target is closed.
     *
     * @example
     * // Simple send
     * transport.send({ t: 'sig', id: '123', p: { data: 'value' } });
     *
     * // With transferable
     * const buffer = new ArrayBuffer(1024);
     * transport.send({ t: 'sig', id: '456', p: buffer }, [buffer]);
     */
    send(message: any, transfer?: Transferable[]): void;
    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     *
     * @example
     * transport.onMessage((msg, source) => {
     *   if (msg.t === 'req') {
     *     // Handle request
     *   }
     * });
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Removes the message handler.
     */
    offMessage(): void;
    /**
     * Destroys the transport, removing all listeners.
     * After destruction, send() will throw.
     */
    destroy(): void;
    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    /**
     * Gets the target origin.
     * @returns {string}
     */
    get targetOrigin(): string;
    #private;
}
/**
 * Target that supports postMessage API.
 */
export type PostMessageTarget = Window | Worker | ServiceWorker | MessagePort;
export type PostMessageTransportOptions = {
    /**
     * - Expected origin for outgoing messages.
     */
    targetOrigin?: string | undefined;
    /**
     * - Allowed origins for incoming messages.
     *    Empty = same origin only.
     */
    allowedOrigins?: string[] | undefined;
    /**
     * - Auto-detect and transfer transferable objects.
     */
    autoTransfer?: boolean | undefined;
    /**
     * - Serialization format.
     */
    contentType?: string | undefined;
};
export type MessageSource = {
    /**
     * - Origin of the message.
     */
    origin: string;
    /**
     * - The window/worker that sent the message.
     */
    source: PostMessageTarget;
};
export type MessageHandler = (message: any, source: MessageSource) => any;
