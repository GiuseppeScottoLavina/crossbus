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
import { encodeCompact, decodeCompact } from '../common/compact-wire.js';

/**
 * @typedef {Object} MessageChannelTransportOptions
 * @property {boolean} [autoTransfer=false] - Auto-detect and transfer transferable objects.
 * @property {string} [contentType='application/json'] - Serialization format.
 * @property {'standard'|'compact'|'compact-v2'} [wireFormat='standard'] - Compact requires 0.1.3+ receivers; compact-v2 requires 0.1.6+ receivers.
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
 * The port handoff is the trust boundary: whoever holds the port is accepted
 * under the `channel` origin label. Send it to an exact origin and accept it
 * only from the expected window and origin.
 *
 * @example
 * // Parent page: transfer the port to one exact iframe origin
 * const transport = new MessageChannelTransport();
 * iframe.contentWindow.postMessage(
 *   { type: 'crossbus:port' },
 *   'https://widget.example.com',
 *   [transport.remotePort]
 * );
 * bus.addTransport(transport, { peerId: 'widget', origin: 'channel' });
 *
 * // Iframe: accept the port only from the expected parent
 * window.addEventListener('message', (e) => {
 *   if (e.source !== window.parent || e.origin !== 'https://app.example.com') return;
 *   if (e.data?.type !== 'crossbus:port' || !e.ports[0]) return;
 *   const transport = MessageChannelTransport.fromPort(e.ports[0]);
 *   bus.addTransport(transport, { peerId: 'parent', origin: 'channel' });
 * });
 */
export class MessageChannelTransport {
    /** @type {MessagePort} */
    #localPort;

    /** @type {MessagePort|null} */
    #remotePort;

    /** @type {boolean} */
    #autoTransfer;

    /** @type {'standard'|'compact'|'compact-v2'} */
    #wireFormat;

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

        return new MessageChannelTransport(options, port);
    }

    /**
     * Creates a new MessageChannel transport (as initiator).
     * The remote port should be sent to the other context via postMessage.
     *
     * @param {MessageChannelTransportOptions} [options={}] - Configuration.
     * @param {MessagePort|null} [port=null] - Internal existing-port construction. Prefer fromPort().
     * @throws {CrossBusError} If MessageChannel is not supported.
     */
    constructor(options = {}, port = null) {
        if (!MessageChannelTransport.isSupported()) {
            throw CrossBusError.from(ErrorCode.UNSUPPORTED, {
                api: 'MessageChannel'
            });
        }

        this.#contentType = options.contentType ?? 'application/json';
        this.#wireFormat = options.wireFormat ?? 'standard';
        if (!['standard','compact','compact-v2'].includes(this.#wireFormat) || (this.#wireFormat !== 'standard' && this.#contentType !== 'application/json')) {
            throw new TypeError('wireFormat must be standard, or a compact mode with the default contentType');
        }

        const channel = port ? null : new MessageChannel();
        this.#localPort = port ?? /** @type {MessageChannel} */(channel).port1;
        this.#remotePort = channel?.port2 ?? null;
        this.#autoTransfer = options.autoTransfer ?? false;
        this.#serializer = getSerializer(this.#contentType);
        this.#isInitiator = port === null;

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

    /** Gets the selected outgoing encoding. Receivers accept standard and both compact versions. */
    get wireFormat() { return this.#wireFormat; }

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
        // Protocol builders already supply the marker. These transports clone
        // synchronously, so an extra top-level object copy is unnecessary.
        const envelope = message[PROTOCOL_MARKER] === PROTOCOL_VERSION ? message : {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        let dataToSend = this.#wireFormat !== 'standard' ? encodeCompact(envelope, this.#wireFormat === 'compact-v2') : envelope;
        if (this.#contentType !== 'application/json') {
            if (transfer?.length) throw new TypeError('Transfer lists require structured-clone MessageChannel encoding');
            dataToSend = this.#serializer.serialize(envelope);
        }

        // Auto-detect transferables if enabled
        let transferables = transfer;
        if (this.#autoTransfer && !transfer && this.#contentType === 'application/json') {
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
        let packet = event.data;
        // Non-default content types already use the JSON serializer fallback
        // when sending. Decode that wire representation before protocol checks.
        // Malformed/unrelated strings are not protocol messages.
        if (typeof packet === 'string') {
            try { packet = this.#serializer.deserialize(packet); }
            catch { return; }
        }
        const data = Array.isArray(packet) ? decodeCompact(packet) : packet;

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
