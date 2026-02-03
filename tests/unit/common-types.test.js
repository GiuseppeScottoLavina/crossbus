/**
 * @fileoverview Unit tests for common/types.js - Protocol message utilities.
 */

import { describe, it, expect } from 'bun:test';
import {
    isProtocolMessage,
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    MessageType
} from '../../src/common/types.js';

describe('isProtocolMessage', () => {
    describe('valid protocol messages', () => {
        it('should accept messages with compact type field (t)', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id-123',
                t: MessageType.REQUEST
            };
            expect(isProtocolMessage(msg)).toBe(true);
        });

        it('should accept messages with full type field (type)', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id-456',
                type: MessageType.SIGNAL
            };
            expect(isProtocolMessage(msg)).toBe(true);
        });

        it('should accept messages with both type and t fields', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id-789',
                type: 'req',
                t: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(true);
        });

        it('should accept all MessageType values', () => {
            Object.values(MessageType).forEach(typeValue => {
                const msgWithT = {
                    [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                    id: `test-${typeValue}`,
                    t: typeValue
                };
                expect(isProtocolMessage(msgWithT)).toBe(true);

                const msgWithType = {
                    [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                    id: `test-${typeValue}`,
                    type: typeValue
                };
                expect(isProtocolMessage(msgWithType)).toBe(true);
            });
        });
    });

    describe('invalid protocol messages', () => {
        it('should reject null', () => {
            expect(isProtocolMessage(null)).toBe(false);
        });

        it('should reject undefined', () => {
            expect(isProtocolMessage(undefined)).toBe(false);
        });

        it('should reject primitives', () => {
            expect(isProtocolMessage('string')).toBe(false);
            expect(isProtocolMessage(123)).toBe(false);
            expect(isProtocolMessage(true)).toBe(false);
        });

        it('should reject messages without protocol marker', () => {
            const msg = {
                id: 'test-id',
                type: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages with wrong protocol version', () => {
            const msg = {
                [PROTOCOL_MARKER]: 99,
                id: 'test-id',
                type: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages with boolean protocol marker (old format)', () => {
            const msg = {
                [PROTOCOL_MARKER]: true, // Old format used boolean
                id: 'test-id',
                type: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages without id', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                type: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages with non-string id', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 123,
                type: 'req'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages without type OR t field', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id'
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject messages with non-string type', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id',
                type: 123
            };
            expect(isProtocolMessage(msg)).toBe(false);
        });

        it('should reject empty objects', () => {
            expect(isProtocolMessage({})).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle extra fields gracefully', () => {
            const msg = {
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'test-id',
                type: 'req',
                payload: { data: 'test' },
                meta: { timestamp: Date.now() },
                extra: 'ignored'
            };
            expect(isProtocolMessage(msg)).toBe(true);
        });

        it('should handle frozen objects', () => {
            const msg = Object.freeze({
                [PROTOCOL_MARKER]: PROTOCOL_VERSION,
                id: 'frozen-id',
                t: 'sig'
            });
            expect(isProtocolMessage(msg)).toBe(true);
        });
    });
});

describe('MessageType constants', () => {
    it('should have compact wire codes', () => {
        expect(MessageType.SIGNAL).toBe('sig');
        expect(MessageType.REQUEST).toBe('req');
        expect(MessageType.RESPONSE).toBe('res');
        expect(MessageType.ACK).toBe('ack');
        expect(MessageType.PING).toBe('png');
        expect(MessageType.PONG).toBe('pog');
        expect(MessageType.BYE).toBe('bye');
        expect(MessageType.BROADCAST).toBe('bc');
    });

    it('should be frozen', () => {
        expect(Object.isFrozen(MessageType)).toBe(true);
    });
});

describe('Protocol constants', () => {
    it('should have correct protocol marker', () => {
        expect(PROTOCOL_MARKER).toBe('_cb');
    });

    it('should have correct protocol version', () => {
        expect(PROTOCOL_VERSION).toBe(1);
    });
});
