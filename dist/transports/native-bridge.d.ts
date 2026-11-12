/**
 * @typedef {Object} NativeBridgeTransportOptions
 * @property {string} [androidInterface='CrossBus']
 * @property {string} [iosHandler='crossbus']
 * @property {string} [callbackName='__crossbus_receive__'] - Must match the native adapter.
 * @property {number} [initTimeout=5000]
 * @property {number} [heartbeatInterval=0] - Optional transport heartbeat.
 * @property {boolean} [queueWhileInit=true]
 * @property {number} [maxQueueSize=100]
 */
export class NativeBridgeTransport {
    /** @param {NativeBridgeTransportOptions} [options] */
    static detectBridge(options?: NativeBridgeTransportOptions): "none" | "android" | "ios";
    /** @param {NativeBridgeTransportOptions} [options] */
    static isSupported(options?: NativeBridgeTransportOptions): boolean;
    /** @param {NativeBridgeTransportOptions} [options] */
    constructor(options?: NativeBridgeTransportOptions);
    /** @param {Object} message */
    send(message: any): void;
    /** @param {Function} handler */
    onMessage(handler: Function): void;
    offMessage(): void;
    destroy(): void;
    get isDestroyed(): boolean;
    get bridgeType(): string;
    get isReady(): boolean;
    get ready(): Promise<void>;
    #private;
}
export type NativeBridgeTransportOptions = {
    androidInterface?: string | undefined;
    iosHandler?: string | undefined;
    /**
     * - Must match the native adapter.
     */
    callbackName?: string | undefined;
    initTimeout?: number | undefined;
    /**
     * - Optional transport heartbeat.
     */
    heartbeatInterval?: number | undefined;
    queueWhileInit?: boolean | undefined;
    maxQueueSize?: number | undefined;
};
