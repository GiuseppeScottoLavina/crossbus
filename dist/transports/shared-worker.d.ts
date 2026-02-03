/**
 * @typedef {Object} SharedWorkerTransportOptions
 * @property {string} [workerUrl] - URL to the SharedWorker script.
 * @property {string} [name] - Optional name for the SharedWorker.
 */
/**
 * @typedef {Object} MessageContext
 * @property {string} origin - Always 'sharedworker' for this transport.
 */
/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {MessageContext} context - Context information.
 */
/**
 * SharedWorker-based transport for tab communication.
 *
 * SharedWorkers persist across page refreshes and are shared between
 * all tabs/windows of the same origin. This enables:
 * - Shared state across tabs
 * - Single connection to backend (via worker)
 * - Efficient broadcast to all tabs
 *
 * @example
 * // Create transport
 * const transport = new SharedWorkerTransport({
 *   workerUrl: '/crossbus-worker.js'
 * });
 *
 * // Listen for messages
 * transport.onMessage((msg, ctx) => {
 *   console.log('Received:', msg);
 * });
 *
 * // Send message (goes through shared worker to all tabs)
 * transport.send({ t: 'sig', p: { event: 'user:action' } });
 *
 * // Cleanup
 * transport.destroy();
 */
export class SharedWorkerTransport {
    /**
     * Checks if SharedWorker API is available.
     *
     * @returns {boolean} True if SharedWorker is supported.
     */
    static isSupported(): boolean;
    /**
     * Creates a new SharedWorker transport.
     *
     * @param {SharedWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If SharedWorker is not supported.
     */
    constructor(options?: SharedWorkerTransportOptions);
    /**
     * Sends a message through the SharedWorker.
     *
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
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
     * Destroys the transport, closing the port.
     */
    destroy(): void;
    /**
     * Gets the worker URL.
     * @returns {string}
     */
    get workerUrl(): string;
    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    #private;
}
export type SharedWorkerTransportOptions = {
    /**
     * - URL to the SharedWorker script.
     */
    workerUrl?: string | undefined;
    /**
     * - Optional name for the SharedWorker.
     */
    name?: string | undefined;
};
export type MessageContext = {
    /**
     * - Always 'sharedworker' for this transport.
     */
    origin: string;
};
export type MessageHandler = (message: any, context: MessageContext) => any;
