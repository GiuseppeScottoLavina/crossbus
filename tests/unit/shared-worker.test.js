/**
 * @fileoverview TDD tests for SharedWorkerTransport.
 * SharedWorker enables shared state between multiple tabs.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// Note: SharedWorker not available in Bun/Node, tests use mocks
describe('SharedWorkerTransport', () => {
    let mockSharedWorker;
    let mockPort;

    beforeEach(() => {
        // Mock SharedWorker and MessagePort
        mockPort = {
            postMessage: mock(),
            start: mock(),
            close: mock(),
            onmessage: null,
            onmessageerror: null
        };

        mockSharedWorker = {
            port: mockPort,
            onerror: null
        };

        // Mock global SharedWorker constructor
        globalThis.SharedWorker = mock((url) => {
            mockSharedWorker.url = url;
            return mockSharedWorker;
        });
    });

    afterEach(() => {
        delete globalThis.SharedWorker;
    });

    describe('isSupported()', () => {
        it('should return true when SharedWorker is available', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            expect(SharedWorkerTransport.isSupported()).toBe(true);
        });

        it('should return false when SharedWorker is not available', async () => {
            delete globalThis.SharedWorker;
            // Need to re-import to get fresh module
            const mod = await import('../../src/transports/shared-worker.js?v=1');
            expect(mod.SharedWorkerTransport.isSupported()).toBe(false);
        });
    });

    describe('constructor()', () => {
        it('should create SharedWorker with provided URL', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({
                workerUrl: '/shared-worker.js'
            });

            expect(globalThis.SharedWorker).toHaveBeenCalled();
            expect(mockPort.start).toHaveBeenCalled();

            transport.destroy();
        });

        it('should use default worker URL if not provided', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport();

            expect(globalThis.SharedWorker).toHaveBeenCalled();
            transport.destroy();
        });

        it('should throw if unsupported', async () => {
            const originalSW = globalThis.SharedWorker;
            delete globalThis.SharedWorker;

            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');

            expect(() => new SharedWorkerTransport()).toThrow(/not supported/);

            globalThis.SharedWorker = originalSW;
        });
    });

    describe('send()', () => {
        it('should post message to worker port', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            transport.send({ type: 'test', payload: { data: 123 } });

            expect(mockPort.postMessage).toHaveBeenCalled();
            const sentMessage = mockPort.postMessage.mock.calls[0][0];
            expect(sentMessage.payload).toEqual({ data: 123 });

            transport.destroy();
        });

        it('should support transferable objects', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            const buffer = new ArrayBuffer(8);
            transport.send({ t: 'sig' }, [buffer]);

            expect(mockPort.postMessage).toHaveBeenCalled();
            const args = mockPort.postMessage.mock.calls[0];
            expect(args[1]).toEqual([buffer]);

            transport.destroy();
        });

        it('should throw if transport is destroyed', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });
            transport.destroy();

            expect(() => transport.send({ type: 'test' })).toThrow();
        });

        it('should include protocol marker in envelope', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            transport.send({ t: 'sig', p: {} });

            const sent = mockPort.postMessage.mock.calls[0][0];
            expect(sent['_cb']).toBe(1); // PROTOCOL_MARKER = '_cb', PROTOCOL_VERSION = 1

            transport.destroy();
        });
    });

    describe('onMessage()', () => {
        it('should register message handler', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });
            const handler = mock();

            transport.onMessage(handler);

            // Simulate message from worker - need valid protocol message with id and t
            const protocolMsg = { '_cb': 1, id: 'test-123', t: 'sig', p: { test: true } };
            // Transport binds its own handler, need to call it directly
            mockPort.onmessage({ data: protocolMsg });

            expect(handler).toHaveBeenCalledWith(protocolMsg, { origin: 'sharedworker' });
            transport.destroy();
        });

        it('should ignore non-protocol messages', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });
            const handler = mock();

            transport.onMessage(handler);

            // Non-protocol message
            mockPort.onmessage({ data: { random: 'data' } });

            expect(handler).not.toHaveBeenCalled();
            transport.destroy();
        });

        it('should catch handler errors', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            // Handler that throws
            transport.onMessage(() => { throw new Error('Fail'); });

            const protocolMsg = { '_cb': 1, id: '1', t: 'sig' };
            // Should catch and log error, not crash
            mockPort.onmessage({ data: protocolMsg });

            transport.destroy();
        });

        it('should allow removing message handler', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });
            const handler = mock();

            transport.onMessage(handler);
            transport.offMessage();

            const protocolMsg = { '_cb': 1, id: '1', t: 'sig' };
            mockPort.onmessage({ data: protocolMsg });

            expect(handler).not.toHaveBeenCalled();
            transport.destroy();
        });
    });

    describe('error handling', () => {
        it('should handle port message errors', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            // Trigger onmessageerror
            mockPort.onmessageerror({ type: 'messageerror' });

            transport.destroy();
        });

        it('should handle worker errors', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            // Trigger worker onerror
            mockSharedWorker.onerror({ message: 'Script failed' });

        });
    });

    describe('destroy()', () => {
        it('should close the port', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            transport.destroy();

            expect(mockPort.close).toHaveBeenCalled();
            expect(transport.isDestroyed).toBe(true);
        });

        it('should be idempotent', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/test.js' });

            transport.destroy();
            transport.destroy(); // Should not throw

            expect(mockPort.close).toHaveBeenCalledTimes(1);
        });
    });

    describe('workerUrl getter', () => {
        it('should return the worker URL', async () => {
            const { SharedWorkerTransport } = await import('../../src/transports/shared-worker.js');
            const transport = new SharedWorkerTransport({ workerUrl: '/my-worker.js' });

            expect(transport.workerUrl).toBe('/my-worker.js');
            transport.destroy();
        });
    });
});
