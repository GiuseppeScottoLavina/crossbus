# Contributing to CrossBus

Thank you for considering contributing to CrossBus!

> ⚠️ **Before contributing, read [DEVELOPMENT.md](./DEVELOPMENT.md)** - Mandatory rules.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/giuseppescottolavina/crossbus.git
cd crossbus

# Install dependencies (Node 24 and Bun for development)
npm ci --legacy-peer-deps

# Build, then run unit and package tests
bun run build
bun run test
```

## Project Structure

```
src/
├── common/          # Shared code (types, errors, utils)
├── core/            # Bus, event emitter, streams, presence
├── router/          # Peer routing
├── transports/      # PostMessage, MessageChannel, workers, WebSocket, native
├── security/        # Origin validation and handshake utilities
├── ordering/        # Vector clocks and causal ordering utilities
├── plugins/         # Optional plugins (crossbus/plugins/*)
├── enterprise/      # crossbus/enterprise
├── testing/         # crossbus/testing
├── nano.js          # crossbus/nano
└── index.js         # Entry point

tests/
├── unit/            # Unit tests (Bun)
├── package/         # Packaged export and declaration checks
├── e2e/             # Chrome end-to-end tests
├── integration/     # Chrome integration tests
├── docs/            # Executable documentation checks
├── experiments/     # Repository-only prototypes
└── native/          # Swift/Java adapter build checks
```

## Coding Standards

- **Pure JavaScript** - No TypeScript source, JSDoc for types
- **ES2022+** - Use modern features (private fields, etc.)
- **No dependencies** - Core must be dependency-free
- **Behavior coverage** - Public APIs require meaningful assertions; report measured coverage with its runner and scope.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add retry plugin
fix: resolve ACK timeout race condition
docs: update API reference
test: add broadcast coverage
refactor: simplify router logic
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`bun run build && bun run test`, plus browser suites)
5. Update documentation if needed
6. Submit PR with clear description

## Testing

```bash
# Unit and package tests (after bun run build)
bun run test

# Type declarations
bun run test:types

# Line coverage gate (90% minimum)
bun run test:coverage

# Browser tests (Chrome; set CHROME_PATH if needed)
bun run test:e2e
bun run test:integration
```

## Building

```bash
# Production build (cleans dist/, emits declarations and bundles)
bun run build

# Watch mode (Rollup only)
bun run build:watch
```

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
