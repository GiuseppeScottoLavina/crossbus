/**
 * @fileoverview SharedWorker transport for tab communication via shared state.
 * Uses SharedWorker API for efficient cross-tab communication with shared context.
 * @module transports/shared-worker
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';

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
    /** @type {SharedWorker|null} */
    #worker = null;

    /** @type {MessagePort|null} */
    #port = null;

    /** @type {string} */
    #workerUrl;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if SharedWorker API is available.
     * 
     * @returns {boolean} True if SharedWorker is supported.
     */
    static isSupported() {
        return typeof SharedWorker !== 'undefined';
    }

    /**
     * Creates a new SharedWorker transport.
     * 
     * @param {SharedWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If SharedWorker is not supported.
     */
    constructor(options = {}) {
        if (!SharedWorkerTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'SharedWorker'
            });
        }

        this.#workerUrl = options.workerUrl ?? '/crossbus-shared-worker.js';

        // Create SharedWorker
        this.#worker = new SharedWorker(this.#workerUrl, options.name);
        this.#port = this.#worker.port;

        // Set up message handler on port
        this.#port.onmessage = this.#handleMessage.bind(this);
        this.#port.onmessageerror = this.#handleError.bind(this);

        // Handle worker errors
        this.#worker.onerror = this.#handleWorkerError.bind(this);

        // Start the port (required for SharedWorker)
        this.#port.start();
    }

    /**
     * Sends a message through the SharedWorker.
     * 
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'SharedWorkerTransport.send'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        if (!this.#port) return;

        if (transfer && transfer.length > 0) {
            this.#port.postMessage(envelope, transfer);
        } else {
            this.#port.postMessage(envelope);
        }
    }

    /**
     * Registers a message handler.
     * Only one handler can be registered; subsequent calls replace previous.
     * 
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler) {
        if (typeof handler !== 'function') {
            throw new TypeError('Handler must be a function');
        }
        this.#messageHandler = handler;
    }

    /**
     * Removes the message handler.
     */
    offMessage() {
        this.#messageHandler = null;
    }

    /**
     * Destroys the transport, closing the port.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#port) {
            this.#port.close();
            this.#port = null;
        }

        this.#worker = null;
    }

    /**
     * Gets the worker URL.
     * @returns {string}
     */
    get workerUrl() {
        return this.#workerUrl;
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming messages from the SharedWorker.
     * 
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Skip non-protocol messages
        if (!isProtocolMessage(event.data)) return;

        // Invoke handler
        try {
            this.#messageHandler(event.data, {
                origin: 'sharedworker'
            });
        } catch (error) {
            console.error('[CrossBus] SharedWorker handler error:', error);
        }
    }

    /**
     * Handles message errors.
     * 
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] SharedWorker message error:', event);
    }

    /**
     * Handles worker-level errors.
     * 
     * @param {ErrorEvent} event
     */
    #handleWorkerError(event) {
        console.error('[CrossBus] SharedWorker error:', event.message);
    }
}
