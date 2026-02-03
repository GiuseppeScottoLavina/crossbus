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
export function withCompression(bus: import("../core/cross-bus.js").CrossBus, options?: CompressionOptions): import("../core/cross-bus.js").CrossBus;
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
export class Compression {
    static DEFAULT_ALGORITHM: string;
    /**
     * Checks if CompressionStream API is supported.
     *
     * @returns {boolean}
     */
    static isSupported(): boolean;
    /**
     * Estimates the size of a payload in bytes.
     *
     * @param {any} payload - Payload to estimate
     * @returns {number} Estimated size in bytes
     */
    static estimateSize(payload: any): number;
    /**
     * Compresses a payload.
     *
     * @param {any} payload - Data to compress (will be JSON serialized)
     * @param {CompressionOptions} [options={}] - Compression options
     * @returns {Promise<CompressedPayload>} Compressed payload
     */
    static compress(payload: any, options?: CompressionOptions): Promise<CompressedPayload>;
    /**
     * Decompresses a compressed payload.
     *
     * @param {CompressedPayload} compressed - Compressed payload
     * @returns {Promise<any>} Decompressed payload
     */
    static decompress(compressed: CompressedPayload): Promise<any>;
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
    static createCompressedHooks(options?: CompressionOptions): {
        compressHook: import("../core/cross-bus.js").MessageHook;
        decompressHook: import("../core/cross-bus.js").MessageHook;
    };
    static "__#private@#arrayBufferToBase64"(buffer: any): string;
    static "__#private@#base64ToArrayBuffer"(base64: any): ArrayBuffer;
}
export type CompressedPayload = {
    /**
     * - Marker indicating compressed content
     */
    _compressed: boolean;
    /**
     * - Base64-encoded compressed data
     */
    data: string;
    /**
     * - Compression algorithm used
     */
    algorithm: string;
};
export type CompressionOptions = {
    /**
     * - Compression algorithm
     */
    algorithm?: "gzip" | "deflate" | "deflate-raw" | undefined;
    /**
     * - Minimum payload size to compress (bytes)
     */
    threshold?: number | undefined;
};
export type CompressionStream = {
    writable: WritableStream;
    readable: ReadableStream;
};
export type DecompressionStream = {
    writable: WritableStream;
    readable: ReadableStream;
};
export type CompressionFormat = "gzip" | "deflate" | "deflate-raw";
