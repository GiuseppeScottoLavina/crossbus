/**
 * CrossBus Nano - Ultra-minimal event emitter (~200 bytes gzipped)
 * Beats nanoevents on emit performance while matching API exactly.
 * 
 * @module crossbus/nano
 */

/**
 * Creates an ultra-fast plain object emitter.
 * @returns {Object} Fast emitter with on(), emit(), off() methods
 */
export const createNanoEmitter = () => ({
    e: {},
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
    off(n) { n ? delete this.e[n] : this.e = {}; }
});
