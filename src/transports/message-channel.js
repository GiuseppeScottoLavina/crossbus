/**
 * @fileoverview MessageChannel transport for direct 1:1 peer communication.
 * Uses the MessageChannel API for efficient, low-latency communication.
 * @module transports/message-channel
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage,
    findTransferables
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';
import { getSerializer } from '../common/serialization.js';

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
    /** @type {MessagePort} */
    #localPort;

    /** @type {MessagePort|null} */
    #remotePort;

    /** @type {boolean} */
    #autoTransfer;

    /** @type {import('../common/serialization.js').Serializer} */
    #serializer;

    /** @type {string} */
    #contentType;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {boolean} */
    #isInitiator;

    /**
     * Checks if MessageChannel API is available.
     * 
     * @returns {boolean} True if MessageChannel is supported.
     */
    static isSupported() {
        return typeof MessageChannel !== 'undefined';
    }

    /**
     * Creates a MessageChannelTransport from an existing port.
     * Use this when receiving a port from another context.
     * 
     * @param {MessagePort} port - The received port.
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @returns {MessageChannelTransport}
     */
    static fromPort(port, options = {}) {
        if (!(port instanceof MessagePort)) {
            throw new TypeError('Port must be a MessagePort');
        }

        const transport = Object.create(MessageChannelTransport.prototype);
        transport.#localPort = port;
        transport.#remotePort = null; // Not available when wrapping existing port
        transport.#autoTransfer = options.autoTransfer ?? false;
        transport.#contentType = options.contentType ?? 'application/json';
        transport.#serializer = getSerializer(transport.#contentType);
        transport.#destroyed = false;
        transport.#isInitiator = false;
        transport.#messageHandler = null;

        // Set up message handler
        transport.#localPort.onmessage = transport.#handleMessage.bind(transport);
        transport.#localPort.onmessageerror = transport.#handleError.bind(transport);

        return transport;
    }

    /**
     * Creates a new MessageChannel transport (as initiator).
     * The remote port should be sent to the other context via postMessage.
     * 
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @throws {CrossBusError} If MessageChannel is not supported.
     */
    constructor(options = {}) {
        if (!MessageChannelTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'MessageChannel'
            });
        }

        const channel = new MessageChannel();
        this.#localPort = channel.port1;
        this.#remotePort = channel.port2;
        this.#autoTransfer = options.autoTransfer ?? false;
        this.#contentType = options.contentType ?? 'application/json';
        this.#serializer = getSerializer(this.#contentType);
        this.#isInitiator = true;

        // Set up message handler
        this.#localPort.onmessage = this.#handleMessage.bind(this);
        this.#localPort.onmessageerror = this.#handleError.bind(this);
    }

    /**
     * Gets the remote port to send to the other context.
     * This port can only be accessed once and becomes null after transfer.
     * 
     * @returns {MessagePort|null} The remote port, or null if already transferred.
     */
    get remotePort() {
        return this.#remotePort;
    }

    /**
     * Marks the remote port as transferred (called automatically when used).
     */
    markRemoteTransferred() {
        this.#remotePort = null;
    }

    /**
     * Checks if this transport was created as the channel initiator.
     * @returns {boolean}
     */
    get isInitiator() {
        return this.#isInitiator;
    }

    /**
     * Sends a message to the connected peer.
     * 
     * @param {Object} message - Protocol message to send.
     * @param {Transferable[]} [transfer] - Transferable objects to pass.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message, transfer) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'MessageChannelTransport.send'
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

        // Auto-detect transferables if enabled
        let transferables = transfer;
        if (this.#autoTransfer && !transfer) {
            transferables = findTransferables(message);
            if (transferables.length === 0) {
                transferables = undefined;
            }
        }

        this.#localPort.postMessage(dataToSend, /** @type {any} */(transferables));
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
     * Destroys the transport, closing ports.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;

        if (this.#localPort) {
            this.#localPort.close();
            this.#localPort = /** @type {any} */(null);
        }

        if (this.#remotePort) {
            this.#remotePort.close();
            this.#remotePort = null;
        }
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

        // Get message data
        let data = event.data;

        // Skip non-protocol messages
        if (!isProtocolMessage(data)) return;

        // Invoke handler
        try {
            this.#messageHandler(data, {
                origin: 'channel'
            });
        } catch (error) {
            console.error('[CrossBus] MessageChannel handler error:', error);
        }
    }

    /**
     * Handles message errors.
     * 
     * @param {MessageEvent} event
     */
    #handleError(event) {
        console.error('[CrossBus] MessageChannel error:', event);
    }
}
