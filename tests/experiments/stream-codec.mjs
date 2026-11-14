// Exercise Node's real fallback in a fresh process, without altering other tests' globals.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { WritableSignalStream, ReadableSignalStream } = await import(pathToFileURL(process.argv[2]));
const encode = async (input) => {
    const frames = [];
    const writer = new WritableSignalStream((frame) => frames.push(frame), 'bytes', {
        chunkSize: 5
    });
    await writer.write(input);
    await writer.end();
    return frames.filter((frame) => frame.st === 'data');
};
for (const length of [0, 1, 2, 3, 257, 4099]) {
    const original = Uint8Array.from({ length: length + 7 }, (_, i) => (i * 13) & 255),
        input = original.subarray(3, 3 + length);
    const frames = await encode(input);
    let offset = 0;
    const reader = new ReadableSignalStream(
        'bytes',
        'bytes',
        {},
        { maxBufferedBytes: Math.max(1, length) }
    );
    const collected = reader.collect();
    for (const frame of frames) {
        assert.equal(frame.d, btoa(String.fromCharCode(...input.subarray(offset, offset + 5))));
        reader.push(frame);
        offset += 5;
    }
    reader.end();
    assert.deepEqual(await collected, input);
    assert.equal(original.buffer.byteLength, length + 7);
}
const texts = [
    '',
    'YQ',
    'YQ==',
    'YR==',
    'YWI',
    'YWI=',
    'YWJj',
    ' Y W\tJ\rj\n\f',
    '=',
    '==',
    '===',
    '====',
    'a',
    'ab=',
    'a===',
    'abc==',
    'a=bc',
    'ab=c',
    'ab=c==',
    'YWJj!',
    'YW-J',
    'YW_J',
    'YWJj\v',
    'YWJj\u00a0',
    'YWJj\u2028'
];
// Deterministic malformed-input coverage, independent from the codec under test.
let seed = 0x12345678;
const alphabet = 'AZaz09+/= \t\r\n\f!_-\v\u00a0\u2028';
for (let i = 0; i < 4096; i++) {
    let text = '';
    for (let j = 0; j < i % 17; j++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        text += alphabet[seed % alphabet.length];
    }
    texts.push(text);
}
for (const text of texts) {
    let expected;
    try {
        expected = atob(text);
    } catch {
        expected = null;
    }
    const reader = new ReadableSignalStream('bytes', 'bytes');
    if (expected === null) {
        assert.throws(
            () => reader.push({ seq: 0, b64: true, d: text }),
            (e) => e.name === 'InvalidCharacterError'
        );
        assert.equal(reader.bufferedBytes, 0);
        assert.equal(reader.bufferedChunks, 0);
    } else {
        const iterator = reader[Symbol.asyncIterator]();
        reader.push({ seq: 0, b64: true, d: text });
        reader.end({}, 1);
        const { value } = await iterator.next();
        assert.equal(Object.getPrototypeOf(value), Uint8Array.prototype);
        assert.equal(value.buffer.byteLength, value.byteLength);
        assert.deepEqual(
            [...value],
            [...expected].map((c) => c.charCodeAt(0))
        );
        assert.equal((await iterator.next()).done, true);
    }
}
console.log(
    JSON.stringify({
        runtime: process.version,
        canonicalLengths: 6,
        atobParityCases: texts.length,
        exactOwnedStorage: true,
        plainUint8Array: true
    })
);
