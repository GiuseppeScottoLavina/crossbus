import { it, expect } from 'bun:test';
import { assertPayloadSize } from '../../src/common/utils.js';
const cases = [
    [undefined, 8], [null, 8], [true, 8], [7, 8], ['😀', 12],
    [{ value: 7 }, 34], [new Uint8Array(16), 24],
    [new Map([['key', 7]]), 30], [new Set([1]), 16]
];
const cyclic = {}; cyclic.self = cyclic; cases.push([cyclic, 32]);
for (const [payload, bytes] of cases) it(`enforces the exact documented budget boundary for ${payload?.constructor?.name ?? String(payload)} (${bytes} bytes)`, () => {
    expect(() => assertPayloadSize(payload, bytes)).not.toThrow();
    expect(() => assertPayloadSize(payload, bytes - 1)).toThrow();
    expect(() => assertPayloadSize(payload, 0)).not.toThrow();
});
