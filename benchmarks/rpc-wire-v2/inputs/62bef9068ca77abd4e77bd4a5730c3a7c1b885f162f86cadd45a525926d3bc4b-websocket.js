/**
 * @fileoverview WebSocket transport for CrossBus.
 * Enables communication with a server via WebSocket.
 * @module transports/websocket
 */

import { uuid } from '../common/utils.js';
import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../common/types.js';

/**
 * @typedef {Object} WebSocketTransportOptions
 * @property {string} url - WebSocket server URL (ws:// or wss://)
 * @property {string} [peerId] - Local peer ID
 * @property {boolean} [autoReconnect=true] - Auto-reconnect on disconnect
 * @property {number} [reconnectDelayMs=1000] - Base delay for reconnection
 * @property {number} [maxReconnectDelayMs=30000] - Max delay with exponential backoff
 * @property {number} [heartbeatIntervalMs=30000] - Heartbeat interval (0 to disable)
 * @property {string|string[]} [protocols] - WebSocket subprotocols
 * @property {number} [maxQueueSize=1000] - Maximum queued messages while disconnected; zero disables the cap.
 */

/**
 * WebSocket transport for server communication.
 *
 * @example
 * const transport = new WebSocketTransport({
 *   url: 'wss://api.example.com/crossbus',
 *   peerId: 'client-1'
 * });
 *
 * transport.onMessage((msg) => console.log('Received:', msg));
 * transport.onStateChange((state) => console.log('State:', state));
 *
 * await transport.connect();
 * transport.send({ type: 'hello', payload: { name: 'client' } });
 */
export class WebSocketTransport {
    /** @type {string} */
    #url;

    /** @type {string} */
    #peerId;

    /** @type {WebSocket|null} */
    #socket = null;

    /** @type {boolean} */
    #autoReconnect;

    /** @type {number} */
    #reconnectDelayMs;

    /** @type {number} */
    #maxReconnectDelayMs;

    /** @type {number} */
    #currentReconnectDelay;

    /** @type {number} */
    #heartbeatIntervalMs;

    /** @type {ReturnType<typeof setInterval>|null} */
    #heartbeatTimer = null;

    /** @type {ReturnType<typeof setTimeout>|null} */
    #reconnectTimer = null;

    /** @type {((message: Object) => void)|null} */
    #messageHandler = null;

    /** @type {((state: 'connecting'|'connected'|'disconnected'|'error') => void)|null} */
    #stateHandler = null;

    /** @type {'connecting'|'connected'|'disconnected'|'error'} */
    #state = 'disconnected';

    /** @type {string[]} Already serialized snapshots, not mutable caller objects. */
    #messageQueue = [];

    #destroyed = false;
    /** @type {Promise<void>|null} */
    #connecting = null;
    /** @type {((error?: any) => void)|null} */
    #settleConnect = null;
    /** @type {string|string[]|undefined} */
    #protocols;
    #maxQueueSize;

    /** @type {boolean} */
    #intentionalClose = false;

    /**
     * Creates a new WebSocket transport.
     * @param {WebSocketTransportOptions} options
     */
    constructor(options) {
        this.#url = options.url;
        this.#protocols = options.protocols;
        this.#maxQueueSize = options.maxQueueSize ?? 1000;
        if (!Number.isSafeInteger(this.#maxQueueSize) || this.#maxQueueSize < 0) throw new RangeError('maxQueueSize must be a nonnegative safe integer');
        this.#peerId = options.peerId ?? uuid();
        this.#autoReconnect = options.autoReconnect ?? true;
        this.#reconnectDelayMs = options.reconnectDelayMs ?? 1000;
        this.#maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30000;
        this.#currentReconnectDelay = this.#reconnectDelayMs;
        this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    }

    /** @returns {string} */
    get peerId() {
        return this.#peerId;
    }

    /** @returns {'connecting'|'connected'|'disconnected'|'error'} */
    get state() {
        return this.#state;
    }

    /** @returns {boolean} */
    get isConnected() {
        return this.#state === 'connected' && this.#socket?.readyState === WebSocket.OPEN;
    }

    /**
     * Connects to the WebSocket server.
     * @returns {Promise<void>}
     */
    connect() {
        if (this.#destroyed) return Promise.reject(new Error('WebSocket transport destroyed'));
        if (this.#connecting) return this.#connecting;
        if (this.#socket && this.#socket.readyState === WebSocket.OPEN) return Promise.resolve();
        this.#intentionalClose = false;
        /** @type {(error?: any) => void} */
        let settle = () => {};
        /** @type {Promise<void>} */
        const pending = new Promise((resolve, reject) => {
            let settled = false;
            settle = error => {
                if (settled) return;
                settled = true;
                this.#connecting = null;
                this.#settleConnect = null;
                if (error) reject(error); else resolve();
            };
        });
        this.#connecting = pending;
        this.#settleConnect = settle;
        try {
            this.#setState('connecting');
            const socket = this.#protocols === undefined ? new WebSocket(this.#url) : new WebSocket(this.#url, this.#protocols);
            this.#socket = socket;
            socket.onopen = () => {
                if (socket !== this.#socket || this.#destroyed || this.#intentionalClose) return;
                try {
                    this.#setState('connected');
                    this.#currentReconnectDelay = this.#reconnectDelayMs;
                    this.#flushQueue();
                    this.#startHeartbeat();
                    settle();
                } catch (error) { this.#setState('error'); settle(error); socket.close(); }
            };
            socket.onmessage = event => { if (socket === this.#socket && !this.#destroyed) this.#handleMessage(event); };
            socket.onclose = () => {
                if (socket !== this.#socket) return;
                this.#stopHeartbeat();
                this.#setState('disconnected');
                settle(new Error('WebSocket closed before connecting'));
                if (!this.#intentionalClose && !this.#destroyed && this.#autoReconnect) this.#scheduleReconnect();
            };
            socket.onerror = () => {
                if (socket !== this.#socket) return;
                this.#setState('error');
                settle(new Error('WebSocket connection failed'));
            };
        } catch (error) { this.#setState('error'); settle(error); }
        return pending;
    }

    /**
     * Disconnects from the server.
     */
    disconnect() {
        this.#intentionalClose = true;
        this.#settleConnect?.(new Error('WebSocket disconnected before connecting'));
        this.#stopHeartbeat();

        if (this.#reconnectTimer) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = null;
        }

        if (this.#socket) {
            const socket = this.#socket;
            this.#socket = null;
            socket.onopen = null; socket.onclose = null; socket.onerror = null; socket.onmessage = null;
            socket.close(1000, 'Client disconnect');
        }

        this.#setState('disconnected');
    }

    /**
     * Sends a message to the server.
     * @param {Object} message - Message to send
     * @returns {boolean} Whether the message was sent immediately
     */
    send(message) {
        if (this.#destroyed) throw new Error('WebSocket transport destroyed');
        const envelope = {
            _cb: PROTOCOL_VERSION,
            _m: PROTOCOL_MARKER,
            id: uuid(),
            from: this.#peerId,
            timestamp: Date.now(),
            ...message
        };

        const serialized = JSON.stringify(envelope);
        if (this.isConnected && this.#socket) {
            this.#socket.send(serialized);
            return true;
        } else {
            // Queue for later
            if (this.#maxQueueSize && this.#messageQueue.length >= this.#maxQueueSize) throw new Error('WebSocket queue limit reached');
            this.#messageQueue.push(serialized);
            return false;
        }
    }

    /**
     * Sets the message handler.
     * @param {(message: Object) => void} handler
     */
    onMessage(handler) {
        this.#messageHandler = handler;
    }

    /** Removes the current inbound observer. */
    offMessage() { this.#messageHandler = null; }

    /**
     * Sets the state change handler.
     * @param {(state: string) => void} handler
     */
    onStateChange(handler) {
        this.#stateHandler = handler;
    }

    /**
     * Handles incoming messages.
     */
    #handleMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle pong (heartbeat response)
            if (data.type === 'pong') {
                return;
            }

            if (this.#messageHandler) {
                this.#messageHandler(data);
            }
        } catch (e) {
            console.error('[WebSocketTransport] Failed to parse message:', e);
        }
    }

    /**
     * Flushes queued messages.
     */
    #flushQueue() {
        while (this.#messageQueue.length > 0 && this.isConnected && this.#socket) {
            const message = this.#messageQueue[0];
            if (message) {
                this.#socket.send(message);
            }
            this.#messageQueue.shift();
        }
    }

    /**
     * Updates and emits state.
     */
    #setState(state) {
        if (this.#state !== state) {
            this.#state = state;
            if (this.#stateHandler) {
                try { this.#stateHandler(state); }
                catch (error) { console.error('[WebSocketTransport] State observer error:', error); }
            }
        }
    }

    /**
     * Starts heartbeat timer.
     */
    #startHeartbeat() {
        this.#stopHeartbeat();
        if (this.#heartbeatIntervalMs <= 0) return;

        this.#heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.#socket) {
                this.#socket.send(JSON.stringify({ type: 'ping', from: this.#peerId }));
            }
        }, this.#heartbeatIntervalMs);
    }

    /**
     * Stops heartbeat timer.
     */
    #stopHeartbeat() {
        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;
        }
    }

    /**
     * Schedules a reconnection attempt.
     */
    #scheduleReconnect() {
        if (this.#reconnectTimer || this.#intentionalClose || this.#destroyed) return;

        this.#reconnectTimer = setTimeout(async () => {
            this.#reconnectTimer = null;

            try {
                await this.connect();
            } catch {
                // Exponential backoff
                this.#currentReconnectDelay = Math.min(
                    this.#currentReconnectDelay * 2,
                    this.#maxReconnectDelayMs
                );

                if (this.#autoReconnect && !this.#intentionalClose) {
                    this.#scheduleReconnect();
                }
            }
        }, this.#currentReconnectDelay);
    }

    /**
     * Destroys the transport.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        this.disconnect();
        this.#messageHandler = null;
        this.#stateHandler = null;
        this.#messageQueue = [];
    }
}
