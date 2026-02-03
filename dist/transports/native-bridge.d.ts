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
    /**
     * Detects which native bridge is available.
     *
     * @returns {BridgeType} The detected bridge type.
     */
    static detectBridge(): BridgeType;
    /**
     * Checks if any native bridge is available.
     *
     * @returns {boolean} True if a native bridge is detected.
     */
    static isSupported(): boolean;
    /**
     * Creates a new Native Bridge transport.
     *
     * @param {NativeBridgeTransportOptions} [options={}] - Configuration options.
     */
    constructor(options?: NativeBridgeTransportOptions);
    /**
     * Sends a message to the native side.
     *
     * @param {Object} message - Protocol message to send.
     * @throws {CrossBusError} If transport is destroyed.
     */
    send(message: any): void;
    /**
     * Registers a message handler.
     *
     * @param {MessageHandler} handler - Function to handle incoming messages.
     */
    onMessage(handler: MessageHandler): void;
    /**
     * Removes the message handler.
     */
    offMessage(): void;
    /**
     * Destroys the transport, cleaning up resources.
     */
    destroy(): void;
    /**
     * Gets whether the transport is destroyed.
     * @returns {boolean}
     */
    get isDestroyed(): boolean;
    /**
     * Gets the detected bridge type.
     * @returns {BridgeType}
     */
    get bridgeType(): BridgeType;
    /**
     * Gets whether the bridge is ready.
     * @returns {boolean}
     */
    get isReady(): boolean;
    /**
     * Promise that resolves when bridge is ready.
     * @returns {Promise<void>}
     */
    get ready(): Promise<void>;
    #private;
}
export type BridgeType = "android" | "ios" | "none";
export type NativeBridgeTransportOptions = {
    /**
     * - Name of Android JavascriptInterface.
     */
    androidInterface?: string | undefined;
    /**
     * - Name of iOS WKScriptMessageHandler.
     */
    iosHandler?: string | undefined;
    /**
     * - Timeout waiting for native bridge (ms).
     */
    initTimeout?: number | undefined;
    /**
     * - Heartbeat interval (ms), 0 to disable.
     */
    heartbeatInterval?: number | undefined;
    /**
     * - Queue messages while waiting for bridge.
     */
    queueWhileInit?: boolean | undefined;
};
export type MessageHandler = (message: any, source: {
    bridgeType: BridgeType;
}) => any;
