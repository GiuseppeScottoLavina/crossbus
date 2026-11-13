/**
 * Build an independent generator backed by the supplied cryptographic fill.
 * Refills publish only after success, so an entropy failure cannot expose
 * partially filled bytes or repeat an exhausted slice.
 * @param {(bytes: Uint8Array<ArrayBuffer>) => void} fill
 * @returns {() => string} A canonical lowercase UUID v4 generator.
 */
export function createUuidPool(fill: (bytes: Uint8Array<ArrayBuffer>) => void): () => string;
