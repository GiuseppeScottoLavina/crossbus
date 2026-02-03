/**
 * @typedef {Object} ListenerOptions
 * @property {boolean} [once=false] - Auto-remove after first invocation.
 * @property {AbortSignal} [signal] - AbortController signal for cleanup.
 * @property {'sync'|'async'} [mode='async'] - Execution mode.
 * @property {number} [priority=0] - Execution order (higher = first).
 */
/**
 * @typedef {Object} Subscription
 * @property {string} id - Unique subscription ID.
 * @property {string} signalName - The signal name subscribed to.
 * @property {Function} unsubscribe - Call to remove this listener.
 * @property {boolean} active - Whether subscription is active.
 */
/**
 * @typedef {Object} SignalEvent
 * @property {string} name - Signal name that was emitted.
 * @property {*} data - The payload data.
 * @property {string} messageId - Unique message ID.
 * @property {number} timestamp - When the signal was emitted.
 * @property {SignalSource} source - Origin of the signal.
 */
/**
 * @typedef {Object} SignalSource
 * @property {string} peerId - ID of the emitting peer ('self' if local).
 * @property {string} origin - Origin URL.
 * @property {'local'|'iframe'|'worker'|'service-worker'|'window'} type - Source type.
 */
/**
 * @callback SignalHandler
 * @param {SignalEvent} event - The signal event object.
 * @returns {void|Promise<void>}
 */
/**
 * @typedef {Object} ListenerEntry
 * @property {string} id - Subscription ID.
 * @property {SignalHandler} handler - The callback function.
 * @property {number} priority - Execution priority.
 * @property {'sync'|'async'} mode - Execution mode.
 * @property {boolean} once - Auto-remove after first invocation.
 * @property {AbortSignal|null} signal - Abort signal.
 */
/**
 * @typedef {Object} RemoveResult
 * @property {boolean} success - True if at least one listener was removed.
 * @property {number} removedCount - Number of listeners removed.
 * @property {number} remainingCount - Listeners still registered for this signal.
 */
/**
 * Local event emitter with wildcard support.
 *
 * Supports:
 * - Exact match: `on('user:login', handler)`
 * - Namespace wildcard: `on('user:*', handler)` matches `user:login`, `user:logout`
 * - Global wildcard: `on('*', handler)` matches all signals
 *
 * @example
 * const emitter = new EventEmitter();
 *
 * // Basic listener
 * emitter.on('message', (event) => console.log(event.data));
 *
 * // Wildcard listener
 * emitter.on('user:*', (event) => console.log('User event:', event.name));
 *
 * // Emit signal
 * emitter.emit('message', { text: 'Hello' });
 */
export class EventEmitter {
    /**
     * Sets the max listeners threshold for memory leak warnings.
     * @param {number} n - Max listeners (0 = unlimited)
     */
    setMaxListeners(n: number): this;
    /**
     * Gets the current max listeners setting.
     * @returns {number}
     */
    getMaxListeners(): number;
    /**
     * Registers a listener for a signal.
     *
     * @param {string} name - Signal name. Supports wildcards: '*', 'namespace:*'.
     * @param {SignalHandler} handler - Callback function.
     * @param {ListenerOptions} [options={}] - Configuration options.
     * @returns {Subscription} Subscription object.
     * @throws {TypeError} If name is not a string or handler is not a function.
     *
     * @example
     * // Basic listener
     * const sub = emitter.on('user:login', (event) => {
     *   console.log(`User ${event.data.userId} logged in`);
     * });
     *
     * @example
     * // One-time listener
     * emitter.on('init:complete', handler, { once: true });
     *
     * @example
     * // With AbortController
     * const controller = new AbortController();
     * emitter.on('data:update', handler, { signal: controller.signal });
     * controller.abort(); // Removes listener
     *
     * @example
     * // Priority-based ordering
     * emitter.on('event', lowPriorityHandler, { priority: 1 });
     * emitter.on('event', highPriorityHandler, { priority: 10 }); // Runs first
     */
    on(name: string, handler: SignalHandler, options?: ListenerOptions): Subscription;
    /**
     * Registers a one-time listener.
     * Convenience method for `on(name, handler, { once: true })`.
     *
     * @param {string} name - Signal name.
     * @param {SignalHandler} handler - Callback function.
     * @param {ListenerOptions} [options={}] - Additional options.
     * @returns {Subscription} Subscription object.
     */
    once(name: string, handler: SignalHandler, options?: ListenerOptions): Subscription;
    /**
     * Ultra-fast listener registration for performance-critical paths.
     *
     * Unlike on(), this method:
     * - No input validation (caller must ensure correct types)
     * - No subscription object (returns unbind function directly)
     * - No priority, once, or AbortSignal support
     * - Direct push to FAST_CACHE (minimal overhead)
     *
     * Use when you need maximum subscribe performance.
     *
     * @param {string} name - Signal name.
     * @param {EventListener} handler - Callback function.
     * @returns {Function} Unbind function (call to remove listener).
     *
     * @example
     * // 50M+ ops/sec subscribe/unsubscribe
     * const off = emitter.onFast('tick', (data) => console.log(data));
     * off(); // Remove listener
     */
    onFast(name: string, handler: EventListener): Function;
    /**
     * Ultra-fast listener removal for performance-critical paths.
     *
     * @param {string} name - Signal name.
     * @param {EventListener} handler - Handler to remove.
     */
    offFast(name: string, handler: EventListener): void;
    /**
     * Removes signal listener(s).
     *
     * @param {string} name - Signal name.
     * @param {SignalHandler} [handler] - Specific handler to remove.
     *                                    If omitted, removes ALL listeners.
     * @returns {RemoveResult} Result of the removal.
     * @throws {TypeError} If name is not a string.
     *
     * @example
     * // Remove specific handler
     * const result = emitter.off('msg', myHandler);
     * // => { success: true, removedCount: 1, remainingCount: 0 }
     *
     * @example
     * // Remove ALL listeners for a signal
     * emitter.off('updates');
     * // => { success: true, removedCount: 2, remainingCount: 0 }
     */
    off(name: string, handler?: SignalHandler): RemoveResult;
    /**
     * Ultra-fast synchronous emit for performance-critical paths.
     *
     * Unlike emit(), this method:
     * - Is synchronous (no async/await overhead)
     * - Passes data directly (no event envelope)
     * - Skips messageId, timestamp generation
     * - No wildcard matching (exact match only)
     *
     * Use for high-frequency events where metadata is not needed.
     *
     * @param {string} name - Signal name (exact match only).
     * @param {*} data - Payload to pass directly to handlers.
     * @returns {number} Number of listeners invoked.
     *
     * @example
     * // 150M+ ops/sec - use for hot paths
     * emitter.emitSync('tick', { x: 100, y: 200 });
     */
    emitSync(name: string, data: any): number;
    /**
     * Emits a signal to local listeners.
     *
     * @param {string} name - Signal name.
     * @param {*} data - Payload data.
     * @param {Partial<SignalSource>} [source] - Signal source info.
     * @returns {Promise<number>} Number of listeners invoked.
     * @throws {TypeError} If name is not a string.
     *
     * @example
     * const count = await emitter.emit('user:login', { userId: 123 });
     * console.log(`Notified ${count} listeners`);
     */
    emit(name: string, data: any, source?: Partial<SignalSource>): Promise<number>;
    /**
     * Checks if there are any listeners for a signal.
     *
     * @param {string} name - Signal name (exact match only).
     * @returns {boolean} True if listeners exist.
     */
    hasListeners(name: string): boolean;
    /**
     * Gets the count of listeners for a signal.
     *
     * @param {string} name - Signal name (exact match only).
     * @returns {number} Number of listeners.
     */
    listenerCount(name: string): number;
    /**
     * Gets all registered signal names.
     *
     * @returns {string[]} Array of signal names.
     */
    getSignalNames(): string[];
    /**
     * Removes all listeners.
     */
    clear(): void;
    #private;
}
export function createFastEmitter(): any;
export type ListenerOptions = {
    /**
     * - Auto-remove after first invocation.
     */
    once?: boolean | undefined;
    /**
     * - AbortController signal for cleanup.
     */
    signal?: AbortSignal | undefined;
    /**
     * - Execution mode.
     */
    mode?: "sync" | "async" | undefined;
    /**
     * - Execution order (higher = first).
     */
    priority?: number | undefined;
};
export type Subscription = {
    /**
     * - Unique subscription ID.
     */
    id: string;
    /**
     * - The signal name subscribed to.
     */
    signalName: string;
    /**
     * - Call to remove this listener.
     */
    unsubscribe: Function;
    /**
     * - Whether subscription is active.
     */
    active: boolean;
};
export type SignalEvent = {
    /**
     * - Signal name that was emitted.
     */
    name: string;
    /**
     * - The payload data.
     */
    data: any;
    /**
     * - Unique message ID.
     */
    messageId: string;
    /**
     * - When the signal was emitted.
     */
    timestamp: number;
    /**
     * - Origin of the signal.
     */
    source: SignalSource;
};
export type SignalSource = {
    /**
     * - ID of the emitting peer ('self' if local).
     */
    peerId: string;
    /**
     * - Origin URL.
     */
    origin: string;
    /**
     * - Source type.
     */
    type: "local" | "iframe" | "worker" | "service-worker" | "window";
};
export type SignalHandler = (event: SignalEvent) => void | Promise<void>;
export type ListenerEntry = {
    /**
     * - Subscription ID.
     */
    id: string;
    /**
     * - The callback function.
     */
    handler: SignalHandler;
    /**
     * - Execution priority.
     */
    priority: number;
    /**
     * - Execution mode.
     */
    mode: "sync" | "async";
    /**
     * - Auto-remove after first invocation.
     */
    once: boolean;
    /**
     * - Abort signal.
     */
    signal: AbortSignal | null;
};
export type RemoveResult = {
    /**
     * - True if at least one listener was removed.
     */
    success: boolean;
    /**
     * - Number of listeners removed.
     */
    removedCount: number;
    /**
     * - Listeners still registered for this signal.
     */
    remainingCount: number;
};
