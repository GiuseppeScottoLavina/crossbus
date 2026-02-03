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
 */

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
class Compression {
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
     * @returns {Promise<any>} Decompressed payload
     */
    static async decompress(compressed) {
        const algorithm = compressed.algorithm ?? this.DEFAULT_ALGORITHM;
        const data = this.#base64ToArrayBuffer(compressed.data);

        // Create decompression stream
        // @ts-ignore - Types not yet in all TS libs
        const ds = new DecompressionStream(/** @type {any} */(algorithm));
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();

        // Write compressed data
        writer.write(new Uint8Array(data));
        writer.close();

        // Read decompressed chunks
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks
        const decompressed = new Uint8Array(
            chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        );
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
        const { threshold = 0, algorithm = this.DEFAULT_ALGORITHM } = options;

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
                return await this.decompress(payload);
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
function withCompression(bus, options = {}) {
    const { compressHook, decompressHook } = Compression.createCompressedHooks(options);
    bus.addOutboundHook(compressHook);
    bus.addInboundHook(decompressHook);
    return bus;
}

export { Compression, withCompression };
//# sourceMappingURL=compression.js.map
