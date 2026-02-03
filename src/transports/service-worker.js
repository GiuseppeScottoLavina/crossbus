/**
 * @fileoverview ServiceWorker transport for offline-capable communication.
 * Uses ServiceWorker API for background sync and offline messaging.
 * @module transports/service-worker
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';

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
 * ServiceWorker-based transport for offline-capable communication.
 * 
 * ServiceWorkers run in the background and can:
 * - Handle messages even when page is not focused
 * - Queue messages for offline delivery
 * - Sync state across all tabs
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
    /** @type {ServiceWorker|null} */
    #controller = null;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {Promise<void>} */
    #readyPromise;

    /** @type {Function|null} */
    #boundMessageHandler = null;

    /**
     * Checks if ServiceWorker API is available.
     * 
     * @returns {boolean} True if ServiceWorker is supported.
     */
    static isSupported() {
        return typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator;
    }

    /**
     * Creates a new ServiceWorker transport.
     * 
     * @param {ServiceWorkerTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If ServiceWorker is not supported.
     */
    constructor(options = {}) {
        if (!ServiceWorkerTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'ServiceWorker'
            });
        }

        // Initialize ready promise
        this.#readyPromise = this.#initialize();
    }

    /**
     * Promise that resolves when transport is ready.
     * @returns {Promise<void>}
     */
    get ready() {
        return this.#readyPromise;
    }

    /**
     * Initializes the ServiceWorker connection.
     * 
     */
    async #initialize() {
        // Wait for ServiceWorker to be ready
        const registration = await navigator.serviceWorker.ready;

        this.#controller = registration.active || navigator.serviceWorker.controller;

        // Set up message handler
        this.#boundMessageHandler = this.#handleMessage.bind(this);
        navigator.serviceWorker.addEventListener('message', /** @type {EventListener} */(this.#boundMessageHandler));
    }

    /**
     * Sends a message to the ServiceWorker.
     * 
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects.
     * @throws {CrossBusError} If transport is destroyed or no controller.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'ServiceWorkerTransport.send'
            });
        }

        if (!this.#controller) {
            throw CrossBusError.from(ErrorCode.NOT_CONNECTED, {
                context: 'ServiceWorkerTransport.send',
                reason: 'No active ServiceWorker'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        if (transfer && transfer.length > 0) {
            this.#controller.postMessage(envelope, transfer);
        } else {
            this.#controller.postMessage(envelope);
        }
    }

    /**
     * Registers a message handler.
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
     * Destroys the transport.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#boundMessageHandler) {
            navigator.serviceWorker.removeEventListener('message', /** @type {EventListener} */(this.#boundMessageHandler));
            this.#boundMessageHandler = null;
        }

        this.#controller = null;
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
     * Handles incoming messages from the ServiceWorker.
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
                origin: 'serviceworker'
            });
        } catch (error) {
            console.error('[CrossBus] ServiceWorker handler error:', error);
        }
    }
}
