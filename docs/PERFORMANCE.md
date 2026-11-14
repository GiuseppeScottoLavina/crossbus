# Performance engineering

The synchronous local emitters avoid allocating event metadata on each dispatch. `emitSync()` caches callbacks, and nano/fast emitters store callback arrays in dictionaries without prototypes. This separates a small raw-callback API from `emit()`'s event envelopes, wildcards and scheduling.

These are implementation choices, not universal claims that object lookups beat Maps, loop unrolling helps every engine or that CrossBus is fastest. Registration/removal costs, duplicated cache storage, mutation behavior and safety checks must be included when choosing a path. Always preserve once semantics, cleanup and validation while optimizing.

The current benchmark uses observable callbacks, exact listener counts, calibrated batches and rotating library order over repeated samples. It measures both local dispatch and actual MessageChannel round trips, in separate groups. The 10 KiB local workload passes a reference; it does not measure copying the payload.

See [BENCHMARKS.md](BENCHMARKS.md) for commands and artifacts. Old single-run comparisons used inconsistent listener counts, empty callbacks or omitted awaited work. They are retained only as historical experiments and are not evidence for current performance claims.

Current RPC optimization removes duplicate tracking tables and timeout Promise wrappers. The no-hook path retains payload validation and bound-peer response checks while avoiding unnecessary asynchronous transformations. The payload walker preserves its byte-accounting rules and cycle checks while avoiding a per-call closure/key array. Marked protocol messages pass through synchronous transports without an extra shallow copy.

`bench:paired` compares preserved pre-change and candidate bundles in alternating order. For primary comparisons, run `--paired --variant baseline` and `--paired --variant candidate` separately in fresh processes: unchanged-code controls demonstrate that JIT specialization can move synthetic emitter results even when source bytes match. Report measured ranges rather than universal speed or a supposed theoretical maximum. `bench:rpc` compares real MessageChannel echo calls with Comlink, including cached proxy methods; API/guarantee differences and the same-event-loop topology are recorded.

The [0.1.3 competitor study](COMPETITOR_ANALYSIS.md) adds source-reviewed birpc/Penpal comparisons, optional compact MessageChannel encoding and real Worker measurements. Its frozen bundles and process-pair ratios are separate from the historical benchmark snapshot.

The [0.1.5 comparison](NEXT_RELEASE.md) adds shared default RPC timeout scheduling and a separate one-way binary study. The standard typed-array base64 path improves the tested Bun/Chrome stream cases; Node's fallback has a small regression, and optional native binary modes change representation. Keep these results separate from RPC ratios, local emitter throughput and [functional physical-device qualification](QUALIFICATION.md). The report includes complete ranges, unchanged RPC controls and increased bundle size.
