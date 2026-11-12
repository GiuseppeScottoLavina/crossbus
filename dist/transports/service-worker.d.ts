/**
 * @typedef {Object} ServiceWorkerTransportOptions
 * @property {number} [timeout=5000] - Timeout waiting for ready state.
 */
/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'serviceworker' for this transport.
 */
/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */
/**
 * Message transport to the application's service worker.
 * Registration and message routing belong to the application. This transport
 * does not itself persist messages or implement offline/background delivery.
 *
 * @example
 * const transport = new ServiceWorkerTransport();
 *
 * // Wait for ServiceWorker to be ready
 * await transport.ready;
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received from SW:', msg);
 * });
 *
 * // Send message to ServiceWorker
 * transport.send({ t: 'sig', id: 'abc', p: { event: 'sync' } });
 *
 * // Cleanup
 * transport.destroy();
 */
export class ServiceWorkerTransport {
    /**
     * Checks if ServiceWorker API is available.
     *
     * @returns {boolean} True if ServiceWorker is supported.
     */
    static isSupported(): boolean;
    /**
     * Creates a new ServiceWorker transport.
     *
     * @param {ServiceWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If ServiceWorker is not supported.
     */
    constructor(options?: ServiceWorkerTransportOptions);
    /**
     * Promise that resolves when transport is ready.
     * @returns {Promise<void>}
     */
    get ready(): Promise<void>;
    /**
     * Sends a message to the ServiceWorker.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
     * @throws {CrossBusError} If transport is destroyed or no controller.
     */
    send(message: any, transfer?: Transferable[]): void;
    /**
     * Registers a message handler.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Removes the message handler.
     */
    offMessage(): void;
    /**
     * Destroys the transport.
     */
    destroy(): void;
    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    #private;
}
export type ServiceWorkerTransportOptions = {
    /**
     * - Timeout waiting for ready state.
     */
    timeout?: number | undefined;
};
export type MessageContext = {
    /**
     * - Always 'serviceworker' for this transport.
     */
    origin: string;
};
export type MessageHandler = (message: any, context: MessageContext) => any;
