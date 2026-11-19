/**
 * Encode only the standard envelope shapes. Extension fields, custom metadata,
 * other versions/types and nonstandard messages retain their original object.
 * @param {any} message
 * @param {boolean} [version2=false]
 * @returns {any}
 */
export declare function encodeCompact(message: any, version2?: boolean): any;
/** @param {any} packet @returns {any} Null means a malformed compact packet. */
export declare function decodeCompact(packet: any): any;
