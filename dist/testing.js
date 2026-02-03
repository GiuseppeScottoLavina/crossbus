/** CrossBus v0.1.0 | MIT */
/**
 * @fileoverview Mock transport for testing CrossBus without browser APIs.
 * @module testing/mock-transport
 */

/**
 * @typedef {Object} CapturedMessage
 * @property {Object} message - The message sent
 * @property {number} timestamp - When it was sent
 */

/**
 * Mock transport for unit testing CrossBus.
 * Simulates a peer without requiring browser APIs.
 * 
 * @example
 * const mock = new MockTransport('widget-1');
 * 
 * // Connect to CrossBus
 * bus.addPeer('widget-1', mock.send);
 * 
 * // Simulate incoming message
 * mock.simulateMessage({ type: 'ready', payload: {} });
 * 
 * // Check what was sent
 * expect(mock.getLastSent()).toEqual({ ... });
 */
class MockTransport {
    /** @type {string} */
    #peerId;

    /** @type {CapturedMessage[]} */
    #sentMessages = [];

    /** @type {CapturedMessage[]} */
    #receivedMessages = [];

    /** @type {((message: Object) => void)|null} */
    #messageHandler = null;

    /** @type {number} */
    #latencyMs = 0;

    /** @type {boolean} */
    #shouldFail = false;

    /** @type {string|null} */
    #failureMessage = null;

    /** @type {boolean} */
    #connected = true;

    /**
     * Creates a new mock transport.
     * @param {string} peerId - Peer ID to simulate
     * @param {Object} [options={}] - Options
     * @param {number} [options.latencyMs=0] - Simulated latency in ms
     */
    constructor(peerId, options = {}) {
        this.#peerId = peerId;
        this.#latencyMs = options.latencyMs ?? 0;
    }

    /**
     * Gets the peer ID.
     * @returns {string}
     */
    get peerId() {
        return this.#peerId;
    }

    /**
     * Gets whether the mock is connected.
     * @returns {boolean}
     */
    get connected() {
        return this.#connected;
    }

    /**
     * The send function to pass to CrossBus.addPeer().
     * @returns {(message: Object) => void}
     */
    get send() {
        /** @type {(message: Object) => void} */
        const sendFn = (message) => {
            if (this.#shouldFail) {
                throw new Error(this.#failureMessage ?? 'Mock send failure');
            }

            if (!this.#connected) {
                throw new Error('Mock transport disconnected');
            }

            this.#sentMessages.push({
                message,
                timestamp: Date.now()
            });
        };
        return sendFn;
    }

    /**
     * Sets the message handler (called for simulated incoming messages).
     * @param {(message: Object) => void} handler
     */
    onMessage(handler) {
        this.#messageHandler = handler;
    }

    /**
     * Simulates receiving a message from the peer.
     * @param {Object} message - Message to simulate
     * @param {Object} [options={}] - Options
     * @param {number} [options.delay] - Override latency for this message
     */
    async simulateMessage(message, options = {}) {
        const delay = options.delay ?? this.#latencyMs;

        this.#receivedMessages.push({
            message,
            timestamp: Date.now()
        });

        if (delay > 0) {
            await new Promise(r => setTimeout(r, delay));
        }

        if (this.#messageHandler) {
            this.#messageHandler(message);
        }
    }

    /**
     * Simulates a disconnect.
     */
    disconnect() {
        this.#connected = false;
    }

    /**
     * Simulates a reconnect.
     */
    reconnect() {
        this.#connected = true;
    }

    /**
     * Configures the mock to fail on next send.
     * @param {string} [message] - Error message
     */
    failOnNextSend(message) {
        this.#shouldFail = true;
        this.#failureMessage = message ?? null;
    }

    /**
     * Resets failure mode.
     */
    resetFailure() {
        this.#shouldFail = false;
        this.#failureMessage = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // Inspection methods
    // ─────────────────────────────────────────────────────────────────

    /**
     * Gets all sent messages.
     * @returns {CapturedMessage[]}
     */
    getSentMessages() {
        return [...this.#sentMessages];
    }

    /**
     * Gets the last sent message.
     * @returns {Object|undefined}
     */
    getLastSent() {
        return this.#sentMessages[this.#sentMessages.length - 1]?.message;
    }

    /**
     * Gets sent message count.
     * @returns {number}
     */
    get sentCount() {
        return this.#sentMessages.length;
    }

    /**
     * Gets all received (simulated) messages.
     * @returns {CapturedMessage[]}
     */
    getReceivedMessages() {
        return [...this.#receivedMessages];
    }

    /**
     * Checks if a message with specific properties was sent.
     * @param {Object} matcher - Properties to match
     * @returns {boolean}
     */
    wasSent(matcher) {
        return this.#sentMessages.some(({ message }) =>
            Object.entries(matcher).every(([key, value]) =>
                JSON.stringify(message[key]) === JSON.stringify(value)
            )
        );
    }

    /**
     * Waits for a specific number of messages to be sent.
     * @param {number} count - Expected count
     * @param {number} [timeoutMs=1000] - Timeout
     * @returns {Promise<CapturedMessage[]>}
     */
    async waitForMessages(count, timeoutMs = 1000) {
        const start = Date.now();
        while (this.#sentMessages.length < count) {
            if (Date.now() - start > timeoutMs) {
                throw new Error(`Timeout waiting for ${count} messages, got ${this.#sentMessages.length}`);
            }
            await new Promise(r => setTimeout(r, 10));
        }
        return this.getSentMessages();
    }

    /**
     * Clears all captured messages.
     */
    clear() {
        this.#sentMessages = [];
        this.#receivedMessages = [];
    }

    /**
     * Resets the mock to initial state.
     */
    reset() {
        this.clear();
        this.resetFailure();
        this.reconnect();
    }
}

/**
 * Creates a pair of connected mock transports for testing.
 * Messages sent to one are received by the other.
 * 
 * @param {string} peerId1 - First peer ID
 * @param {string} peerId2 - Second peer ID
 * @returns {{ transport1: MockTransport, transport2: MockTransport }}
 * 
 * @example
 * const { transport1, transport2 } = createConnectedMocks('hub', 'widget');
 * // Messages sent via transport1 are received by transport2
 */
function createConnectedMocks(peerId1, peerId2) {
    const transport1 = new MockTransport(peerId1);
    const transport2 = new MockTransport(peerId2);

    // Wire them together
    const originalSend1 = transport1.send;
    const originalSend2 = transport2.send;

    // Override sends to forward to the other transport
    Object.defineProperty(transport1, 'send', {
        get() {
            return (message) => {
                originalSend1(message);
                transport2.simulateMessage(message);
            };
        }
    });

    Object.defineProperty(transport2, 'send', {
        get() {
            return (message) => {
                originalSend2(message);
                transport1.simulateMessage(message);
            };
        }
    });

    return { transport1, transport2 };
}

export { MockTransport, createConnectedMocks };
//# sourceMappingURL=testing.js.map
