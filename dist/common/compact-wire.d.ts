/**
 * Encode only the standard envelope shapes. Extension fields, custom metadata,
 * other versions/types and nonstandard messages retain their original object.
 * @param {any} message
 * @returns {any}
 */
export function encodeCompact(message: any): any;
/** @param {any} packet @returns {any} Null means a malformed compact packet. */
export function decodeCompact(packet: any): any;
