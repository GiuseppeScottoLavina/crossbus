// Historical Vitest configuration. Current scripts use Bun and tests/coverage-check.js.
// Vitest is not installed; these thresholds are not an active release gate.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.js'],
            exclude: ['src/**/index.js'],
            thresholds: {
                lines: 90,
                branches: 85
            }
        }
    }
});
