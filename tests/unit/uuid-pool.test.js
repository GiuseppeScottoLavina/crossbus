import {it, expect} from 'bun:test';
import {createUuidPool} from '../../src/common/uuid-pool.js';

it('formats all 16 entropy bytes as an RFC 4122 version 4 UUID', () => {
    const next = createUuidPool(bytes => { for (let i=0; i<bytes.length; i++) bytes[i]=i&255; });
    expect(next()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(next()).toBe('10111213-1415-4617-9819-1a1b1c1d1e1f');
});

it('consumes a fresh 16-byte slice for every ID across refill boundaries', () => {
    let sequence=0, draws=0;
    const next=createUuidPool(bytes=>{
        draws++;bytes.fill(0);
        const view=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for(let i=0;i<bytes.length;i+=16)view.setUint32(i,sequence++);
    });
    const seen=new Set();let malformed=0;
    for(let i=0;i<4097;i++){
        const id=next();seen.add(id);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))malformed++;
    }
    expect(malformed).toBe(0);expect(seen.size).toBe(4097);
    expect(draws).toBeGreaterThan(1);expect(draws).toBeLessThan(65);
});

it('propagates an entropy failure and does not consume partially filled bytes', () => {
    let calls=0;
    const next=createUuidPool(bytes=>{
        calls++;bytes.fill(calls);
        if(calls===1)throw Error('entropy unavailable');
    });
    expect(()=>next()).toThrow('entropy unavailable');
    expect(next()).toBe('02020202-0202-4202-8202-020202020202');
    expect(calls).toBe(2);
});

it('does not share entropy or positions between independent generators', () => {
    const a=createUuidPool(bytes=>bytes.fill(1)), b=createUuidPool(bytes=>bytes.fill(2));
    expect(a()).toBe('01010101-0101-4101-8101-010101010101');
    expect(b()).toBe('02020202-0202-4202-8202-020202020202');
});
