// One-way binary delivery over real ports; receiver checks every byte.
export async function runStreams(artifact, variant, order = 0) {
    const lib = await import(artifact);
    const samples = 7,
        iterations = 4,
        warmup = 2,
        chunkSize = 64000;
    const modes =
        variant === 'baseline'
            ? ['base64']
            : ['base64', 'native', 'native-flow', 'native-flow-transfer'];
    const results = [];
    for (const bytes of [1048576, 4194304]) {
        const input = Uint8Array.from({ length: bytes }, (_, i) => (i * 13) & 255);
        const { port1, port2 } = new MessageChannel();
        let counts,
            resolveDone,
            rejectDone,
            transfer = false,
            calls = 0;
        const post = (port, frame) => {
            counts[frame.st] = (counts[frame.st] ?? 0) + 1;
            port.postMessage(
                frame,
                transfer && frame.d instanceof Uint8Array ? [frame.d.buffer] : []
            );
        };
        const sender = new lib.StreamManager((_peer, frame) => post(port1, frame));
        const receiver = new lib.StreamManager((_peer, frame) => post(port2, frame));
        port1.onmessage = ({ data }) => sender.handleMessage(data, 'receiver');
        port2.onmessage = ({ data }) => receiver.handleMessage(data, 'sender');
        receiver.onStream('bytes', async (stream) => {
            try {
                calls++;
                const value = await stream.collect();
                if (!(value instanceof Uint8Array) || value.length !== bytes)
                    throw Error('Incorrect received size/type');
                let checksum = 0;
                for (let i = 0; i < value.length; i++) {
                    if (value[i] !== ((i * 13) & 255)) throw Error('Incorrect received byte ' + i);
                    checksum += value[i];
                }
                resolveDone(checksum);
            } catch (error) {
                rejectDone(error);
                throw error;
            }
        });
        const cases = modes.map((mode) => ({
            mode,
            rates: [],
            checksums: [],
            frames: [],
            checkedTransfers: 0
        }));
        const run = async (item, count) => {
            transfer = item.mode === 'native-flow-transfer';
            const flow = item.mode.includes('flow'),
                native = item.mode !== 'base64';
            let checksum = 0;
            const before = calls;
            const tick = performance.now();
            for (let i = 0; i < count; i++) {
                counts = {};
                let timer;
                const done = new Promise((resolve, reject) => {
                    resolveDone = resolve;
                    rejectDone = reject;
                    timer = setTimeout(() => reject(Error('Stream did not complete')), 30000);
                });
                done.catch(() => {});
                try {
                    const writer = sender.createStream('bytes', 'receiver', {
                        chunkSize,
                        binaryEncoding: native ? 'native' : 'base64',
                        flowControl: flow,
                        windowSize: 16,
                        ackTimeout: 30000
                    });
                    await writer.write(input);
                    await writer.end();
                    checksum += await done;
                    const chunks = Math.ceil(bytes / chunkSize);
                    if (
                        counts.open !== (flow ? undefined : 1) ||
                        counts['open-flow'] !== (flow ? 1 : undefined) ||
                        counts.data !== chunks ||
                        counts.end !== 1 ||
                        (counts.ack ?? 0) !== (flow ? chunks + 2 : 0) ||
                        counts.error
                    )
                        throw Error('Incorrect stream frame ledger ' + JSON.stringify(counts));
                    item.frames.push({ ...counts });
                } finally {
                    clearTimeout(timer);
                }
            }
            const elapsedMs = performance.now() - tick;
            if (calls - before !== count || input.buffer.byteLength !== bytes)
                throw Error('Incorrect invocation/ownership ledger');
            for (let i = 0; i < input.length; i++)
                if (input[i] !== ((i * 13) & 255)) throw Error('Original input changed');
            item.checkedTransfers += count;
            item.checksums.push(checksum);
            return (bytes * count) / 1048576 / (elapsedMs / 1000);
        };
        try {
            for (const item of cases) await run(item, warmup);
            for (let round = 0; round < samples; round++)
                for (let offset = 0; offset < cases.length; offset++) {
                    const item = cases[(round + offset + order) % cases.length];
                    item.rates.push(await run(item, iterations));
                }
            for (const item of cases) {
                const sorted = [...item.rates].sort((a, b) => a - b);
                results.push({
                    bytes,
                    mode: item.mode,
                    checkedTransfers: item.checkedTransfers,
                    checksums: item.checksums,
                    frames: item.frames,
                    mebibytesPerSecond: {
                        median: sorted[sorted.length >> 1],
                        min: sorted[0],
                        max: sorted.at(-1),
                        samples: item.rates
                    }
                });
            }
        } finally {
            sender.destroy();
            receiver.destroy();
            port1.close();
            port2.close();
        }
    }
    return {
        methodology: {
            samples,
            iterations,
            warmup,
            chunkSize,
            order,
            topology:
                'Raw MessageChannel, two endpoints in one event loop; no Worker/network/native host',
            scope: 'Timed writer creation/open/data/end, receiver collection and full byte verification; ports/managers/input setup excluded. Caller input stays attached. Native modes change representation; flow modes add consumption ACKs.',
            nativeBase64Encode: typeof Uint8Array.prototype.toBase64 === 'function',
            nativeBase64Decode: typeof Uint8Array.fromBase64 === 'function'
        },
        results
    };
}
