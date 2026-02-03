/**
 * @fileoverview Tests for CrossBus streaming.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
    WritableSignalStream,
    ReadableSignalStream,
    StreamManager
} from '../../src/core/stream.js';

describe('WritableSignalStream', () => {
    describe('constructor', () => {
        it('should create stream with name and ID', () => {
            const sendFn = mock(() => Promise.resolve());
            const stream = new WritableSignalStream(sendFn, 'test-stream');

            expect(stream.name).toBe('test-stream');
            expect(stream.streamId).toBeDefined();
            expect(stream.streamId.length).toBeGreaterThan(0);
        });
    });

    describe('write()', () => {
        it('should auto-open on first write', async () => {
            const messages = [];
            const sendFn = mock((msg) => {
                messages.push(msg);
                return Promise.resolve();
            });

            const stream = new WritableSignalStream(sendFn, 'upload');
            await stream.write('hello');

            expect(messages.length).toBeGreaterThanOrEqual(2);
            expect(messages[0].st).toBe('open');
            expect(messages[0].name).toBe('upload');
            expect(messages[1].st).toBe('data');
        });

        it('should write string data', async () => {
            const messages = [];
            const sendFn = mock((msg) => {
                messages.push(msg);
                return Promise.resolve();
            });

            const stream = new WritableSignalStream(sendFn, 'text');
            await stream.write('hello world');

            const dataMsg = messages.find(m => m.st === 'data');
            expect(dataMsg.d).toBe('hello world');
            expect(dataMsg.b64).toBe(false);
        });

        it('should write binary data as base64', async () => {
            const messages = [];
            const sendFn = mock((msg) => {
                messages.push(msg);
                return Promise.resolve();
            });

            const stream = new WritableSignalStream(sendFn, 'binary');
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            await stream.write(data);

            const dataMsg = messages.find(m => m.st === 'data');
            expect(dataMsg.b64).toBe(true);
            expect(typeof dataMsg.d).toBe('string');
        });

        it('should throw if stream already ended', async () => {
            const sendFn = mock(() => Promise.resolve());
            const stream = new WritableSignalStream(sendFn, 'test');
            await stream.end();

            expect(stream.write('data')).rejects.toThrow();
        });
    });

    describe('end()', () => {
        it('should send end message', async () => {
            const messages = [];
            const sendFn = mock((msg) => {
                messages.push(msg);
                return Promise.resolve();
            });

            const stream = new WritableSignalStream(sendFn, 'test');
            await stream.open();
            await stream.end({ status: 'complete' });

            const endMsg = messages.find(m => m.st === 'end');
            expect(endMsg).toBeDefined();
            expect(endMsg.meta.status).toBe('complete');
        });

        it('should be idempotent', async () => {
            const sendFn = mock(() => Promise.resolve());
            const stream = new WritableSignalStream(sendFn, 'test');
            await stream.open();
            await stream.end();
            await stream.end(); // Should not throw

            // Only one end message
            const endCalls = sendFn.mock.calls.filter(([msg]) => msg.st === 'end');
            expect(endCalls.length).toBe(1);
        });
    });

    describe('abort()', () => {
        it('should send error message', async () => {
            const messages = [];
            const sendFn = mock((msg) => {
                messages.push(msg);
                return Promise.resolve();
            });

            const stream = new WritableSignalStream(sendFn, 'test');
            await stream.open();
            await stream.abort('Network error');

            const errMsg = messages.find(m => m.st === 'error');
            expect(errMsg).toBeDefined();
            expect(errMsg.reason).toBe('Network error');
        });
    });
});

describe('ReadableSignalStream', () => {
    describe('constructor', () => {
        it('should create stream with ID and meta', () => {
            const stream = new ReadableSignalStream('stream-123', 'download', {
                filename: 'data.json'
            });

            expect(stream.streamId).toBe('stream-123');
            expect(stream.name).toBe('download');
            expect(stream.meta.filename).toBe('data.json');
        });
    });

    describe('push() and iteration', () => {
        it('should receive pushed data', async () => {
            const stream = new ReadableSignalStream('s1', 'test');

            // Push some data
            stream.push({ d: 'chunk1', b64: false });
            stream.push({ d: 'chunk2', b64: false });
            stream.end();

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['chunk1', 'chunk2']);
        });

        it('should decode base64 data', async () => {
            const stream = new ReadableSignalStream('s1', 'binary');

            // Push base64 encoded data
            const original = new Uint8Array([1, 2, 3, 4, 5]);
            const base64 = btoa(String.fromCharCode(...original));
            stream.push({ d: base64, b64: true });
            stream.end();

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            expect(chunks[0]).toBeInstanceOf(Uint8Array);
            expect([...chunks[0]]).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('collect()', () => {
        it('should collect string chunks', async () => {
            const stream = new ReadableSignalStream('s1', 'text');

            stream.push({ d: 'Hello ', b64: false });
            stream.push({ d: 'World!', b64: false });
            stream.end();

            const result = await stream.collect();
            expect(result).toBe('Hello World!');
        });

        it('should collect binary chunks', async () => {
            const stream = new ReadableSignalStream('s1', 'binary');

            const chunk1 = new Uint8Array([1, 2, 3]);
            const chunk2 = new Uint8Array([4, 5, 6]);

            stream.push({ d: btoa(String.fromCharCode(...chunk1)), b64: true });
            stream.push({ d: btoa(String.fromCharCode(...chunk2)), b64: true });
            stream.end();

            const result = await stream.collect();
            expect(result).toBeInstanceOf(Uint8Array);
            expect([...result]).toEqual([1, 2, 3, 4, 5, 6]);
        });
    });

    describe('error handling', () => {
        it('should throw on error', async () => {
            const stream = new ReadableSignalStream('s1', 'test');

            stream.push({ d: 'data', b64: false });
            stream.error('Connection lost');

            const chunks = [];

            await expect(async () => {
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
            }).toThrow('Connection lost');
        });
    });
});

describe('StreamManager', () => {
    describe('createStream()', () => {
        it('should create writable stream for peer', () => {
            const sendFn = mock(() => Promise.resolve());
            const manager = new StreamManager(sendFn);

            const stream = manager.createStream('upload', 'peer-1');

            expect(stream).toBeInstanceOf(WritableSignalStream);
            expect(stream.name).toBe('upload');
        });
    });

    describe('onStream()', () => {
        it('should register stream handler', () => {
            const sendFn = mock(() => Promise.resolve());
            const manager = new StreamManager(sendFn);

            const handler = mock(() => Promise.resolve());
            const unregister = manager.onStream('download', handler);

            expect(typeof unregister).toBe('function');
        });
    });

    describe('handleMessage()', () => {
        it('should handle stream open and call handler', async () => {
            const sendFn = mock(() => Promise.resolve());
            const manager = new StreamManager(sendFn);

            let receivedStream = null;
            manager.onStream('upload', async (stream) => {
                receivedStream = stream;
            });

            // Simulate open message
            manager.handleMessage({
                t: 'stream',
                sid: 'stream-123',
                st: 'open',
                name: 'upload',
                meta: { filename: 'test.txt' }
            }, 'peer-1');

            // Wait for async handler
            await new Promise(r => setTimeout(r, 10));

            expect(receivedStream).not.toBeNull();
            expect(receivedStream.streamId).toBe('stream-123');
            expect(receivedStream.meta.filename).toBe('test.txt');
        });

        it('should handle data messages', async () => {
            const sendFn = mock(() => Promise.resolve());
            const manager = new StreamManager(sendFn);

            let collectedData = null;
            manager.onStream('data', async (stream) => {
                collectedData = await stream.collect();
            });

            // Open stream
            manager.handleMessage({
                t: 'stream',
                sid: 's1',
                st: 'open',
                name: 'data'
            }, 'peer-1');

            await new Promise(r => setTimeout(r, 10));

            // Send data
            manager.handleMessage({
                t: 'stream',
                sid: 's1',
                st: 'data',
                seq: 0,
                d: 'hello',
                b64: false
            }, 'peer-1');

            // End stream
            manager.handleMessage({
                t: 'stream',
                sid: 's1',
                st: 'end'
            }, 'peer-1');

            await new Promise(r => setTimeout(r, 50));

            expect(collectedData).toBe('hello');
        });

        it('should track active stream count', async () => {
            const sendFn = mock(() => Promise.resolve());
            const manager = new StreamManager(sendFn);

            manager.onStream('test', async () => { });

            expect(manager.activeStreamCount).toBe(0);

            manager.handleMessage({
                t: 'stream',
                sid: 's1',
                st: 'open',
                name: 'test'
            }, 'peer-1');

            await new Promise(r => setTimeout(r, 10));
            expect(manager.activeStreamCount).toBe(1);

            manager.handleMessage({
                t: 'stream',
                sid: 's1',
                st: 'end'
            }, 'peer-1');

            expect(manager.activeStreamCount).toBe(0);
        });
    });
});
