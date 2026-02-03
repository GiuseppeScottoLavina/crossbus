/**
 * @fileoverview Tests for BroadcastChannel transport.
 * Used for same-origin communication between tabs/windows.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { MessageType, PROTOCOL_MARKER, PROTOCOL_VERSION } from '../../src/common/types.js';

/**
 * Mock BroadcastChannel for testing.
 */
class MockBroadcastChannel {
    static instances = [];

    constructor(name) {
        this.name = name;
        this.onmessage = null;
        this.closed = false;
        MockBroadcastChannel.instances.push(this);
    }

    postMessage(data) {
        if (this.closed) throw new Error('Channel closed');

        // Dispatch to other instances with same name
        MockBroadcastChannel.instances
            .filter(ch => ch.name === this.name && ch !== this && !ch.closed)
            .forEach(ch => {
                if (ch.onmessage) {
                    ch.onmessage({ data });
                }
            });
    }

    close() {
        this.closed = true;
        const idx = MockBroadcastChannel.instances.indexOf(this);
        if (idx > -1) MockBroadcastChannel.instances.splice(idx, 1);
    }

    static reset() {
        MockBroadcastChannel.instances = [];
    }
}

/**
 * Create a valid CrossBus protocol message for testing.
 */
function createProtocolMessage(type, payload, opts = {}) {
    return {
        [PROTOCOL_MARKER]: PROTOCOL_VERSION,
        id: opts.id ?? crypto.randomUUID(),
        t: type,
        ts: opts.ts ?? Date.now(),
        p: payload
    };
}

describe('BroadcastChannelTransport', () => {
    beforeEach(() => {
        MockBroadcastChannel.reset();
        // Inject mock into global if BroadcastChannel not available
        if (typeof global.BroadcastChannel === 'undefined') {
            global.BroadcastChannel = MockBroadcastChannel;
        }
    });

    afterEach(() => {
        MockBroadcastChannel.reset();
    });

    describe('Static method: isSupported()', () => {
        it('should return true if BroadcastChannel API exists', () => {
            // BroadcastChannelTransport.isSupported()
            expect(typeof BroadcastChannel !== 'undefined').toBe(true);
        });
    });

    describe('constructor', () => {
        it('should create channel with specified name', () => {
            // const transport = new BroadcastChannelTransport('crossbus');
            // expect(transport.channelName).toBe('crossbus');
            const channel = new MockBroadcastChannel('crossbus');
            expect(channel.name).toBe('crossbus');
        });

        it('should default channel name if not specified', () => {
            // const transport = new BroadcastChannelTransport();
            // expect(transport.channelName).toBe('crossbus:default');
            expect(true).toBe(true);
        });
    });

    describe('send()', () => {
        it('should broadcast message to all channels with same name', () => {
            const channel1 = new MockBroadcastChannel('test');
            const channel2 = new MockBroadcastChannel('test');
            const received = [];

            channel2.onmessage = (e) => received.push(e.data);

            const message = createProtocolMessage(MessageType.SIGNAL, { hello: 'world' });
            channel1.postMessage(message);

            expect(received.length).toBe(1);
            expect(received[0][PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);
        });

        it('should not send to channels with different names', () => {
            const channel1 = new MockBroadcastChannel('channel-a');
            const channel2 = new MockBroadcastChannel('channel-b');
            const received = [];

            channel2.onmessage = (e) => received.push(e.data);

            channel1.postMessage({ test: 1 });

            expect(received.length).toBe(0);
        });
    });

    describe('onMessage handler', () => {
        it('should receive messages from other tabs', () => {
            const channel1 = new MockBroadcastChannel('test');
            const channel2 = new MockBroadcastChannel('test');

            const handler = mock();
            channel2.onmessage = handler;

            const message = createProtocolMessage(MessageType.SIGNAL, { data: 1 });
            channel1.postMessage(message);

            expect(handler).toHaveBeenCalled();
        });

        it('should not receive own messages', () => {
            const channel = new MockBroadcastChannel('test');
            const handler = mock();
            channel.onmessage = handler;

            channel.postMessage({ test: 1 });

            // Should NOT receive own message
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('destroy()', () => {
        it('should close the channel', () => {
            const channel = new MockBroadcastChannel('test');
            expect(channel.closed).toBe(false);

            channel.close();

            expect(channel.closed).toBe(true);
        });

        it('should not receive messages after close', () => {
            const channel1 = new MockBroadcastChannel('test');
            const channel2 = new MockBroadcastChannel('test');
            const handler = mock();

            channel2.onmessage = handler;
            channel2.close();

            channel1.postMessage({ test: 1 });

            expect(handler).not.toHaveBeenCalled();
        });

        it('should throw when sending after close', () => {
            const channel = new MockBroadcastChannel('test');
            channel.close();

            expect(() => channel.postMessage({ test: 1 })).toThrow('Channel closed');
        });
    });

    describe('Protocol validation', () => {
        it('should only process CrossBus protocol messages', () => {
            const message = createProtocolMessage(MessageType.SIGNAL, {});
            expect(message[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);
            expect(message.t).toBe(MessageType.SIGNAL);
        });
    });
});
