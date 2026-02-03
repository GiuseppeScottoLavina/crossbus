/**
 * @fileoverview Tests for NativeBridgeTransport.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { NativeBridgeTransport } from '../../src/transports/native-bridge.js';

describe('NativeBridgeTransport', () => {
    let originalWindow;

    beforeEach(() => {
        // Save original window properties
        originalWindow = {
            CrossBus: globalThis.CrossBus,
            AndroidBridge: globalThis.AndroidBridge,
            webkit: globalThis.webkit
        };
    });

    afterEach(() => {
        // Restore window properties
        globalThis.CrossBus = originalWindow.CrossBus;
        globalThis.AndroidBridge = originalWindow.AndroidBridge;
        globalThis.webkit = originalWindow.webkit;

        // Clean up global callback
        delete globalThis['__crossbus_receive__'];
    });

    describe('detectBridge()', () => {
        it('should return "none" when no bridge available', () => {
            delete globalThis.CrossBus;
            delete globalThis.AndroidBridge;
            delete globalThis.webkit;

            expect(NativeBridgeTransport.detectBridge()).toBe('none');
        });

        it('should detect Android CrossBus interface', () => {
            globalThis.CrossBus = {
                postMessage: () => { }
            };

            expect(NativeBridgeTransport.detectBridge()).toBe('android');
        });

        it('should detect Android AndroidBridge interface', () => {
            globalThis.AndroidBridge = {
                postMessage: () => { }
            };

            expect(NativeBridgeTransport.detectBridge()).toBe('android');
        });

        it('should detect iOS WKWebView', () => {
            globalThis.webkit = {
                messageHandlers: {
                    crossbus: {
                        postMessage: () => { }
                    }
                }
            };

            expect(NativeBridgeTransport.detectBridge()).toBe('ios');
        });

        it('should prefer Android if both available', () => {
            globalThis.CrossBus = { postMessage: () => { } };
            globalThis.webkit = {
                messageHandlers: { crossbus: { postMessage: () => { } } }
            };

            // Android is checked first
            expect(NativeBridgeTransport.detectBridge()).toBe('android');
        });
    });

    describe('isSupported()', () => {
        it('should return false when no bridge available', () => {
            delete globalThis.CrossBus;
            delete globalThis.AndroidBridge;
            delete globalThis.webkit;

            expect(NativeBridgeTransport.isSupported()).toBe(false);
        });

        it('should return true when Android bridge available', () => {
            globalThis.CrossBus = { postMessage: () => { } };

            expect(NativeBridgeTransport.isSupported()).toBe(true);
        });

        it('should return true when iOS bridge available', () => {
            globalThis.webkit = {
                messageHandlers: { crossbus: { postMessage: () => { } } }
            };

            expect(NativeBridgeTransport.isSupported()).toBe(true);
        });
    });

    describe('constructor', () => {
        it('should create transport with default options', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            expect(transport.isDestroyed).toBe(false);
            expect(transport.bridgeType).toBe('none');

            transport.destroy();
        });

        it('should set up global callback for native messages', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            expect(typeof globalThis['__crossbus_receive__']).toBe('function');

            transport.destroy();
        });
    });

    describe('send()', () => {
        it('should queue messages when not ready', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            // Should not throw - queues the message
            transport.send({ t: 'test', p: { hello: 'world' } });

            transport.destroy();
        });

        it('should throw when destroyed', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            transport.destroy();

            expect(() => transport.send({ t: 'test' })).toThrow();
        });

        it('should send to Android bridge when available', async () => {
            const mockPostMessage = mock(() => { });
            globalThis.CrossBus = { postMessage: mockPostMessage };

            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            await transport.ready;

            transport.send({ t: 'test', p: { data: 123 } });

            expect(mockPostMessage).toHaveBeenCalled();
            const sentData = JSON.parse(mockPostMessage.mock.calls[0][0]);
            expect(sentData.t).toBe('test');
            expect(sentData.p.data).toBe(123);
            expect(sentData._cb).toBe(1);

            transport.destroy();
        });

        it('should send to iOS bridge when available', async () => {
            const mockPostMessage = mock(() => { });
            globalThis.webkit = {
                messageHandlers: {
                    crossbus: { postMessage: mockPostMessage }
                }
            };

            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            await transport.ready;

            transport.send({ t: 'test', p: { data: 456 } });

            expect(mockPostMessage).toHaveBeenCalled();
            const sentData = mockPostMessage.mock.calls[0][0];
            expect(sentData.t).toBe('test');
            expect(sentData.p.data).toBe(456);

            transport.destroy();
        });
    });

    describe('onMessage()', () => {
        it('should register message handler', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            const handler = () => { };

            transport.onMessage(handler);

            transport.destroy();
        });

        it('should throw if handler is not a function', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            expect(() => transport.onMessage('not a function')).toThrow(TypeError);

            transport.destroy();
        });

        it('should receive messages via global callback', async () => {
            globalThis.CrossBus = { postMessage: () => { } };

            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            await transport.ready;

            let receivedMsg = null;
            transport.onMessage((msg) => {
                receivedMsg = msg;
            });

            // Simulate native calling the callback
            globalThis['__crossbus_receive__'](JSON.stringify({
                _cb: 1,
                id: 'native-msg-1',
                t: 'native-event',
                p: { from: 'native' }
            }));

            expect(receivedMsg).not.toBeNull();
            expect(receivedMsg.t).toBe('native-event');
            expect(receivedMsg.p.from).toBe('native');

            transport.destroy();
        });

        it('should ignore non-protocol messages', async () => {
            globalThis.CrossBus = { postMessage: () => { } };

            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            await transport.ready;

            let receivedMsg = null;
            transport.onMessage((msg) => {
                receivedMsg = msg;
            });

            // Send non-protocol message (no _cb marker)
            globalThis['__crossbus_receive__'](JSON.stringify({
                type: 'random',
                data: 'not crossbus'
            }));

            expect(receivedMsg).toBeNull();

            transport.destroy();
        });
    });

    describe('destroy()', () => {
        it('should clean up resources', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            transport.destroy();

            expect(transport.isDestroyed).toBe(true);
            expect(globalThis['__crossbus_receive__']).toBeUndefined();
        });

        it('should be idempotent', () => {
            const transport = new NativeBridgeTransport({ initTimeout: 100 });
            transport.destroy();
            transport.destroy(); // Should not throw

            expect(transport.isDestroyed).toBe(true);
        });
    });

    describe('ready promise', () => {
        it('should resolve when bridge detected', async () => {
            globalThis.CrossBus = { postMessage: () => { } };

            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            await transport.ready;

            expect(transport.isReady).toBe(true);
            expect(transport.bridgeType).toBe('android');

            transport.destroy();
        });

        it('should resolve after timeout if no bridge', async () => {
            delete globalThis.CrossBus;
            delete globalThis.AndroidBridge;
            delete globalThis.webkit;

            const transport = new NativeBridgeTransport({ initTimeout: 100 });

            await transport.ready;

            expect(transport.isReady).toBe(true);
            expect(transport.bridgeType).toBe('none');

            transport.destroy();
        });
    });

    describe('heartbeat', () => {
        it('should send heartbeats when enabled', async () => {
            const mockPostMessage = mock(() => { });
            globalThis.CrossBus = { postMessage: mockPostMessage };

            const transport = new NativeBridgeTransport({
                initTimeout: 100,
                heartbeatInterval: 50 // Very short for testing
            });

            await transport.ready;

            // Wait for at least one heartbeat
            await new Promise(r => setTimeout(r, 100));

            // Should have received heartbeat messages
            const calls = mockPostMessage.mock.calls;
            const heartbeats = calls.filter(call => {
                const msg = JSON.parse(call[0]);
                return msg.t === 'hb';
            });

            expect(heartbeats.length).toBeGreaterThan(0);

            transport.destroy();
        });

        it('should not send heartbeats when disabled', async () => {
            const mockPostMessage = mock(() => { });
            globalThis.CrossBus = { postMessage: mockPostMessage };

            const transport = new NativeBridgeTransport({
                initTimeout: 100,
                heartbeatInterval: 0 // Disabled
            });

            await transport.ready;

            // Wait a bit
            await new Promise(r => setTimeout(r, 100));

            // No heartbeat messages
            const heartbeats = mockPostMessage.mock.calls.filter(call => {
                try {
                    const msg = JSON.parse(call[0]);
                    return msg.t === 'hb';
                } catch {
                    return false;
                }
            });

            expect(heartbeats.length).toBe(0);

            transport.destroy();
        });
    });
});
