// Internal implementation, not a package export. Each UUID consumes 16 fresh
// bytes; the RFC version/variant bits are imposed only while formatting.
const ENTROPY_BYTES = 2048; // 128 UUIDs, below Web Crypto's 65,536-byte quota.

/**
 * Build an independent generator backed by the supplied cryptographic fill.
 * Refills publish only after success, so an entropy failure cannot expose
 * partially filled bytes or repeat an exhausted slice.
 * @param {(bytes: Uint8Array<ArrayBuffer>) => void} fill
 * @returns {() => string} A canonical lowercase UUID v4 generator.
 */
export function createUuidPool(fill) {
    let bytes = new Uint8Array(0);
    let cursor = 0;
    /** @type {ReturnType<typeof flatFormatter>|undefined} */
    let format;
    return function uuidV4() {
        if (cursor === bytes.length) {
            const fresh = new Uint8Array(ENTROPY_BYTES);
            fill(fresh);
            if (!format) format = flatFormatter();
            bytes = fresh;
            cursor = 0;
        }
        const i = cursor;
        cursor += 16;
        return /** @type {ReturnType<typeof flatFormatter>} */(format)(bytes, i);
    };
}

/**
 * Format into a reusable ASCII buffer and return an owned, flat string.
 * Concatenating hexadecimal pairs creates string ropes which the native
 * structured clone must later flatten, moving allocation back into RPC sends.
 */
function flatFormatter() {
    const alphabet = '0123456789abcdef';
    const pairs = new Uint16Array(256);
    for (let n=0;n<256;n++) pairs[n]=(alphabet.charCodeAt(n>>4)<<8)|alphabet.charCodeAt(n&15);
    const ascii = new Uint8Array(36);
    ascii[8]=ascii[13]=ascii[18]=ascii[23]=45;
    const view = new DataView(ascii.buffer);
    /** @param {Uint8Array<ArrayBuffer>} bytes @param {number} i */
    return (bytes, i) => {
        view.setUint16(0,pairs[bytes[i]]);
        view.setUint16(2,pairs[bytes[i+1]]);
        view.setUint16(4,pairs[bytes[i+2]]);
        view.setUint16(6,pairs[bytes[i+3]]);
        view.setUint16(9,pairs[bytes[i+4]]);
        view.setUint16(11,pairs[bytes[i+5]]);
        view.setUint16(14,pairs[(bytes[i+6]&15)|64]);
        view.setUint16(16,pairs[bytes[i+7]]);
        view.setUint16(19,pairs[(bytes[i+8]&63)|128]);
        view.setUint16(21,pairs[bytes[i+9]]);
        view.setUint16(24,pairs[bytes[i+10]]);
        view.setUint16(26,pairs[bytes[i+11]]);
        view.setUint16(28,pairs[bytes[i+12]]);
        view.setUint16(30,pairs[bytes[i+13]]);
        view.setUint16(32,pairs[bytes[i+14]]);
        view.setUint16(34,pairs[bytes[i+15]]);
        // Fixed arguments avoid a per-ID iterable/array allocation. Constructing
        // from numeric code units cannot retain a larger parent string or rope.
        return String.fromCharCode(
            ascii[0],ascii[1],ascii[2],ascii[3],ascii[4],ascii[5],ascii[6],ascii[7],ascii[8],
            ascii[9],ascii[10],ascii[11],ascii[12],ascii[13],ascii[14],ascii[15],ascii[16],ascii[17],
            ascii[18],ascii[19],ascii[20],ascii[21],ascii[22],ascii[23],ascii[24],ascii[25],ascii[26],
            ascii[27],ascii[28],ascii[29],ascii[30],ascii[31],ascii[32],ascii[33],ascii[34],ascii[35]
        );
    };
}
