/*! CrossBus v0.1.4 | Apache-2.0 */
/**
 * CrossBus Nano - minimal synchronous event emitter.
 *
 * @module crossbus/nano
 */

/**
 * Creates an ultra-fast plain object emitter.
 * @returns {Object} Fast emitter with on(), emit(), off() methods
 */
const createNanoEmitter = () => ({
    e: Object.create(null),
    on(n, c) {
        (this.e[n] ||= []).push(c);
        return () => { this.e[n] = this.e[n]?.filter(i => c !== i); };
    },
    emit(n, d) {
        const c = this.e[n];
        if (!c) return;
        const l = c.length;
        if (l === 1) { c[0](d); return; }
        if (l === 2) { c[0](d); c[1](d); return; }
        if (l === 3) { c[0](d); c[1](d); c[2](d); return; }
        if (l === 4) { c[0](d); c[1](d); c[2](d); c[3](d); return; }
        for (let i = 0; i < l; i++) c[i](d);
    },
    off(n) { n !== undefined ? delete this.e[n] : this.e = Object.create(null); }
});

export { createNanoEmitter };
//# sourceMappingURL=nano.js.map
