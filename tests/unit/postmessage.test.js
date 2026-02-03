/**
 * @fileoverview Tests for PostMessageTransport.
 * Focus on constructor, send, properties, and destroy - not full message loop.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { PostMessageTransport } from '../../src/transports/postmessage.js';
import { MessageType, PROTOCOL_MARKER, PROTOCOL_VERSION } from '../../src/common/types.js';

/**
 * Mock Worker that supports postMessage
 */
class MockWorker {
    constructor() {
        this.messages = [];
        this.onmessage = null;
    }

    postMessage(data, transfer) {
        this.messages.push({ data, transfer });
    }

    addEventListener(event, handler) {
        if (event === 'message') {
            this.onmessage = handler;
        }
    }

    removeEventListener() { }
    terminate() { }
}

/**
 * Mock MessagePort
 */
class MockPort {
    constructor() {
        this.messages = [];
    }

    postMessage(data, transfer) {
        this.messages.push({ data, transfer });
    }

    addEventListener() { }
    removeEventListener() { }
    start() { }
    close() { }
}

function createProtocolMessage(type, payload = {}) {
    return {
        [PROTOCOL_MARKER]: PROTOCOL_VERSION,
        id: crypto.randomUUID(),
        t: type,
        ts: Date.now(),
        p: payload
    };
}

describe('PostMessageTransport', () => {
    describe('Static isSupported()', () => {
        it('should return a boolean', () => {
            const result = PostMessageTransport.isSupported();
            expect(typeof result).toBe('boolean');
        });
    });

    describe('constructor', () => {
        it('should create transport for Worker target', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(transport).toBeDefined();
            expect(transport.isDestroyed).toBe(false);

            transport.destroy();
        });

        it('should throw TypeError for null target', () => {
            expect(() => new PostMessageTransport(null)).toThrow(TypeError);
        });

        it('should throw TypeError for primitive target', () => {
            expect(() => new PostMessageTransport(123)).toThrow(TypeError);
            expect(() => new PostMessageTransport('string')).toThrow(TypeError);
        });

        it('should throw TypeError for object without postMessage', () => {
            expect(() => new PostMessageTransport({})).toThrow(TypeError);
        });

        it('should accept options', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker, {
                targetOrigin: 'https://example.com',
                allowedOrigins: ['https://trusted.com']
            });

            expect(transport.targetOrigin).toBe('https://example.com');

            transport.destroy();
        });

        it('should default targetOrigin to *', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(transport.targetOrigin).toBe('*');

            transport.destroy();
        });

        it('should create transport for MessagePort', () => {
            const port = new MockPort();
            const transport = new PostMessageTransport(port);

            expect(transport).toBeDefined();
            expect(transport.isDestroyed).toBe(false);

            transport.destroy();
        });
    });

    describe('send()', () => {
        it('should send message to worker', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            const message = createProtocolMessage(MessageType.SIGNAL, { test: 'data' });
            transport.send(message);

            expect(worker.messages.length).toBe(1);
            expect(worker.messages[0].data[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);

            transport.destroy();
        });

        it('should add protocol marker to messages', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            transport.send({ t: 'sig', p: { hello: 'world' } });

            expect(worker.messages[0].data[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);

            transport.destroy();
        });

        it('should pass transferables to postMessage', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            const buffer = new ArrayBuffer(16);
            const message = createProtocolMessage(MessageType.SIGNAL, {});
            transport.send(message, [buffer]);

            // Message should be sent, transfer handling depends on internal logic
            expect(worker.messages.length).toBe(1);

            transport.destroy();
        });

        it('should throw when destroyed', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);
            transport.destroy();

            expect(() => transport.send({})).toThrow();
        });

        it('should send to MessagePort', () => {
            const port = new MockPort();
            const transport = new PostMessageTransport(port);

            const message = createProtocolMessage(MessageType.REQUEST, { data: 'test' });
            transport.send(message);

            expect(port.messages.length).toBe(1);

            transport.destroy();
        });
    });

    describe('onMessage()', () => {
        it('should throw TypeError for non-function handler', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(() => transport.onMessage('not a function')).toThrow(TypeError);
            expect(() => transport.onMessage(123)).toThrow(TypeError);
            expect(() => transport.onMessage(null)).toThrow(TypeError);

            transport.destroy();
        });

        it('should accept function handler', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(() => transport.onMessage(() => { })).not.toThrow();

            transport.destroy();
        });
    });

    describe('offMessage()', () => {
        it('should not throw when called', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(() => transport.offMessage()).not.toThrow();

            transport.destroy();
        });
    });

    describe('destroy()', () => {
        it('should mark transport as destroyed', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
            expect(transport.isDestroyed).toBe(true);
        });

        it('should be idempotent', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            transport.destroy();
            expect(() => transport.destroy()).not.toThrow();
            expect(transport.isDestroyed).toBe(true);
        });
    });

    describe('properties', () => {
        it('should expose targetOrigin', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker, {
                targetOrigin: 'https://specific.com'
            });

            expect(transport.targetOrigin).toBe('https://specific.com');

            transport.destroy();
        });

        it('should expose isDestroyed', () => {
            const worker = new MockWorker();
            const transport = new PostMessageTransport(worker);

            expect(typeof transport.isDestroyed).toBe('boolean');

            transport.destroy();
        });
    });
});
