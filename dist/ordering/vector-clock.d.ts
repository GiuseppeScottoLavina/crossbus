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
    /**
     * Deserializes from JSON object.
     *
     * @param {{ ownId: string, counters: Object<string, number> }} json
     * @returns {VectorClock}
     */
    static fromJSON(json: {
        ownId: string;
        counters: {
            [x: string]: number;
        };
    }): VectorClock;
    /**
     * Creates a new vector clock.
     *
     * @param {string} ownId - This node's unique identifier
     * @param {Object<string, number>} [initial={}] - Initial counter values
     */
    constructor(ownId: string, initial?: {
        [x: string]: number;
    });
    /**
     * Gets this node's ID.
     * @returns {string}
     */
    get ownId(): string;
    /**
     * Gets the counter value for a node.
     *
     * @param {string} nodeId - Node identifier
     * @returns {number} Counter value (0 if unknown)
     */
    get(nodeId: string): number;
    /**
     * Increments this node's counter (call before sending).
     *
     * @returns {number} New counter value
     */
    tick(): number;
    /**
     * Updates this clock with values from another clock.
     * Takes the max of each component (merge operation).
     *
     * @param {VectorClock} other - Clock to merge from
     */
    update(other: VectorClock): void;
    /**
     * Checks if this clock happened-before another.
     * A happened-before B iff all(A[i] <= B[i]) and exists(A[j] < B[j])
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if this clock causally precedes other
     */
    happenedBefore(other: VectorClock): boolean;
    /**
     * Checks if this clock is concurrent with another.
     * Concurrent means neither happened-before the other.
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks are concurrent
     */
    isConcurrentWith(other: VectorClock): boolean;
    /**
     * Checks if two clocks are identical.
     *
     * @param {VectorClock} other - Clock to compare against
     * @returns {boolean} True if clocks have identical values
     */
    equals(other: VectorClock): boolean;
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
    canDeliver(msgClock: VectorClock, senderId: string): boolean;
    /**
     * Creates a copy of this clock.
     *
     * @returns {VectorClock} Cloned clock
     */
    clone(): VectorClock;
    /**
     * Serializes to JSON-compatible object.
     *
     * @returns {{ ownId: string, counters: Object<string, number> }}
     */
    toJSON(): {
        ownId: string;
        counters: {
            [x: string]: number;
        };
    };
    /**
     * Returns human-readable representation.
     * @returns {string}
     */
    toString(): string;
    #private;
}
