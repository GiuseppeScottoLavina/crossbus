/**
 * @fileoverview TDD tests for Compression plugin.
 * Uses CompressionStream/DecompressionStream (Web Streams API).
 */

import { describe, it, expect, beforeAll } from 'bun:test';

describe('Compression Plugin', () => {
    let Compression;

    beforeAll(async () => {
        const module = await import('../../src/plugins/compression.js');
        Compression = module.Compression;
    });

    describe('compress() / decompress()', () => {
        it('should compress and decompress a string payload', async () => {
            const original = 'Hello, World! '.repeat(100);

            const compressed = await Compression.compress(original);
            expect(compressed._compressed).toBe(true);
            expect(compressed.data).toBeDefined();
            expect(compressed.algorithm).toBe('gzip');

            const decompressed = await Compression.decompress(compressed);
            expect(decompressed).toBe(original);
        });

        it('should compress and decompress an object payload', async () => {
            const original = {
                users: Array(50).fill({ name: 'Test User', email: 'test@example.com' })
            };

            const compressed = await Compression.compress(original);
            const decompressed = await Compression.decompress(compressed);

            expect(decompressed).toEqual(original);
        });

        it('should achieve compression ratio for repetitive data', async () => {
            const original = 'AAAAAAAAAA'.repeat(1000); // 10KB of As

            const compressed = await Compression.compress(original);

            // Compressed should be much smaller
            expect(compressed.data.length).toBeLessThan(original.length / 2);
        });

        it('should handle empty payload', async () => {
            const original = '';

            const compressed = await Compression.compress(original);
            const decompressed = await Compression.decompress(compressed);

            expect(decompressed).toBe(original);
        });

        it('should support deflate algorithm', async () => {
            const original = 'Test data for deflate';

            const compressed = await Compression.compress(original, { algorithm: 'deflate' });
            expect(compressed.algorithm).toBe('deflate');

            const decompressed = await Compression.decompress(compressed);
            expect(decompressed).toBe(original);
        });
    });

    describe('createCompressedHooks()', () => {
        it('should return compress and decompress hook functions', () => {
            const { compressHook, decompressHook } = Compression.createCompressedHooks();

            expect(typeof compressHook).toBe('function');
            expect(typeof decompressHook).toBe('function');
        });

        it('should compress on outbound and decompress on inbound', async () => {
            const { compressHook, decompressHook } = Compression.createCompressedHooks();

            const original = { data: 'test payload '.repeat(100) };

            // Compress (outbound)
            const compressed = await compressHook(original, { direction: 'outbound' });
            expect(compressed._compressed).toBe(true);

            // Decompress (inbound)
            const decompressed = await decompressHook(compressed, { direction: 'inbound' });
            expect(decompressed).toEqual(original);
        });

        it('should skip compression for small payloads with threshold', async () => {
            const { compressHook } = Compression.createCompressedHooks({
                threshold: 1024 // Only compress if > 1KB
            });

            const small = { data: 'tiny' };
            const result = await compressHook(small, {});

            // Should not compress small data
            expect(result._compressed).toBeUndefined();
            expect(result).toEqual(small);
        });
    });

    describe('isSupported()', () => {
        it('should return true if CompressionStream is available', () => {
            // CompressionStream is available in Bun
            expect(Compression.isSupported()).toBe(true);
        });
    });

    describe('estimateSize()', () => {
        it('should estimate JSON payload size', () => {
            const payload = { data: 'test' };
            const size = Compression.estimateSize(payload);

            expect(size).toBeGreaterThan(0);
            expect(typeof size).toBe('number');
        });
    });
});
