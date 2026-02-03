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
 * @property {Object} [protocols] - WebSocket subprotocols
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

    /** @type {Object[]} */
    #messageQueue = [];

    /** @type {boolean} */
    #intentionalClose = false;

    /**
     * Creates a new WebSocket transport.
     * @param {WebSocketTransportOptions} options
     */
    constructor(options) {
        this.#url = options.url;
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
    async connect() {
        if (this.#socket && this.#socket.readyState === WebSocket.OPEN) {
            return;
        }

        this.#intentionalClose = false;
        this.#setState('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.#socket = new WebSocket(this.#url);

                this.#socket.onopen = () => {
                    this.#setState('connected');
                    this.#currentReconnectDelay = this.#reconnectDelayMs;
                    this.#flushQueue();
                    this.#startHeartbeat();
                    resolve();
                };

                this.#socket.onmessage = (event) => {
                    this.#handleMessage(event);
                };

                this.#socket.onclose = (event) => {
                    this.#stopHeartbeat();
                    this.#setState('disconnected');

                    if (!this.#intentionalClose && this.#autoReconnect) {
                        this.#scheduleReconnect();
                    }
                };

                this.#socket.onerror = (error) => {
                    this.#setState('error');
                    if (this.#state === 'connecting') {
                        reject(new Error('WebSocket connection failed'));
                    }
                };
            } catch (e) {
                this.#setState('error');
                reject(e);
            }
        });
    }

    /**
     * Disconnects from the server.
     */
    disconnect() {
        this.#intentionalClose = true;
        this.#stopHeartbeat();

        if (this.#reconnectTimer) {
            clearTimeout(this.#reconnectTimer);
            this.#reconnectTimer = null;
        }

        if (this.#socket) {
            this.#socket.close(1000, 'Client disconnect');
            this.#socket = null;
        }

        this.#setState('disconnected');
    }

    /**
     * Sends a message to the server.
     * @param {Object} message - Message to send
     * @returns {boolean} Whether the message was sent immediately
     */
    send(message) {
        const envelope = {
            _cb: PROTOCOL_VERSION,
            _m: PROTOCOL_MARKER,
            id: uuid(),
            from: this.#peerId,
            timestamp: Date.now(),
            ...message
        };

        if (this.isConnected && this.#socket) {
            this.#socket.send(JSON.stringify(envelope));
            return true;
        } else {
            // Queue for later
            this.#messageQueue.push(envelope);
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
            const message = this.#messageQueue.shift();
            if (message) {
                this.#socket.send(JSON.stringify(message));
            }
        }
    }

    /**
     * Updates and emits state.
     */
    #setState(state) {
        if (this.#state !== state) {
            this.#state = state;
            if (this.#stateHandler) {
                this.#stateHandler(state);
            }
        }
    }

    /**
     * Starts heartbeat timer.
     */
    #startHeartbeat() {
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
        if (this.#reconnectTimer) return;

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
        this.disconnect();
        this.#messageHandler = null;
        this.#stateHandler = null;
        this.#messageQueue = [];
    }
}
