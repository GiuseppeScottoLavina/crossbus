/**
 * @fileoverview Tests for common/types.js transferable functions.
 */

import { describe, it, expect } from 'bun:test';
import {
    isTransferable,
    findTransferables,
    TransferableTypes,
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    MessageType,
    HandshakePhase,
    PeerStatus,
    PeerType,
    DeliveryStatus,
    Defaults,
    isProtocolMessage
} from '../../src/common/types.js';

describe('Types Constants', () => {
    describe('PROTOCOL_MARKER and PROTOCOL_VERSION', () => {
        it('should export PROTOCOL_MARKER', () => {
            expect(PROTOCOL_MARKER).toBe('_cb');
        });

        it('should export PROTOCOL_VERSION', () => {
            expect(typeof PROTOCOL_VERSION).toBe('number');
            expect(PROTOCOL_VERSION).toBe(1);
        });
    });

    describe('MessageType', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(MessageType)).toBe(true);
        });

        it('should have all expected types', () => {
            expect(MessageType.SIGNAL).toBe('sig');
            expect(MessageType.REQUEST).toBe('req');
            expect(MessageType.RESPONSE).toBe('res');
            expect(MessageType.ACK).toBe('ack');
            expect(MessageType.HANDSHAKE).toBe('hsk');
            expect(MessageType.HANDSHAKE_INIT).toBe('hsk_init');
            expect(MessageType.HANDSHAKE_ACK).toBe('hsk_ack');
            expect(MessageType.HANDSHAKE_COMPLETE).toBe('hsk_done');
            expect(MessageType.PING).toBe('png');
            expect(MessageType.PONG).toBe('pog');
            expect(MessageType.BYE).toBe('bye');
            expect(MessageType.BROADCAST).toBe('bc');
        });
    });

    describe('HandshakePhase', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(HandshakePhase)).toBe(true);
        });

        it('should have all phases', () => {
            expect(HandshakePhase.INIT).toBe('init');
            expect(HandshakePhase.INIT_SENT).toBe('init_sent');
            expect(HandshakePhase.ACK).toBe('ack');
            expect(HandshakePhase.ACK_SENT).toBe('ack_sent');
            expect(HandshakePhase.DONE).toBe('done');
        });
    });

    describe('PeerStatus', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(PeerStatus)).toBe(true);
        });

        it('should have all statuses', () => {
            expect(PeerStatus.CONNECTING).toBe('connecting');
            expect(PeerStatus.CONNECTED).toBe('connected');
            expect(PeerStatus.DISCONNECTED).toBe('disconnected');
            expect(PeerStatus.RECONNECTING).toBe('reconnecting');
            expect(PeerStatus.FAILED).toBe('failed');
        });
    });

    describe('PeerType', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(PeerType)).toBe(true);
        });

        it('should have all types', () => {
            expect(PeerType.IFRAME).toBe('iframe');
            expect(PeerType.WORKER).toBe('worker');
            expect(PeerType.SERVICE_WORKER).toBe('sw');
            expect(PeerType.WINDOW).toBe('window');
            expect(PeerType.PORT).toBe('port');
        });
    });

    describe('DeliveryStatus', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(DeliveryStatus)).toBe(true);
        });

        it('should have all statuses', () => {
            expect(DeliveryStatus.LOCAL).toBe('local');
            expect(DeliveryStatus.SENT).toBe('sent');
            expect(DeliveryStatus.ACKED).toBe('acked');
            expect(DeliveryStatus.QUEUED).toBe('queued');
            expect(DeliveryStatus.TIMEOUT).toBe('timeout');
            expect(DeliveryStatus.FAILED).toBe('failed');
        });
    });

    describe('Defaults', () => {
        it('should be frozen', () => {
            expect(Object.isFrozen(Defaults)).toBe(true);
        });

        it('should have reasonable default values', () => {
            expect(Defaults.ACK_TIMEOUT).toBe(5000);
            expect(Defaults.REQUEST_TIMEOUT).toBe(30000);
            expect(Defaults.HANDSHAKE_TIMEOUT).toBe(10000);
            expect(Defaults.HEARTBEAT_INTERVAL).toBe(15000);
            expect(Defaults.MAX_PEERS).toBe(100);
            expect(Defaults.MAX_MESSAGE_SIZE).toBe(1048576);
        });
    });
});

describe('isTransferable()', () => {
    it('should return true for ArrayBuffer', () => {
        const buffer = new ArrayBuffer(16);
        expect(isTransferable(buffer)).toBe(true);
    });

    it('should return true for MessagePort', () => {
        const channel = new MessageChannel();
        expect(isTransferable(channel.port1)).toBe(true);
        expect(isTransferable(channel.port2)).toBe(true);
    });

    it('should return false for primitives', () => {
        expect(isTransferable('string')).toBe(false);
        expect(isTransferable(123)).toBe(false);
        expect(isTransferable(true)).toBe(false);
        expect(isTransferable(null)).toBe(false);
        expect(isTransferable(undefined)).toBe(false);
    });

    it('should return false for plain objects', () => {
        expect(isTransferable({})).toBe(false);
        expect(isTransferable({ a: 1 })).toBe(false);
    });

    it('should return false for arrays', () => {
        expect(isTransferable([])).toBe(false);
        expect(isTransferable([1, 2, 3])).toBe(false);
    });

    it('should return false for TypedArrays (not transferable, buffer is)', () => {
        const arr = new Uint8Array(10);
        expect(isTransferable(arr)).toBe(false);
    });

    it('should return true for ReadableStream if supported', () => {
        if (typeof ReadableStream !== 'undefined') {
            const stream = new ReadableStream();
            expect(isTransferable(stream)).toBe(true);
        }
    });

    it('should return true for WritableStream if supported', () => {
        if (typeof WritableStream !== 'undefined') {
            const stream = new WritableStream();
            expect(isTransferable(stream)).toBe(true);
        }
    });

    it('should return true for TransformStream if supported', () => {
        if (typeof TransformStream !== 'undefined') {
            const stream = new TransformStream();
            expect(isTransferable(stream)).toBe(true);
        }
    });
});

describe('findTransferables()', () => {
    it('should return empty array for null', () => {
        expect(findTransferables(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
        expect(findTransferables(undefined)).toEqual([]);
    });

    it('should return empty array for primitives', () => {
        expect(findTransferables('string')).toEqual([]);
        expect(findTransferables(123)).toEqual([]);
        expect(findTransferables(true)).toEqual([]);
    });

    it('should find ArrayBuffer directly', () => {
        const buffer = new ArrayBuffer(16);
        const result = findTransferables(buffer);
        expect(result).toContain(buffer);
    });

    it('should find MessagePort directly', () => {
        const channel = new MessageChannel();
        const result = findTransferables(channel.port1);
        expect(result).toContain(channel.port1);
    });

    it('should find ArrayBuffer in object', () => {
        const buffer = new ArrayBuffer(16);
        const obj = { data: buffer, name: 'test' };
        const result = findTransferables(obj);
        expect(result).toContain(buffer);
    });

    it('should find ArrayBuffer in array', () => {
        const buffer = new ArrayBuffer(16);
        const arr = [1, 'string', buffer, null];
        const result = findTransferables(arr);
        expect(result).toContain(buffer);
    });

    it('should find multiple transferables', () => {
        const buffer1 = new ArrayBuffer(8);
        const buffer2 = new ArrayBuffer(16);
        const channel = new MessageChannel();
        const obj = {
            data: buffer1,
            extra: { nested: buffer2 },
            port: channel.port1
        };
        const result = findTransferables(obj);
        expect(result.length).toBe(3);
    });

    it('should find transferables in nested arrays', () => {
        const buffer = new ArrayBuffer(8);
        const nested = [[[[buffer]]]];
        const result = findTransferables(nested);
        expect(result).toContain(buffer);
    });

    it('should not duplicate same transferable', () => {
        const buffer = new ArrayBuffer(8);
        const obj = { a: buffer, b: buffer, c: buffer };
        const result = findTransferables(obj);
        expect(result.length).toBe(1);
    });
});

describe('TransferableTypes', () => {
    it('should be an array', () => {
        expect(Array.isArray(TransferableTypes)).toBe(true);
    });

    it('should include ArrayBuffer', () => {
        expect(TransferableTypes).toContain(ArrayBuffer);
    });

    it('should include MessagePort', () => {
        expect(TransferableTypes).toContain(MessagePort);
    });
});

describe('isProtocolMessage() extended', () => {
    it('should accept messages with type field', () => {
        const msg = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            id: 'test-id',
            type: 'sig'
        };
        expect(isProtocolMessage(msg)).toBe(true);
    });

    it('should accept messages with t field', () => {
        const msg = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            id: 'test-id',
            t: 'req'
        };
        expect(isProtocolMessage(msg)).toBe(true);
    });

    it('should reject messages with wrong version', () => {
        const msg = {
            [PROTOCOL_MARKER]: 999,
            id: 'test-id',
            t: 'sig'
        };
        expect(isProtocolMessage(msg)).toBe(false);
    });

    it('should reject messages without id', () => {
        const msg = {
            [PROTOCOL_MARKER]: PROTOCOL_VERSION,
            t: 'sig'
        };
        expect(isProtocolMessage(msg)).toBe(false);
    });

    it('should reject non-object values', () => {
        expect(isProtocolMessage(null)).toBe(false);
        expect(isProtocolMessage(undefined)).toBe(false);
        expect(isProtocolMessage('string')).toBe(false);
        expect(isProtocolMessage(123)).toBe(false);
    });
});
