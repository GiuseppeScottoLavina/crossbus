# Bounded streams — 0.1.5 candidate

These options belong to the unreleased 0.1.5 checkout, not npm 0.1.4. `StreamManager`, `WritableSignalStream` and `ReadableSignalStream` are explicit utilities exported from `crossbus`. Applications wire their frames to authenticated channels; the bus does not dispatch streams or apply RPC handler authorization to them automatically.

## Connect both endpoints

After building this checkout, run the complete [MessageChannel example](../examples/quickstart/stream.mjs):

```sh
bun run build
node examples/quickstart/stream.mjs
```

It creates both transports and managers, registers the receiving handler, writes binary chunks with flow control, verifies every received byte and closes both endpoints. The receiver starts reading in its handler; waiting for `writer.end()` before starting the reader would exhaust credits and stall until the acknowledgement deadline.

## Writer options

`manager.createStream(name, peerId, options)` returns a writer with `open(meta?)`, `write(data)`, `end(meta?)`, `abort(reason?)`, `streamId`, `name` and `ended`.

| Option | Default | Meaning |
|---|---:|---|
| `chunkSize` | 64,000 | Positive safe integer; raw binary bytes or UTF-16 code units per text chunk |
| `flowControl` | `false` | Require a version-1 receiver handshake and consumption acknowledgements |
| `windowSize` | 16 | Maximum sent but unconsumed chunks in flow mode |
| `ackTimeout` | 30,000 ms | Maximum wait without valid acknowledgement progress; `0` disables |
| `timeout` | `0` | Total lifetime from opening; `0` disables |
| `signal` | unset | AbortSignal; an already aborted signal rejects creation |
| `binaryEncoding` | `'base64'` | `'native'` sends owned Uint8Array chunks over structured clone |
| `meta` | unset | Opening metadata |
| `onClose` | unset | Called with an Error or `null` on terminal completion |

Concurrent writes and `end()` execute in registration order. Once end is requested, new writes reject. `end()` in flow mode waits for the receiver to pull all chunks and acknowledge the end; it does not acknowledge completion of application processing, storage or a transaction. Lifetime cancellation also settles a writer whose application send function never resolves. Peer notification is best effort after local cancellation.

Binary chunks are encoded independently, including empty binary input. Strings are sliced by UTF-16 code units; objects are JSON-serialized as a single text chunk and are not split by `chunkSize`. Mutating input before `write()` resolves is unsupported. Native binary mode allocates exact owned chunk slices so the original caller buffer remains attached; an application can transfer those internal buffers. It is not a zero-copy guarantee. JSON native/WebSocket bridges require base64 or another application encoding.

The base64 codec feature-detects the standard [`Uint8Array.toBase64` / `Uint8Array.fromBase64` APIs](https://github.com/tc39/proposal-arraybuffer-base64) and keeps the padded base64 alphabet. Older engines use `btoa`/`atob` with tight byte loops; no Node Buffer dependency or engine minimum is added. Compatibility tests cover empty input, every byte value and non-multiple-of-three chunk boundaries against the 0.1.4 reader.

## Reader and manager budgets

`new StreamManager(sendFn, options)` accepts the following positive integer limits (except `maxOutOfOrderChunks` and `idleTimeout`, which permit zero). `sendFn(peerId, frame)` must route to the corresponding authenticated peer. Call `handleMessage(frame, boundPeerId)` using channel identity, never a peer ID from the payload.

| Option | Default | Scope |
|---|---:|---|
| `maxIncomingStreams` | 100 | Active incoming streams per manager |
| `maxOutgoingStreams` | 100 | Active outgoing writers per manager |
| `maxControlBytes` | 65,536 | Estimated in-memory size of each non-data frame |
| `maxBufferedChunks` | 1,024 | Queued plus reordered chunks per reader |
| `maxBufferedBytes` | 8,388,608 | Binary backing storage and two bytes per UTF-16 code unit per reader |
| `maxOutOfOrderChunks` | 64 | Maximum sequence distance ahead of the next expected chunk |
| `idleTimeout` | mode-dependent | Defaults to 30,000 ms for flow readers, `0` for legacy; accepted data/consumption refreshes it |

`ReadableSignalStream` accepts the reader limits directly; its direct-construction idle default is `0`. Use one active consumer via `for await`, or `collect()` for a complete Uint8Array/string. Mixed binary/text collection rejects. Early iterator termination cancels and releases unread storage. Duplicate sequences are ignored, bounded gaps are reassembled, and a declared end waits for its missing chunks. A configured idle timeout terminates an incomplete gap. Getters `bufferedChunks` and `bufferedBytes` describe queued/reordered storage, not total process memory.

The budgets do not cap browser-internal cloning/parsing allocations, application-retained chunks or the full result allocated by `collect()`. Aggregate memory can be larger than a single reader's budget when multiple streams are active. Configure both stream-count and per-reader limits for the application.

`onStream(name, handler)` registers a receiving handler and returns identity-safe cleanup. `activeStreamCount` and `outgoingStreamCount` expose manager counts. `destroy()` clears handlers and cancels both directions. Overflow, invalid sequence, timeout and cancellation use Errors with codes `ERR_STREAM_OVERFLOW`, `ERR_STREAM_SEQUENCE`, `ERR_STREAM_TIMEOUT` and `ERR_STREAM_CANCELLED` respectively where generated locally. Remote errors currently transmit a reason string and are reported as cancellation, rather than preserving a remote error code.

## Compatibility

Default `flowControl: false` and base64 frames interoperate with 0.1.4 in both directions in regression tests. The candidate still imposes its reader budgets: legacy senders can overflow a slow receiver, so read incrementally or configure explicit limits. Native binary mode requires a compatible structured-clone receiver; it is not a JSON mode.

Flow mode uses `st: 'open-flow', flow: 1` and cumulative acknowledgements from the bound peer. A 0.1.4 manager ignores this opening and does not run its stream handler; the writer reaches its acknowledgement deadline rather than silently downgrading. Use finite acknowledgement/lifetime deadlines when peers may be incompatible. Acknowledgements with a wrong peer, unsupported version or impossible future sequence do not grant credits. This handshake does not replace application authentication.
