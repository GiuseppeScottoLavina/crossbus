/**
 * @fileoverview Rollup configuration for CrossBus with maximum compression.
 */

import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const banner = `/** CrossBus v${pkg.version} | MIT */`;

// Terser configuration - AGGRESSIVE compression for 2026 SOTA
// NOTE: Do NOT use toplevel:true - it mangles exports and breaks public API!
const terserConfig = terser({
    ecma: 2024,  // Target latest ES features (smaller syntax)
    module: true,
    // toplevel: false (default) - preserve public exports!
    compress: {
        passes: 3,           // More passes = smaller (diminishing returns after 3)
        pure_getters: true,
        drop_console: true,  // Remove console.* in production
        drop_debugger: true,
        dead_code: true,
        unused: true,
        conditionals: true,
        comparisons: true,
        booleans: true,
        loops: true,
        join_vars: true,
        reduce_vars: true,
        collapse_vars: true,
        inline: true,
        evaluate: true,
        hoist_funs: true,
        hoist_props: true,
        properties: true,
        sequences: true,
        side_effects: true,  // Trust sideEffects: false
        arrows: true,        // ES6+ arrow function optimizations
        keep_fargs: false,   // Remove unused function args
        unsafe_arrows: true,
        unsafe_methods: true,
        ecma: 2024
    },
    mangle: {
        // toplevel: false (default) - preserve exported names!
        properties: {
            regex: /^[_#]/   // Only mangle private # and _ prefixed
        }
    },
    format: {
        comments: /^!|@license|@preserve/,  // Keep license/banner comments
        ecma: 2024,
        wrap_iife: false,
        wrap_func_args: false
    }
});

// Main bundle
const mainConfig = {
    input: 'src/index.js',
    output: [
        {
            file: 'dist/crossbus.js',
            format: 'es',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/crossbus.cjs',
            format: 'cjs',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/crossbus.min.js',
            format: 'es',
            banner,
            sourcemap: true,
            plugins: [terserConfig]
        }
    ],
    plugins: [
        visualizer({
            filename: 'docs/bundle-stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap'
        })
    ]
};

// Core-only bundle with minified version
const coreConfig = {
    input: 'src/core/cross-bus.js',
    output: [
        {
            file: 'dist/crossbus.core.js',
            format: 'es',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/crossbus.core.min.js',
            format: 'es',
            banner,
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Retry plugin with minified version
const retryConfig = {
    input: 'src/plugins/retry.js',
    output: [
        {
            file: 'dist/plugins/retry.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/retry.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Circuit breaker plugin with minified version
const circuitBreakerConfig = {
    input: 'src/plugins/circuit-breaker.js',
    output: [
        {
            file: 'dist/plugins/circuit-breaker.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/circuit-breaker.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Encryption plugin
const encryptionConfig = {
    input: 'src/plugins/encryption.js',
    output: [
        {
            file: 'dist/plugins/encryption.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/encryption.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Rate Limiter plugin
const rateLimiterConfig = {
    input: 'src/plugins/rate-limiter.js',
    output: [
        {
            file: 'dist/plugins/rate-limiter.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/rate-limiter.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Compression plugin
const compressionConfig = {
    input: 'src/plugins/compression.js',
    output: [
        {
            file: 'dist/plugins/compression.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/compression.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Batch plugin
const batchConfig = {
    input: 'src/plugins/batch.js',
    output: [
        {
            file: 'dist/plugins/batch.js',
            format: 'es',
            sourcemap: true
        },
        {
            file: 'dist/plugins/batch.min.js',
            format: 'es',
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Nano bundle
const nanoConfig = {
    input: 'src/nano.js',
    output: [
        {
            file: 'dist/nano.js',
            format: 'es',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/nano.min.js',
            format: 'es',
            banner,
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Enterprise bundle (tracing, metrics, backpressure, versioning)
const enterpriseConfig = {
    input: 'src/enterprise/index.js',
    output: [
        {
            file: 'dist/enterprise.js',
            format: 'es',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/enterprise.min.js',
            format: 'es',
            banner,
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

// Testing utilities bundle
const testingConfig = {
    input: 'src/testing/index.js',
    output: [
        {
            file: 'dist/testing.js',
            format: 'es',
            banner,
            sourcemap: true
        },
        {
            file: 'dist/testing.min.js',
            format: 'es',
            banner,
            sourcemap: true,
            plugins: [terserConfig]
        }
    ]
};

export default [
    mainConfig,
    coreConfig,
    retryConfig,
    circuitBreakerConfig,
    encryptionConfig,
    rateLimiterConfig,
    compressionConfig,
    batchConfig,
    nanoConfig,
    enterpriseConfig,
    testingConfig
];
