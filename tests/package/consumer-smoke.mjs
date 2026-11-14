// Copy beside a clean consumer's node_modules after installing the packed tgz.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CrossBus, MessageChannelTransport, EventEmitter } from 'crossbus';
const require = createRequire(import.meta.url);
const root = resolve(dirname(require.resolve('crossbus')), '..');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.ok(process.argv[2], 'Pass the expected package version');
assert.equal(pkg.version, process.argv[2]);
assert.equal(typeof require('crossbus').CrossBus, 'function');
for (const [subpath, entry] of Object.entries(pkg.exports)) {
    const module = await import(subpath === '.' ? 'crossbus' : `crossbus/${subpath.slice(2)}`);
    assert.ok(Object.keys(module).length > 0, subpath);
    await access(resolve(root, entry.types));
}
for (const file of [
    'native/ios/CrossBusBridge.swift',
    'native/android/CrossBusBridge.java',
    'Package.swift',
    'CrossBusNative.podspec',
    'native/android/gradlew',
    'native/android/gradle/wrapper/gradle-wrapper.jar',
    'README.md',
    'LICENSE',
    'examples/quickstart/hub.js',
    'examples/quickstart/stream.mjs'
])
    await access(resolve(root, file));
async function checkStream(lib, binaryEncoding) {
    const left = new lib.MessageChannelTransport({ autoTransfer: binaryEncoding === 'native' });
    const right = lib.MessageChannelTransport.fromPort(left.remotePort);
    const sender = new lib.StreamManager((peer, frame) => {
        assert.equal(peer, 'receiver');
        return left.send(frame);
    });
    const receiver = new lib.StreamManager((peer, frame) => {
        assert.equal(peer, 'sender');
        return right.send(frame);
    });
    left.onMessage((frame) => sender.handleMessage(frame, 'receiver'));
    right.onMessage((frame) => receiver.handleMessage(frame, 'sender'));
    let resolveResult, rejectResult;
    const collected = new Promise((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    collected.catch(() => {});
    receiver.onStream('bytes', (stream) => stream.collect().then(resolveResult, rejectResult));
    const original = Uint8Array.from({ length: 513 }, (_, i) => (i * 13) & 255);
    const view = original.subarray(3, 260),
        expected = view.slice();
    try {
        const writer = sender.createStream('bytes', 'receiver', {
            flowControl: true,
            binaryEncoding,
            chunkSize: 5,
            windowSize: 4,
            ackTimeout: 2000,
            timeout: 5000
        });
        await writer.write(view);
        await writer.end();
        assert.deepEqual(await collected, expected);
        assert.equal(original.buffer.byteLength, 513);
        assert.deepEqual(view, expected);
        assert.equal(sender.outgoingStreamCount, 0);
        assert.equal(receiver.activeStreamCount, 0);
    } finally {
        sender.destroy();
        receiver.destroy();
        left.destroy();
        right.destroy();
    }
}
const local = new EventEmitter();
let delivered;
local.on(
    'tick',
    (event) => {
        delivered = event;
    },
    { mode: 'sync' }
);
await local.emit('tick', 42);
assert.equal(delivered.data, 42);
assert.match(delivered.messageId, /^[0-9a-f-]{36}$/);
for (const entry of ['./dist/crossbus.js', './dist/crossbus.min.js', './dist/crossbus.cjs'])
    for (const wireFormat of ['standard', 'compact']) {
        const lib = entry.endsWith('.cjs')
            ? require(resolve(root, entry))
            : await import(pathToFileURL(resolve(root, entry)).href);
        const a = new lib.CrossBus({ peerId: 'a', allowedOrigins: ['channel'] });
        const b = new lib.CrossBus({ peerId: 'b', allowedOrigins: ['channel'] });
        const channel = new lib.MessageChannelTransport({ wireFormat });
        assert.equal(channel.wireFormat, wireFormat);
        a.addTransport(channel, { peerId: 'b', origin: 'channel' });
        b.addTransport(lib.MessageChannelTransport.fromPort(channel.remotePort, { wireFormat }), {
            peerId: 'a',
            origin: 'channel'
        });
        const { withSchemaValidation } = await import('crossbus/plugins/schema-validation');
        b.handle(
            'echo',
            withSchemaValidation({ type: 'object', required: ['value'] }, (payload) => payload)
        );
        try {
            assert.deepEqual(
                await a.request('b', 'echo', { value: 'packed 🐟' }, { timeout: 1000 }),
                { value: 'packed 🐟' }
            );
            await assert.rejects(
                a.request('b', 'echo', {}, { timeout: 1000 }),
                (error) => error.code === 'ERR_INVALID_PAYLOAD'
            );
        } finally {
            a.destroy();
            b.destroy();
        }
        if (wireFormat === 'standard')
            for (const encoding of ['base64', 'native']) await checkStream(lib, encoding);
    }
console.log(
    JSON.stringify({
        package: pkg.name,
        version: pkg.version,
        runtime: process.version,
        exports: Object.keys(pkg.exports).length,
        esm: true,
        commonjs: true,
        minifiedRpc: true,
        compactRpc: true,
        schemaValidation: true,
        nativeSources: true,
        nativeSdkConfiguration: true,
        boundedBinaryStreams: true
    })
);
