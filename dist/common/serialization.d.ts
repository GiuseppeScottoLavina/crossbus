/**
 * Gets a serializer by content type.
 * Defaults to JSON if not found.
 *
 * @param {string} contentType
 * @returns {Serializer}
 */
export function getSerializer(contentType: string): Serializer;
/**
 * Returns the preferred content type for the given payload.
 * Always returns JSON for maximum compatibility with native bridges.
 *
 * @param {*} payload
 * @returns {string} Content-Type preferred
 */
export function detectPreferredContentType(payload: any): string;
/**
 * @fileoverview Serialization abstraction layer for CrossBus.
 * Uses JSON serialization for maximum compatibility.
 * @module common/serialization
 */
/**
 * @typedef {Object} Serializer
 * @property {string} contentType - MIME type of the serialization format.
 * @property {function(*): string} serialize - Encodes data.
 * @property {function(string): *} deserialize - Decodes data.
 */
/**
 * Standard JSON Serializer (Default).
 * Compatible with all browsers, native bridges (iOS/Android), and standard tooling.
 * @type {Serializer}
 */
export const JSONSerializer: Serializer;
export type Serializer = {
    /**
     * - MIME type of the serialization format.
     */
    contentType: string;
    /**
     * - Encodes data.
     */
    serialize: (arg0: any) => string;
    /**
     * - Decodes data.
     */
    deserialize: (arg0: string) => any;
};
