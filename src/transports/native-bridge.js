/**
 * @fileoverview Native Bridge transport for Android/iOS WebView communication.
 * Enables CrossBus to communicate with native mobile apps through WebView bridges.
 * @module transports/native-bridge
 */

import {
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    isProtocolMessage
} from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';

/**
 * @typedef {'android' | 'ios' | 'none'} BridgeType
 */

/**
 * @typedef {Object} NativeBridgeTransportOptions
 * @property {string} [androidInterface='CrossBus'] - Name of Android JavascriptInterface.
 * @property {string} [iosHandler='crossbus'] - Name of iOS WKScriptMessageHandler.
 * @property {number} [initTimeout=5000] - Timeout waiting for native bridge (ms).
 * @property {number} [heartbeatInterval=30000] - Heartbeat interval (ms), 0 to disable.
 * @property {boolean} [queueWhileInit=true] - Queue messages while waiting for bridge.
 */

/**
 * @callback MessageHandler
 * @param {Object} message - The received protocol message.
 * @param {{ bridgeType: BridgeType }} source - Bridge type info.
 */

/**
 * Native Bridge transport for WebView ↔ Native communication.
 * 
 * Supports:
 * - Android WebView via JavascriptInterface
 * - iOS WKWebView via WKScriptMessageHandler
 * 
 * @example
 * // In WebView context
 * const transport = new NativeBridgeTransport();
 * 
 * transport.onMessage((msg, source) => {
 *   console.log('From native:', msg, 'via:', source.bridgeType);
 * });
 * 
 * // Send to native
 * transport.send({ type: 'greeting', payload: { hello: 'native' } });
 * 
 * // Cleanup
 * transport.destroy();
 */
export class NativeBridgeTransport {
    /** @type {BridgeType} */
    #bridgeType = 'none';

    /** @type {string} */
    #androidInterface;

    /** @type {string} */
    #iosHandler;

    /** @type {MessageHandler|null} */
    #messageHandler = null;

    /** @type {boolean} */
    #destroyed = false;

    /** @type {boolean} */
    #ready = false;

    /** @type {Array<Object>} */
    #messageQueue = [];

    /** @type {boolean} */
    #queueWhileInit;

    /** @type {ReturnType<typeof setInterval>|null} */
    #heartbeatTimer = null;

    /** @type {number} */
    #heartbeatInterval;

    /** @type {Promise<void>} */
    #readyPromise;

    /** @type {((value?: void) => void)|undefined} */
    #resolveReady;

    /**
     * Detects which native bridge is available.
     * 
     * @returns {BridgeType} The detected bridge type.
     */
    static detectBridge() {
        // Check for Android bridge (customizable name, default 'CrossBus')
        if (globalThis.CrossBus && typeof globalThis.CrossBus.postMessage === 'function') {
            return 'android';
        }
        // Also check common Android bridge patterns
        if (globalThis.AndroidBridge && typeof globalThis.AndroidBridge.postMessage === 'function') {
            return 'android';
        }

        // iOS: WKWebView injects webkit.messageHandlers
        if (globalThis.webkit?.messageHandlers?.crossbus) {
            return 'ios';
        }

        return 'none';
    }

    /**
     * Checks if any native bridge is available.
     * 
     * @returns {boolean} True if a native bridge is detected.
     */
    static isSupported() {
        return NativeBridgeTransport.detectBridge() !== 'none';
    }

    /**
     * Creates a new Native Bridge transport.
     * 
     * @param {NativeBridgeTransportOptions} [options={}] - Configuration options.
     */
    constructor(options = {}) {
        this.#androidInterface = options.androidInterface ?? 'CrossBus';
        this.#iosHandler = options.iosHandler ?? 'crossbus';
        this.#queueWhileInit = options.queueWhileInit ?? true;
        this.#heartbeatInterval = options.heartbeatInterval ?? 30000;

        // Create ready promise
        this.#readyPromise = new Promise((resolve) => {
            this.#resolveReady = resolve;
        });

        // Detect and initialize bridge
        this.#initBridge(options.initTimeout ?? 5000);
    }

    /**
     * Initializes the native bridge connection.
     * 
     * @param {number} timeout - Timeout in ms.
     */
    async #initBridge(timeout) {
        const startTime = Date.now();

        // Poll for bridge availability
        const checkBridge = () => {
            this.#bridgeType = NativeBridgeTransport.detectBridge();

            if (this.#bridgeType !== 'none') {
                this.#onBridgeReady();
                return;
            }

            if (Date.now() - startTime < timeout) {
                setTimeout(checkBridge, 50);
            } else {
                // Timeout - no bridge found, but don't error
                // Could be running in regular browser
                console.warn('[CrossBus] No native bridge detected after timeout');
                this.#ready = true;
                this.#resolveReady?.();
            }
        };

        checkBridge();

        // Set up global callback for native → JS messages
        this.#setupNativeCallback();
    }

    /**
     * Called when bridge is detected and ready.
     */
    #onBridgeReady() {
        this.#ready = true;
        this.#resolveReady?.();

        // Flush queued messages
        this.#flushQueue();

        // Start heartbeat if enabled
        if (this.#heartbeatInterval > 0) {
            this.#startHeartbeat();
        }
    }

    /**
     * Sets up callback for native → JS communication.
     */
    #setupNativeCallback() {
        // Native should call this global function to send messages to JS
        const callbackName = '__crossbus_receive__';

        globalThis[callbackName] = (messageStr) => {
            if (this.#destroyed || !this.#messageHandler) return;

            try {
                const data = typeof messageStr === 'string'
                    ? JSON.parse(messageStr)
                    : messageStr;

                if (!isProtocolMessage(data)) return;

                this.#messageHandler(data, { bridgeType: this.#bridgeType });
            } catch (e) {
                console.error('[CrossBus] Failed to parse native message:', e);
            }
        };
    }

    /**
     * Sends a message to the native side.
     * 
     * @param {Object} message - Protocol message to send.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message) {
        if (this.#destroyed) {
            throw CrossBusError.from(ErrorCode.DESTROYED, {
                context: 'NativeBridgeTransport.send'
            });
        }

        // Ensure message has protocol marker
        const envelope = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            ...message
        };

        // Queue if not ready
        if (!this.#ready && this.#queueWhileInit) {
            this.#messageQueue.push(envelope);
            return;
        }

        this.#sendToNative(envelope);
    }

    /**
     * Actually sends message to native bridge.
     * 
     * @param {Object} envelope - Message envelope.
     */
    #sendToNative(envelope) {
        const jsonStr = JSON.stringify(envelope);

        try {
            if (this.#bridgeType === 'android') {
                // Try custom interface name first
                const bridge = globalThis[this.#androidInterface] || globalThis.AndroidBridge;
                if (bridge?.postMessage) {
                    bridge.postMessage(jsonStr);
                }
            } else if (this.#bridgeType === 'ios') {
                // iOS WKWebView
                const handler = globalThis.webkit?.messageHandlers?.[this.#iosHandler];
                if (handler?.postMessage) {
                    handler.postMessage(envelope); // iOS can take objects directly
                }
            }
            // If bridgeType is 'none', silently drop (or could throw)
        } catch (e) {
            console.error('[CrossBus] Failed to send to native:', e);
        }
    }

    /**
     * Flushes queued messages after bridge is ready.
     */
    #flushQueue() {
        while (this.#messageQueue.length > 0) {
            const msg = this.#messageQueue.shift();
            this.#sendToNative(msg);
        }
    }

    /**
     * Starts heartbeat to keep native connection alive.
     */
    #startHeartbeat() {
        this.#heartbeatTimer = setInterval(() => {
            if (this.#destroyed) return;

            this.#sendToNative({
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                t: 'hb', // heartbeat
                ts: Date.now()
            });
        }, this.#heartbeatInterval);
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
     * Destroys the transport, cleaning up resources.
     */
    destroy() {
        if (this.#destroyed) return;

        this.#destroyed = true;
        this.#messageHandler = null;
        this.#messageQueue = [];

        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer);
            this.#heartbeatTimer = null;
        }

        // Clean up global callback
        delete globalThis['__crossbus_receive__'];
    }

    /**
     * Gets whether the transport is destroyed.
     * @returns {boolean}
     */
    get isDestroyed() {
        return this.#destroyed;
    }

    /**
     * Gets the detected bridge type.
     * @returns {BridgeType}
     */
    get bridgeType() {
        return this.#bridgeType;
    }

    /**
     * Gets whether the bridge is ready.
     * @returns {boolean}
     */
    get isReady() {
        return this.#ready;
    }

    /**
     * Promise that resolves when bridge is ready.
     * @returns {Promise<void>}
     */
    get ready() {
        return this.#readyPromise;
    }
}
