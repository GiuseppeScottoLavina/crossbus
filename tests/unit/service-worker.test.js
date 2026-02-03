/**
 * @fileoverview TDD tests for ServiceWorkerTransport.
 * ServiceWorker enables offline-capable communication.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

describe('ServiceWorkerTransport', () => {
    let mockServiceWorker;
    let mockRegistration;
    let mockContainer;

    beforeEach(() => {
        mockServiceWorker = {
            postMessage: mock(),
            state: 'activated'
        };

        mockRegistration = {
            active: mockServiceWorker,
            installing: null,
            waiting: null
        };

        mockContainer = {
            ready: Promise.resolve(mockRegistration),
            controller: mockServiceWorker,
            onmessage: null,
            oncontrollerchange: null,
            addEventListener: mock((event, handler) => {
                if (event === 'message') {
                    mockContainer._messageHandler = handler;
                }
            }),
            removeEventListener: mock()
        };

        // Mock navigator.serviceWorker
        globalThis.navigator = {
            serviceWorker: mockContainer
        };
    });

    afterEach(() => {
        delete globalThis.navigator;
    });

    describe('isSupported()', () => {
        it('should return true when ServiceWorker is available', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            expect(ServiceWorkerTransport.isSupported()).toBe(true);
        });

        it('should return false when ServiceWorker is not available', async () => {
            const originalNavigator = globalThis.navigator;
            delete globalThis.navigator; // Completely remove navigator

            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            expect(ServiceWorkerTransport.isSupported()).toBe(false);

            globalThis.navigator = originalNavigator;
        });

        it('should return false when navigator exists but serviceWorker missing', async () => {
            const originalSW = globalThis.navigator.serviceWorker;
            delete globalThis.navigator.serviceWorker;

            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            expect(ServiceWorkerTransport.isSupported()).toBe(false);

            globalThis.navigator.serviceWorker = originalSW;
        });
    });

    describe('constructor()', () => {
        it('should wait for ready ServiceWorker', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();

            await transport.ready;

            expect(mockContainer.addEventListener).toHaveBeenCalled();
            transport.destroy();
        });

        it('should throw if unsupported', async () => {
            const originalNavigator = globalThis.navigator;
            delete globalThis.navigator;

            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');

            expect(() => new ServiceWorkerTransport()).toThrow();

            globalThis.navigator = originalNavigator;
        });
    });

    describe('send()', () => {
        it('should post message to controller', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            transport.send({ t: 'sig', id: 'test', p: { data: 123 } });

            expect(mockServiceWorker.postMessage).toHaveBeenCalled();
            transport.destroy();
        });

        it('should support transferables', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            const buffer = new ArrayBuffer(8);
            transport.send({ t: 'sig', id: 'test' }, [buffer]);

            expect(mockServiceWorker.postMessage).toHaveBeenCalled();
            const args = mockServiceWorker.postMessage.mock.calls[0];
            expect(args[1]).toEqual([buffer]);

            transport.destroy();
        });

        it('should throw if transport is destroyed', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;
            transport.destroy();

            expect(() => transport.send({ t: 'sig', id: 'x' })).toThrow();
        });

        it('should throw if no controller available', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');

            // Mock NO controller scenario
            mockContainer.controller = null;
            mockRegistration.active = null;

            const transport = new ServiceWorkerTransport();
            await transport.ready;

            expect(() => transport.send({ t: 'sig', id: 'z' })).toThrow();

            transport.destroy();
        });

        it('should include protocol marker', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            transport.send({ t: 'sig', id: 'y', p: {} });

            const sent = mockServiceWorker.postMessage.mock.calls[0][0];
            expect(sent['_cb']).toBe(1);
            transport.destroy();
        });
    });

    describe('onMessage()', () => {
        it('should register message handler', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            const handler = mock();
            transport.onMessage(handler);

            // Simulate message from service worker
            const protocolMsg = { '_cb': 1, id: 'test-123', t: 'sig', p: { test: true } };
            mockContainer._messageHandler({ data: protocolMsg });

            expect(handler).toHaveBeenCalledWith(protocolMsg, { origin: 'serviceworker' });
            transport.destroy();
        });

        it('should ignore non-protocol messages', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;
            const handler = mock();
            transport.onMessage(handler);

            mockContainer._messageHandler({ data: { random: 'junk' } });

            expect(handler).not.toHaveBeenCalled();
            transport.destroy();
        });

        it('should catch handler errors without crashing', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            const handler = mock(() => { throw new Error('Boom'); });
            transport.onMessage(handler);

            const protocolMsg = { '_cb': 1, id: 'test-123', t: 'sig' };
            // Should not throw
            mockContainer._messageHandler({ data: protocolMsg });

            expect(handler).toHaveBeenCalled();
            transport.destroy();
        });

        it('should allow removing message handler with offMessage', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            const handler = mock();
            transport.onMessage(handler);
            transport.offMessage();

            const protocolMsg = { '_cb': 1, id: 'test-123', t: 'sig' };
            mockContainer._messageHandler({ data: protocolMsg });

            expect(handler).not.toHaveBeenCalled();
            transport.destroy();
        });
    });

    describe('destroy()', () => {
        it('should remove event listeners', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            transport.destroy();

            expect(mockContainer.removeEventListener).toHaveBeenCalled();
            expect(transport.isDestroyed).toBe(true);
        });

        it('should be idempotent', async () => {
            const { ServiceWorkerTransport } = await import('../../src/transports/service-worker.js');
            const transport = new ServiceWorkerTransport();
            await transport.ready;

            transport.destroy();
            transport.destroy();

            expect(mockContainer.removeEventListener).toHaveBeenCalledTimes(1);
        });
    });
});
