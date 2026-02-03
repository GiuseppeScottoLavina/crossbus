/**
 * @fileoverview Vector Clock implementation for causal ordering.
 * 
 * Vector clocks track logical time across distributed processes,
 * enabling detection of causal relationships between events.
 * 
 * @module ordering/vector-clock
 */

/**
 * Vector Clock for tracking causal order in distributed systems.
 * 
 * Each node maintains a counter for every known node. When sending
 * a message, the sender increments its own counter and includes
 * the entire clock. When receiving, the receiver updates its clock
 * by taking the max of each component.
 * 
 * @example
 * const clock = new VectorClock('node-1');
 * clock.tick(); // Increment before sending
 * const message = { data, clock: clock.toJSON() };
 * 
 * // On receive:
 * const remoteClock = VectorClock.fromJSON(message.clock);
 * if (localClock.canDeliver(remoteClock, senderId)) {
 *   localClock.update(remoteClock);
 *   deliver(message);
 * }
 */
export class VectorClock {
    /** @type {string} */
    #ownId;

    /** @type {Map<string, number>} */
    #counters;

    /**
     * Creates a new vector clock.
     * 
     * @param {string} ownId - This node's unique identifier
     * @param {Object<string, number>} [initial={}] - Initial counter values
     */
    constructor(ownId, initial = {}) {
        this.#ownId = ownId;
        this.#counters = new Map(Object.entries(initial));

        // Ensure own entry exists
        if (!this.#counters.has(ownId)) {
            this.#counters.set(ownId, 0);
        }
    }

    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId() {
        return this.#ownId;
    }

    /**
     * Gets the counter value for a node.
     * 
     * @param {string} nodeId - Node identifier
     * @returns {number} Counter value (0 if unknown)
     */
    get(nodeId) {
        return this.#counters.get(nodeId) ?? 0;
    }

    /**
     * Increments this node's counter (call before sending).
     * 
     * @returns {number} New counter value
     */
    tick() {
        const current = this.get(this.#ownId);
        const next = current + 1;
        this.#counters.set(this.#ownId, next);
        return next;
    }

    /**
     * Updates this clock with values from another clock.
     * Takes the max of each component (merge operation).
     * 
     * @param {VectorClock} other - Clock to merge from
     */
    update(other) {
        for (const [nodeId, value] of other.#counters) {
            const current = this.get(nodeId);
            if (value > current) {
                this.#counters.set(nodeId, value);
            }
        }
    }

    /**
     * Checks if this clock happened-before another.
     * A happened-before B iff all(A[i] <= B[i]) and exists(A[j] < B[j])
     * 
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if this clock causally precedes other
     */
    happenedBefore(other) {
        let atLeastOneSmaller = false;
        const allNodeIds = new Set([...this.#counters.keys(), ...other.#counters.keys()]);

        for (const nodeId of allNodeIds) {
            const thisVal = this.get(nodeId);
            const otherVal = other.get(nodeId);

            if (thisVal > otherVal) {
                return false; // This has a greater component
            }
            if (thisVal < otherVal) {
                atLeastOneSmaller = true;
            }
        }

        return atLeastOneSmaller;
    }

    /**
     * Checks if this clock is concurrent with another.
     * Concurrent means neither happened-before the other.
     * 
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks are concurrent
     */
    isConcurrentWith(other) {
        return !this.happenedBefore(other) &&
            !other.happenedBefore(this) &&
            !this.equals(other);
    }

    /**
     * Checks if two clocks are identical.
     * 
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks have identical values
     */
    equals(other) {
        const allNodeIds = new Set([...this.#counters.keys(), ...other.#counters.keys()]);

        for (const nodeId of allNodeIds) {
            if (this.get(nodeId) !== other.get(nodeId)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Checks if a message with the given clock can be delivered.
     * 
     * Delivery condition: For the sender's component, the message clock
     * should be exactly one more than our current knowledge. For all other
     * components, the message clock should be <= our current knowledge.
     * 
     * @param {VectorClock} msgClock - Clock attached to incoming message
     * @param {string} senderId - ID of the message sender
     * @returns {boolean} True if message can be delivered without breaking causal order
     */
    canDeliver(msgClock, senderId) {
        const senderSeq = msgClock.get(senderId);
        const ourKnowledge = this.get(senderId);

        // Sender's sequence should be next in order (exactly +1)
        if (senderSeq !== ourKnowledge + 1) {
            return false;
        }

        // All other components should be <= what we know
        for (const [nodeId, value] of msgClock.#counters) {
            if (nodeId === senderId) continue;
            if (value > this.get(nodeId)) {
                return false; // We're missing messages from another node
            }
        }

        return true;
    }

    /**
     * Creates a copy of this clock.
     * 
     * @returns {VectorClock} Cloned clock
     */
    clone() {
        const counters = Object.fromEntries(this.#counters);
        return new VectorClock(this.#ownId, counters);
    }

    /**
     * Serializes to JSON-compatible object.
     * 
     * @returns {{ ownId: string, counters: Object<string, number> }}
     */
    toJSON() {
        return {
            ownId: this.#ownId,
            counters: Object.fromEntries(this.#counters)
        };
    }

    /**
     * Deserializes from JSON object.
     * 
     * @param {{ ownId: string, counters: Object<string, number> }} json
     * @returns {VectorClock}
     */
    static fromJSON(json) {
        return new VectorClock(json.ownId, json.counters);
    }

    /**
     * Returns human-readable representation.
     * @returns {string}
     */
    toString() {
        const entries = [...this.#counters.entries()]
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');
        return `VectorClock(${this.#ownId}){${entries}}`;
    }
}
