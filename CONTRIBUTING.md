# Contributing to CrossBus

Thank you for your interest in contributing to CrossBus! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community

## Getting Started

1. **Fork the repository** and clone your fork
2. **Install dependencies** (Node 24 and Bun for development): `npm ci --legacy-peer-deps`
3. **Build**: `bun run build` (package tests import `dist/`)
4. **Run unit and package tests**: `bun run test`
5. **Run browser tests** (needs Chrome; set `CHROME_PATH` if needed): `bun run test:e2e` and `bun run test:integration`

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full setup.

## Development Workflow

### Before Making Changes

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Ensure all existing tests pass: `bun run build && bun run test`

### Making Changes

1. Write tests first (TDD); public behavior needs meaningful assertions. The enforced source line coverage minimum is 90% (`bun run test:coverage`)
2. Follow existing code style
3. Keep changes focused and atomic
4. Update documentation if needed

### Test Requirements

- **Unit and package tests**: `bun run test` (after `bun run build`)
- **Type declarations**: `bun run test:types`
- **Browser tests**: `bun run test:e2e` and `bun run test:integration`
- **Documentation demo**: `bun run test:docs`
- **Coverage gate**: `bun run test:coverage` (line coverage, 90% minimum)
- **Full release gate**: `bun run release:check`
- All tests must pass before submitting

Bare `bun test` discovers every test directory, including browser and experimental suites; prefer the scripts above.

### Commit Guidelines

Use conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test additions/changes
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

## Pull Request Process

1. Ensure all tests pass
2. Update CHANGELOG.md if applicable
3. Update README.md if adding features
4. Submit PR with clear description
5. Request review

## Code Style

- Use ES modules
- Use JSDoc for public APIs
- No runtime dependencies
- Keep functions focused and small

## Testing Guidelines

### Unit Tests
```javascript
import { expect, test, describe } from 'bun:test';
import { CrossBus } from '../../src/core/cross-bus.js';

describe('Feature', () => {
    test('should do something', () => {
        // Arrange
        const bus = new CrossBus({ peerId: 'test' });
        
        // Act
        const result = bus.someMethod();
        
        // Assert
        expect(result).toBe(expected);
        
        // Cleanup
        bus.destroy();
    });
});
```

### E2E Tests
E2E tests use Puppeteer Core with an installed Chrome (chrome-headless-shell or Chrome for Testing is preferred; set `CHROME_PATH` to override). See existing tests in `tests/e2e/` for patterns.

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include environment details
- Include error messages

## Security

For security vulnerabilities, follow the private reporting process in [SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
