# AI assistant integration guide

Use the [agent guide](AGENTS.md), [getting started example](GETTING_STARTED.md) and [API reference](API.md). Import core first and dynamically load optional features. Each agent context needs a trusted transport binding to its peer; CrossBus supplies messaging, not LLM inference or a bundled integration with an AI framework.

A planner/executor pattern can register handlers such as `plan:create`, `task:execute` and `tool:describe` on separate buses. The orchestrator calls known peer IDs with `request(peerId, handlerName, payload)`. It can aggregate responses with `broadcastRequest()`. Applications own tool schemas, model calls, authorization and cancellation policy.

Remote signals arrive in `event.data.payload`, and their bound peer ID is `event.data.source`. Never infer authorization from an agent ID in the payload. Validate tool calls in a handler or an inbound hook. Hook rejection stops processing; tests must prove the protected operation was not invoked.

`createSecure()` requires explicit origins and rejects wildcard patterns. Add matching origin/source checks to the chosen transport. Native host source integrations are documented in [native/README.md](../native/README.md). Performance claims must cite the runtime, workload and artifacts from [BENCHMARKS.md](BENCHMARKS.md).
