# Examples

- [Runnable iframe demo](../examples/quickstart/README.md): one Node command starts both local origins with complete HTML and import maps.
- [Getting started](GETTING_STARTED.md): a working MessageChannel request/response pair and iframe setup references.
- [Integration patterns](ADVANCED.md): explicit hub forwarding, group signals and retry.
- [Native WebView adapters](../native/README.md): Swift WKWebView and Java AndroidX integration.
- [Agent guide](AGENTS.md): optional modules, trust boundaries and test requirements.
- [Executable package checks](../tests/package/exports.test.js): ESM, CommonJS and minified RPC.
- [Plugin integration checks](../tests/unit/plugin-integration.test.js): batching, presence and validation on real channels.

Files under `examples/patterns/` and `examples/templates/` are application scaffolds. They require their HTML, workers, model backends and application handlers; they are not standalone deployable integrations. Use the verified examples above as the API reference.
