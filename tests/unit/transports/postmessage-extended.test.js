/**
 * @fileoverview Extended tests for PostMessageTransport - focusing on API behavior.
 * Since MessageEvent in Bun requires MessagePort for source, we test through
 * the integration layer that uses MockTransport.
 */

import { describe, it, expect, mock } from 'bun:test';
import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../../../src/common/types.js';
import { PostMessageTransport } from '../../../src/transports/postmessage.js';

// Simple mock that PostMessageTransport can use
class MockTarget {
    messages = [];

    postMessage(data, targetOriginOrOptions, transfer) {
        this.messages.push({ data, targetOriginOrOptions, transfer });
    }
}

describe('PostMessageTransport API', () => {
    describe('constructor', () => {
        it('should create with defaults', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target);

            expect(transport.targetOrigin).toBeDefined();
            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
        });

        it('should accept custom targetOrigin', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: 'https://example.com'
            });

            expect(transport.targetOrigin).toBe('https://example.com');
            transport.destroy();
        });

        it('should accept allowedOrigins array', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*',
                allowedOrigins: ['https://a.com', 'https://b.com']
            });

            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
        });

        it('should throw for invalid target', () => {
            expect(() => new PostMessageTransport(null)).toThrow();
            expect(() => new PostMessageTransport({})).toThrow();
        });
    });

    describe('send()', () => {
        it('should send message with protocol marker', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: 'https://example.com'
            });

            transport.send({ t: 'sig', p: { name: 'test' } });

            expect(target.messages.length).toBe(1);
            expect(target.messages[0].data[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);
            transport.destroy();
        });

        it('should send with transferables', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: 'https://example.com'
            });

            const buffer = new ArrayBuffer(8);
            transport.send({ t: 'sig', p: buffer }, [buffer]);

            expect(target.messages.length).toBe(1);
            transport.destroy();
        });

        it('should throw when destroyed', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            transport.destroy();

            expect(() => transport.send({ t: 'sig' })).toThrow();
        });
    });

    describe('onMessage()', () => {
        it('should register handler', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            const handler = mock(() => { });
            transport.onMessage(handler);

            // Handler registered - transport not crashed
            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
        });

        it('should throw for non-function handler', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            expect(() => transport.onMessage('not a function')).toThrow(TypeError);
            transport.destroy();
        });
    });

    describe('offMessage()', () => {
        it('should unregister handler', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            transport.onMessage(() => { });
            transport.offMessage();

            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
        });
    });

    describe('destroy()', () => {
        it('should mark as destroyed', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            transport.destroy();

            expect(transport.isDestroyed).toBe(true);
        });

        it('should be idempotent', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            transport.destroy();
            transport.destroy();

            expect(transport.isDestroyed).toBe(true);
        });
    });

    describe('getters', () => {
        it('should expose targetOrigin', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: 'https://example.com'
            });

            expect(transport.targetOrigin).toBe('https://example.com');
            transport.destroy();
        });

        it('should expose isDestroyed', () => {
            const target = new MockTarget();
            const transport = new PostMessageTransport(target, {
                targetOrigin: '*'
            });

            expect(transport.isDestroyed).toBe(false);
            transport.destroy();
            expect(transport.isDestroyed).toBe(true);
        });
    });
});
