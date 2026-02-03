# Contributing to CrossBus

Thank you for your interest in contributing to CrossBus! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community

## Getting Started

1. **Fork the repository** and clone your fork
2. **Install dependencies**: `npm install`
3. **Run tests**: `bun test`
4. **Run E2E tests**: `bun test tests/e2e/`

## Development Workflow

### Before Making Changes

1. Create a new branch: `git checkout -b feature/your-feature-name`
2. Ensure all existing tests pass: `bun test`

### Making Changes

1. Write tests first (TDD) - target ≥97% coverage
2. Follow existing code style
3. Keep changes focused and atomic
4. Update documentation if needed

### Test Requirements

- **Unit tests**: Run with `bun test tests/unit/`
- **E2E tests**: Run with `bun test tests/e2e/`
- **Coverage**: Check with `bun test --coverage`
- All tests must pass before submitting

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
E2E tests use Puppeteer with chrome-headless-shell. See existing tests in `tests/e2e/` for patterns.

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include environment details
- Include error messages

## Security

For security vulnerabilities, please email the maintainer directly rather than opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
