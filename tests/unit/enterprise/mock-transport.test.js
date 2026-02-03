/**
 * @fileoverview Tests for mock transport module.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MockTransport, createConnectedMocks } from '../../../src/testing/mock-transport.js';

describe('MockTransport', () => {
    let mock;

    beforeEach(() => {
        mock = new MockTransport('widget-1');
    });

    describe('constructor', () => {
        it('should create with peer ID', () => {
            expect(mock.peerId).toBe('widget-1');
        });

        it('should be connected by default', () => {
            expect(mock.connected).toBe(true);
        });

        it('should accept latency option', () => {
            const m = new MockTransport('test', { latencyMs: 100 });
            expect(m.peerId).toBe('test');
        });
    });

    describe('send', () => {
        it('should capture sent messages', () => {
            mock.send({ type: 'signal', data: 1 });
            expect(mock.sentCount).toBe(1);
            expect(mock.getLastSent()).toEqual({ type: 'signal', data: 1 });
        });

        it('should capture multiple messages', () => {
            mock.send({ data: 1 });
            mock.send({ data: 2 });
            mock.send({ data: 3 });
            expect(mock.sentCount).toBe(3);
        });

        it('should throw when configured to fail', () => {
            mock.failOnNextSend('Test failure');
            expect(() => mock.send({ data: 1 })).toThrow('Test failure');
        });

        it('should throw when disconnected', () => {
            mock.disconnect();
            expect(() => mock.send({ data: 1 })).toThrow('disconnected');
        });
    });

    describe('simulateMessage()', () => {
        it('should call message handler', async () => {
            const received = [];
            mock.onMessage((msg) => received.push(msg));
            await mock.simulateMessage({ type: 'test' });
            expect(received.length).toBe(1);
            expect(received[0].type).toBe('test');
        });

        it('should respect latency', async () => {
            const m = new MockTransport('test', { latencyMs: 50 });
            const received = [];
            m.onMessage((msg) => received.push(msg));

            const start = Date.now();
            await m.simulateMessage({ type: 'test' });
            const elapsed = Date.now() - start;

            expect(elapsed).toBeGreaterThanOrEqual(45);
        });

        it('should allow delay override', async () => {
            const received = [];
            mock.onMessage((msg) => received.push(msg));

            const start = Date.now();
            await mock.simulateMessage({ type: 'test' }, { delay: 50 });
            const elapsed = Date.now() - start;

            expect(elapsed).toBeGreaterThanOrEqual(45);
        });
    });

    describe('disconnect/reconnect', () => {
        it('should mark as disconnected', () => {
            mock.disconnect();
            expect(mock.connected).toBe(false);
        });

        it('should allow reconnection', () => {
            mock.disconnect();
            mock.reconnect();
            expect(mock.connected).toBe(true);
        });
    });

    describe('failOnNextSend/resetFailure', () => {
        it('should fail once', () => {
            mock.failOnNextSend();
            expect(() => mock.send({})).toThrow();
        });

        it('should reset failure mode', () => {
            mock.failOnNextSend();
            mock.resetFailure();
            expect(() => mock.send({})).not.toThrow();
        });
    });

    describe('inspection methods', () => {
        it('getSentMessages should return all sent', () => {
            mock.send({ a: 1 });
            mock.send({ b: 2 });
            const sent = mock.getSentMessages();
            expect(sent.length).toBe(2);
            expect(sent[0].message.a).toBe(1);
        });

        it('getLastSent should return last message', () => {
            mock.send({ a: 1 });
            mock.send({ b: 2 });
            expect(mock.getLastSent().b).toBe(2);
        });

        it('getLastSent should return undefined if empty', () => {
            expect(mock.getLastSent()).toBeUndefined();
        });

        it('wasSent should check for message', () => {
            mock.send({ type: 'test', value: 42 });
            expect(mock.wasSent({ type: 'test' })).toBe(true);
            expect(mock.wasSent({ type: 'other' })).toBe(false);
        });
    });

    describe('waitForMessages()', () => {
        it('should wait for message count', async () => {
            setTimeout(() => mock.send({ data: 1 }), 10);
            setTimeout(() => mock.send({ data: 2 }), 20);
            const messages = await mock.waitForMessages(2);
            expect(messages.length).toBe(2);
        });

        it('should timeout if not enough messages', async () => {
            await expect(mock.waitForMessages(5, 100)).rejects.toThrow('Timeout');
        });
    });

    describe('clear()', () => {
        it('should clear captured messages', () => {
            mock.send({ data: 1 });
            mock.clear();
            expect(mock.sentCount).toBe(0);
        });
    });

    describe('reset()', () => {
        it('should reset to initial state', () => {
            mock.send({ data: 1 });
            mock.failOnNextSend();
            mock.disconnect();
            mock.reset();

            expect(mock.sentCount).toBe(0);
            expect(mock.connected).toBe(true);
            expect(() => mock.send({})).not.toThrow();
        });
    });
});

describe('createConnectedMocks()', () => {
    it('should create two connected transports', () => {
        const { transport1, transport2 } = createConnectedMocks('hub', 'widget');
        expect(transport1.peerId).toBe('hub');
        expect(transport2.peerId).toBe('widget');
    });

    it('should forward messages between transports', async () => {
        const { transport1, transport2 } = createConnectedMocks('hub', 'widget');

        const received1 = [];
        const received2 = [];

        transport1.onMessage((msg) => received1.push(msg));
        transport2.onMessage((msg) => received2.push(msg));

        transport1.send({ from: 'hub' });
        await new Promise(r => setTimeout(r, 10));

        expect(received2.length).toBe(1);
        expect(received2[0].from).toBe('hub');
    });
});
