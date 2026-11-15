/**
 * @fileoverview Compression plugin for CrossBus.
 * Compresses message payloads using CompressionStream API.
 *
 * @module plugins/compression
 */

/**
 * @typedef {Object} CompressedPayload
 * @property {boolean} _compressed - Marker indicating compressed content
 * @property {string} data - Base64-encoded compressed data
 * @property {string} algorithm - Compression algorithm used
 */

/**
 * @typedef {Object} CompressionOptions
 * @property {'gzip' | 'deflate' | 'deflate-raw'} [algorithm='gzip'] - Compression algorithm
 * @property {number} [threshold=0] - Minimum payload size to compress (bytes)
 * @property {number} [maxDecompressedBytes=1048576] - Maximum decompressed size accepted
 *   by the inbound hook. Decompression stops as soon as it is exceeded.
 */

/** Formats accepted from remote compressed payloads. */
const ALGORITHMS = new Set(['gzip', 'deflate', 'deflate-raw']);
/** Default inbound decompression budget, equal to the bus default payload budget. */
const DEFAULT_MAX_DECOMPRESSED_BYTES = 1024 * 1024;

/**
 * @typedef {Object} CompressionStream
 * @property {WritableStream} writable
 * @property {ReadableStream} readable
 */

/**
 * @typedef {Object} DecompressionStream
 * @property {WritableStream} writable
 * @property {ReadableStream} readable
 */

/**
 * @typedef {'gzip' | 'deflate' | 'deflate-raw'} CompressionFormat
 */

/**
 * Compression utilities for CrossBus messages.
 * Uses native CompressionStream API for efficiency.
 *
 * @example
 * import { Compression } from 'crossbus/plugins/compression';
 *
 * // Use with CrossBus hooks
 * const { compressHook, decompressHook } = Compression.createCompressedHooks();
 * bus.addOutboundHook(compressHook);
 * bus.addInboundHook(decompressHook);
 *
 * // Now large messages are automatically compressed!
 */
export class Compression {
    static DEFAULT_ALGORITHM = 'gzip';

    /**
     * Checks if CompressionStream API is supported.
     *
     * @returns {boolean}
     */
    static isSupported() {
        return typeof CompressionStream !== 'undefined' &&
            typeof DecompressionStream !== 'undefined';
    }

    /**
     * Estimates the size of a payload in bytes.
     *
     * @param {any} payload - Payload to estimate
     * @returns {number} Estimated size in bytes
     */
    static estimateSize(payload) {
        const json = JSON.stringify(payload);
        return new TextEncoder().encode(json).length;
    }

    /**
     * Compresses a payload.
     *
     * @param {any} payload - Data to compress (will be JSON serialized)
     * @param {CompressionOptions} [options={}] - Compression options
     * @returns {Promise<CompressedPayload>} Compressed payload
     */
    static async compress(payload, options = {}) {
        const algorithm = options.algorithm ?? this.DEFAULT_ALGORITHM;

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(payload));

        // Create compression stream
        // @ts-ignore - Types not yet in all TS libs
        const cs = new CompressionStream(/** @type {any} */(algorithm));
        const writer = cs.writable.getWriter();
        const reader = cs.readable.getReader();

        // Write data
        writer.write(data);
        writer.close();

        // Read compressed chunks
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks
        const compressed = new Uint8Array(
            chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        );
        let offset = 0;
        for (const chunk of chunks) {
            compressed.set(chunk, offset);
            offset += chunk.length;
        }

        return {
            _compressed: true,
            data: this.#arrayBufferToBase64(compressed.buffer),
            algorithm
        };
    }

    /**
     * Decompresses a compressed payload.
     *
     * @param {CompressedPayload} compressed - Compressed payload
     * @param {Object} [options={}]
     * @param {number} [options.maxBytes=1048576] - Maximum decompressed bytes; reading
     *   stops and the payload is rejected once it is exceeded
     * @returns {Promise<any>} Decompressed payload
     */
    static async decompress(compressed, options = {}) {
        const algorithm = compressed?.algorithm ?? this.DEFAULT_ALGORITHM;
        if (!ALGORITHMS.has(algorithm) || typeof compressed?.data !== 'string') {
            throw Object.assign(new Error('Unsupported compressed payload'), { code: 'ERR_INVALID_PAYLOAD' });
        }
        const maxBytes = options.maxBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
        if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
            throw new RangeError('maxDecompressedBytes must be a nonnegative safe integer or Infinity');
        }
        const data = this.#base64ToArrayBuffer(compressed.data);

        // Create decompression stream
        // @ts-ignore - Types not yet in all TS libs
        const ds = new DecompressionStream(/** @type {any} */(algorithm));
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();

        // Write compressed data; failures surface through the reader.
        writer.write(new Uint8Array(data)).catch(() => {});
        writer.close().catch(() => {});

        // Read decompressed chunks within the budget
        const chunks = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                throw Object.assign(new Error(`Decompressed payload exceeds ${maxBytes} bytes`), { code: 'ERR_PAYLOAD_TOO_LARGE' });
            }
            chunks.push(value);
        }

        // Combine chunks
        const decompressed = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            decompressed.set(chunk, offset);
            offset += chunk.length;
        }

        const decoder = new TextDecoder();
        return JSON.parse(decoder.decode(decompressed));
    }

    /**
     * Creates hook functions for automatic compression/decompression.
     *
     * @param {CompressionOptions} [options={}] - Compression options
     * @returns {{ compressHook: import('../core/cross-bus.js').MessageHook, decompressHook: import('../core/cross-bus.js').MessageHook }}
     *
     * @example
     * const { compressHook, decompressHook } = Compression.createCompressedHooks({
     *   algorithm: 'gzip',
     *   threshold: 1024 // Only compress payloads > 1KB
     * });
     * bus.addOutboundHook(compressHook);
     * bus.addInboundHook(decompressHook);
     */
    static createCompressedHooks(options = {}) {
        const { threshold = 0, algorithm = this.DEFAULT_ALGORITHM, maxDecompressedBytes = DEFAULT_MAX_DECOMPRESSED_BYTES } = options;

        return {
            compressHook: async (payload, context) => {
                // Skip if already compressed
                if (payload && payload._compressed) return payload;

                // Skip if below threshold
                if (threshold > 0 && this.estimateSize(payload) < threshold) {
                    return payload;
                }

                return await this.compress(payload, { algorithm: /** @type {CompressionFormat} */(algorithm) });
            },

            decompressHook: async (payload, context) => {
                // Skip if not compressed
                if (!payload || !payload._compressed) return payload;
                return await this.decompress(payload, { maxBytes: maxDecompressedBytes });
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────

    static #arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    static #base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

/**
 * Helper to add compression to a CrossBus instance.
 *
 * @param {import("../core/cross-bus.js").CrossBus} bus - CrossBus instance
 * @param {CompressionOptions} [options={}] - Compression options
 * @returns {import("../core/cross-bus.js").CrossBus} Same bus with compression hooks installed
 *
 * @example
 * withCompression(bus, { threshold: 1024 });
 * // Large messages now compressed automatically
 */
export function withCompression(bus, options = {}) {
    const { compressHook, decompressHook } = Compression.createCompressedHooks(options);
    bus.addOutboundHook(compressHook);
    bus.addInboundHook(decompressHook);
    return bus;
}
