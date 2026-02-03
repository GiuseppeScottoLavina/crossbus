/**
 * @typedef {Object} CausalOrdererOptions
 * @property {Function} [onDeliver] - Callback when message is delivered
 * @property {number} [maxBufferSize=1000] - Maximum buffered messages
 * @property {Function} [onBufferOverflow] - Called when buffer is full
 */
/**
 * @typedef {Object} BufferedMessage
 * @property {string} senderId - Message sender ID
 * @property {Object} message - Original message
 * @property {VectorClock} clock - Message's vector clock
 */
/**
 * Causal Orderer ensures messages are delivered in causal order.
 *
 * When a message arrives out of order (missing dependencies), it's
 * buffered until its dependencies are satisfied. This guarantees
 * that if message B was sent after seeing message A, then B will
 * be delivered after A at all receivers.
 *
 * @example
 * const orderer = new CausalOrderer('my-node', {
 *   onDeliver: (msg) => processMessage(msg)
 * });
 *
 * // When receiving a message:
 * orderer.receive(senderId, message);
 *
 * // When sending:
 * const clock = orderer.tick();
 * send({ ...data, clock: clock.toJSON() });
 */
export class CausalOrderer {
    /**
     * Creates a new CausalOrderer.
     *
     * @param {string} ownId - This node's unique identifier
     * @param {CausalOrdererOptions} options - Configuration options
     */
    constructor(ownId: string, options?: CausalOrdererOptions);
    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId(): string;
    /**
     * Gets the current buffer size.
     * @returns {number}
     */
    get bufferSize(): number;
    /**
     * Receives a message and delivers it if deps are satisfied,
     * otherwise buffers it.
     *
     * @param {string} senderId - ID of the message sender
     * @param {Object} message - Message with clock property
     */
    receive(senderId: string, message: any): void;
    /**
     * Increments local clock for sending a message.
     * Returns the clock to attach to outgoing message.
     *
     * @returns {VectorClock} Clock to include in message
     */
    tick(): VectorClock;
    /**
     * Gets a copy of the current vector clock.
     *
     * @returns {VectorClock}
     */
    getVectorClock(): VectorClock;
    /**
     * Clears the buffer (e.g., on disconnect).
     */
    clear(): void;
    #private;
}
export type CausalOrdererOptions = {
    /**
     * - Callback when message is delivered
     */
    onDeliver?: Function | undefined;
    /**
     * - Maximum buffered messages
     */
    maxBufferSize?: number | undefined;
    /**
     * - Called when buffer is full
     */
    onBufferOverflow?: Function | undefined;
};
export type BufferedMessage = {
    /**
     * - Message sender ID
     */
    senderId: string;
    /**
     * - Original message
     */
    message: any;
    /**
     * - Message's vector clock
     */
    clock: VectorClock;
};
import { VectorClock } from './vector-clock.js';
