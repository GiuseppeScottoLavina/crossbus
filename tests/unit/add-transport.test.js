/**
 * @fileoverview Unit tests for addTransport method
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';
import { createConnectedMocks } from '../../src/testing/mock-transport.js';

describe('CrossBus.addTransport()', () => {
    let bus;

    beforeEach(() => {
        bus = new CrossBus({ peerId: 'test-bus', allowedOrigins: ['*'] });
    });

    afterEach(() => {
        bus?.destroy();
    });

    describe('Basic functionality', () => {
        it('should add a transport and return cleanup function', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'remote'
            };

            const cleanup = bus.addTransport(mockTransport);

            expect(typeof cleanup).toBe('function');
            expect(bus.peers).toContain('remote');
        });

        it('should throw if transport has no send method', () => {
            expect(() => bus.addTransport({})).toThrow('Transport must have a send() method');
        });

        it('should throw if transport is null', () => {
            expect(() => bus.addTransport(null)).toThrow();
        });

        it('should use options.peerId when provided', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'transport-id'
            };

            bus.addTransport(mockTransport, { peerId: 'custom-id' });

            expect(bus.peers).toContain('custom-id');
            expect(bus.peers).not.toContain('transport-id');
        });

        it('should use transport.peerId when options.peerId not provided', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'transport-id'
            };

            bus.addTransport(mockTransport);

            expect(bus.peers).toContain('transport-id');
        });

        it('should auto-generate peerId when none provided', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { })
            };

            bus.addTransport(mockTransport);

            expect(bus.peerCount).toBe(1);
            expect(bus.peers[0]).toMatch(/^transport-/);
        });
    });

    describe('Cleanup function', () => {
        it('should remove peer when cleanup is called', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'remote'
            };

            const cleanup = bus.addTransport(mockTransport);
            expect(bus.peers).toContain('remote');

            cleanup();
            expect(bus.peers).not.toContain('remote');
        });

        it('should call transport.destroy if available', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                destroy: mock(() => { }),
                peerId: 'remote'
            };

            const cleanup = bus.addTransport(mockTransport);
            cleanup();

            expect(mockTransport.destroy).toHaveBeenCalled();
        });

        it('should not throw if transport has no destroy method', () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'remote'
            };

            const cleanup = bus.addTransport(mockTransport);
            expect(() => cleanup()).not.toThrow();
        });
    });

    describe('Message wiring', () => {
        it('should wire transport.onMessage to handleMessage', () => {
            let capturedHandler;
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock((handler) => { capturedHandler = handler; }),
                peerId: 'remote'
            };

            bus.addTransport(mockTransport);

            expect(mockTransport.onMessage).toHaveBeenCalled();
            expect(typeof capturedHandler).toBe('function');
        });

        it('should wire addPeer send to transport.send', async () => {
            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'remote'
            };

            bus.addTransport(mockTransport);

            // Signal should trigger send (await since signal() is async)
            await bus.signal('test', { data: 1 });

            expect(mockTransport.send).toHaveBeenCalled();
        });
    });

    describe('Integration with MockTransport', () => {
        it('should enable communication between two CrossBus instances', async () => {
            const { transport1, transport2 } = createConnectedMocks('a', 'b');

            const busA = new CrossBus({ peerId: 'a', allowedOrigins: ['*'] });
            const busB = new CrossBus({ peerId: 'b', allowedOrigins: ['*'] });

            busA.addTransport(transport1, { peerId: 'b' });
            busB.addTransport(transport2, { peerId: 'a' });

            await new Promise(r => setTimeout(r, 50));

            busB.handle('echo', (data) => ({ echoed: data }));

            const result = await busA.request('b', 'echo', { msg: 'hello' });

            expect(result.echoed.msg).toBe('hello');

            busA.destroy();
            busB.destroy();
        });

        it('should support signals between two CrossBus instances', async () => {
            const { transport1, transport2 } = createConnectedMocks('a', 'b');

            const busA = new CrossBus({ peerId: 'a', allowedOrigins: ['*'] });
            const busB = new CrossBus({ peerId: 'b', allowedOrigins: ['*'] });

            busA.addTransport(transport1, { peerId: 'b' });
            busB.addTransport(transport2, { peerId: 'a' });

            await new Promise(r => setTimeout(r, 50));

            let received = null;
            busB.on('test-signal', (event) => {
                // EventEmitter.emit(name, data) creates event = { name, data: {...} }
                // #handleSignal passes { payload, source } as 'data', so actual payload is event.data.payload
                received = event.data.payload;
            });

            // Must await since signal() is async
            await busA.signal('test-signal', { value: 42 });

            await new Promise(r => setTimeout(r, 50));

            expect(received).toEqual({ value: 42 });

            busA.destroy();
            busB.destroy();
        });
    });

    describe('Throws when destroyed', () => {
        it('should throw if bus is destroyed', () => {
            bus.destroy();

            const mockTransport = {
                send: mock(() => { }),
                onMessage: mock(() => { }),
                peerId: 'remote'
            };

            expect(() => bus.addTransport(mockTransport)).toThrow();
        });
    });
});
