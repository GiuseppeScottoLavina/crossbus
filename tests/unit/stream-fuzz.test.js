/**
 * Seeded randomized tests of StreamManager flow control. A simulated channel
 * reorders, duplicates and drops frames; the reader consumes at a random pace;
 * either side may abort, cancel or destroy its manager. Every run must end
 * with both sides settled, the exact bytes delivered when nothing was lost or
 * cancelled, the writer inside its credit window, and no stream left open.
 * A failure prints the seed and configuration that reproduce it.
 */
import { describe, it, expect } from 'bun:test';
import { StreamManager } from '../../src/index.js';

// A quick default for the unit suite; set STREAM_FUZZ_RUNS (and STREAM_FUZZ_SEED) for longer campaigns.
const RUNS = Number(process.env.STREAM_FUZZ_RUNS ?? 40);
const FIRST_SEED = Number(process.env.STREAM_FUZZ_SEED ?? 1);

function prng(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        // xorshift32
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
    };
}

function configFor(seed) {
    const random = prng(seed);
    const pick = list => list[Math.floor(random() * list.length)];
    const flowControl = random() < 0.7;
    const disruption = random();
    return {
        seed,
        random,
        flowControl,
        windowSize: pick([1, 2, 3, 8, 16]),
        chunkSize: pick([1, 3, 7, 64]),
        binary: random() < 0.6,
        binaryEncoding: random() < 0.5 ? 'base64' : 'native',
        writes: 1 + Math.floor(random() * 12),
        writeSize: pick([0, 1, 5, 20, 48]),
        reorder: random() < 0.5 ? pick([2, 3, 5]) : 1,
        duplicate: random() < 0.4 ? pick([0.05, 0.2]) : 0,
        drop: disruption < 0.08,
        abort: disruption >= 0.08 && disruption < 0.16 ? 'writer'
            : disruption < 0.24 ? 'reader'
                : disruption < 0.3 ? 'destroy-writer-manager'
                    : disruption < 0.36 ? 'destroy-reader-manager' : null,
        readPace: pick([0, 0.3, 0.7]),
        sendSettles: random() < 0.5 ? 'at-once' : 'on-delivery'
    };
}

function describeConfig(config) {
    const { random: _random, ...rest } = config;
    return JSON.stringify(rest);
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function run(config) {
    const { random } = config;
    const deadline = Date.now() + 3000;
    const queues = { toReader: [], toWriter: [] };
    const violations = [];
    let ackedByWriter = 0;
    let dropped = false;

    const send = (queue) => (peerId, frame) => {
        const copies = 1 + (random() < config.duplicate ? 1 : 0);
        let settle;
        const sent = new Promise(resolve => { settle = resolve; });
        for (let i = 0; i < copies; i++) queues[queue].push({ frame: structuredClone(frame), settle: i === 0 ? settle : null });
        if (config.sendSettles === 'at-once') settle();
        return sent;
    };
    const options = { idleTimeout: config.flowControl ? 400 : 0 };
    const writerSide = new StreamManager(send('toReader'), options);
    // Legacy readers have no idle timeout by default; a lossy legacy run needs one.
    const readerSide = new StreamManager(send('toWriter'), { idleTimeout: config.flowControl ? 400 : config.drop ? 150 : 0 });

    const input = [];
    for (let i = 0; i < config.writes; i++) {
        if (config.binary) input.push(Uint8Array.from({ length: config.writeSize }, () => Math.floor(random() * 256)));
        // Include astral characters, which chunking splits into surrogate halves.
        else input.push(Array.from({ length: config.writeSize }, () => random() < 0.2 ? '😀' : String.fromCharCode(97 + Math.floor(random() * 26))).join(''));
    }

    let reader = null;
    const output = [];
    const readerState = { settled: false, error: null };
    readerSide.onStream('data', (stream) => {
        reader = stream;
    });

    const writer = writerSide.createStream('data', 'reader', {
        flowControl: config.flowControl,
        windowSize: config.windowSize,
        chunkSize: config.chunkSize,
        binaryEncoding: config.binaryEncoding,
        // Short only where a lost frame must be detected; otherwise a slow consumer is not a fault.
        ackTimeout: config.drop ? 150 : 5000
    });
    const writerState = { settled: false, error: null };
    const writing = (async () => {
        for (const item of input) await writer.write(item);
        await writer.end();
    })().then(() => { writerState.settled = true; }, (error) => { writerState.settled = true; writerState.error = error; });

    let iterator = null;
    let pendingRead = null;
    let idleSteps = 0;
    const abortAt = config.abort ? 2 + Math.floor(random() * 30) : -1;
    for (let step = 0; ; step++) {
        if (Date.now() > deadline) {
            violations.push(`hang: writer ${writerState.settled ? 'settled' : 'pending'}, reader ${readerState.settled ? 'settled' : 'pending'}, queued ${queues.toReader.length}/${queues.toWriter.length}`);
            break;
        }
        if (step === abortAt) {
            if (config.abort === 'writer') void writer.abort('fuzz abort').catch(() => {});
            else if (config.abort === 'reader') reader?.cancel('fuzz cancel');
            else if (config.abort === 'destroy-writer-manager') writerSide.destroy();
            else if (config.abort === 'destroy-reader-manager') readerSide.destroy();
        }

        // Start the consumer once the stream exists, then pull at a random pace.
        if (reader && !iterator) iterator = reader[Symbol.asyncIterator]();
        const idle = !queues.toReader.length && !queues.toWriter.length;
        // When the channel is empty, the consumer is the only thing that can make progress.
        if (iterator && !pendingRead && !readerState.settled && (idle || random() >= config.readPace)) {
            pendingRead = iterator.next().then(({ value, done }) => {
                pendingRead = null;
                if (done) readerState.settled = true;
                else output.push(value);
            }, (error) => {
                pendingRead = null;
                readerState.settled = true;
                readerState.error = error;
            });
        }

        // Deliver one frame in either direction, sometimes out of order.
        const direction = queues.toReader.length && (!queues.toWriter.length || random() < 0.5) ? 'toReader' : 'toWriter';
        const queue = queues[direction];
        if (queue.length) {
            let index = Math.floor(random() * Math.min(config.reorder, queue.length));
            // Channels deliver the opening first; the protocol has no way to buffer data before it.
            if (queue[0].frame.st === 'open' || queue[0].frame.st === 'open-flow') index = 0;
            const [{ frame, settle }] = queue.splice(index, 1);
            if (config.drop && !dropped && frame.st === 'data' && random() < 0.3) {
                dropped = true;
                settle?.();
            } else {
                if (direction === 'toReader') {
                    if (frame.st === 'data' && config.flowControl && frame.seq >= ackedByWriter + config.windowSize) {
                        violations.push(`window: sent seq ${frame.seq} with ${ackedByWriter} acknowledged, window ${config.windowSize}`);
                    }
                    readerSide.handleMessage(frame, 'writer');
                } else {
                    if (frame.st === 'ack' && frame.seq > ackedByWriter) ackedByWriter = frame.seq;
                    writerSide.handleMessage(frame, 'reader');
                }
                settle?.();
            }
        }

        await tick();
        // Credits bound what the reader holds: never more unconsumed chunks than the window.
        if (config.flowControl && reader && reader.bufferedChunks > config.windowSize) {
            violations.push(`buffer: reader holds ${reader.bufferedChunks} chunks, window ${config.windowSize}`);
            break;
        }
        const quiet = !queues.toReader.length && !queues.toWriter.length && !pendingRead;
        if (writerState.settled && (readerState.settled || !reader) && quiet) {
            // A reader that never opened (the opening was refused or lost) has nothing to settle.
            break;
        }
        // When nothing moves for a while, only timers can make progress: give them time.
        idleSteps = !queues.toReader.length && !queues.toWriter.length && (pendingRead || !iterator) ? idleSteps + 1 : 0;
        if (idleSteps > 10) await new Promise(resolve => setTimeout(resolve, 5));
    }

    await writing;
    const disrupted = config.drop && dropped || config.abort !== null && abortAt >= 0;
    if (!violations.length && !disrupted) {
        if (writerState.error) violations.push(`writer failed without disruption: ${writerState.error.code} ${writerState.error.message}`);
        if (readerState.error) violations.push(`reader failed without disruption: ${readerState.error.code} ${readerState.error.message}`);
        const expected = config.binary ? Buffer.concat(input.map(part => Buffer.from(part))).toString('hex') : input.join('');
        const actual = config.binary ? Buffer.concat(output.map(part => Buffer.from(part))).toString('hex') : output.join('');
        if (actual !== expected) violations.push(`data: got ${actual.length} units, expected ${expected.length}`);
        if (reader && (reader.bufferedChunks || reader.bufferedBytes)) {
            violations.push(`accounting: ${reader.bufferedChunks} chunks / ${reader.bufferedBytes} bytes still counted after a complete read`);
        }
    }
    if (writerState.error && !/^ERR_STREAM_/.test(writerState.error.code ?? '')) {
        violations.push(`writer error without a stream code: ${writerState.error.message}`);
    }
    if (readerState.error && !/^ERR_STREAM_/.test(readerState.error.code ?? '')) {
        violations.push(`reader error without a stream code: ${readerState.error.message}`);
    }
    const open = { outgoing: writerSide.outgoingStreamCount, incoming: readerSide.activeStreamCount };
    if (open.outgoing || open.incoming) violations.push(`left open: ${JSON.stringify(open)}`);
    writerSide.destroy();
    readerSide.destroy();
    return violations;
}

describe('StreamManager under a hostile channel', () => {
    it(`keeps its guarantees across ${RUNS} seeded runs`, async () => {
        const failures = [];
        for (let seed = FIRST_SEED; seed < FIRST_SEED + RUNS; seed++) {
            const config = configFor(seed);
            const violations = await run(config);
            if (violations.length) failures.push(`seed ${seed} ${describeConfig(config)}\n    ${violations.join('\n    ')}`);
            if (failures.length >= 5) break;
        }
        expect(failures).toEqual([]);
    }, 600000);
});
