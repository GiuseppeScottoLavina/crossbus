/**
 * @fileoverview Tests for common/errors module.
 * Following TDD: tests written FIRST.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
    CrossBusError,
    ErrorCode,
    isCrossBusError,
    isRetryable
} from '../../src/common/errors.js';

describe('CrossBusError', () => {
    describe('ErrorCode enum', () => {
        it('should have all connection error codes', () => {
            expect(ErrorCode.HANDSHAKE_TIMEOUT).toBe('ERR_HANDSHAKE_TIMEOUT');
            expect(ErrorCode.HANDSHAKE_REJECTED).toBe('ERR_HANDSHAKE_REJECTED');
            expect(ErrorCode.ORIGIN_FORBIDDEN).toBe('ERR_ORIGIN_FORBIDDEN');
            expect(ErrorCode.PEER_EXISTS).toBe('ERR_PEER_EXISTS');
            expect(ErrorCode.PEER_NOT_FOUND).toBe('ERR_PEER_NOT_FOUND');
            expect(ErrorCode.PEER_DISCONNECTED).toBe('ERR_PEER_DISCONNECTED');
        });

        it('should have all message error codes', () => {
            expect(ErrorCode.ACK_TIMEOUT).toBe('ERR_ACK_TIMEOUT');
            expect(ErrorCode.RESPONSE_TIMEOUT).toBe('ERR_RESPONSE_TIMEOUT');
            expect(ErrorCode.CLONE_ERROR).toBe('ERR_CLONE_ERROR');
            expect(ErrorCode.TRANSFER_ERROR).toBe('ERR_TRANSFER_ERROR');
        });

        it('should have all handler error codes', () => {
            expect(ErrorCode.NO_HANDLER).toBe('ERR_NO_HANDLER');
            expect(ErrorCode.HANDLER_ERROR).toBe('ERR_HANDLER_ERROR');
        });

        it('should be frozen', () => {
            expect(Object.isFrozen(ErrorCode)).toBe(true);
        });
    });

    describe('constructor', () => {
        it('should create error with code and default message', () => {
            const error = new CrossBusError(ErrorCode.PEER_NOT_FOUND);

            expect(error.name).toBe('CrossBusError');
            expect(error.code).toBe('ERR_PEER_NOT_FOUND');
            expect(error.message).toBe('Peer not found');
            expect(error.retryable).toBe(false);
            expect(error.timestamp).toBeDefined();
            expect(error instanceof Error).toBe(true);
        });

        it('should use custom message when provided', () => {
            const error = new CrossBusError(
                ErrorCode.PEER_NOT_FOUND,
                'Custom: peer xyz not found'
            );

            expect(error.message).toBe('Custom: peer xyz not found');
        });

        it('should include details object', () => {
            const error = new CrossBusError(
                ErrorCode.PEER_NOT_FOUND,
                undefined,
                { details: { peerId: 'xyz', attempts: 3 } }
            );

            expect(error.details.peerId).toBe('xyz');
            expect(error.details.attempts).toBe(3);
        });

        it('should override retryable when specified', () => {
            const error = new CrossBusError(
                ErrorCode.PEER_NOT_FOUND,
                undefined,
                { retryable: true }
            );

            // Default for PEER_NOT_FOUND is false, but we override
            expect(error.retryable).toBe(true);
        });

        it('should store cause error', () => {
            const cause = new Error('Original error');
            const error = new CrossBusError(
                ErrorCode.HANDLER_ERROR,
                undefined,
                { cause }
            );

            expect(error.cause).toBe(cause);
        });
    });

    describe('static from()', () => {
        it('should create error from code', () => {
            const error = CrossBusError.from(ErrorCode.ACK_TIMEOUT, {
                peerId: 'target',
                timeout: 5000
            });

            expect(error.code).toBe('ERR_ACK_TIMEOUT');
            expect(error.details.peerId).toBe('target');
            expect(error.details.timeout).toBe(5000);
        });
    });

    describe('static wrap()', () => {
        it('should wrap another error', () => {
            const original = new Error('Connection refused');
            const wrapped = CrossBusError.wrap(
                ErrorCode.HANDSHAKE_TIMEOUT,
                original,
                { peerId: 'widget' }
            );

            expect(wrapped.code).toBe('ERR_HANDSHAKE_TIMEOUT');
            expect(wrapped.message).toBe('Connection refused');
            expect(wrapped.cause).toBe(original);
            expect(wrapped.details.peerId).toBe('widget');
        });
    });

    describe('toJSON()', () => {
        it('should return serializable object', () => {
            const error = new CrossBusError(
                ErrorCode.CLONE_ERROR,
                'Cannot clone DOM node',
                { details: { type: 'HTMLDivElement' } }
            );

            const json = error.toJSON();

            expect(json.name).toBe('CrossBusError');
            expect(json.code).toBe('ERR_CLONE_ERROR');
            expect(json.message).toBe('Cannot clone DOM node');
            expect(json.details.type).toBe('HTMLDivElement');
            expect(json.retryable).toBe(false);
            expect(json.timestamp).toBeDefined();
        });
    });

    describe('toString()', () => {
        it('should return formatted string', () => {
            const error = new CrossBusError(ErrorCode.TTL_EXCEEDED);

            expect(error.toString()).toBe(
                'CrossBusError [ERR_TTL_EXCEEDED]: Message TTL exceeded (possible routing loop)'
            );
        });
    });

    describe('retryable defaults', () => {
        it('should mark connection timeout errors as retryable', () => {
            expect(new CrossBusError(ErrorCode.HANDSHAKE_TIMEOUT).retryable).toBe(true);
            expect(new CrossBusError(ErrorCode.PEER_DISCONNECTED).retryable).toBe(true);
            expect(new CrossBusError(ErrorCode.ACK_TIMEOUT).retryable).toBe(true);
            expect(new CrossBusError(ErrorCode.RESPONSE_TIMEOUT).retryable).toBe(true);
        });

        it('should mark validation errors as non-retryable', () => {
            expect(new CrossBusError(ErrorCode.ORIGIN_FORBIDDEN).retryable).toBe(false);
            expect(new CrossBusError(ErrorCode.CLONE_ERROR).retryable).toBe(false);
            expect(new CrossBusError(ErrorCode.NO_HANDLER).retryable).toBe(false);
        });
    });
});

describe('Utility functions', () => {
    describe('isCrossBusError()', () => {
        it('should return true for CrossBusError', () => {
            const error = new CrossBusError(ErrorCode.PEER_NOT_FOUND);
            expect(isCrossBusError(error)).toBe(true);
        });

        it('should return false for regular Error', () => {
            const error = new Error('Regular error');
            expect(isCrossBusError(error)).toBe(false);
        });

        it('should return false for non-error values', () => {
            expect(isCrossBusError(null)).toBe(false);
            expect(isCrossBusError(undefined)).toBe(false);
            expect(isCrossBusError('string')).toBe(false);
            expect(isCrossBusError({})).toBe(false);
        });
    });

    describe('isRetryable()', () => {
        it('should return true for retryable CrossBusError', () => {
            const error = new CrossBusError(ErrorCode.ACK_TIMEOUT);
            expect(isRetryable(error)).toBe(true);
        });

        it('should return false for non-retryable CrossBusError', () => {
            const error = new CrossBusError(ErrorCode.ORIGIN_FORBIDDEN);
            expect(isRetryable(error)).toBe(false);
        });

        it('should return false for regular errors', () => {
            const error = new Error('Regular error');
            expect(isRetryable(error)).toBe(false);
        });
    });
});
