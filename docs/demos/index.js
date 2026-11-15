// The live strip on the demos index: a real module Worker renders a small
// tile on request every 300 ms, and each envelope is drawn as it travels.
import { CrossBus, MessageChannelTransport } from '../assets/crossbus.min.js';
import { BusTrace, traced, $ } from './shared.js';

const trace = new BusTrace($('#trace'), { lanes: [{ id: 'page', label: 'this page' }, { id: 'worker', label: 'worker' }] });
const status = $('#hero-status');
const bus = CrossBus.createSecure({ peerId: 'page', allowedOrigins: ['channel'] });
const worker = new Worker(new URL('./fractal-worker.js', import.meta.url), { type: 'module' });
const channel = new MessageChannelTransport();

const ready = new Promise(resolve => {
    const subscription = bus.on('worker:ready', () => { subscription.unsubscribe(); resolve(); });
});
bus.addTransport(traced(channel, trace, 'page', 'worker'), { peerId: 'worker', origin: 'channel' });
worker.postMessage({ type: 'crossbus:connect', name: 'worker', wireFormat: 'standard', port: channel.remotePort }, [channel.remotePort]);

await ready;
let count = 0;
const tick = async () => {
    if (document.hidden) return;
    const started = performance.now();
    const x = (count * 7) % 400;
    await bus.request('worker', 'tile', { x, y: 0, w: 16, h: 16, width: 400, height: 240, cx: -0.74, cy: 0.12, scale: 0.0004, maxIter: 512 });
    count++;
    status.textContent = `${count} requests answered by a module Worker · last round trip ${(performance.now() - started).toFixed(1)} ms`;
    document.body.dataset.live = String(count);
};
setInterval(tick, 300);
tick();
