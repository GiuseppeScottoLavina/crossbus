import { describe, it, expect, mock } from 'bun:test';
import { CrossBus, EventEmitter, createFastEmitter, MessageChannelTransport, NativeBridgeTransport, OriginValidator } from '../../src/index.js';
import { createNanoEmitter } from '../../src/nano.js';
import { findTransferables } from '../../src/common/types.js';
import { createValidator, createValidationHook } from '../../src/plugins/schema-validation.js';

describe('Audit regressions', () => {
    for (const create of [createNanoEmitter, createFastEmitter]) {
        it(`${create.name}: supports prototype names and the empty event`, () => {
            const bus = create();
            for (const event of ['__proto__', 'constructor', 'toString', '']) {
                const fn = mock();
                bus.on(event, fn);
                bus.emit(event, 42);
                expect(fn).toHaveBeenCalledWith(42);
                bus.off(event);
                bus.emit(event, 99);
                expect(fn).toHaveBeenCalledTimes(1);
            }
        });
    }
    it('keeps namespace listeners when a single exact listener exists', async () => {
        const bus = new EventEmitter();
        const seen = [];
        bus.on('task:done', () => seen.push('exact'), { mode: 'sync' });
        bus.on('task:*', () => seen.push('namespace'), { mode: 'sync' });
        expect(await bus.emit('task:done', {})).toBe(2);
        expect(seen).toEqual(['exact', 'namespace']);
    });
    it('removes a once listener before recursive emit', async () => {
        const bus = new EventEmitter();
        const fn = mock(async () => { await bus.emit('once'); });
        bus.once('once', fn, { mode: 'sync' });
        await bus.emit('once');
        expect(fn).toHaveBeenCalledTimes(1);
    });
    it('clears allow-all mode', () => {
        const validator = new OriginValidator({ allowed: ['*'] });
        validator.clear();
        expect(validator.isAllowed('https://evil.example')).toBe(false);
    });
    it('finds each transferable once in cyclic objects and Maps', () => {
        const buffer = new ArrayBuffer(32);
        const data = { buffer, map: new Map([['buffer', buffer]]) };
        data.self = data;
        expect(findTransferables(data)).toEqual([buffer]);
    });
    it('applies max pending and destroys attached transports', async () => {
        const bus = new CrossBus({ allowedOrigins: ['*'], maxPendingRequests: 1 });
        const destroy = mock();
        bus.addTransport({ send() {}, onMessage() {}, destroy }, { peerId: 'peer' });
        const pending = bus.request('peer', 'wait');
        const cancelled = pending.catch(error => error);
        await Promise.resolve();
        await expect(bus.request('peer', 'overflow')).rejects.toMatchObject({ code: 'ERR_MAX_PENDING' });
        bus.destroy();
        expect(await cancelled).toBeInstanceOf(Error);
        expect(destroy).toHaveBeenCalledTimes(1);
        bus.destroy();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
    it('uses the transport event origin instead of a configured trusted label', async () => {
        const bus = CrossBus.createSecure({ allowedOrigins: ['https://trusted.example'] });
        let receive;
        const handler = mock();
        bus.handle('sensitive', handler);
        bus.addTransport({ send() {}, onMessage(fn) { receive = fn; } }, { peerId: 'peer', origin: 'https://trusted.example' });
        receive({ _cb: 1, id: 'request', type: 'req', payload: { name: 'sensitive', data: {} } }, { origin: 'https://evil.example' });
        await Promise.resolve();
        expect(handler).not.toHaveBeenCalled();
        bus.destroy();
    });
    it('rejects a spoofed response from a different peer', async () => {
        const bus = new CrossBus({ allowedOrigins: ['*'] });
        let request;
        bus.addPeer('expected', msg => { request = msg; });
        const pending = bus.request('expected', 'test', {}, { timeout: 100 });
        await Promise.resolve();
        await bus.handleMessage({ type: 'res', id: request.id, success: true, data: 'forged' }, '*', 'attacker');
        expect(bus.healthCheck().pendingRequests).toBe(1);
        await bus.handleMessage({ type: 'res', id: request.id, success: true, data: 'real' }, '*', 'expected');
        expect(await pending).toBe('real');
        bus.destroy();
    });
    it('returns validation errors over a real MessageChannel and never executes the handler', async () => {
        const a = new CrossBus({ allowedOrigins: ['channel'] });
        const b = new CrossBus({ allowedOrigins: ['channel'] });
        const channel = new MessageChannelTransport();
        const remote = MessageChannelTransport.fromPort(channel.remotePort);
        a.addTransport(channel, { peerId: 'b', origin: 'channel' });
        b.addTransport(remote, { peerId: 'a', origin: 'channel' });
        const handler = mock();
        b.addInboundHook(createValidationHook({ secure: { type: 'object', required: ['id'] } }));
        b.handle('secure', handler);
        try {
            await expect(a.request('b', 'secure', {}, { timeout: 1000 })).rejects.toMatchObject({ code: 'ERR_INVALID_PAYLOAD' });
            expect(handler).not.toHaveBeenCalled();
        } finally { a.destroy(); b.destroy(); }
    });
    it('enforces payload budget for binary data and Unicode', async () => {
        const bus = new CrossBus({ allowedOrigins: ['*'], maxPayloadSize: 64 });
        const handler = mock();
        bus.addPeer('peer', handler);
        try {
            await expect(bus.signal('binary', new Uint8Array(100))).rejects.toMatchObject({ code: 'ERR_PAYLOAD_TOO_LARGE' });
            await expect(bus.request('peer', 'unicode', '😀'.repeat(30))).rejects.toMatchObject({ code: 'ERR_PAYLOAD_TOO_LARGE' });
            expect(handler).not.toHaveBeenCalled();
            expect(bus.healthCheck().pendingRequests).toBe(0);
        } finally { bus.destroy(); }
    });
    it('does not allocate pending requests when outbound hooks reject', async () => {
        const bus = new CrossBus({ allowedOrigins: ['*'] });
        const send = mock();
        bus.addPeer('peer', send);
        bus.addOutboundHook(() => { throw new Error('Denied'); });
        await expect(bus.request('peer', 'secure')).rejects.toThrow('Denied');
        expect(send).not.toHaveBeenCalled();
        expect(bus.healthCheck().pendingRequests).toBe(0);
        bus.destroy();
    });
    it('validates enums for null and rejects non-finite numbers and inherited required keys', () => {
        expect(createValidator({ enum: ['start'] })(null).valid).toBe(false);
        expect(createValidator({ type: 'number' })(NaN).valid).toBe(false);
        expect(createValidator({ type: 'number' })(Infinity).valid).toBe(false);
        expect(createValidator({ type: 'object', required: ['id'] })(Object.create({ id: 1 })).valid).toBe(false);
    });
    it('detects custom native names and propagates send failures', async () => {
        globalThis.CustomBridge = { postMessage() { throw new Error('native failure'); } };
        const transport = new NativeBridgeTransport({ androidInterface: 'CustomBridge', callbackName: '__audit_receive__' });
        try {
            await transport.ready;
            expect(transport.bridgeType).toBe('android');
            expect(() => transport.send({ id: 'test', t: 'sig' })).toThrow('native failure');
        } finally { transport.destroy(); delete globalThis.CustomBridge; }
    });
    it('bounds native initialization queue and cancels polling on destroy', async () => {
        const transport = new NativeBridgeTransport({ androidInterface: '__missing__', iosHandler: '__missing__', maxQueueSize: 1, callbackName: '__audit_receive__' });
        transport.send({ id: 'one', t: 'sig' });
        expect(() => transport.send({ id: 'two', t: 'sig' })).toThrow();
        transport.destroy();
        await expect(transport.ready).rejects.toMatchObject({ code: 'ERR_DESTROYED' });
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(transport.isReady).toBe(false);
        expect(globalThis.__audit_receive__).toBeUndefined();
    });
    it('rejects duplicate native callback ownership without disturbing its owner', async () => {
        globalThis.CustomBridge = { postMessage() {} };
        const options = { androidInterface: 'CustomBridge', callbackName: '__audit_receive__' };
        const owner = new NativeBridgeTransport(options);
        try {
            await owner.ready;
            expect(() => new NativeBridgeTransport(options)).toThrow('already registered');
            expect(typeof globalThis.__audit_receive__).toBe('function');
        } finally { owner.destroy(); delete globalThis.CustomBridge; }
    });
});

describe('Additional transport and lifecycle regressions', () => {
    it('preserves both fast and regular subscriptions as either is added or removed', () => {
        const bus = new EventEmitter();
        const fast = mock();
        const regular = mock();
        const off = bus.onFast('event', fast);
        const sub = bus.on('event', regular);
        bus.emitSync('event', 1);
        expect(fast).toHaveBeenCalledWith(1);
        expect(regular).toHaveBeenCalledWith(1);
        sub.unsubscribe();
        bus.emitSync('event', 2);
        expect(fast).toHaveBeenCalledWith(2);
        expect(regular).toHaveBeenCalledTimes(1);
        off();
        expect(bus.listenerCount('event')).toBe(0);
        expect(bus.getSignalNames()).not.toContain('event');
    });
    it('updates subscription state on once delivery and explicit removal', async () => {
        const bus = new EventEmitter();
        const once = bus.once('event', () => {}, { mode: 'sync' });
        bus.emitSync('event', 1);
        expect(once.active).toBe(false);
        expect(bus.emitSync('event', 2)).toBe(0);
        const sub = bus.on('event', () => {});
        bus.off('event');
        expect(sub.active).toBe(false);
    });
    it('removes AbortSignal listeners on explicit subscription cleanup', () => {
        const controller = new AbortController();
        const original = controller.signal.removeEventListener.bind(controller.signal);
        const removed = mock(original);
        controller.signal.removeEventListener = removed;
        const bus = new EventEmitter();
        const sub = bus.on('event', () => {}, { signal: controller.signal });
        sub.unsubscribe();
        expect(removed).toHaveBeenCalledTimes(1);
        expect(removed.mock.calls[0][0]).toBe('abort');
    });
    it('strict mode rejects wildcard patterns in production and cannot be disabled through the secure factory', () => {
        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            expect(() => new CrossBus({ strictMode: true, allowedOrigins: ['*'] })).toThrow();
            expect(() => CrossBus.createSecure({ allowedOrigins: ['https://*.example.com'] })).toThrow();
            const bus = CrossBus.createSecure({ allowedOrigins: ['https://app.example.com'], strictMode: false });
            expect(bus.strictMode).toBe(true);
            bus.destroy();
        } finally {
            if (previous === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previous;
        }
    });
    for (const platform of ['android', 'ios']) {
        it(`${platform} contract: JS request matches a native response with a fresh ID`, async () => {
            const callbackName = '__native_contract__';
            const reply = message => {
                const request = typeof message === 'string' ? JSON.parse(message) : message;
                queueMicrotask(() => globalThis[callbackName]({ _cb: 1, id: 'fresh-native-response', type: 'res',
                    payload: { requestId: request.id, success: true, data: request.payload.data } }));
            };
            if (platform === 'android') globalThis.ContractBridge = { postMessage: reply };
            else globalThis.webkit = { messageHandlers: { contract: { postMessage: reply } } };
            const transport = new NativeBridgeTransport({ androidInterface: 'ContractBridge', iosHandler: 'contract', callbackName });
            const bus = new CrossBus({ peerId: 'web', allowedOrigins: ['native'] });
            bus.addTransport(transport, { peerId: 'native', origin: 'native' });
            try {
                await transport.ready;
                expect(transport.bridgeType).toBe(platform);
                expect(await bus.request('native', 'echo', { text: "quote '\" \\ 🐟" }, { timeout: 500 })).toEqual({ text: "quote '\" \\ 🐟" });
            } finally { bus.destroy(); delete globalThis.ContractBridge; delete globalThis.webkit; }
        });
    }
});

describe('Wildcard and bridge fallback regressions', () => {
    it('does not dispatch a wildcard registration twice when its pattern is emitted', async () => {
        const emitter = new EventEmitter();
        const handler = mock();
        emitter.on('*', handler, { mode: 'sync' });
        expect(await emitter.emit('*', 42)).toBe(1);
        expect(handler).toHaveBeenCalledTimes(1);
    });
    it('uses AndroidBridge when a global CrossBus object has no native postMessage', async () => {
        const previous = globalThis.CrossBus;
        const send = mock();
        globalThis.CrossBus = class CrossBus {};
        globalThis.AndroidBridge = { postMessage: send };
        const transport = new NativeBridgeTransport({ callbackName: '__fallback_contract__' });
        try {
            await transport.ready;
            transport.send({ id: 'test', t: 'sig' });
            expect(send).toHaveBeenCalledTimes(1);
        } finally { transport.destroy(); globalThis.CrossBus = previous; delete globalThis.AndroidBridge; }
    });
});

describe('Handler lifecycle', () => {
    it('does not retain authorization options when a handler is removed and replaced', async () => {
        const bus = new CrossBus({ allowedOrigins: ['*'] });
        bus.handle('test', () => 'old', { allowedPeers: ['admin'] });
        bus.unhandle('test');
        bus.handle('test', () => 'new');
        let response;
        await bus.handleMessage({ id: 'request', type: 'req', payload: { name: 'test', data: {} } }, '*', 'user', reply => { response = reply; });
        expect(response.payload.success).toBe(true);
        expect(response.payload.data).toBe('new');
        bus.destroy();
    });
    it('does not mutate the caller capabilities array', () => {
        const capabilities = Object.freeze(['execute:js']);
        const bus = new CrossBus({ capabilities });
        expect(capabilities).toEqual(['execute:js']);
        bus.destroy();
    });
});
