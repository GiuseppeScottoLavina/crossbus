import { CrossBus, BroadcastChannelTransport } from '../assets/crossbus.min.js';
import { BusTrace, traced, mountSource, $, fmt } from './shared.js';

const COLORS = [
    { name: 'Cobalt', value: '#2f5bff' }, { name: 'Teal', value: '#0e9f76' }, { name: 'Amber', value: '#c98a00' },
    { name: 'Red', value: '#d0342c' }, { name: 'Violet', value: '#7a4cd9' }, { name: 'Cyan', value: '#0b8bb3' }
];
const pick = COLORS[Math.floor(Math.random() * COLORS.length)];
const me = { id: Math.random().toString(36).slice(2, 8), color: pick.value, label: `${pick.name} tab`, since: Date.now() };
const olderThanMe = tab => tab.since < me.since || (tab.since === me.since && tab.id < me.id);

const trace = new BusTrace($('#trace'), { lanes: [{ id: 'self', label: 'this tab' }, { id: 'others', label: 'other tabs' }] });
const board = $('#board');
const ink = board.getContext('2d');
const tabs = new Map();            // id -> { color, label, lastSeen, cursor }
const strokes = new Map();         // id -> { color, points: number[] }
const stats = { sent: 0, received: 0, latency: NaN };

// #region wiring
// Every tab of this page runs the same code on the same channel.
const bus = CrossBus.createSecure({ peerId: me.id, allowedOrigins: ['broadcast'] });
const channel = new BroadcastChannelTransport({ channelName: 'crossbus-demo:tabs' });

// All other tabs are reached through one BroadcastChannel, bound as one peer.
bus.addTransport(traced(channel, trace, 'self', 'others'), { peerId: 'tabs', origin: 'broadcast' });

// Tabs of one origin trust each other here: the tab ID inside each payload is
// self-reported, which is acceptable only because every tab runs this page.
bus.on('board:segment', event => drawSegment(event.data.payload));
bus.on('cursor:move', event => moveCursor(event.data.payload));
bus.on('tab:hello', event => greet(event.data.payload));
bus.on('tab:bye', event => forget(event.data.payload.id));
bus.on('board:snapshot', event => restore(event.data.payload));
bus.on('board:clear', () => clearBoard(false));

const send = (name, payload) => { stats.sent++; return bus.signal(name, { ...payload, sentAt: Date.now() }); };
// #endregion

// ── Presence ─────────────────────────────────────────────

function received(payload) {
    stats.received++;
    if (Number.isFinite(payload?.sentAt)) stats.latency = Math.max(0, Date.now() - payload.sentAt);
}

function greet(payload) {
    received(payload);
    const { id, color, label, since, first } = payload;
    if (typeof id !== 'string' || id === me.id) return;
    const known = tabs.has(id);
    tabs.set(id, { ...(tabs.get(id) ?? {}), id, color, label, since, lastSeen: Date.now() });
    // The newer of two tabs with the same colour picks one nobody uses.
    if (color === me.color && olderThanMe({ id, since })) recolor();
    else if (!known) send('tab:hello', hello());
    // The longest-open tab answers a newcomer with the current drawing.
    if (first && isOldest() && strokes.size) send('board:snapshot', { to: id, strokes: snapshot() });
    renderTabs();
}

const hello = (extra = {}) => ({ id: me.id, color: me.color, label: me.label, since: me.since, ...extra });

// Newest strokes first, up to about 40,000 coordinates, well inside the bus payload budget.
function snapshot() {
    const out = [];
    let budget = 40000;
    for (const entry of [...strokes].reverse()) {
        budget -= entry[1].points.length;
        if (budget < 0) break;
        out.unshift(entry);
    }
    return out;
}

function recolor() {
    const used = new Set([...tabs.values()].map(tab => tab.color));
    const free = COLORS.filter(color => !used.has(color.value));
    const next = free[Math.floor(Math.random() * free.length)] ?? COLORS[Math.floor(Math.random() * COLORS.length)];
    me.color = next.value;
    me.label = `${next.name} tab`;
    $('#me-swatch').style.background = me.color;
    $('#me-label').textContent = me.label;
    send('tab:hello', hello());
}

function isOldest() {
    return [...tabs.values()].every(tab => !olderThanMe(tab));
}

function forget(id) {
    tabs.delete(id);
    $(`.cursor[data-id="${CSS.escape(id)}"]`)?.remove();
    renderTabs();
}

setInterval(() => {
    send('tab:hello', hello());
    const stale = Date.now() - 8000;
    for (const [id, tab] of tabs) if (tab.lastSeen < stale) forget(id);
    renderReadouts();
}, 2500);

addEventListener('pagehide', () => bus.signal('tab:bye', { id: me.id }));

function renderTabs() {
    const list = $('#tab-list');
    const items = [[me.id, { ...me, self: true }], ...tabs];
    list.replaceChildren(...items.map(([id, tab]) => {
        const item = document.createElement('li');
        item.innerHTML = '<i></i><span></span><code></code>';
        item.querySelector('i').style.background = tab.color;
        item.querySelector('span').textContent = tab.self ? `${tab.label} (this tab)` : tab.label;
        item.querySelector('code').textContent = id;
        return item;
    }));
    $('#alone').hidden = tabs.size > 0;
    renderReadouts();
}

function renderReadouts() {
    $('#r-tabs').textContent = tabs.size + 1;
    $('#r-sent').textContent = fmt(stats.sent);
    $('#r-received').textContent = fmt(stats.received);
    $('#r-latency').innerHTML = Number.isFinite(stats.latency) ? `${stats.latency < 1 ? '<1' : fmt(stats.latency)}<small>ms</small>` : '—';
}

// ── Board ────────────────────────────────────────────────

function sizeBoard() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    board.width = Math.round(board.clientWidth * dpr);
    board.height = Math.round(board.clientWidth * 0.56 * dpr);
    redraw();
}

function line(color, points, from = 0) {
    if (points.length < 4) return;
    ink.strokeStyle = color;
    ink.lineWidth = 3 * Math.min(devicePixelRatio || 1, 2);
    ink.lineCap = 'round';
    ink.lineJoin = 'round';
    ink.beginPath();
    ink.moveTo(points[from] * board.width, points[from + 1] * board.height);
    for (let i = from + 2; i < points.length; i += 2) ink.lineTo(points[i] * board.width, points[i + 1] * board.height);
    ink.stroke();
}

function trim() {
    while (strokes.size > 300) strokes.delete(strokes.keys().next().value);
}

function redraw() {
    ink.clearRect(0, 0, board.width, board.height);
    for (const stroke of strokes.values()) line(stroke.color, stroke.points);
}

function drawSegment(payload) {
    received(payload);
    const { id, color, points } = payload;
    if (typeof id !== 'string' || !Array.isArray(points) || points.length > 2000 || !points.every(Number.isFinite)) return;
    const stroke = strokes.get(id) ?? { color, points: [] };
    const from = Math.max(0, stroke.points.length - 2);
    stroke.points.push(...points);
    strokes.set(id, stroke);
    trim();
    line(color, stroke.points, from);
    $('#empty').hidden = true;
}

function restore(payload) {
    received(payload);
    if (payload.to !== me.id || strokes.size || !Array.isArray(payload.strokes)) return;
    for (const [id, stroke] of payload.strokes) if (Array.isArray(stroke?.points)) strokes.set(id, stroke);
    redraw();
    $('#empty').hidden = strokes.size > 0;
}

function clearBoard(broadcast) {
    strokes.clear();
    redraw();
    $('#empty').hidden = false;
    if (broadcast) send('board:clear', {});
}

// Local drawing: points are normalised so tabs of any size agree.
let current = null, pending = [], flushTimer = 0;
const point = event => {
    const rect = board.getBoundingClientRect();
    return [+((event.clientX - rect.left) / rect.width).toFixed(4), +((event.clientY - rect.top) / rect.height).toFixed(4)];
};

function flush() {
    flushTimer = 0;
    if (!current || !pending.length) return;
    const stroke = strokes.get(current);
    // Include the previous point so each segment joins the last one.
    const joint = stroke.points.length > pending.length ? stroke.points.slice(-pending.length - 2, -pending.length) : [];
    send('board:segment', { id: current, color: me.color, points: [...joint, ...pending] });
    pending = [];
}

board.addEventListener('pointerdown', event => {
    board.setPointerCapture(event.pointerId);
    current = `${me.id}-${Date.now().toString(36)}`;
    strokes.set(current, { color: me.color, points: point(event) });
    trim();
    pending = [...strokes.get(current).points];
    $('#empty').hidden = true;
});

board.addEventListener('pointermove', event => {
    const [x, y] = point(event);
    cursorQueue = { id: me.id, color: me.color, label: me.label, x, y };
    if (!current) return;
    const stroke = strokes.get(current);
    const from = stroke.points.length - 2;
    stroke.points.push(x, y);
    pending.push(x, y);
    line(me.color, stroke.points, from);
    flushTimer ||= setTimeout(flush, 40);
});

const endStroke = () => { flush(); current = null; };
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);
board.addEventListener('pointerleave', () => { cursorQueue = { id: me.id, x: -1, y: -1 }; });

// Cursor positions are sent at most 30 times per second.
let cursorQueue = null;
setInterval(() => { if (cursorQueue) { send('cursor:move', cursorQueue); cursorQueue = null; } }, 33);

function moveCursor(payload) {
    received(payload);
    const { id, x, y } = payload;
    if (typeof id !== 'string' || id === me.id || !tabs.has(id)) return;
    let cursor = $(`.cursor[data-id="${CSS.escape(id)}"]`);
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.className = 'cursor';
        cursor.dataset.id = id;
        cursor.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1l5.5 13 2-5.5L14 6.5z"/></svg><span></span>';
        $('#cursors').append(cursor);
    }
    const tab = tabs.get(id);
    cursor.style.color = tab.color;
    cursor.querySelector('span').textContent = tab.label;
    cursor.hidden = x < 0;
    cursor.style.left = `${x * 100}%`;
    cursor.style.top = `${y * 100}%`;
}

// ── Controls ─────────────────────────────────────────────

$('#open-tab').addEventListener('click', () => open(location.href, '_blank'));
$('#clear').addEventListener('click', () => clearBoard(true));
$('#me-swatch').style.background = me.color;
$('#me-label').textContent = me.label;
$('#me-id').textContent = me.id;

new ResizeObserver(sizeBoard).observe(board);
mountSource($('#src-wiring'), new URL('./tabs.js', import.meta.url), 'wiring');
renderTabs();
send('tab:hello', hello({ first: true }));
