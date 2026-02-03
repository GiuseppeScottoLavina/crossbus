/**
 * @fileoverview PostMessage transport for iframes, popups, and workers.
 * Handles message serialization, origin validation, and bidirectional communication.
 * @module transports/postmessage
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage,
    findTransferables
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';
import { getSerializer, detectPreferredContentType } from '../common/serialization.js';

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
    /** @type {PostMessageTarget|null} */
    #target = null;

    /** @type {string} */
    #targetOrigin;

    /** @type {Set<string>} */
    #allowedOrigins;

    /** @type {boolean} */
    #autoTransfer;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {Function|null} */
    #boundListener = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if PostMessage API is available.
     * 
     * @returns {boolean} True if postMessage is supported.
     */
    static isSupported() {
        return typeof globalThis.postMessage === 'function' ||
            typeof Window !== 'undefined';
    }

    /**
     * Creates a new PostMessage transport.
     * 
     * @param {PostMessageTarget} target - The window/worker to communicate with.
     * @param {PostMessageTransportOptions} [options={}] - Configuration options.
     * @throws {TypeError} If target is not a valid postMessage target.
     */
    constructor(target, options = {}) {
        if (!this.#isValidTarget(target)) {
            throw new TypeError('Target must support postMessage');
        }

        this.#target = target;
        this.#targetOrigin = options.targetOrigin ?? '*';
        this.#allowedOrigins = new Set(options.allowedOrigins ?? []);
        this.#autoTransfer = options.autoTransfer ?? false;
        this.#contentType = options.contentType ?? 'application/json';
        this.#serializer = getSerializer(this.#contentType);

        // Development security warning
        const isDev = typeof process !== 'undefined'
            ? process.env?.NODE_ENV !== 'production'
            : typeof window !== 'undefined' && window.location?.hostname === 'localhost';

        if (isDev && this.#targetOrigin === '*') {
            console.warn(
                '[CrossBus Security] ⚠️ targetOrigin: "*" broadcasts to ANY window.\n' +
                'This is INSECURE in production. Use specific origin:\n' +
                '  targetOrigin: "https://iframe-domain.com"\n' +
                'Suppress this warning with NODE_ENV=production'
            );
        }

        // Set up message listener
        this.#boundListener = this.#handleMessage.bind(this);
        this.#getListenerTarget().addEventListener('message', /** @type {EventListener} */(this.#boundListener));
    }

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
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'PostMessageTransport.send'
            });
        }

        // Check if window is closed
        if (this.#isWindowClosed()) {
            throw CrossBusError.from(ErrorCode.PEER_DISCONNECTED, {
                reason: 'Target window is closed'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        // Serialize if needed
        // Note: PostMessage can handle objects natively. 
        // We only serialize if strictly requested (e.g. for consistency or size optimization)
        // OR if the serializer is NOT JSON.
        let dataToSend = envelope;
        if (this.#contentType !== 'application/json') {
            dataToSend = this.#serializer.serialize(envelope);
        }

        // Auto-detect transferables if enabled
        let transferables = transfer;
        if (this.#autoTransfer && !transfer) {
            transferables = findTransferables(message);
            if (transferables.length === 0) {
                transferables = undefined;
            }
        }

        // Send based on target type
        if (this.#isWorker()) {
            // Workers don't need origin
            /** @type {Worker} */(this.#target).postMessage(dataToSend, /** @type {any} */(transferables));
        } else {
            // Windows need origin
            /** @type {Window} */(this.#target).postMessage(envelope, this.#targetOrigin, transferables);
        }
    }

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
     * Destroys the transport, removing all listeners.
     * After destruction, send() will throw.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#boundListener) {
            this.#getListenerTarget().removeEventListener('message', /** @type {EventListener} */(this.#boundListener));
            this.#boundListener = null;
        }
    }

    /**
     * Checks if transport has been destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    /**
     * Gets the target origin.
     * @returns {string}
     */
    get targetOrigin() {
        return this.#targetOrigin;
    }

    // ─────────────────────────────────────────────────────────────────
    // Private methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Handles incoming message events.
     * 
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Get message data
        let data = event.data;

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Validate origin (skip for workers which don't have origin)
        if (event.origin && !this.#isOriginAllowed(event.origin)) {
            console.warn(`[CrossBus] Blocked message from unauthorized origin: ${event.origin}`);
            return;
        }

        // Validate source matches target (if target is a Window/MessagePort)
        // We can't strictly validate for Workers as event.source might be null or different in some contexts
        if (this.#target && 'postMessage' in this.#target && !this.#isWorker()) {
            if (event.source !== this.#target) return;
        }

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: event.origin ?? 'worker',
                source: /** @type {PostMessageTarget} */(/** @type {any} */(event.source ?? event.currentTarget))
            });
        } catch (error) {
            console.error('[CrossBus] Message handler error:', error);
        }
    }

    /**
     * Checks if an origin is allowed.
     * 
     * @param {string} origin
     * @returns {boolean}
     */
    #isOriginAllowed(origin) {
        // If no origins specified, only allow same origin
        if (this.#allowedOrigins.size === 0) {
            return origin === globalThis.location?.origin;
        }

        // Check for wildcard
        if (this.#allowedOrigins.has('*')) {
            return true;
        }

        // Check exact match
        if (this.#allowedOrigins.has(origin)) {
            return true;
        }

        // Check wildcard pattern (e.g., https://*.example.com)
        for (const pattern of this.#allowedOrigins) {
            if (pattern.includes('*')) {
                // Use bounded quantifier to prevent ReDoS
                const regex = new RegExp('^' + pattern
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\\\*/g, '[a-zA-Z0-9.-]{0,253}') + '$');
                if (regex.test(origin)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks if target is a valid postMessage target.
     * 
     * @param {*} target
     * @returns {boolean}
     */
    #isValidTarget(target) {
        if (!target) return false;
        return typeof target.postMessage === 'function';
    }

    /**
     * Checks if target is a Worker or ServiceWorker.
     * 
     * @returns {boolean}
     */
    #isWorker() {
        if (typeof Worker !== 'undefined' && this.#target instanceof Worker) {
            return true;
        }
        if (typeof ServiceWorker !== 'undefined' && this.#target instanceof ServiceWorker) {
            return true;
        }
        if (typeof MessagePort !== 'undefined' && this.#target instanceof MessagePort) {
            return true;
        }
        return false;
    }

    /**
     * Checks if the target window is closed.
     * 
     * @returns {boolean}
     */
    #isWindowClosed() {
        if (this.#isWorker()) return false;
        return /** @type {Window} */(this.#target).closed === true;
    }

    /**
     * Gets the object to attach message listener to.
     * For workers, we listen on the worker itself.
     * For windows, we listen on the current window.
     * 
     * @returns {EventTarget}
     */
    #getListenerTarget() {
        // If inside worker, listen on self
        if (typeof DedicatedWorkerGlobalScope !== 'undefined' &&
            globalThis instanceof DedicatedWorkerGlobalScope) {
            return globalThis;
        }

        // Main thread listening to worker - listen on worker
        if (this.#isWorker()) {
            return /** @type {EventTarget} */(/** @type {any} */(this.#target));
        }

        // Window communication - listen on current window
        if (typeof window !== 'undefined') {
            return window;
        }

        return globalThis;
    }
}
