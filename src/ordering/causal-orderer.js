/**
 * @fileoverview Causal Orderer for message delivery with causal consistency.
 * 
 * Buffers out-of-order messages and delivers them only when their
 * causal dependencies have been satisfied.
 * 
 * @module ordering/causal-orderer
 */

import { VectorClock } from './vector-clock.js';

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
    /** @type {string} */
    #ownId;

    /** @type {VectorClock} */
    #clock;

    /** @type {BufferedMessage[]} */
    #buffer;

    /** @type {Function} */
    #onDeliver;

    /** @type {number} */
    #maxBufferSize;

    /** @type {Function|null} */
    #onBufferOverflow;

    /**
     * Creates a new CausalOrderer.
     * 
     * @param {string} ownId - This node's unique identifier
     * @param {CausalOrdererOptions} options - Configuration options
     */
    constructor(ownId, options = {}) {
        this.#ownId = ownId;
        this.#clock = new VectorClock(ownId);
        this.#buffer = [];
        this.#onDeliver = options.onDeliver || (() => { });
        this.#maxBufferSize = options.maxBufferSize ?? 1000;
        this.#onBufferOverflow = options.onBufferOverflow || null;
    }

    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId() {
        return this.#ownId;
    }

    /**
     * Gets the current buffer size.
     * @returns {number}
     */
    get bufferSize() {
        return this.#buffer.length;
    }

    /**
     * Receives a message and delivers it if deps are satisfied,
     * otherwise buffers it.
     * 
     * @param {string} senderId - ID of the message sender
     * @param {Object} message - Message with clock property
     */
    receive(senderId, message) {
        const msgClock = VectorClock.fromJSON(message.clock);

        if (this.#clock.canDeliver(msgClock, senderId)) {
            this.#deliver(senderId, message, msgClock);
            this.#tryDeliverBuffered();
        } else {
            this.#bufferMessage(senderId, message, msgClock);
        }
    }

    /**
     * Delivers a message and updates local clock.
     * 
     * @param {string} senderId
     * @param {Object} message
     * @param {VectorClock} msgClock
     */
    #deliver(senderId, message, msgClock) {
        // Update local clock with received clock
        this.#clock.update(msgClock);

        // Invoke delivery callback
        this.#onDeliver(message);
    }

    /**
     * Buffers a message for later delivery.
     * 
     * @param {string} senderId
     * @param {Object} message
     * @param {VectorClock} clock
     */
    #bufferMessage(senderId, message, clock) {
        if (this.#buffer.length >= this.#maxBufferSize) {
            if (this.#onBufferOverflow) {
                this.#onBufferOverflow({
                    senderId,
                    message,
                    bufferSize: this.#buffer.length
                });
            }
            return; // Drop message if buffer full
        }

        this.#buffer.push({ senderId, message, clock });
    }

    /**
     * Tries to deliver buffered messages whose deps are now satisfied.
     * Repeats until no more messages can be delivered.
     */
    #tryDeliverBuffered() {
        let delivered = true;

        while (delivered) {
            delivered = false;

            for (let i = this.#buffer.length - 1; i >= 0; i--) {
                const { senderId, message, clock } = this.#buffer[i];

                if (this.#clock.canDeliver(clock, senderId)) {
                    // Remove from buffer
                    this.#buffer.splice(i, 1);
                    // Deliver
                    this.#deliver(senderId, message, clock);
                    delivered = true;
                }
            }
        }
    }

    /**
     * Increments local clock for sending a message.
     * Returns the clock to attach to outgoing message.
     * 
     * @returns {VectorClock} Clock to include in message
     */
    tick() {
        this.#clock.tick();
        return this.#clock.clone();
    }

    /**
     * Gets a copy of the current vector clock.
     * 
     * @returns {VectorClock}
     */
    getVectorClock() {
        return this.#clock.clone();
    }

    /**
     * Clears the buffer (e.g., on disconnect).
     */
    clear() {
        this.#buffer = [];
    }
}
