import { it, expect } from 'bun:test';
import { PendingRequests } from '../../src/router/pending-requests.js';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

it('shares one default timer while retaining independent promises, peer checks and cleanup', async () => {
    const tracker = new PendingRequests({
        coalesceTimeouts: true,
        maxPending: 128,
        defaultTimeout: 1000
    });
    const requests = Array.from({ length: 128 }, () => tracker.create('trusted', 'echo'));
    try {
        const oldTimer = tracker.get(requests[0].requestId).timer;
        expect(new Set(requests.map((r) => tracker.get(r.requestId).timer)).size).toBe(1);
        expect(
            tracker.resolve(requests[0].requestId, { success: true, data: 'forged' }, 'other')
        ).toBe(false);
        expect(tracker.size).toBe(128);
        for (let i = 0; i < requests.length; i++)
            expect(
                tracker.resolve(requests[i].requestId, { success: true, data: i }, 'trusted')
            ).toBe(true);
        expect(await Promise.all(requests.map((r) => r.promise))).toEqual(
            Array.from({ length: 128 }, (_, i) => i)
        );
        expect(tracker.size).toBe(0);
        const next = tracker.create('trusted', 'echo');
        expect(tracker.get(next.requestId).timer).not.toBe(oldTimer);
        tracker.resolve(next.requestId, { success: true, data: 7 }, 'trusted');
        expect(await next.promise).toBe(7);
    } finally {
        tracker.cancelAll();
    }
});

it('does not expire a later default deadline early after its predecessor is cancelled', async () => {
    const tracker = new PendingRequests({ coalesceTimeouts: true, defaultTimeout: 45 });
    const first = tracker.create('a', 'echo'),
        firstOutcome = first.promise.catch((e) => e.message);
    await pause(15);
    const start = performance.now();
    const second = tracker.create('a', 'echo', { defaultValue: 'late' });
    tracker.cancel(first.requestId);
    expect(await firstOutcome).toBe('Request cancelled');
    expect(await second.promise).toBe('late');
    expect(performance.now() - start).toBeGreaterThanOrEqual(44);
    expect(tracker.size).toBe(0);
});

it('retains distinct custom deadlines, errors and default values', async () => {
    const tracker = new PendingRequests({ coalesceTimeouts: true, defaultTimeout: 100 });
    const regular = tracker.create('a', 'echo', { defaultValue: 'default' });
    const short = tracker.create('a', 'echo', { timeout: 10 });
    const outcome = short.promise.catch((e) => e.code);
    expect(tracker.get(short.requestId).timer).not.toBe(tracker.get(regular.requestId).timer);
    expect(await outcome).toBe('ERR_RESPONSE_TIMEOUT');
    expect(tracker.has(regular.requestId)).toBe(true);
    expect(await regular.promise).toBe('default');
    expect(tracker.size).toBe(0);
});

it('cancels middle/tail peers and all requests without retaining expired links', async () => {
    const tracker = new PendingRequests({ coalesceTimeouts: true, defaultTimeout: 1000 });
    const requests = ['a', 'b', 'a', 'c'].map((peer) => tracker.create(peer, 'echo'));
    const outcomes = requests.map((r) => r.promise.catch((e) => e.code ?? e.message));
    expect(tracker.cancelForPeer('a')).toBe(2);
    expect(tracker.size).toBe(2);
    expect(tracker.cancelAll()).toBe(2);
    expect(tracker.size).toBe(0);
    expect(await Promise.all(outcomes)).toEqual([
        'ERR_PEER_DISCONNECTED',
        'All requests cancelled',
        'ERR_PEER_DISCONNECTED',
        'All requests cancelled'
    ]);
    for (const r of requests) expect(tracker.get(r.requestId)).toBeUndefined();
});

it('survives default getters that throw or create requests during expiration', async () => {
    const tracker = new PendingRequests({ coalesceTimeouts: true, defaultTimeout: 10 });
    let expired = false,
        reentrant;
    const first = tracker.create('a', 'echo', {
        get defaultValue() {
            if (expired) {
                reentrant = tracker.create('b', 'echo', { defaultValue: 9 });
                return 7;
            }
            return 0;
        }
    });
    const options = { defaultValue: 0 };
    const second = tracker.create('a', 'echo', options);
    Object.defineProperty(options, 'defaultValue', {
        get() {
            throw Error('timeout getter failed');
        }
    });
    expired = true;
    const failure = second.promise.catch((e) => e.message);
    expect(await first.promise).toBe(7);
    expect(await failure).toBe('timeout getter failed');
    expect(await reentrant.promise).toBe(9);
    expect(tracker.size).toBe(0);
});
