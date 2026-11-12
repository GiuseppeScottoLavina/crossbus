/** WebView transport. Native adapters are shipped in native/. JSON payloads only. */
import { PROTOCOL_MARKER, PROTOCOL_VERSION, isProtocolMessage } from '../common/types.js';
import { CrossBusError, ErrorCode } from '../common/errors.js';

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
    #options;
    #bridgeType = 'none';
    #destroyed = false;
    #ready = false;
    /** @type {Function|null} */
    #handler = null;
    /** @type {Object[]} */
    #queue = [];
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    #poll;
    /** @type {ReturnType<typeof setInterval>|undefined} */
    #heartbeat;
    /** @type {Function} */
    #receive;
    /** @type {Promise<void>} */
    #readyPromise;
    /** @type {Function} */
    #resolve = () => {};
    /** @type {Function} */
    #reject = () => {};
    /** @type {Error|undefined} */
    #failure;

    /** @param {NativeBridgeTransportOptions} [options] */
    static detectBridge(options = {}) {
        const android = globalThis[options.androidInterface ?? 'CrossBus'];
        if (typeof android?.postMessage === 'function') return 'android';
        if (!options.androidInterface && typeof globalThis.AndroidBridge?.postMessage === 'function') return 'android';
        if (typeof globalThis.webkit?.messageHandlers?.[options.iosHandler ?? 'crossbus']?.postMessage === 'function') return 'ios';
        return 'none';
    }

    /** @param {NativeBridgeTransportOptions} [options] */
    static isSupported(options = {}) {
        return this.detectBridge(options) !== 'none';
    }

    /** @param {NativeBridgeTransportOptions} [options] */
    constructor(options = {}) {
        this.#options = {
            androidInterface: options.androidInterface,
            iosHandler: options.iosHandler ?? 'crossbus',
            callbackName: options.callbackName ?? '__crossbus_receive__',
            initTimeout: options.initTimeout ?? 5000,
            heartbeatInterval: options.heartbeatInterval ?? 0,
            queueWhileInit: options.queueWhileInit ?? true,
            maxQueueSize: options.maxQueueSize ?? 100
        };
        for (const name of ['initTimeout', 'heartbeatInterval', 'maxQueueSize']) {
            const value = this.#options[name];
            if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative`);
        }
        const callback = this.#options.callbackName;
        if (callback in globalThis) throw new Error(`Native callback already registered: ${callback}`);
        this.#readyPromise = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
        // A transport may be destroyed without the application awaiting ready.
        this.#readyPromise.catch(() => {});
        this.#receive = message => {
            if (this.#destroyed || !this.#handler) return;
            let data;
            try { data = typeof message === 'string' ? JSON.parse(message) : message; }
            catch { return; }
            if (isProtocolMessage(data)) this.#handler(data, { bridgeType: this.#bridgeType });
        };
        globalThis[callback] = this.#receive;
        const deadline = Date.now() + this.#options.initTimeout;
        const check = () => {
            if (this.#destroyed) return;
            this.#bridgeType = NativeBridgeTransport.detectBridge(options);
            if (this.#bridgeType !== 'none') {
                try {
                    // Detach once, then iterate: queue flushing is linear.
                    const queued = this.#queue;
                    this.#queue = [];
                    for (const message of queued) this.#send(message);
                    this.#ready = true;
                    this.#resolve();
                    if (this.#options.heartbeatInterval > 0) {
                        this.#heartbeat = setInterval(() => {
                            try { this.send({ id: `hb_${Date.now()}`, t: 'png', ts: Date.now() }); }
                            catch (error) { console.error('[CrossBus] Native heartbeat failed:', error); }
                        }, this.#options.heartbeatInterval);
                    }
                } catch (error) { this.#fail(error); }
            } else if (Date.now() >= deadline) {
                this.#fail(CrossBusError.from(ErrorCode.NOT_CONNECTED));
            } else this.#poll = setTimeout(check, Math.min(50, Math.max(1, deadline - Date.now())));
        };
        check();
    }

    /** @param {any} error */
    #fail(error) {
        this.#failure = error;
        this.#queue = [];
        this.#reject(error);
    }

    /** @param {Object} message */
    send(message) {
        if (this.#destroyed) throw CrossBusError.from(ErrorCode.DESTROYED);
        if (this.#failure) throw this.#failure;
        const envelope = { ...message, [PROTOCOL_MARKER]: PROTOCOL_VERSION };
        if (!this.#ready) {
            if (!this.#options.queueWhileInit) throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            if (this.#queue.length >= this.#options.maxQueueSize) throw CrossBusError.from(ErrorCode.QUEUE_FULL);
            this.#queue.push(envelope);
            return;
        }
        this.#send(envelope);
    }

    /** @param {Object} envelope */
    #send(envelope) {
        if (this.#bridgeType === 'android') {
            const bridge = this.#options.androidInterface
                ? globalThis[this.#options.androidInterface] : (typeof globalThis.CrossBus?.postMessage === 'function' ? globalThis.CrossBus : globalThis.AndroidBridge);
            if (typeof bridge?.postMessage !== 'function') throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            bridge.postMessage(JSON.stringify(envelope));
        } else {
            const handler = globalThis.webkit?.messageHandlers?.[this.#options.iosHandler];
            if (typeof handler?.postMessage !== 'function') throw CrossBusError.from(ErrorCode.NOT_CONNECTED);
            handler.postMessage(envelope);
        }
    }

    /** @param {Function} handler */
    onMessage(handler) {
        if (typeof handler !== 'function') throw new TypeError('Handler must be a function');
        if (this.#destroyed) throw CrossBusError.from(ErrorCode.DESTROYED);
        this.#handler = handler;
    }
    offMessage() { this.#handler = null; }
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;
        clearTimeout(this.#poll);
        clearInterval(this.#heartbeat);
        this.#queue = [];
        this.#handler = null;
        if (!this.#ready) this.#reject(CrossBusError.from(ErrorCode.DESTROYED));
        if (globalThis[this.#options.callbackName] === this.#receive) delete globalThis[this.#options.callbackName];
    }
    get isDestroyed() { return this.#destroyed; }
    get bridgeType() { return this.#bridgeType; }
    get isReady() { return this.#ready; }
    get ready() { return this.#readyPromise; }
}
