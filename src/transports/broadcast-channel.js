/**
 * @fileoverview BroadcastChannel transport for same-origin tab communication.
 * Uses the BroadcastChannel API for efficient pub/sub across browser contexts.
 * @module transports/broadcast-channel
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';
import { getSerializer, JSONSerializer } from '../common/serialization.js';

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
    /** @type {BroadcastChannel} */
    #channel;

    /** @type {string} */
    #channelName;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /**
     * Checks if BroadcastChannel API is available.
     * 
     * @returns {boolean} True if BroadcastChannel is supported.
     */
    static isSupported() {
        return typeof BroadcastChannel !== 'undefined';
    }

    /**
     * Creates a new BroadcastChannel transport.
     * 
     * @param {BroadcastChannelTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If BroadcastChannel is not supported.
     */
    constructor(options = {}) {
        if (!BroadcastChannelTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'BroadcastChannel'
            });
        }

        this.#channelName = options.channelName ?? 'crossbus:default';
        this.#channel = new BroadcastChannel(this.#channelName);
        this.#contentType = options.contentType ?? 'application/json';
        this.#serializer = getSerializer(this.#contentType);

        // Set up message handler
        this.#channel.onmessage = this.#handleMessage.bind(this);
        this.#channel.onmessageerror = this.#handleError.bind(this);
    }

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
    send(message) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'BroadcastChannelTransport.send'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        let dataToSend = envelope;
        if (this.#contentType !== 'application/json') {
            dataToSend = this.#serializer.serialize(envelope);
        }

        this.#channel.postMessage(dataToSend);
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
     * Destroys the transport, closing the channel.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#channel) {
            this.#channel.close();
            this.#channel = /** @type {any} */(null);
        }
    }

    /**
     * Gets the channel name.
     * @returns {string}
     */
    get channelName() {
        return this.#channelName;
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
     * Handles incoming message events.
     * 
     * @param {MessageEvent} event
     */
    #handleMessage(event) {
        // Skip if no handler
        if (!this.#messageHandler) return;

        // Deserialize if binary (convert to string first)
        let data = event.data;
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            try {
                const text = new TextDecoder().decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
                data = JSONSerializer.deserialize(text);
            } catch (e) {
                console.warn('[CrossBus] Failed to deserialize binary message', e);
                return;
            }
        }

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: 'broadcast'
            });
        } catch (error) {
            console.error('[CrossBus] BroadcastChannel handler error:', error);
        }
    }

    /**
     * Handles message errors (e.g., deserialization failures).
     * 
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] BroadcastChannel message error:', event);
    }
}
