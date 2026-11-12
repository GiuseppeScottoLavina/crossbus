# CrossBus design note

CrossBus combines browser-context signals and request/response routing with optional transport and application utilities. This document is a design description, not a peer-reviewed paper or an independent comparative evaluation.

The [architecture](ARCHITECTURE.md) separates local event dispatch, RPC tracking and transport responsibilities. Native host source adapters support WKWebView and AndroidX WebView. Vector clocks and a causal orderer are available for explicitly configured distributed state processing.

The [competitor study](COMPETITOR_ANALYSIS.md) compares versioned Comlink, birpc and Penpal MessageChannel RPC paths, including real Workers. It does not measure post-robot, network servers or physical WebViews. Local emitter operations are not comparable to cross-context RPC calls. Neither independent security certification nor universal performance leadership is claimed. Historical measurements and their limits are recorded separately in [BENCHMARKS.md](BENCHMARKS.md).
