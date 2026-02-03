/**
 * @fileoverview Exhaustive tests for PresenceManager.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { PresenceManager } from '../../src/core/presence.js';

describe('PresenceManager', () => {
    let sendFn;
    let sentMessages;

    beforeEach(() => {
        sentMessages = [];
        sendFn = mock((msg) => {
            sentMessages.push(msg);
            return Promise.resolve();
        });
    });

    describe('constructor', () => {
        it('should require peerId', () => {
            expect(() => new PresenceManager(sendFn, {})).toThrow('peerId is required');
        });

        it('should create manager with peerId', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            expect(presence.peerId).toBe('my-peer');
            expect(presence.status).toBe('online');
            presence.destroy();
        });

        it('should auto-start by default', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                heartbeatInterval: 100
            });

            // Should have sent join message
            await new Promise(r => setTimeout(r, 50));
            const joinMsg = sentMessages.find(m => m.pt === 'join');
            expect(joinMsg).toBeDefined();

            presence.destroy();
        });

        it('should not auto-start when autoStart=false', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            await new Promise(r => setTimeout(r, 50));
            expect(sentMessages.length).toBe(0);

            presence.destroy();
        });
    });

    describe('start() / stop()', () => {
        it('should start sending heartbeats', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false,
                heartbeatInterval: 50
            });

            presence.start();

            // Wait for at least one heartbeat
            await new Promise(r => setTimeout(r, 100));

            const heartbeats = sentMessages.filter(m => m.pt === 'heartbeat');
            expect(heartbeats.length).toBeGreaterThan(0);

            presence.destroy();
        });

        it('should stop sending heartbeats and announce leave', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                heartbeatInterval: 50
            });

            await new Promise(r => setTimeout(r, 50));
            sentMessages.length = 0; // Clear

            presence.stop();

            // Should have sent leave
            const leaveMsg = sentMessages.find(m => m.pt === 'leave');
            expect(leaveMsg).toBeDefined();

            // Wait and confirm no more heartbeats
            await new Promise(r => setTimeout(r, 100));
            const afterStop = sentMessages.filter(m => m.pt === 'heartbeat');
            expect(afterStop.length).toBe(0);

            presence.destroy();
        });

        it('should be idempotent for start()', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.start();
            presence.start(); // Should not throw or start twice

            presence.destroy();
        });
    });

    describe('setStatus()', () => {
        it('should update status and send update', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.setStatus('away');

            expect(presence.status).toBe('away');

            const updateMsg = sentMessages.find(m => m.pt === 'update');
            expect(updateMsg).toBeDefined();
            expect(updateMsg.status).toBe('away');

            presence.destroy();
        });

        it('should update status with meta', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.setStatus('online', { name: 'John' });

            const updateMsg = sentMessages.find(m => m.pt === 'update');
            expect(updateMsg.meta.name).toBe('John');

            presence.destroy();
        });
    });

    describe('setMeta()', () => {
        it('should update meta and send update', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.setMeta({ avatar: 'url', role: 'admin' });

            const updateMsg = sentMessages.find(m => m.pt === 'update');
            expect(updateMsg.meta.avatar).toBe('url');
            expect(updateMsg.meta.role).toBe('admin');

            presence.destroy();
        });

        it('should merge meta', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.setMeta({ a: 1 });
            presence.setMeta({ b: 2 });

            const updates = sentMessages.filter(m => m.pt === 'update');
            expect(updates[1].meta.a).toBe(1);
            expect(updates[1].meta.b).toBe(2);

            presence.destroy();
        });
    });

    describe('handleMessage() - join', () => {
        it('should add peer on join and emit event', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            const joinEvents = [];
            presence.on('join', (data) => joinEvents.push(data));

            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                peerId: 'peer-2',
                status: 'online',
                meta: { name: 'Bob' }
            }, 'peer-2');

            expect(joinEvents.length).toBe(1);
            expect(joinEvents[0].peerId).toBe('peer-2');
            expect(joinEvents[0].meta.name).toBe('Bob');

            expect(presence.isOnline('peer-2')).toBe(true);

            presence.destroy();
        });

        it('should respond with heartbeat on join', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                status: 'online'
            }, 'peer-2');

            const heartbeat = sentMessages.find(m => m.pt === 'heartbeat');
            expect(heartbeat).toBeDefined();

            presence.destroy();
        });

        it('should ignore own join messages', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            const joinEvents = [];
            presence.on('join', (peerId) => joinEvents.push(peerId));

            presence.handleMessage({
                t: 'presence',
                pt: 'join'
            }, 'my-peer'); // Own message

            expect(joinEvents.length).toBe(0);

            presence.destroy();
        });
    });

    describe('handleMessage() - leave', () => {
        it('should remove peer on leave and emit event', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            // First add peer
            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                status: 'online'
            }, 'peer-2');

            expect(presence.isOnline('peer-2')).toBe(true);

            const leaveEvents = [];
            presence.on('leave', (data) => leaveEvents.push(data.peerId));

            presence.handleMessage({
                t: 'presence',
                pt: 'leave'
            }, 'peer-2');

            expect(leaveEvents.length).toBe(1);
            expect(leaveEvents[0]).toBe('peer-2');
            expect(presence.isOnline('peer-2')).toBe(false);

            presence.destroy();
        });
    });

    describe('handleMessage() - update/heartbeat', () => {
        it('should update peer on heartbeat', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            // Add peer
            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                status: 'online'
            }, 'peer-2');

            const updateEvents = [];
            presence.on('update', (data) => updateEvents.push(data));

            // Heartbeat
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'away'
            }, 'peer-2');

            expect(updateEvents.length).toBe(1);
            expect(presence.getPeer('peer-2').status).toBe('away');

            presence.destroy();
        });

        it('should add new peer on heartbeat if not known', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            const joinEvents = [];
            presence.on('join', (peerId) => joinEvents.push(peerId));

            // Heartbeat from unknown peer
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'online'
            }, 'peer-3');

            expect(joinEvents.length).toBe(1);
            expect(presence.isOnline('peer-3')).toBe(true);

            presence.destroy();
        });
    });

    describe('timeout cleanup', () => {
        it('should mark peer offline after timeout', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false,
                heartbeatInterval: 50,
                timeout: 100
            });

            // Start cleanup timer
            presence.start();

            // Add peer
            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                status: 'online'
            }, 'peer-2');

            expect(presence.isOnline('peer-2')).toBe(true);

            const leaveEvents = [];
            presence.on('leave', (peerId) => leaveEvents.push(peerId));

            // Wait for timeout
            await new Promise(r => setTimeout(r, 200));

            expect(leaveEvents.length).toBe(1);
            expect(presence.isOnline('peer-2')).toBe(false);

            presence.destroy();
        });

        it('should not timeout peer that sends heartbeats', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false,
                heartbeatInterval: 30,
                timeout: 100
            });

            presence.start();

            // Add peer
            presence.handleMessage({
                t: 'presence',
                pt: 'join',
                status: 'online'
            }, 'peer-2');

            const leaveEvents = [];
            presence.on('leave', (data) => leaveEvents.push(data.peerId));

            // Send heartbeats to keep alive
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 40));
                presence.handleMessage({
                    t: 'presence',
                    pt: 'heartbeat',
                    status: 'online'
                }, 'peer-2');
            }

            // Should still be online
            expect(leaveEvents.length).toBe(0);
            expect(presence.isOnline('peer-2')).toBe(true);

            presence.destroy();
        });
    });

    describe('getOnlinePeers()', () => {
        it('should return list of online peer IDs', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-1');
            presence.handleMessage({ t: 'presence', pt: 'join', status: 'away' }, 'peer-2');
            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-3');

            const online = presence.getOnlinePeers();
            expect(online).toContain('peer-1');
            expect(online).toContain('peer-2'); // away is still "online"
            expect(online).toContain('peer-3');
            expect(online.length).toBe(3);

            presence.destroy();
        });
    });

    describe('getAllPeers()', () => {
        it('should return all peer presences', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online', meta: { role: 'admin' } }, 'peer-1');
            presence.handleMessage({ t: 'presence', pt: 'join', status: 'away' }, 'peer-2');

            const all = presence.getAllPeers();
            expect(all.length).toBe(2);
            expect(all.find(p => p.peerId === 'peer-1').meta.role).toBe('admin');

            presence.destroy();
        });
    });

    describe('getPeer()', () => {
        it('should return specific peer presence', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online', meta: { name: 'Alice' } }, 'peer-1');

            const peer = presence.getPeer('peer-1');
            expect(peer.peerId).toBe('peer-1');
            expect(peer.status).toBe('online');
            expect(peer.meta.name).toBe('Alice');

            presence.destroy();
        });

        it('should return undefined for unknown peer', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            expect(presence.getPeer('unknown')).toBeUndefined();

            presence.destroy();
        });
    });

    describe('onlineCount', () => {
        it('should return count of online peers', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            expect(presence.onlineCount).toBe(0);

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-1');
            expect(presence.onlineCount).toBe(1);

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-2');
            expect(presence.onlineCount).toBe(2);

            presence.handleMessage({ t: 'presence', pt: 'leave' }, 'peer-1');
            expect(presence.onlineCount).toBe(1);

            presence.destroy();
        });
    });

    describe('destroy()', () => {
        it('should clean up resources', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer'
            });

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-1');

            presence.destroy();

            expect(presence.isDestroyed).toBe(true);
            expect(presence.getAllPeers().length).toBe(0);
        });

        it('should be idempotent', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.destroy();
            presence.destroy(); // Should not throw

            expect(presence.isDestroyed).toBe(true);
        });

        it('should stop sending heartbeats', async () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                heartbeatInterval: 50
            });

            await new Promise(r => setTimeout(r, 50));
            presence.destroy();

            const beforeCount = sentMessages.length;
            await new Promise(r => setTimeout(r, 100));

            // Should not have sent more messages after destroy
            expect(sentMessages.length).toBe(beforeCount);
        });
    });

    describe('edge cases', () => {
        it('should handle non-presence messages', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            // Should not throw
            presence.handleMessage({ t: 'other', data: 'something' }, 'peer-1');
            presence.handleMessage({ t: 'signal', name: 'test' }, 'peer-1');

            expect(presence.onlineCount).toBe(0);

            presence.destroy();
        });

        it('should handle rapid join/leave', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            const events = [];
            presence.on('join', (data) => events.push({ type: 'join', id: data.peerId }));
            presence.on('leave', (data) => events.push({ type: 'leave', id: data.peerId }));

            for (let i = 0; i < 10; i++) {
                presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, `peer-${i}`);
            }

            for (let i = 0; i < 10; i++) {
                presence.handleMessage({ t: 'presence', pt: 'leave' }, `peer-${i}`);
            }

            const joins = events.filter(e => e.type === 'join');
            const leaves = events.filter(e => e.type === 'leave');

            expect(joins.length).toBe(10);
            expect(leaves.length).toBe(10);
            expect(presence.onlineCount).toBe(0);

            presence.destroy();
        });

        it('should handle concurrent status updates', () => {
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            presence.handleMessage({ t: 'presence', pt: 'join', status: 'online' }, 'peer-1');

            // Rapid status changes
            presence.handleMessage({ t: 'presence', pt: 'update', status: 'away' }, 'peer-1');
            presence.handleMessage({ t: 'presence', pt: 'update', status: 'online' }, 'peer-1');
            presence.handleMessage({ t: 'presence', pt: 'update', status: 'away' }, 'peer-1');

            expect(presence.getPeer('peer-1').status).toBe('away');

            presence.destroy();
        });
    });
});
