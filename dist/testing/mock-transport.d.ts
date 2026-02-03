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
export function createConnectedMocks(peerId1: string, peerId2: string): {
    transport1: MockTransport;
    transport2: MockTransport;
};
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
export class MockTransport {
    /**
     * Creates a new mock transport.
     * @param {string} peerId - Peer ID to simulate
     * @param {Object} [options={}] - Options
     * @param {number} [options.latencyMs=0] - Simulated latency in ms
     */
    constructor(peerId: string, options?: {
        latencyMs?: number | undefined;
    });
    /**
     * Gets the peer ID.
     * @returns {string}
     */
    get peerId(): string;
    /**
     * Gets whether the mock is connected.
     * @returns {boolean}
     */
    get connected(): boolean;
    /**
     * The send function to pass to CrossBus.addPeer().
     * @returns {(message: Object) => void}
     */
    get send(): (message: any) => void;
    /**
     * Sets the message handler (called for simulated incoming messages).
     * @param {(message: Object) => void} handler
     */
    onMessage(handler: (message: any) => void): void;
    /**
     * Simulates receiving a message from the peer.
     * @param {Object} message - Message to simulate
     * @param {Object} [options={}] - Options
     * @param {number} [options.delay] - Override latency for this message
     */
    simulateMessage(message: any, options?: {
        delay?: number | undefined;
    }): Promise<void>;
    /**
     * Simulates a disconnect.
     */
    disconnect(): void;
    /**
     * Simulates a reconnect.
     */
    reconnect(): void;
    /**
     * Configures the mock to fail on next send.
     * @param {string} [message] - Error message
     */
    failOnNextSend(message?: string): void;
    /**
     * Resets failure mode.
     */
    resetFailure(): void;
    /**
     * Gets all sent messages.
     * @returns {CapturedMessage[]}
     */
    getSentMessages(): CapturedMessage[];
    /**
     * Gets the last sent message.
     * @returns {Object|undefined}
     */
    getLastSent(): any | undefined;
    /**
     * Gets sent message count.
     * @returns {number}
     */
    get sentCount(): number;
    /**
     * Gets all received (simulated) messages.
     * @returns {CapturedMessage[]}
     */
    getReceivedMessages(): CapturedMessage[];
    /**
     * Checks if a message with specific properties was sent.
     * @param {Object} matcher - Properties to match
     * @returns {boolean}
     */
    wasSent(matcher: any): boolean;
    /**
     * Waits for a specific number of messages to be sent.
     * @param {number} count - Expected count
     * @param {number} [timeoutMs=1000] - Timeout
     * @returns {Promise<CapturedMessage[]>}
     */
    waitForMessages(count: number, timeoutMs?: number): Promise<CapturedMessage[]>;
    /**
     * Clears all captured messages.
     */
    clear(): void;
    /**
     * Resets the mock to initial state.
     */
    reset(): void;
    #private;
}
export type CapturedMessage = {
    /**
     * - The message sent
     */
    message: any;
    /**
     * - When it was sent
     */
    timestamp: number;
};
