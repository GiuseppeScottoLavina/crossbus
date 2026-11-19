// Home page: code tabs, copy buttons and the live strip, where this page asks
// a module Worker to count primes and the trace draws every envelope.
import { CrossBus, MessageChannelTransport } from './assets/crossbus.min.js';
import { BusTrace, traced, mountSource, highlight, $ } from './demos/shared.js';

for (const pre of document.querySelectorAll('pre.snippet')) pre.innerHTML = highlight(pre.textContent);

for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(button.dataset.copy);
            button.textContent = 'Copied';
            button.dataset.state = 'done';
        } catch {
            // Clipboard access can be denied; select the command instead.
            getSelection().selectAllChildren(button.previousElementSibling);
            button.textContent = 'Press Ctrl+C';
        }
        setTimeout(() => { button.textContent = 'Copy'; delete button.dataset.state; }, 1600);
    });
}

const tabs = [...document.querySelectorAll('.code-tabs [role="tab"]')];
function select(tab) {
    for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
}
for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        const next = tabs[(index + step + tabs.length) % tabs.length];
        select(next);
        next.focus();
    });
}
mountSource($('#src-page'), new URL('./home.js', import.meta.url), 'page');
mountSource($('#src-worker'), new URL('./home-worker.js', import.meta.url), 'worker');

const trace = new BusTrace($('#trace'), { lanes: [{ id: 'page', label: 'this page' }, { id: 'worker', label: 'worker' }] });
const status = $('#hero-status');
const LIMITS = [20_000, 50_000, 100_000, 200_000];
let answered = 0, sentAt = 0;
const startTimer = setTimeout(() => { status.textContent = 'This browser did not start the module Worker.'; }, 8000);

// #region page
const bus = CrossBus.createSecure({
    peerId: 'page',
    allowedOrigins: ['channel']
});
const url = new URL('./home-worker.js', import.meta.url);
const worker = new Worker(url, { type: 'module' });
const channel = new MessageChannelTransport();
// `traced` only draws each envelope on the strip below.
const link = traced(channel, trace, 'page', 'worker');
bus.addTransport(link, { peerId: 'worker', origin: 'channel' });

const ready = new Promise(resolve =>
    bus.once('worker:ready', resolve, { mode: 'sync' }));
worker.postMessage({ port: channel.remotePort }, [channel.remotePort]);
channel.markRemoteTransferred();
await ready;

// Every 600 ms while the page is visible, ask for a new count.
setInterval(async () => {
    if (document.hidden) return;
    const below = nextLimit();
    try {
        const { count } = await bus.request('worker', 'primes', { below });
        report(below, count);
    } catch (error) {
        report(below, error);
    }
}, 600);
// #endregion

function nextLimit() {
    sentAt = performance.now();
    return LIMITS[answered % LIMITS.length];
}

function report(below, result) {
    clearTimeout(startTimer);
    if (result instanceof Error) { status.textContent = `Request failed: ${result.message}`; return; }
    answered++;
    status.textContent = `${answered} requests answered by a module Worker · ${result.toLocaleString('en-US')} primes below ${below.toLocaleString('en-US')} · round trip ${(performance.now() - sentAt).toFixed(1)} ms`;
    document.body.dataset.live = String(answered);
}
