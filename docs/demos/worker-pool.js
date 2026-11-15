import { CrossBus, MessageChannelTransport } from '../assets/crossbus.min.js';
import { BusTrace, traced, mountSource, $, fmt, median } from './shared.js';
import { buildPalette, renderTile } from './fractal.js';

const canvas = $('#fractal');
const ctx = canvas.getContext('2d');
const trace = new BusTrace($('#trace'), { lanes: [{ id: 'main', label: 'main' }] });
const cores = Math.max(1, navigator.hardwareConcurrency || 4);
const TILE = 80;
const HOME = { cx: -0.62, cy: 0, span: 3.1 };
// The renderer works in 64-bit floats. Near |z| = 2 adjacent doubles are
// 2^-51 apart; below about 64 of those per pixel, neighbouring pixels round
// to the same point and the image breaks into blocks, so zoom stops here.
const MIN_SCALE = 2 ** -45;

const state = {
    workers: Math.min(4, cores),
    wireFormat: 'standard',
    runOn: 'workers',
    maxIter: 1024,
    view: { ...HOME, scale: 0 },
    generation: 0,
    pool: []
};

// #region main
const bus = CrossBus.createSecure({ peerId: 'main', allowedOrigins: ['channel'] });

async function startWorker(name, wireFormat) {
    const worker = new Worker(new URL('./fractal-worker.js', import.meta.url), { type: 'module' });
    const channel = new MessageChannelTransport({ wireFormat });
    const ready = new Promise(resolve => {
        const subscription = bus.on('worker:ready', event => {
            if (event.data.source !== name) return;
            subscription.unsubscribe();
            resolve();
        });
    });
    // `traced` only draws each envelope on the bus trace below.
    const disconnect = bus.addTransport(traced(channel, trace, 'main', name), { peerId: name, origin: 'channel' });
    worker.postMessage({ type: 'crossbus:connect', name, wireFormat, port: channel.remotePort }, [channel.remotePort]);
    await ready;
    return { name, stop() { disconnect(); worker.terminate(); } };
}

// Each tile is one request; the Worker returns its pixels.
const renderOnWorker = (name, tile) => bus.request(name, 'tile', tile);
// #endregion

async function restartPool() {
    for (const member of state.pool.splice(0)) member.stop();
    if (state.runOn !== 'workers') { trace.setLanes([{ id: 'main', label: 'main' }]); return; }
    const names = Array.from({ length: state.workers }, (_, i) => `worker-${i + 1}`);
    trace.setLanes([{ id: 'main', label: 'main' }, ...names.map(name => ({ id: name, label: name.replace('worker-', 'w') }))]);
    state.pool = await Promise.all(names.map(name => startWorker(name, state.wireFormat)));
}

// ── Rendering ────────────────────────────────────────────

function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(width * 0.58);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    state.view.span = Math.max(state.view.span, MIN_SCALE * canvas.width);
    state.view.scale = state.view.span / canvas.width;
}

function tiles() {
    const { width, height } = canvas;
    const list = [];
    for (let y = 0; y < height; y += TILE) for (let x = 0; x < width; x += TILE) {
        list.push({ x, y, w: Math.min(TILE, width - x), h: Math.min(TILE, height - y), width, height,
            cx: state.view.cx, cy: state.view.cy, scale: state.view.scale, maxIter: state.maxIter });
    }
    // Centre first, so the interesting part appears early.
    const mx = width / 2, my = height / 2;
    return list.sort((a, b) => Math.hypot(a.x + a.w / 2 - mx, a.y + a.h / 2 - my) - Math.hypot(b.x + b.w / 2 - mx, b.y + b.h / 2 - my));
}

function paint({ x, y, w, h, pixels }) {
    ctx.putImageData(new ImageData(pixels, w, h), x, y);
}

const readout = {
    time: $('#r-time'), tiles: $('#r-tiles'), rtt: $('#r-rtt'), inflight: $('#r-inflight'),
    frame: $('#r-frame'), by: $('#r-by'), status: $('#status')
};

async function render() {
    sizeCanvas();
    const generation = ++state.generation;
    const queue = tiles();
    const total = queue.length;
    const roundTrips = [];
    let done = 0, inFlight = 0, peak = 0;
    const start = performance.now();
    heartbeat.reset();
    readout.status.textContent = 'Rendering…';
    readout.by.textContent = state.runOn === 'workers' ? `${state.pool.length} Worker${state.pool.length > 1 ? 's' : ''}` : 'Main thread';
    readout.tiles.innerHTML = `0<small>/ ${total}</small>`;

    const update = () => {
        readout.tiles.innerHTML = `${done}<small>/ ${total}</small>`;
        readout.time.innerHTML = `${fmt(performance.now() - start)}<small>ms</small>`;
        readout.rtt.innerHTML = roundTrips.length ? `${fmt(median(roundTrips), 1)}<small>ms</small>` : '—';
        readout.inflight.textContent = peak || '—';
    };

    if (state.runOn === 'main') {
        // Deliberately synchronous: this is what blocking the main thread looks like.
        await new Promise(resolve => setTimeout(resolve, 30));
        const palette = mainPalette ??= buildPalette();
        for (const tile of queue) { paint(renderTile(tile, palette)); done++; }
        update();
    } else {
        await Promise.all(state.pool.map(async member => {
            while (queue.length && generation === state.generation) {
                const tile = queue.shift();
                inFlight++; peak = Math.max(peak, inFlight);
                const sent = performance.now();
                const result = await renderOnWorker(member.name, tile);
                inFlight--;
                roundTrips.push(performance.now() - sent);
                if (generation !== state.generation) return;
                paint(result);
                done++;
                if (done % 8 === 0) update();
            }
        }));
        if (generation !== state.generation) return;
        update();
    }
    readout.status.textContent = `Rendered ${total} tiles in ${fmt(performance.now() - start)} ms`;
    canvas.dataset.rendered = String(generation);
}
let mainPalette;

// ── Main-thread heartbeat ────────────────────────────────
// A dot moved by requestAnimationFrame: it stops whenever the main thread is busy.

const heartbeat = (() => {
    const dot = $('#beat-dot');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let last = performance.now(), longest = 0, phase = 0;
    const tick = now => {
        const delta = now - last;
        last = now;
        longest = Math.max(longest, delta);
        phase = (phase + delta / 1400) % 1;
        if (!still.matches) dot.style.transform = `translateX(${(Math.sin(phase * Math.PI * 2) * 0.5 + 0.5) * 100}%)`;
        readout.frame.innerHTML = `${fmt(longest)}<small>ms</small>`;
        readout.frame.closest('.readout').dataset.state = longest > 100 ? 'bad' : longest > 34 ? 'warn' : 'ok';
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { reset() { longest = 0; last = performance.now(); } };
})();

// ── Controls ─────────────────────────────────────────────

for (const input of document.querySelectorAll('input[name="workers"]')) {
    input.disabled = Number(input.value) > cores;
    input.checked = Number(input.value) === state.workers;
}
$('#cores').textContent = `This browser reports ${cores} logical core${cores > 1 ? 's' : ''}`;

async function apply(change) {
    Object.assign(state, change);
    const workerOnly = state.runOn !== 'workers';
    for (const input of document.querySelectorAll('input[name="workers"], input[name="wire"]')) {
        input.disabled = workerOnly || (input.name === 'workers' && Number(input.value) > cores);
    }
    readout.status.textContent = state.runOn === 'workers' ? 'Starting Workers…' : 'Main thread selected';
    await restartPool();
    await render();
}

$('#controls').addEventListener('change', event => {
    const { name, value } = event.target;
    if (name === 'workers') apply({ workers: Number(value) });
    if (name === 'wire') apply({ wireFormat: value });
    if (name === 'runon') apply({ runOn: value });
    if (name === 'detail') { state.maxIter = Number(value); render(); }
});

function zoom(factor, px = canvas.width / 2, py = canvas.height / 2) {
    const { view } = state;
    view.cx += (px - canvas.width / 2) * view.scale;
    view.cy += (py - canvas.height / 2) * view.scale;
    const minSpan = MIN_SCALE * canvas.width;
    view.span = Math.min(HOME.span * 1.5, Math.max(minSpan, view.span * factor));
    const deepest = view.span <= minSpan * 1.0001;
    // Enough decimals to tell this view from its neighbour.
    const digits = Math.min(16, Math.max(6, Math.ceil(-Math.log10(view.span)) + 3));
    $('#coords').textContent = `centre ${view.cx.toFixed(digits)} ${view.cy >= 0 ? '+' : '−'} ${Math.abs(view.cy).toFixed(digits)}i · width ${view.span.toPrecision(3)}`
        + (deepest ? ' · deepest zoom 64-bit floats can draw' : '');
    $('#zoom-in').disabled = deepest;
    canvas.dataset.deepest = String(deepest);
    render();
}

canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / rect.width;
    const py = (event.clientY - rect.top) * canvas.height / rect.height;
    zoom(event.shiftKey || event.altKey ? 2.5 : 0.4, px, py);
});
canvas.addEventListener('contextmenu', event => { event.preventDefault(); zoom(2.5); });
$('#zoom-in').addEventListener('click', () => zoom(0.4));
$('#zoom-out').addEventListener('click', () => zoom(2.5));
$('#reset').addEventListener('click', () => { Object.assign(state.view, HOME); zoom(1); });
$('#again').addEventListener('click', () => render());

let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (canvas.dataset.rendered) render(); }, 200); }).observe(canvas);

mountSource($('#src-main'), new URL('./worker-pool.js', import.meta.url), 'main');
mountSource($('#src-worker'), new URL('./fractal-worker.js', import.meta.url), 'worker');

apply({});
