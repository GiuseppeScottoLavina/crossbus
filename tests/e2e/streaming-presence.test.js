/**
 * @fileoverview E2E tests for Streaming and Presence features.
 * Tests actual API of StreamManager, WritableSignalStream, ReadableSignalStream, PresenceManager.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { StreamManager, WritableSignalStream, ReadableSignalStream } from '../../src/core/stream.js';
import { PresenceManager } from '../../src/core/presence.js';

describe('E2E: Streaming Feature', () => {
    describe('WritableSignalStream', () => {
        it('should create streams with unique IDs', () => {
            const sendFn = async () => { };
            const stream1 = new WritableSignalStream(sendFn, 'test-stream-1');
            const stream2 = new WritableSignalStream(sendFn, 'test-stream-2');

            expect(stream1.streamId).not.toBe(stream2.streamId);
            expect(typeof stream1.streamId).toBe('string');
        });

        it('should have name property', () => {
            const sendFn = async () => { };
            const stream = new WritableSignalStream(sendFn, 'my-stream');

            expect(stream.name).toBe('my-stream');
        });

        it('should send messages via sendFn when writing', async () => {
            const messages = [];
            const sendFn = async (msg) => { messages.push(msg); };

            const stream = new WritableSignalStream(sendFn, 'test-stream');
            await stream.write({ data: 'hello' });

            // Should have sent at least an 'open' and a 'data' message
            expect(messages.length).toBeGreaterThanOrEqual(2);
        });

        it('should send end message on close', async () => {
            const messages = [];
            const sendFn = async (msg) => { messages.push(msg); };

            const stream = new WritableSignalStream(sendFn, 'test-stream');
            await stream.write({ data: 'test' });
            await stream.end();

            // Last message should be 'end'
            const lastMsg = messages[messages.length - 1];
            expect(lastMsg.st).toBe('end');
        });

        it('should send error message on abort', async () => {
            const messages = [];
            const sendFn = async (msg) => { messages.push(msg); };

            const stream = new WritableSignalStream(sendFn, 'test-stream');
            await stream.write({ data: 'test' });
            await stream.abort('User cancelled');

            // Last message should be 'error'
            const lastMsg = messages[messages.length - 1];
            expect(lastMsg.st).toBe('error');
            expect(lastMsg.reason).toBe('User cancelled');
        });

        it('should throw when writing to ended stream', async () => {
            const sendFn = async () => { };
            const stream = new WritableSignalStream(sendFn, 'test-stream');

            await stream.write({ data: 'test' });
            await stream.end();

            await expect(stream.write({ data: 'more' })).rejects.toThrow('Stream already ended');
        });
    });

    describe('ReadableSignalStream', () => {
        it('should store metadata', () => {
            const stream = new ReadableSignalStream('stream-123', 'upload', { filename: 'test.txt' });

            expect(stream.streamId).toBe('stream-123');
            expect(stream.name).toBe('upload');
            expect(stream.meta.filename).toBe('test.txt');
        });

        it('should push and iterate chunks', async () => {
            const stream = new ReadableSignalStream('stream-456', 'data');

            // Push data
            stream.push({ d: 'chunk1', b64: false });
            stream.push({ d: 'chunk2', b64: false });
            stream.end();

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['chunk1', 'chunk2']);
        });

        it('should report ended status', () => {
            const stream = new ReadableSignalStream('stream-789', 'test');

            expect(stream.ended).toBe(false);
            stream.end();
            expect(stream.ended).toBe(true);
        });

        it('should collect all chunks into single result', async () => {
            const stream = new ReadableSignalStream('stream-collect', 'text');

            stream.push({ d: 'Hello', b64: false });
            stream.push({ d: ' ', b64: false });
            stream.push({ d: 'World', b64: false });
            stream.end();

            const result = await stream.collect();
            expect(result).toBe('Hello World');
        });
    });

    describe('StreamManager', () => {
        it('should create writable streams via createStream', () => {
            const sentMessages = [];
            const sendFn = async (peerId, msg) => {
                sentMessages.push({ peerId, msg });
            };

            const manager = new StreamManager(sendFn);
            const stream = manager.createStream('upload', 'peer-1');

            expect(stream).toBeInstanceOf(WritableSignalStream);
            expect(stream.name).toBe('upload');
        });

        it('should register stream handlers', () => {
            const sendFn = async () => { };
            const manager = new StreamManager(sendFn);

            const unregister = manager.onStream('upload', async () => { });
            expect(typeof unregister).toBe('function');

            // Should be able to unregister
            unregister();
        });

        it('should handle incoming stream messages', async () => {
            const sendFn = async () => { };
            const manager = new StreamManager(sendFn);

            let receivedStream = null;
            manager.onStream('test', async (stream) => {
                receivedStream = stream;
            });

            // Simulate incoming open message
            manager.handleMessage({
                t: 'stream',
                sid: 'test-sid',
                st: 'open',
                name: 'test',
                meta: { key: 'value' }
            }, 'peer-1');

            // Wait for async handler
            await new Promise(r => setTimeout(r, 10));

            expect(receivedStream).not.toBe(null);
            expect(receivedStream.name).toBe('test');
            expect(receivedStream.meta.key).toBe('value');
        });

        it('should track active stream count', async () => {
            const sendFn = async () => { };
            const manager = new StreamManager(sendFn);

            manager.onStream('test', async () => { });

            expect(manager.activeStreamCount).toBe(0);

            // Open a stream
            manager.handleMessage({
                t: 'stream',
                sid: 'stream-1',
                st: 'open',
                name: 'test',
                meta: {}
            }, 'peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(manager.activeStreamCount).toBe(1);

            // End the stream
            manager.handleMessage({
                t: 'stream',
                sid: 'stream-1',
                st: 'end',
                meta: {}
            }, 'peer-1');

            expect(manager.activeStreamCount).toBe(0);
        });
    });
});

describe('E2E: Presence Feature', () => {
    describe('PresenceManager', () => {
        it('should require peerId in options', () => {
            const sendFn = async () => { };

            expect(() => {
                new PresenceManager(sendFn, {});
            }).toThrow('peerId is required');
        });

        it('should track own status', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'my-peer',
                autoStart: false
            });

            expect(presence.peerId).toBe('my-peer');
            expect(presence.status).toBe('online');

            presence.destroy();
        });

        it('should update status', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'test-peer',
                autoStart: false
            });

            presence.setStatus('away');
            expect(presence.status).toBe('away');

            presence.setStatus('online');
            expect(presence.status).toBe('online');

            presence.destroy();
        });

        it('should start and stop heartbeat', () => {
            const messages = [];
            const sendFn = async (msg) => { messages.push(msg); };

            const presence = new PresenceManager(sendFn, {
                peerId: 'heartbeat-test',
                heartbeatInterval: 50,
                autoStart: false
            });

            presence.start();
            // First heartbeat sent immediately on start
            expect(messages.length).toBeGreaterThanOrEqual(1);

            presence.stop();
            presence.destroy();
        });

        it('should handle incoming presence messages', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'handler-test',
                autoStart: false
            });

            const joinEvents = [];
            presence.on('join', (data) => {
                joinEvents.push(data);
            });

            // Simulate receiving a peer presence - handleMessage needs fromPeerId as second arg
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'online',
                meta: { name: 'Test Peer' }
            }, 'new-peer');  // fromPeerId is the second argument

            expect(joinEvents.length).toBe(1);
            expect(joinEvents[0].peerId).toBe('new-peer');

            presence.destroy();
        });

        it('should return online peers list', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'list-test',
                autoStart: false
            });

            // Add some peers - handleMessage needs fromPeerId as second arg
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'online',
                meta: {}
            }, 'peer-a');
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'online',
                meta: {}
            }, 'peer-b');

            // getOnlinePeers() returns string[] of peer IDs
            const onlinePeers = presence.getOnlinePeers();
            expect(onlinePeers.length).toBe(2);
            expect(onlinePeers).toContain('peer-a');
            expect(onlinePeers).toContain('peer-b');

            presence.destroy();
        });

        it('should emit leave events when peer goes offline', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'leave-test',
                autoStart: false
            });

            const leaveEvents = [];
            presence.on('leave', (data) => {
                leaveEvents.push(data.peerId);
            });

            // First add a peer - handleMessage needs fromPeerId as second arg
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                status: 'online',
                meta: {}
            }, 'temp-peer');

            // Then they go offline
            presence.handleMessage({
                t: 'presence',
                pt: 'leave'
            }, 'temp-peer');

            expect(leaveEvents.length).toBe(1);
            expect(leaveEvents[0]).toBe('temp-peer');

            presence.destroy();
        });

        it('should emit update events on status change', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'update-test',
                autoStart: false
            });

            const updateEvents = [];
            presence.on('update', (peerId, status, meta) => {
                updateEvents.push({ peerId, status });
            });

            // First heartbeat
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                peerId: 'changing-peer',
                status: 'online',
                meta: {}
            });

            // Status change
            presence.handleMessage({
                t: 'presence',
                pt: 'heartbeat',
                peerId: 'changing-peer',
                status: 'away',
                meta: {}
            });

            // Should have at least one update
            expect(updateEvents.length).toBeGreaterThanOrEqual(1);

            presence.destroy();
        });

        it('should clean up on destroy', () => {
            const sendFn = async () => { };
            const presence = new PresenceManager(sendFn, {
                peerId: 'cleanup-test',
                heartbeatInterval: 50,
                autoStart: true
            });

            presence.destroy();

            // Should not throw when calling methods after destroy
            expect(() => presence.getOnlinePeers()).not.toThrow();
        });
    });
});

describe('E2E: Multi-feature Integration', () => {
    it('should work with both streaming and presence', async () => {
        const sendFn = async () => { };

        // Create both managers
        const streamManager = new StreamManager(sendFn);
        const presence = new PresenceManager(sendFn, {
            peerId: 'integration-hub',
            autoStart: false
        });

        // Start presence
        presence.start();

        // Create a stream
        const stream = streamManager.createStream('data', 'peer-1');
        expect(stream.name).toBe('data');
        expect(presence.status).toBe('online');

        // Cleanup
        presence.destroy();
    });
});
