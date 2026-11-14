// Run from the built 0.1.5 checkout: node examples/quickstart/stream.mjs
import assert from 'node:assert/strict';
import { MessageChannelTransport, StreamManager } from 'crossbus';
const left = new MessageChannelTransport();
const right = MessageChannelTransport.fromPort(left.remotePort);
const sender = new StreamManager((peerId, frame) => {
    assert.equal(peerId, 'receiver');
    return left.send(frame);
});
const receiver = new StreamManager((peerId, frame) => {
    assert.equal(peerId, 'sender');
    return right.send(frame);
});
// Peer identities come from these two known ports, not from frame payloads.
left.onMessage((frame) => sender.handleMessage(frame, 'receiver'));
right.onMessage((frame) => receiver.handleMessage(frame, 'sender'));
let resolveResult, rejectResult;
const collected = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
});
collected.catch(() => {});
receiver.onStream('bytes', (stream) => stream.collect().then(resolveResult, rejectResult));
const original = Uint8Array.from({ length: 257 }, (_, i) => i & 255);
try {
    const writer = sender.createStream('bytes', 'receiver', {
        flowControl: true,
        binaryEncoding: 'native',
        chunkSize: 5,
        windowSize: 4,
        ackTimeout: 2000,
        timeout: 5000
    });
    await writer.write(original);
    await writer.end();
    // The final pull ACK may precede the handler's collect() continuation.
    const received = await collected;
    assert.deepEqual(received, original);
    assert.equal(original.buffer.byteLength, 257);
    console.log(JSON.stringify({ receivedBytes: received.length, originalStillAttached: true }));
} finally {
    sender.destroy();
    receiver.destroy();
    left.destroy();
    right.destroy();
}
