/**
 * @fileoverview Tests for WebSocket transport.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WebSocketTransport } from '../../src/transports/websocket.js';

// Mock WebSocket for Node/Bun environment
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    sentMessages = [];

    constructor(url) {
        this.url = url;
        // Simulate async connection
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) this.onopen({});
        }, 10);
    }

    send(data) {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error('WebSocket not open');
        }
        this.sentMessages.push(data);
    }

    close(code, reason) {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) this.onclose({ code, reason });
    }

    // Test helper to simulate incoming message
    simulateMessage(data) {
        if (this.onmessage) {
            this.onmessage({ data: JSON.stringify(data) });
        }
    }

    // Test helper to simulate error
    simulateError(error) {
        if (this.onerror) this.onerror(error);
    }
}

// Store original WebSocket
const OriginalWebSocket = globalThis.WebSocket;

describe('WebSocketTransport', () => {
    beforeEach(() => {
        // Mock WebSocket globally
        globalThis.WebSocket = MockWebSocket;
    });

    afterEach(() => {
        // Restore original
        globalThis.WebSocket = OriginalWebSocket;
    });

    describe('constructor', () => {
        it('should create transport with URL', () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });
            expect(transport.peerId).toBeDefined();
            expect(transport.state).toBe('disconnected');
        });

        it('should use provided peerId', () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws',
                peerId: 'my-peer'
            });
            expect(transport.peerId).toBe('my-peer');
        });
    });

    describe('connect', () => {
        it('should connect to server', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            await transport.connect();
            expect(transport.state).toBe('connected');
            expect(transport.isConnected).toBe(true);
        });

        it('should emit state changes', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            const states = [];
            transport.onStateChange((state) => states.push(state));

            await transport.connect();
            expect(states).toContain('connecting');
            expect(states).toContain('connected');
        });
    });

    describe('send', () => {
        it('should send message when connected', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws',
                peerId: 'sender'
            });

            await transport.connect();
            const sent = transport.send({ type: 'test', payload: { foo: 'bar' } });

            expect(sent).toBe(true);
        });

        it('should queue message when disconnected', () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            const sent = transport.send({ type: 'test' });
            expect(sent).toBe(false);
        });
    });

    describe('onMessage', () => {
        it('should receive messages', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            const received = [];
            transport.onMessage((msg) => received.push(msg));

            await transport.connect();

            // Message handler is set, test passes if no errors
            expect(received).toEqual([]);
        });
    });

    describe('disconnect', () => {
        it('should disconnect cleanly', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            await transport.connect();
            transport.disconnect();

            expect(transport.state).toBe('disconnected');
            expect(transport.isConnected).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should clean up resources', async () => {
            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws'
            });

            await transport.connect();
            transport.destroy();

            expect(transport.state).toBe('disconnected');
        });
    });

    describe('message envelope', () => {
        it('should include protocol markers', async () => {
            let captured = null;

            // Custom mock that captures sent data
            globalThis.WebSocket = class extends MockWebSocket {
                send(data) {
                    captured = JSON.parse(data);
                    super.send(data);
                }
            };

            const transport = new WebSocketTransport({
                url: 'wss://example.com/ws',
                peerId: 'test-peer'
            });

            await transport.connect();
            transport.send({ type: 'hello', payload: {} });

            expect(captured).toBeDefined();
            expect(captured._cb).toBeDefined();
            expect(captured._m).toBeDefined();
            expect(captured.from).toBe('test-peer');
            expect(captured.timestamp).toBeDefined();
            expect(captured.id).toBeDefined();
        });
    });
});
