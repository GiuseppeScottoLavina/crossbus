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
it('charges the whole backing store of a binary view', () => {
    const view = new Uint8Array(new ArrayBuffer(4096), 0, 1);
    expect(() => assertPayloadSize(view, 4096 + 8)).not.toThrow();
    expect(() => assertPayloadSize(view, 4096 + 7)).toThrow();
});
it('handles deeply nested graphs without a stack overflow', () => {
    let value = null;
    for (let i = 0; i < 20000; i++) value = { next: value };
    expect(() => assertPayloadSize(value, 480008)).not.toThrow();
    try { assertPayloadSize(value, 480007); throw new Error('Budget was bypassed'); }
    catch (error) { expect(error.code).toBe('ERR_PAYLOAD_TOO_LARGE'); }
});
it('counts shared nested objects once and reads accessors once per check', () => {
    let reads = 0;
    const child = { n: 1 };
    const root = { get a() { reads++; return child; }, b: child };
    expect(() => assertPayloadSize(root, 62)).not.toThrow();
    expect(reads).toBe(1);
    expect(() => assertPayloadSize(root, 61)).toThrow();
});
if (typeof SharedArrayBuffer !== 'undefined') it('includes shared backing storage in the budget', () => {
    expect(() => assertPayloadSize(new SharedArrayBuffer(32), 40)).not.toThrow();
    expect(() => assertPayloadSize(new SharedArrayBuffer(32), 39)).toThrow();
});
it('accounts for cycles and shared contents inside Maps and Sets',()=>{
 const map=new Map();map.set('self',map);
 expect(()=>assertPayloadSize(map,32)).not.toThrow();expect(()=>assertPayloadSize(map,31)).toThrow();
 const set=new Set();set.add(set);
 expect(()=>assertPayloadSize(set,16)).not.toThrow();expect(()=>assertPayloadSize(set,15)).toThrow();
 const shared={n:7},values=new Map([['a',shared],['b',shared]]);
 expect(()=>assertPayloadSize(values,62)).not.toThrow();expect(()=>assertPayloadSize(values,61)).toThrow();
});
