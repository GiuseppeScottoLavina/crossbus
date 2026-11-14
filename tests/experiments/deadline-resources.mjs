import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { CrossBus } from '../../src/index.js';
const active = new Set();
let created = 0;
const hook = createHook({
    init(id, type) {
        if (type === 'Timeout') {
            active.add(id);
            created++;
        }
    },
    destroy(id) {
        active.delete(id);
    }
}).enable();
const bus = CrossBus.createSecure({
    peerId: 'client',
    allowedOrigins: ['channel'],
    maxPendingRequests: 128
});
let sends = 0;
bus.addPeer('peer', () => {
    sends++;
});
const requests = Array.from({ length: 128 }, () =>
    bus.request('peer', 'echo', 7).catch((e) => e.message)
);
assert.equal(sends, 128);
assert.equal(created, 1);
assert.equal(active.size, 1);
await assert.rejects(bus.request('peer', 'echo', 7), (e) => e.code === 'ERR_MAX_PENDING');
bus.destroy();
assert.deepEqual(await Promise.all(requests), Array(128).fill('All requests cancelled'));
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(active.size, 0);
hook.disable();
console.log(
    JSON.stringify({ checkedRequests: 128, createdTimers: created, liveAfterDestroy: active.size })
);
