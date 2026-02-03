/**
 * @fileoverview Tests for message type builders and protocol message creation.
 */

import { describe, it, expect } from 'bun:test';
import {
    MessageType,
    DeliveryStatus,
    PeerStatus,
    PeerType,
    createMessage,
    createSignalMessage,
    createBroadcastMessage,
    createHandshakeInit,
    createHandshakeAck,
    createHandshakeComplete,
    createRequestMessage,
    createResponseMessage,
    isProtocolMessage,
    isCompatibleVersion
} from '../../src/core/message-types.js';
import { PROTOCOL_MARKER, PROTOCOL_VERSION } from '../../src/common/types.js';

describe('Message Types', () => {
    describe('Constants', () => {
        it('should have frozen DeliveryStatus', () => {
            expect(Object.isFrozen(DeliveryStatus)).toBe(true);
            expect(DeliveryStatus.LOCAL).toBe('local');
            expect(DeliveryStatus.REMOTE).toBe('remote');
            expect(DeliveryStatus.QUEUED).toBe('queued');
            expect(DeliveryStatus.FAILED).toBe('failed');
        });

        it('should have frozen PeerStatus', () => {
            expect(Object.isFrozen(PeerStatus)).toBe(true);
            expect(PeerStatus.CONNECTING).toBe('connecting');
            expect(PeerStatus.CONNECTED).toBe('connected');
            expect(PeerStatus.DISCONNECTED).toBe('disconnected');
            expect(PeerStatus.FAILED).toBe('failed');
        });

        it('should have frozen PeerType', () => {
            expect(Object.isFrozen(PeerType)).toBe(true);
            expect(PeerType.IFRAME).toBe('iframe');
            expect(PeerType.WORKER).toBe('worker');
            expect(PeerType.SERVICE_WORKER).toBe('service-worker');
            expect(PeerType.WINDOW).toBe('window');
            expect(PeerType.PORT).toBe('port');
            expect(PeerType.LOCAL).toBe('local');
        });
    });

    describe('createMessage()', () => {
        it('should create a frozen message with all required fields', () => {
            const msg = createMessage(MessageType.SIGNAL, { test: 'data' });

            expect(Object.isFrozen(msg)).toBe(true);
            expect(msg[PROTOCOL_MARKER]).toBe(PROTOCOL_VERSION);
            expect(msg.version).toBe(PROTOCOL_VERSION);
            expect(typeof msg.id).toBe('string');
            expect(msg.type).toBe(MessageType.SIGNAL);
            expect(typeof msg.timestamp).toBe('number');
            expect(msg.payload).toEqual({ test: 'data' });
        });

        it('should freeze payload and meta', () => {
            const msg = createMessage(MessageType.SIGNAL, { a: 1 }, { b: 2 });

            expect(Object.isFrozen(msg.payload)).toBe(true);
            expect(Object.isFrozen(msg.meta)).toBe(true);
        });

        it('should use custom ID when provided', () => {
            const msg = createMessage(MessageType.SIGNAL, {}, {}, 'custom-id-123');

            expect(msg.id).toBe('custom-id-123');
        });

        it('should generate unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(createMessage(MessageType.SIGNAL, {}).id);
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('createSignalMessage()', () => {
        it('should create a signal message', () => {
            const msg = createSignalMessage('test:event', { value: 42 }, 'peer-1');

            expect(msg.type).toBe(MessageType.SIGNAL);
            expect(msg.payload.name).toBe('test:event');
            expect(msg.payload.data).toEqual({ value: 42 });
            expect(msg.payload.source).toBe('peer-1');
            expect(msg.payload.dest).toBeNull();
        });

        it('should support targeted signals with destPeerId', () => {
            const msg = createSignalMessage('test', {}, 'peer-1', 'peer-2');

            expect(msg.payload.dest).toBe('peer-2');
        });
    });

    describe('createBroadcastMessage()', () => {
        it('should create a broadcast message', () => {
            const msg = createBroadcastMessage('broadcast:event', { data: 'test' }, 'hub');

            expect(msg.type).toBe(MessageType.BROADCAST);
            expect(msg.payload.name).toBe('broadcast:event');
            expect(msg.payload.data).toEqual({ data: 'test' });
            expect(msg.payload.source).toBe('hub');
        });

        it('should include broadcast options', () => {
            const msg = createBroadcastMessage('test', {}, 'hub', { excludeSelf: true });

            expect(msg.payload.options).toEqual({ excludeSelf: true });
        });
    });

    describe('Handshake Messages', () => {
        it('should create handshake init message', () => {
            const msg = createHandshakeInit('peer-1', 'http://localhost', 'challenge-123');

            expect(msg.type).toBe(MessageType.HANDSHAKE_INIT);
            expect(msg.payload.peerId).toBe('peer-1');
            expect(msg.payload.origin).toBe('http://localhost');
            expect(msg.payload.challenge).toBe('challenge-123');
        });

        it('should create handshake ack message', () => {
            const msg = createHandshakeAck('peer-2', 'http://remote', 'challenge-123', 'response-456');

            expect(msg.type).toBe(MessageType.HANDSHAKE_ACK);
            expect(msg.payload.peerId).toBe('peer-2');
            expect(msg.payload.origin).toBe('http://remote');
            expect(msg.payload.challenge).toBe('challenge-123');
            expect(msg.payload.response).toBe('response-456');
        });

        it('should create handshake complete message for success', () => {
            const msg = createHandshakeComplete('peer-1', true);

            expect(msg.type).toBe(MessageType.HANDSHAKE_COMPLETE);
            expect(msg.payload.peerId).toBe('peer-1');
            expect(msg.payload.success).toBe(true);
        });

        it('should create handshake complete message for failure', () => {
            const msg = createHandshakeComplete('peer-1', false);

            expect(msg.payload.success).toBe(false);
        });
    });

    describe('createRequestMessage()', () => {
        it('should create a request message', () => {
            const msg = createRequestMessage('getData', { query: 'test' }, 'peer-1', 'peer-2');

            expect(msg.type).toBe(MessageType.REQUEST);
            expect(msg.payload.name).toBe('getData');
            expect(msg.payload.data).toEqual({ query: 'test' });
            expect(msg.payload.source).toBe('peer-1');
            expect(msg.payload.dest).toBe('peer-2');
        });

        it('should support custom request ID', () => {
            const msg = createRequestMessage('test', {}, 'p1', 'p2', 'req-custom-123');

            expect(msg.id).toBe('req-custom-123');
        });
    });

    describe('createResponseMessage()', () => {
        it('should create a success response', () => {
            const msg = createResponseMessage('req-123', { result: 'ok' }, 'peer-2');

            expect(msg.type).toBe(MessageType.RESPONSE);
            expect(msg.payload.requestId).toBe('req-123');
            expect(msg.payload.data).toEqual({ result: 'ok' });
            expect(msg.payload.source).toBe('peer-2');
            expect(msg.payload.success).toBe(true);
            expect(msg.payload.error).toBeNull();
        });

        it('should create an error response', () => {
            const error = { code: 'NOT_FOUND', message: 'Resource not found' };
            const msg = createResponseMessage('req-123', null, 'peer-2', false, error);

            expect(msg.payload.success).toBe(false);
            expect(msg.payload.error).toEqual(error);
        });
    });

    describe('isProtocolMessage()', () => {
        it('should return true for valid protocol messages', () => {
            const msg = createMessage(MessageType.SIGNAL, { test: true });
            expect(isProtocolMessage(msg)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isProtocolMessage(null)).toBe(false);
        });

        it('should return false for non-objects', () => {
            expect(isProtocolMessage('string')).toBe(false);
            expect(isProtocolMessage(123)).toBe(false);
        });

        it('should return false for objects missing protocol marker', () => {
            expect(isProtocolMessage({ id: '123', type: 'sig' })).toBe(false);
        });

        it('should return false for objects missing required fields', () => {
            expect(isProtocolMessage({ [PROTOCOL_MARKER]: PROTOCOL_VERSION })).toBe(false);
        });
    });

    describe('isCompatibleVersion()', () => {
        it('should return true for current version', () => {
            const msg = createMessage(MessageType.SIGNAL, {});
            expect(isCompatibleVersion(msg)).toBe(true);
        });

        it('should return false for different version', () => {
            const msg = { version: 999 };
            expect(isCompatibleVersion(msg)).toBe(false);
        });
    });
});
