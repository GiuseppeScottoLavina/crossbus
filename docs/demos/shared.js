// Shared pieces for the CrossBus live demos: the bus trace, a transport
// wrapper that records real envelopes, and source panels that show the code
// each page actually runs.

const KINDS = ['req', 'res', 'sig', 'bad'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** Classifies a protocol message for the trace. */
export function messageKind(message) {
    const type = message?.type ?? message?.t;
    if (type === 'req') return 'req';
    if (type === 'res') return message.payload?.success === false ? 'bad' : 'res';
    return 'sig';
}

/**
 * Wraps a CrossBus transport so every envelope it sends or receives is drawn
 * on the trace. The wrapped transport is what the bus is given.
 */
export function traced(transport, trace, localLane, remoteLane) {
    return {
        send(message, ...rest) {
            trace.record(localLane, remoteLane, messageKind(message));
            return transport.send(message, ...rest);
        },
        onMessage(listener) {
            transport.onMessage((message, source) => {
                trace.record(remoteLane, localLane, messageKind(message));
                listener(message, source);
            });
        },
        offMessage() { transport.offMessage?.(); },
        destroy() { transport.destroy?.(); },
        get peerId() { return transport.peerId; }
    };
}

/**
 * A logic-analyser style strip: one lane per context, time flowing right to
 * left. Each recorded envelope is a short slanted stroke from sender lane to
 * receiver lane, coloured by kind.
 */
export class BusTrace {
    #canvas; #ctx; #lanes = []; #events = []; #counts = { req: 0, res: 0, sig: 0, bad: 0 };
    #windowMs; #colors = {}; #font = 'monospace'; #frame = 0; #legend; #size = { w: 0, h: 0, dpr: 1 };

    constructor(root, { lanes = [], windowMs = 6000 } = {}) {
        this.#canvas = root.querySelector('canvas');
        this.#ctx = this.#canvas.getContext('2d');
        this.#legend = Object.fromEntries(KINDS.map(kind => [kind, root.querySelector(`.k-${kind} b`)]));
        this.#windowMs = windowMs;
        this.setLanes(lanes);
        this.#readColors();
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.#readColors(); this.#draw(); });
        new ResizeObserver(() => this.#resize()).observe(this.#canvas);
        document.addEventListener('visibilitychange', () => this.#schedule());
        this.#resize();
    }

    get counts() { return { ...this.#counts }; }

    setLanes(lanes) {
        this.#lanes = lanes.map(lane => typeof lane === 'string' ? { id: lane, label: lane } : lane);
        this.#events = this.#events.filter(event => this.#lane(event.from) >= 0 && this.#lane(event.to) >= 0);
        this.#draw();
    }

    record(from, to, kind) {
        if (!KINDS.includes(kind)) kind = 'sig';
        this.#counts[kind]++;
        const text = this.#legend[kind];
        if (text) text.textContent = this.#counts[kind].toLocaleString('en-US');
        this.#events.push({ t: performance.now(), from, to, kind });
        if (this.#events.length > 4000) this.#events.splice(0, this.#events.length - 4000);
        this.#schedule();
    }

    reset() {
        this.#events = [];
        for (const kind of KINDS) { this.#counts[kind] = 0; if (this.#legend[kind]) this.#legend[kind].textContent = '0'; }
        this.#draw();
    }

    #lane(id) { return this.#lanes.findIndex(lane => lane.id === id); }

    #readColors() {
        const style = getComputedStyle(document.documentElement);
        for (const name of [...KINDS, 'ink', 'ink-2', 'ink-3', 'rule', 'panel', 'sunken']) this.#colors[name] = style.getPropertyValue(`--${name}`).trim();
        this.#font = style.getPropertyValue('--mono').trim() || 'monospace';
    }

    #resize() {
        const rect = this.#canvas.getBoundingClientRect();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.#size = { w: rect.width, h: rect.height, dpr };
        this.#canvas.width = Math.round(rect.width * dpr);
        this.#canvas.height = Math.round(rect.height * dpr);
        this.#draw();
    }

    #schedule() {
        if (this.#frame || document.hidden) return;
        this.#frame = requestAnimationFrame(() => {
            this.#frame = 0;
            this.#draw();
            const now = performance.now();
            // Keep scrolling while recent events are still on screen.
            if (!reducedMotion.matches && this.#events.some(event => now - event.t < this.#windowMs)) this.#schedule();
        });
    }

    #draw() {
        const { w, h, dpr } = this.#size;
        if (!w || !h) return;
        const ctx = this.#ctx, c = this.#colors;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const gutter = Math.min(128, Math.max(84, w * 0.14));
        const top = 18, bottom = 22;
        const span = this.#lanes.length > 1 ? (h - top - bottom) / (this.#lanes.length - 1) : 0;
        const laneY = index => this.#lanes.length > 1 ? top + index * span : h / 2;
        const now = performance.now();
        const x = t => w - 8 - ((now - t) / this.#windowMs) * (w - gutter - 16);

        // Seconds grid.
        ctx.font = `500 10px ${this.#font}`;
        ctx.textBaseline = 'alphabetic';
        for (let s = 0; s <= this.#windowMs / 1000; s++) {
            const gx = w - 8 - (s * 1000 / this.#windowMs) * (w - gutter - 16);
            ctx.strokeStyle = c.rule; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(Math.round(gx) + .5, top - 8); ctx.lineTo(Math.round(gx) + .5, h - bottom + 6); ctx.stroke();
            ctx.fillStyle = c['ink-3'];
            ctx.textAlign = 'center';
            ctx.fillText(s === 0 ? 'now' : `−${s}s`, gx, h - 6);
        }

        // Lanes.
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        this.#lanes.forEach((lane, index) => {
            const y = laneY(index);
            ctx.strokeStyle = c.rule; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(gutter, Math.round(y) + .5); ctx.lineTo(w - 8, Math.round(y) + .5); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = c['ink-2'];
            ctx.font = `600 11px ${this.#font}`;
            ctx.fillText(lane.label.toUpperCase(), 12, y);
        });

        // Envelopes.
        ctx.lineCap = 'round';
        for (const event of this.#events) {
            const ex = x(event.t);
            if (ex < gutter - 12) continue;
            const from = this.#lane(event.from), to = this.#lane(event.to);
            if (from < 0 || to < 0) continue;
            const y1 = laneY(from), y2 = laneY(to);
            const age = Math.min(1, (now - event.t) / 400);
            ctx.strokeStyle = c[event.kind];
            ctx.fillStyle = c[event.kind];
            ctx.globalAlpha = 0.7;
            if (from === to) {
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(ex - 4, y1 - 4); ctx.lineTo(ex + 4, y1 + 4); ctx.moveTo(ex + 4, y1 - 4); ctx.lineTo(ex - 4, y1 + 4); ctx.stroke();
            } else {
                // The head travels to the receiving lane during the first 400 ms.
                const slant = 14, headY = y1 + (y2 - y1) * (reducedMotion.matches ? 1 : age);
                ctx.lineWidth = 1.25;
                ctx.beginPath(); ctx.moveTo(ex, y1); ctx.lineTo(ex + slant * (headY - y1) / (y2 - y1 || 1), headY); ctx.stroke();
                ctx.beginPath(); ctx.arc(ex + slant * (headY - y1) / (y2 - y1 || 1), headY, 1.75, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        // Drop events that have scrolled out of view.
        const cutoff = now - this.#windowMs * 1.2;
        if (this.#events.length && this.#events[0].t < cutoff) this.#events = this.#events.filter(event => event.t >= cutoff);
    }
}

/**
 * Shows the region of a source file between `// #region name` and
 * `// #endregion`, so the code on the page is the code that runs.
 */
export async function mountSource(element, url, region) {
    const pre = element.querySelector('pre');
    try {
        const text = await (await fetch(url)).text();
        const start = text.indexOf(`// #region ${region}`);
        const end = text.indexOf('// #endregion', start);
        if (start < 0 || end < 0) throw new Error(`Region ${region} not found`);
        const lines = text.slice(text.indexOf('\n', start) + 1, end).replace(/\s+$/, '').split('\n');
        const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length));
        pre.innerHTML = highlight(lines.map(line => line.slice(indent)).join('\n'));
    } catch (error) {
        pre.textContent = `Could not load ${url}: ${error.message}`;
    }
}

const TOKENS = /(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(const|let|await|async|import|from|export|function|return|new|if|else|for|of|throw|try|catch|finally|while|class|this|null|true|false|undefined)\b|\b(\d[\d_.]*)\b/g;

/** Escapes and colours JavaScript for a <pre>; used by the demos, docs and home page. */
export function highlight(source) {
    const escape = text => text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
    let out = '', last = 0;
    for (const match of source.matchAll(TOKENS)) {
        out += escape(source.slice(last, match.index));
        const [token, comment, string, keyword] = match;
        const cls = comment ? 'tok-c' : string ? 'tok-s' : keyword ? 'tok-k' : 'tok-n';
        out += `<span class="${cls}">${escape(token)}</span>`;
        last = match.index + token.length;
    }
    return out + escape(source.slice(last));
}

/** Small helpers shared by the demos. */
export const $ = (selector, root = document) => root.querySelector(selector);
export const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
export function median(values) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
