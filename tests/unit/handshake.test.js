/**
 * @fileoverview Tests for handshake protocol.
 */

import { describe, it, expect, mock } from 'bun:test';
import { Handshake } from '../../src/security/handshake.js';
import { MessageType } from '../../src/common/types.js';

describe('Handshake', () => {
    describe('constructor', () => {
        it('should generate peerId if not provided', () => {
            const handshake = new Handshake();
            expect(handshake.peerId).toBeDefined();
            expect(typeof handshake.peerId).toBe('string');
        });

        it('should use provided peerId', () => {
            const handshake = new Handshake({ peerId: 'my-peer' });
            expect(handshake.peerId).toBe('my-peer');
        });

        it('should use default timeout', () => {
            const handshake = new Handshake();
            // Just verify construction works
            expect(handshake.peerId).toBeDefined();
        });

        it('should accept custom timeout', () => {
            const handshake = new Handshake({ timeout: 5000 });
            expect(handshake.peerId).toBeDefined();
        });

        it('should accept meta and capabilities', () => {
            const handshake = new Handshake({
                meta: { version: '1.0' },
                capabilities: ['ack', 'request']
            });
            const msg = handshake.createInitMessage();
            expect(msg.meta.version).toBe('1.0');
            expect(msg.capabilities).toContain('ack');
        });
    });

    describe('createInitMessage()', () => {
        it('should create valid init message', () => {
            const handshake = new Handshake({
                peerId: 'initiator',
                meta: { version: '1.0' },
                capabilities: ['ack', 'request']
            });

            const msg = handshake.createInitMessage();

            expect(msg.type).toBe(MessageType.HANDSHAKE_INIT);
            expect(msg.handshakeId).toBeDefined();
            expect(msg.peerId).toBe('initiator');
            expect(msg.meta.version).toBe('1.0');
            expect(msg.capabilities).toContain('ack');
            expect(msg.timestamp).toBeDefined();
        });

        it('should generate unique handshake IDs', () => {
            const handshake = new Handshake();
            const ids = new Set();
            for (let i = 0; i < 10; i++) {
                ids.add(handshake.createInitMessage().handshakeId);
            }
            expect(ids.size).toBe(10);
        });
    });

    describe('createAckMessage()', () => {
        it('should create accept ack message', () => {
            const handshake = new Handshake({ peerId: 'responder' });
            const initMsg = { handshakeId: 'abc123' };

            const ack = handshake.createAckMessage(initMsg, true);

            expect(ack.type).toBe(MessageType.HANDSHAKE_ACK);
            expect(ack.handshakeId).toBe('abc123');
            expect(ack.peerId).toBe('responder');
            expect(ack.accept).toBe(true);
            expect(ack.reason).toBeUndefined();
        });

        it('should create reject ack message with reason', () => {
            const handshake = new Handshake({ peerId: 'responder' });
            const initMsg = { handshakeId: 'xyz789' };

            const ack = handshake.createAckMessage(initMsg, false, 'Origin not allowed');

            expect(ack.accept).toBe(false);
            expect(ack.reason).toBe('Origin not allowed');
        });

        it('should include meta and capabilities', () => {
            const handshake = new Handshake({
                peerId: 'responder',
                meta: { name: 'TestPeer' },
                capabilities: ['streaming']
            });
            const initMsg = { handshakeId: 'test-hs' };

            const ack = handshake.createAckMessage(initMsg, true);

            expect(ack.meta.name).toBe('TestPeer');
            expect(ack.capabilities).toContain('streaming');
            expect(ack.timestamp).toBeDefined();
        });
    });

    describe('createCompleteMessage()', () => {
        it('should create complete message', () => {
            const handshake = new Handshake();
            const msg = handshake.createCompleteMessage('hs-123');

            expect(msg.type).toBe(MessageType.HANDSHAKE_COMPLETE);
            expect(msg.handshakeId).toBe('hs-123');
            expect(msg.confirmed).toBe(true);
        });

        it('should include timestamp', () => {
            const handshake = new Handshake();
            const msg = handshake.createCompleteMessage('hs-456');
            expect(msg.timestamp).toBeDefined();
            expect(typeof msg.timestamp).toBe('number');
        });
    });

    describe('handleMessage()', () => {
        it('should respond to init with ack', () => {
            const responder = new Handshake({ peerId: 'peer-b' });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            const initMsg = {
                type: MessageType.HANDSHAKE_INIT,
                handshakeId: 'test-123',
                peerId: 'peer-a',
                meta: {},
                capabilities: []
            };

            responder.handleMessage(initMsg, 'https://peer-a.com', sendFn);

            expect(inbox.length).toBe(1);
            expect(inbox[0].type).toBe(MessageType.HANDSHAKE_ACK);
            expect(inbox[0].accept).toBe(true);
        });

        it('should reject init when validator fails', () => {
            const responder = new Handshake({ peerId: 'peer-b' });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            const initMsg = {
                type: MessageType.HANDSHAKE_INIT,
                handshakeId: 'test-456',
                peerId: 'peer-a',
                meta: {},
                capabilities: []
            };

            const rejectAll = () => false;
            responder.handleMessage(initMsg, 'https://evil.com', sendFn, rejectAll);

            expect(inbox[0].accept).toBe(false);
            expect(inbox[0].reason).toBe('Validation failed');
        });

        it('should return null for unknown message types', () => {
            const handshake = new Handshake();
            const result = handshake.handleMessage(
                { type: 'unknown' },
                'https://origin.com',
                () => { }
            );
            expect(result).toBeNull();
        });

        it('should handle ACK message for pending handshake', async () => {
            const initiator = new Handshake({ peerId: 'initiator', timeout: 1000 });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            // Start handshake
            const resultPromise = initiator.initiate(sendFn);
            const handshakeId = inbox[0].handshakeId;

            // Simulate receiving ACK
            const ackMsg = {
                type: MessageType.HANDSHAKE_ACK,
                handshakeId,
                peerId: 'responder',
                meta: { test: true },
                capabilities: ['streaming'],
                accept: true
            };

            const peerInfo = initiator.handleMessage(ackMsg, 'https://responder.com', sendFn);

            // Should have sent complete message
            expect(inbox.length).toBe(2);
            expect(inbox[1].type).toBe(MessageType.HANDSHAKE_COMPLETE);

            // Should return peer info
            expect(peerInfo).not.toBeNull();
            expect(peerInfo.peerId).toBe('responder');

            // Promise should resolve
            const result = await resultPromise;
            expect(result.success).toBe(true);
            expect(result.peer.peerId).toBe('responder');
        });

        it('should handle rejected ACK', async () => {
            const initiator = new Handshake({ peerId: 'initiator', timeout: 1000 });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            // Start handshake
            const resultPromise = initiator.initiate(sendFn);
            const handshakeId = inbox[0].handshakeId;

            // Simulate receiving rejection ACK
            const ackMsg = {
                type: MessageType.HANDSHAKE_ACK,
                handshakeId,
                peerId: 'responder',
                accept: false,
                reason: 'Not authorized'
            };

            initiator.handleMessage(ackMsg, 'https://responder.com', sendFn);

            // Promise should resolve with failure
            const result = await resultPromise;
            expect(result.success).toBe(false);
        });

        it('should handle COMPLETE message for pending ack', () => {
            const responder = new Handshake({ peerId: 'responder' });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            // First, receive init
            const initMsg = {
                type: MessageType.HANDSHAKE_INIT,
                handshakeId: 'complete-test',
                peerId: 'initiator',
                meta: { name: 'Initiator' },
                capabilities: []
            };
            responder.handleMessage(initMsg, 'https://initiator.com', sendFn);

            // Now receive complete
            const completeMsg = {
                type: MessageType.HANDSHAKE_COMPLETE,
                handshakeId: 'complete-test',
                confirmed: true
            };
            const peerInfo = responder.handleMessage(completeMsg, 'https://initiator.com', sendFn);

            // Should return peer info
            expect(peerInfo).not.toBeNull();
            expect(peerInfo.peerId).toBe('initiator');
            expect(peerInfo.connectedAt).toBeDefined();
        });

        it('should ignore COMPLETE with confirmed=false', () => {
            const responder = new Handshake({ peerId: 'responder' });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            // Receive init
            const initMsg = {
                type: MessageType.HANDSHAKE_INIT,
                handshakeId: 'cancel-test',
                peerId: 'initiator',
                meta: {},
                capabilities: []
            };
            responder.handleMessage(initMsg, 'https://initiator.com', sendFn);

            // Receive unconfirmed complete
            const completeMsg = {
                type: MessageType.HANDSHAKE_COMPLETE,
                handshakeId: 'cancel-test',
                confirmed: false
            };
            const result = responder.handleMessage(completeMsg, 'https://initiator.com', sendFn);

            expect(result).toBeNull();
        });

        it('should return null for unknown handshake ID in ACK', () => {
            const handshake = new Handshake();
            const result = handshake.handleMessage(
                { type: MessageType.HANDSHAKE_ACK, handshakeId: 'unknown', accept: true },
                'https://peer.com',
                () => { }
            );
            expect(result).toBeNull();
        });
    });

    describe('initiate()', () => {
        it('should send init message', () => {
            const initiator = new Handshake({ peerId: 'peer-a' });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            initiator.initiate(sendFn);

            expect(inbox.length).toBe(1);
            expect(inbox[0].type).toBe(MessageType.HANDSHAKE_INIT);
            expect(inbox[0].peerId).toBe('peer-a');
        });

        it('should register pending handshake', () => {
            const handshake = new Handshake();
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            handshake.initiate(sendFn);

            const sentId = inbox[0].handshakeId;
            expect(handshake.hasPending(sentId)).toBe(true);
        });

        it('should timeout if no response', async () => {
            const handshake = new Handshake({ timeout: 50 });
            const sendFn = mock();

            const result = await handshake.initiate(sendFn);

            expect(result.success).toBe(false);
            // Reason or error should indicate failure
            expect(result.reason || result.error).toBeDefined();
        });
    });

    describe('hasPending()', () => {
        it('should return false for unknown ID', () => {
            const handshake = new Handshake();
            expect(handshake.hasPending('nonexistent')).toBe(false);
        });
    });

    describe('cancel()', () => {
        it('should cancel pending handshake', async () => {
            const handshake = new Handshake({ timeout: 1000 });
            const inbox = [];
            const sendFn = (msg) => inbox.push(msg);

            const promise = handshake.initiate(sendFn);
            const sentId = inbox[0].handshakeId;

            handshake.cancel(sentId);
            expect(handshake.hasPending(sentId)).toBe(false);

            const result = await promise;
            expect(result.success).toBe(false);
        });

        it('should do nothing for unknown ID', () => {
            const handshake = new Handshake();
            expect(() => handshake.cancel('unknown')).not.toThrow();
        });
    });

    describe('cancelAll()', () => {
        it('should cancel all pending handshakes', async () => {
            const handshake = new Handshake({ timeout: 1000 });
            const sendFn = mock();

            const p1 = handshake.initiate(sendFn);
            const p2 = handshake.initiate(sendFn);

            handshake.cancelAll();

            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1.success).toBe(false);
            expect(r2.success).toBe(false);
        });
    });
});

