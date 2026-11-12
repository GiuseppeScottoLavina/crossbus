# Contributing to CrossBus

Thank you for considering contributing to CrossBus!

> ⚠️ **Before contributing, read [DEVELOPMENT.md](./DEVELOPMENT.md)** - Mandatory rules.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/giuseppescottolavina/crossbus.git
cd crossbus

# Install dependencies
npm install

# Build and run source/package tests
bun run build
bun test

# Build
npm run build
```

## Project Structure

```
src/
├── common/          # Shared code (types, errors, utils)
├── core/            # Core modules
├── plugins/         # Optional plugins
└── index.js         # Entry point

tests/
├── unit/            # Unit tests (Bun)
└── integration/     # Browser tests
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
4. Ensure all tests pass (`npm test`)
5. Update documentation if needed
6. Submit PR with clear description

## Testing

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Browser tests
npm run test:browser
```

## Building

```bash
# Development build
npm run build

# Watch mode
npm run build:watch
```

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
