import { describe, it, expect, spyOn } from 'bun:test';
import { PendingRequests } from '../../src/router/pending-requests.js';

describe('Pending request resource settlement', () => {
    for (const operation of ['resolve', 'reject', 'cancel', 'cancelForPeer', 'cancelAll']) {
        it(`${operation} releases its timeout synchronously`, async () => {
            const set = spyOn(globalThis, 'setTimeout');
            const clear = spyOn(globalThis, 'clearTimeout');
            const pending = new PendingRequests();
            let observed;
            try {
                const request = pending.create('peer', 'echo');
                const timer = set.mock.results.at(-1).value;
                observed = request.promise.catch(error => error);
                if (operation === 'resolve') pending.resolve(request.requestId, { success: true, data: 42 });
                else if (operation === 'reject') pending.reject(request.requestId, new Error('failed'));
                else if (operation === 'cancel') pending.cancel(request.requestId);
                else if (operation === 'cancelForPeer') pending.cancelForPeer('peer');
                else pending.cancelAll();
                expect(clear).toHaveBeenCalledWith(timer);
                expect(pending.size).toBe(0);
            } finally { set.mockRestore(); clear.mockRestore(); pending.cancelAll(); }
            const result = await observed;
            if (operation === 'resolve') expect(result).toBe(42);
            else expect(result).toBeInstanceOf(Error);
        });
    }
});

describe('RPC Promise contract', () => {
    it('returns rejected Promises instead of throwing synchronously on failure', async () => {
        const { CrossBus } = await import('../../src/core/cross-bus.js');
        const bus = new CrossBus();
        let missing, destroyed;
        expect(() => { missing = bus.request('missing', 'echo'); }).not.toThrow();
        await expect(missing).rejects.toMatchObject({ code: 'ERR_PEER_NOT_FOUND' });
        bus.destroy();
        expect(() => { destroyed = bus.request('missing', 'echo'); }).not.toThrow();
        await expect(destroyed).rejects.toMatchObject({ code: 'ERR_DESTROYED' });
    });
});
