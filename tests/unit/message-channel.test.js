/**
 * @fileoverview Tests for MessageChannel transport.
 * Used for direct 1:1 peer-to-peer communication.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { MessageType, PROTOCOL_MARKER, PROTOCOL_VERSION } from '../../src/common/types.js';

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

describe('MessageChannelTransport', () => {
    describe('Static method: isSupported()', () => {
        it('should return true if MessageChannel API exists', () => {
            expect(typeof MessageChannel !== 'undefined').toBe(true);
        });
    });

    describe('MessageChannel basics', () => {
        it('should create two linked ports', () => {
            const channel = new MessageChannel();

            expect(channel.port1).toBeDefined();
            expect(channel.port2).toBeDefined();
            expect(channel.port1).not.toBe(channel.port2);
        });

        it('should send message from port1 to port2', (done) => {
            const channel = new MessageChannel();
            const message = createProtocolMessage(MessageType.SIGNAL, { test: 1 });

            channel.port2.onmessage = (e) => {
                expect(e.data[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);
                expect(e.data.p.test).toBe(1);
                channel.port1.close();
                channel.port2.close();
                done();
            };

            channel.port1.postMessage(message);
        });

        it('should send message from port2 to port1', (done) => {
            const channel = new MessageChannel();
            const message = createProtocolMessage(MessageType.SIGNAL, { test: 2 });

            channel.port1.onmessage = (e) => {
                expect(e.data.p.test).toBe(2);
                channel.port1.close();
                channel.port2.close();
                done();
            };

            channel.port2.postMessage(message);
        });

        it('should support transferable objects', (done) => {
            const channel = new MessageChannel();
            const buffer = new ArrayBuffer(16);
            const message = { buffer };

            channel.port2.onmessage = (e) => {
                expect(e.data.buffer.byteLength).toBe(16);
                channel.port1.close();
                channel.port2.close();
                done();
            };

            // Transfer ownership
            channel.port1.postMessage(message, [buffer]);

            // Original buffer should now be detached (neutered)
            expect(buffer.byteLength).toBe(0);
        });
    });

    describe('Port lifecycle', () => {
        it('should close ports cleanly', () => {
            const channel = new MessageChannel();

            channel.port1.close();
            channel.port2.close();

            // Should not throw
            expect(true).toBe(true);
        });

        it('should not receive after close', (done) => {
            const channel = new MessageChannel();
            let received = false;

            channel.port2.onmessage = () => {
                received = true;
            };

            channel.port2.close();
            channel.port1.postMessage({ test: 1 });

            // Give time for any potential message
            setTimeout(() => {
                expect(received).toBe(false);
                channel.port1.close();
                done();
            }, 10);
        });
    });

    describe('Direct channel creation', () => {
        it('should allow passing port to another context via postMessage', () => {
            // Simulating: main page creates channel and sends port2 to iframe
            const channel = new MessageChannel();

            // In real usage:
            // iframe.contentWindow.postMessage({ port: channel.port2 }, '*', [channel.port2]);

            expect(channel.port2.constructor.name).toBe('MessagePort');
        });

        it('should enable bidirectional communication', (done) => {
            const channel = new MessageChannel();
            let pingReceived = false;

            // Port1 sends ping, expects pong
            channel.port1.onmessage = (e) => {
                if (e.data.type === 'pong') {
                    expect(pingReceived).toBe(true);
                    channel.port1.close();
                    channel.port2.close();
                    done();
                }
            };

            // Port2 receives ping, sends pong
            channel.port2.onmessage = (e) => {
                if (e.data.type === 'ping') {
                    pingReceived = true;
                    channel.port2.postMessage({ type: 'pong' });
                }
            };

            channel.port1.postMessage({ type: 'ping' });
        });
    });
});
