/**
 * @fileoverview Tests for MessageRouter.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { MessageRouter } from '../../src/router/message-router.js';
import { PeerStatus } from '../../src/common/types.js';

describe('MessageRouter', () => {
    let router;

    beforeEach(() => {
        router = new MessageRouter();
    });

    afterEach(() => {
        router.clearPeers();
        router.clear();
    });

    describe('addPeer()', () => {
        it('should add peer to routing table', () => {
            const sendFn = mock();
            router.addPeer('peer-1', sendFn);

            expect(router.peerCount).toBe(1);
            expect(router.getPeerIds()).toContain('peer-1');
        });

        it('should throw for duplicate peer', () => {
            router.addPeer('peer-1', mock());
            expect(() => router.addPeer('peer-1', mock())).toThrow();
        });

        it('should throw for non-function sendFn', () => {
            expect(() => router.addPeer('peer-1', 'not a function')).toThrow(TypeError);
        });

        it('should store peer metadata', () => {
            router.addPeer('peer-1', mock(), {
                meta: { type: 'widget', version: '1.0' }
            });

            const peer = router.getPeer('peer-1');
            expect(peer.meta.type).toBe('widget');
            expect(peer.meta.version).toBe('1.0');
        });

        it('should emit peer:added event', async () => {
            const handler = mock();
            router.on('peer:added', handler);

            router.addPeer('peer-1', mock(), { meta: { role: 'client' } });

            await new Promise(r => setTimeout(r, 10));
            expect(handler).toHaveBeenCalled();
        });
    });

    describe('removePeer()', () => {
        it('should remove peer from routing table', () => {
            router.addPeer('peer-1', mock());
            expect(router.peerCount).toBe(1);

            const removed = router.removePeer('peer-1');
            expect(removed).toBe(true);
            expect(router.peerCount).toBe(0);
        });

        it('should return false for non-existent peer', () => {
            expect(router.removePeer('unknown')).toBe(false);
        });

        it('should emit peer:removed event', async () => {
            const handler = mock();
            router.on('peer:removed', handler);
            router.addPeer('peer-1', mock());

            router.removePeer('peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(handler).toHaveBeenCalled();
        });
    });

    describe('route() - unicast', () => {
        it('should send message to specific peer', () => {
            const sendFn = mock();
            router.addPeer('peer-1', sendFn);

            const result = router.route({
                target: 'peer-1',
                payload: { action: 'test' }
            });

            expect(result.success).toBe(true);
            expect(result.delivered).toBe(1);
            expect(sendFn).toHaveBeenCalled();
        });

        it('should fail for non-existent peer', () => {
            const result = router.route({
                target: 'unknown',
                payload: {}
            });

            expect(result.success).toBe(false);
            expect(result.failed).toContain('unknown');
        });

        it('should include sequence number in envelope', () => {
            const sendFn = mock();
            router.addPeer('peer-1', sendFn);

            router.route({ target: 'peer-1', payload: {} });
            router.route({ target: 'peer-1', payload: {} });

            const calls = sendFn.mock.calls;
            expect(calls[0][0].seq).toBe(1);
            expect(calls[1][0].seq).toBe(2);
        });
    });

    describe('broadcast()', () => {
        it('should send to all peers', () => {
            const send1 = mock();
            const send2 = mock();
            const send3 = mock();

            router.addPeer('peer-1', send1);
            router.addPeer('peer-2', send2);
            router.addPeer('peer-3', send3);

            const result = router.broadcast({ event: 'update' });

            expect(result.success).toBe(true);
            expect(result.delivered).toBe(3);
            expect(send1).toHaveBeenCalled();
            expect(send2).toHaveBeenCalled();
            expect(send3).toHaveBeenCalled();
        });

        it('should exclude specified peers', () => {
            const send1 = mock();
            const send2 = mock();

            router.addPeer('peer-1', send1);
            router.addPeer('peer-2', send2);

            router.broadcast({}, { exclude: ['peer-1'] });

            expect(send1).not.toHaveBeenCalled();
            expect(send2).toHaveBeenCalled();
        });

        it('should only include specified peers', () => {
            const send1 = mock();
            const send2 = mock();
            const send3 = mock();

            router.addPeer('peer-1', send1);
            router.addPeer('peer-2', send2);
            router.addPeer('peer-3', send3);

            router.broadcast({}, { include: ['peer-1', 'peer-3'] });

            expect(send1).toHaveBeenCalled();
            expect(send2).not.toHaveBeenCalled();
            expect(send3).toHaveBeenCalled();
        });
    });

    describe('getSequence()', () => {
        it('should return 0 for new peer', () => {
            router.addPeer('peer-1', mock());
            expect(router.getSequence('peer-1')).toBe(0);
        });

        it('should increment after each message', () => {
            router.addPeer('peer-1', mock());

            router.route({ target: 'peer-1', payload: {} });
            expect(router.getSequence('peer-1')).toBe(1);

            router.route({ target: 'peer-1', payload: {} });
            expect(router.getSequence('peer-1')).toBe(2);
        });

        it('should track per-peer sequences independently', () => {
            router.addPeer('peer-1', mock());
            router.addPeer('peer-2', mock());

            router.route({ target: 'peer-1', payload: {} });
            router.route({ target: 'peer-1', payload: {} });
            router.route({ target: 'peer-2', payload: {} });

            expect(router.getSequence('peer-1')).toBe(2);
            expect(router.getSequence('peer-2')).toBe(1);
        });
    });

    describe('setPeerStatus()', () => {
        it('should update peer status', () => {
            router.addPeer('peer-1', mock());
            router.setPeerStatus('peer-1', PeerStatus.DISCONNECTED);

            const peer = router.getPeer('peer-1');
            expect(peer.status).toBe(PeerStatus.DISCONNECTED);
        });

        it('should not send to disconnected peers', () => {
            const sendFn = mock();
            router.addPeer('peer-1', sendFn);
            router.setPeerStatus('peer-1', PeerStatus.DISCONNECTED);

            const result = router.route({ target: 'peer-1', payload: {} });

            expect(result.success).toBe(false);
            expect(sendFn).not.toHaveBeenCalled();
        });

        it('should emit peer:status event', async () => {
            const handler = mock();
            router.on('peer:status', handler);
            router.addPeer('peer-1', mock());

            router.setPeerStatus('peer-1', PeerStatus.RECONNECTING);

            await new Promise(r => setTimeout(r, 10));
            expect(handler).toHaveBeenCalled();
        });
    });

    describe('clearPeers()', () => {
        it('should remove all peers', () => {
            router.addPeer('peer-1', mock());
            router.addPeer('peer-2', mock());
            router.addPeer('peer-3', mock());

            router.clearPeers();

            expect(router.peerCount).toBe(0);
        });
    });
});
