# Bounded streams — 0.1.5

These options are available in 0.1.5; 0.1.4 does not provide them. `StreamManager`, `WritableSignalStream` and `ReadableSignalStream` are explicit utilities exported from `crossbus`. Applications wire their frames to authenticated channels; the bus does not dispatch streams or apply RPC handler authorization to them automatically.

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

The base64 codec feature-detects the standard [`Uint8Array.toBase64` / `Uint8Array.fromBase64` APIs](https://github.com/tc39/proposal-arraybuffer-base64) and keeps the padded base64 alphabet. Without those methods, Node-compatible runtimes (including Bun) use the existing global `Buffer` when present, while still producing canonical padded chunks and strict decoding; other older engines use `btoa`/`atob` with tight byte loops. No package dependency or engine minimum is added. The Buffer fallback is new in unpublished 0.1.6; 0.1.5 used the btoa/atob loops in Node, see [the 0.1.6 study](OPTIMIZATION_016.md). Compatibility tests cover empty input, every byte value and non-multiple-of-three chunk boundaries against the 0.1.4 reader.

## Reader and manager budgets

`new StreamManager(sendFn, options)` accepts the following positive integer limits (except `maxOutOfOrderChunks` and `idleTimeout`, which permit zero). `sendFn(peerId, frame)` must route to the corresponding authenticated peer. Call `handleMessage(frame, boundPeerId)` using channel identity, never a peer ID from the payload.

| Option | Default | Scope |
|---|---:|---|
| `maxIncomingStreams` | 100 | Active incoming streams per manager |
| `maxIncomingStreamsPerPeer` | `maxIncomingStreams` | Active incoming streams from one peer; set it lower on hubs so one peer cannot hold every slot |
| `maxOutgoingStreams` | 100 | Active outgoing writers per manager |
| `maxControlBytes` | 65,536 | Estimated in-memory size of each non-data frame |
| `maxBufferedChunks` | 1,024 | Queued plus reordered chunks per reader |
| `maxBufferedBytes` | 8,388,608 | Binary backing storage and two bytes per UTF-16 code unit per reader |
| `maxOutOfOrderChunks` | 64 | Maximum sequence distance ahead of the next expected chunk |
| `idleTimeout` | mode-dependent | Defaults to 30,000 ms for flow readers, `0` for legacy; accepted data/consumption refreshes it |

`ReadableSignalStream` accepts the reader limits directly; its direct-construction idle default is `0`. Use one active consumer via `for await`, or `collect()` for a complete Uint8Array/string. Mixed binary/text collection rejects. Early iterator termination cancels and releases unread storage. Duplicate sequences are ignored, bounded gaps are reassembled, and a declared end waits for its missing chunks. A configured idle timeout terminates an incomplete gap. Getters `bufferedChunks` and `bufferedBytes` describe queued/reordered storage, not total process memory.

The budgets do not cap browser-internal cloning/parsing allocations, application-retained chunks or the full result allocated by `collect()`. Aggregate memory can be larger than a single reader's budget when multiple streams are active. Configure both stream-count and per-reader limits for the application.

`onStream(name, handler)` registers a receiving handler and returns identity-safe cleanup. `activeStreamCount` and `outgoingStreamCount` expose manager counts. `destroy()` clears handlers and cancels both directions. It also sends each peer an error frame, best effort, so the other side ends at once instead of at its acknowledgement or idle deadline. `closePeer(peerId, reason?)` fails the readers and writers of one peer with `ERR_STREAM_CANCELLED` and returns how many it ended; it sends nothing, because the peer is assumed gone. Overflow, invalid sequence, timeout and cancellation use Errors with codes `ERR_STREAM_OVERFLOW`, `ERR_STREAM_SEQUENCE`, `ERR_STREAM_TIMEOUT` and `ERR_STREAM_CANCELLED` respectively where generated locally. Remote errors transmit a reason string. Readers and writers both report them as `ERR_STREAM_CANCELLED` with that reason as the message, rather than preserving a remote error code; before 0.1.8 a reader received a plain Error with no code.

A manager is not owned by a bus. When its frames travel over a bus, tie the two together:

```js
const streams = new StreamManager((peerId, frame) => bus.request(peerId, 'stream', frame));
bus.handle('stream', (frame, context) => streams.handleMessage(frame, context.peerId));
bus.on('peer:disconnected', (event) => streams.closePeer(event.data.peerId));
bus.addCleanup(() => streams.destroy());
```

`peer:disconnected` fires on `removePeer()`, on an `addTransport()` cleanup and, with `goodbye: true`, when the other side leaves. A peer that disappears without notice (a terminated Worker, a removed iframe) is detected only by deadlines: `ackTimeout` for flow writers, `idleTimeout` for readers. Legacy (non-flow) readers have no idle timeout by default, so set `idleTimeout` when such a peer can vanish. Overflow, invalid sequence, timeout and cancellation use Errors with codes `ERR_STREAM_OVERFLOW`, `ERR_STREAM_SEQUENCE`, `ERR_STREAM_TIMEOUT` and `ERR_STREAM_CANCELLED` respectively where generated locally. Remote errors currently transmit a reason string and are reported as cancellation, rather than preserving a remote error code.

## Compatibility

Default `flowControl: false` and base64 frames interoperate with 0.1.4 in both directions in regression tests. The 0.1.5+ reader still imposes its budgets: legacy senders can overflow a slow receiver, so read incrementally or configure explicit limits. Native binary mode requires a compatible structured-clone receiver; it is not a JSON mode.

Flow mode uses `st: 'open-flow', flow: 1` and cumulative acknowledgements from the bound peer. A 0.1.4 manager ignores this opening and does not run its stream handler; the writer reaches its acknowledgement deadline rather than silently downgrading. Use finite acknowledgement/lifetime deadlines when peers may be incompatible. Acknowledgements with a wrong peer, unsupported version or impossible future sequence do not grant credits. This handshake does not replace application authentication.
