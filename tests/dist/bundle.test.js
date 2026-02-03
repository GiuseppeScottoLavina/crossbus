/**
 * @fileoverview Tests for the dist bundle to verify exports work correctly.
 * These tests verify the published package is usable.
 */

import { describe, it, expect } from 'bun:test';

// Test main bundle exports
import {
    CrossBus,
    EventEmitter,
    MessageType,
    HandshakePhase,
    PeerStatus,
    PeerType,
    DeliveryStatus,
    PROTOCOL_MARKER,
    PROTOCOL_VERSION,
    CrossBusError,
    ErrorCode,
    isCrossBusError,
    isRetryable,
    uuid,
    deferred,
    sleep,
    withTimeout,
    isCloneable,
    detectPeerType,
    PostMessageTransport,
    BroadcastChannelTransport,
    MessageChannelTransport,
    OriginValidator,
    OriginValidatorPresets,
    Handshake,
    MessageRouter,
    PendingRequests
} from '../../dist/crossbus.js';

describe('Dist Bundle Exports', () => {
    describe('Core exports', () => {
        it('should export CrossBus class', () => {
            expect(CrossBus).toBeDefined();
            expect(typeof CrossBus).toBe('function');
        });

        it('should export EventEmitter class', () => {
            expect(EventEmitter).toBeDefined();
            expect(typeof EventEmitter).toBe('function');
        });

        it('should create CrossBus instance', () => {
            const bus = new CrossBus({ peerId: 'test-hub', isHub: true });
            expect(bus.peerId).toBe('test-hub');
            expect(bus.isHub).toBe(true);
            bus.destroy();
        });
    });

    describe('Type constants', () => {
        it('should export MessageType enum', () => {
            expect(MessageType.SIGNAL).toBe('sig');
            expect(MessageType.REQUEST).toBe('req');
            expect(MessageType.RESPONSE).toBe('res');
        });

        it('should export HandshakePhase enum', () => {
            expect(HandshakePhase.INIT).toBe('init');
            expect(HandshakePhase.ACK).toBe('ack');
        });

        it('should export PeerStatus enum', () => {
            expect(PeerStatus.CONNECTED).toBe('connected');
            expect(PeerStatus.DISCONNECTED).toBe('disconnected');
        });

        it('should export protocol constants', () => {
            expect(PROTOCOL_MARKER).toBeDefined();
            expect(PROTOCOL_VERSION).toBeDefined();
        });
    });

    describe('Error exports', () => {
        it('should export CrossBusError class', () => {
            expect(CrossBusError).toBeDefined();
            const error = new CrossBusError('TIMEOUT', 'Test error');
            expect(error.code).toBe('TIMEOUT');
        });

        it('should export ErrorCode constants', () => {
            expect(ErrorCode.PEER_NOT_FOUND).toBe('ERR_PEER_NOT_FOUND');
            expect(ErrorCode.RESPONSE_TIMEOUT).toBeDefined();
        });

        it('should export error helpers', () => {
            expect(typeof isCrossBusError).toBe('function');
            expect(typeof isRetryable).toBe('function');
        });
    });

    describe('Utility exports', () => {
        it('should export uuid function', () => {
            const id = uuid();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(8);
        });

        it('should export deferred function', () => {
            const { promise, resolve } = deferred();
            expect(promise).toBeInstanceOf(Promise);
            resolve('done');
        });

        it('should export sleep function', async () => {
            const start = Date.now();
            await sleep(10);
            expect(Date.now() - start).toBeGreaterThanOrEqual(10);
        });

        it('should export withTimeout function', async () => {
            const result = await withTimeout(Promise.resolve('ok'), 1000);
            expect(result).toBe('ok');
        });

        it('should export isCloneable function', () => {
            expect(isCloneable({ a: 1 })).toBe(true);
            expect(isCloneable(() => { })).toBe(false);
        });
    });

    describe('Transport exports', () => {
        it('should export PostMessageTransport class', () => {
            expect(PostMessageTransport).toBeDefined();
            expect(PostMessageTransport.isSupported()).toBe(true);
        });

        it('should export BroadcastChannelTransport class', () => {
            expect(BroadcastChannelTransport).toBeDefined();
            expect(BroadcastChannelTransport.isSupported()).toBe(true);
        });

        it('should export MessageChannelTransport class', () => {
            expect(MessageChannelTransport).toBeDefined();
            expect(MessageChannelTransport.isSupported()).toBe(true);
        });
    });

    describe('Security exports', () => {
        it('should export OriginValidator class', () => {
            expect(OriginValidator).toBeDefined();
            const validator = new OriginValidator({ allowed: ['https://example.com'] });
            expect(validator.isAllowed('https://example.com')).toBe(true);
        });

        it('should export OriginValidatorPresets', () => {
            expect(OriginValidatorPresets.sameOrigin).toBeDefined();
            expect(OriginValidatorPresets.allowAll).toBeDefined();
            expect(OriginValidatorPresets.fromList).toBeDefined();
        });

        it('should export Handshake class', () => {
            expect(Handshake).toBeDefined();
        });
    });

    describe('Router exports', () => {
        it('should export MessageRouter class', () => {
            expect(MessageRouter).toBeDefined();
            const router = new MessageRouter();
            expect(router.peerCount).toBe(0);
        });

        it('should export PendingRequests class', () => {
            expect(PendingRequests).toBeDefined();
            const pending = new PendingRequests();
            expect(pending.size).toBe(0);
        });
    });
});

describe('Dist Bundle Functionality', () => {
    it('should handle signal/request flow', () => {
        const hub = new CrossBus({ peerId: 'hub', isHub: true });

        // Register handler
        hub.handle('echo', (payload) => ({ echoed: payload }));

        // Should have handler
        expect(hub.signal('test', {})).toBeDefined();

        hub.destroy();
    });

    it('should work with EventEmitter pattern', async () => {
        const emitter = new EventEmitter();
        let received = false;

        // EventEmitter API - emit is async
        emitter.on('test', () => { received = true; });
        await emitter.emit('test');

        expect(received).toBe(true);
    });

    it('should work with MessageRouter', () => {
        const router = new MessageRouter();

        router.addPeer('peer-1', () => { });
        expect(router.peerCount).toBe(1);

        router.removePeer('peer-1');
        expect(router.peerCount).toBe(0);
    });
});
