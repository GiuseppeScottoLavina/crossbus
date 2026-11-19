/**
 * @fileoverview Serialization abstraction layer for CrossBus.
 * Uses JSON serialization for maximum compatibility.
 * @module common/serialization
 */
export type Serializer = {
    /**
     * - MIME type of the serialization format.
     */
    contentType: string;
    /**
     * - Encodes data.
     */
    serialize: (data: any) => string;
    /**
     * - Decodes data.
     */
    deserialize: (data: string) => any;
};
/**
 * @typedef {Object} Serializer
 * @property {string} contentType - MIME type of the serialization format.
 * @property {(data: any) => string} serialize - Encodes data.
 * @property {(data: string) => any} deserialize - Decodes data.
 */
/**
 * Standard JSON Serializer (Default).
 * Compatible with all browsers, native bridges (iOS/Android), and standard tooling.
 * @type {Serializer}
 */
export declare const JSONSerializer: Serializer;
/**
 * Gets a serializer by content type.
 * Defaults to JSON if not found.
 *
 * @param {string} contentType
 * @returns {Serializer}
 */
export declare function getSerializer(contentType: string): Serializer;
/**
 * Returns the preferred content type for the given payload.
 * Always returns JSON for maximum compatibility with native bridges.
 *
 * @param {*} payload
 * @returns {string} Content-Type preferred
 */
export declare function detectPreferredContentType(payload: any): string;
