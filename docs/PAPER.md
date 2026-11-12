# CrossBus design note

CrossBus combines browser-context signals and request/response routing with optional transport and application utilities. This document is a design description, not a peer-reviewed paper or an independent comparative evaluation.

The [architecture](ARCHITECTURE.md) separates local event dispatch, RPC tracking and transport responsibilities. Native host source adapters support WKWebView and AndroidX WebView. Vector clocks and a causal orderer are available for explicitly configured distributed state processing.

No versioned end-to-end comparison against Comlink, Penpal or post-robot has been established here. Local emitter operations are not comparable to cross-context RPC calls. Neither independent security certification nor universal performance leadership is claimed. Reproducible local measurements and their limits are recorded in [BENCHMARKS.md](BENCHMARKS.md).
