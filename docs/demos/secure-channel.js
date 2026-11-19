import { CrossBus } from '../assets/crossbus.min.js';
import { Encryption, withEncryption } from '../assets/plugins/encryption.min.js';
import { BusTrace, messageKind, mountSource, $ } from './shared.js';

const trace = new BusTrace($('#trace'), { lanes: [{ id: 'client', label: 'client' }, { id: 'server', label: 'server' }] });
const euro = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
const DELAY = 220;

// ── The server's ledger: what an attacker wants to change ──

const ledger = {
    balance: 1000,
    entries: [],
    transfer({ to, amount }, requestId) {
        if (typeof to !== 'string' || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transfer');
        const attack = attempts.get(requestId);
        if (amount > this.balance) {
            if (attack) settle(attack, 'accepted', 'Handler ran; balance too low');
            throw Object.assign(new Error('Insufficient funds'), { code: 'ERR_FUNDS' });
        }
        this.balance -= amount;
        this.entries.unshift({ to, amount, attack: Boolean(attack) });
        if (attack) settle(attack, 'accepted', `Handler ran: ${euro(amount)} sent to ${to}`);
        renderLedger();
        return { sent: amount, to, balance: this.balance };
    }
};

// ── The wire: every envelope between the two buses passes through here ──

const wire = {
    seq: 0,
    captured: [],
    carry(from, to, message, injected = false) {
        const entry = { seq: ++this.seq, from, to, message, kind: messageKind(message), injected };
        // The attacker only captures genuine client traffic.
        if (from === 'client' && message.type === 'req' && !injected) this.captured.unshift(entry);
        trace.record(from, to, entry.kind);
        renderEnvelope(entry);
        setTimeout(() => endpoints?.[to].handleMessage(message, 'wire', from)?.catch?.(() => {}), DELAY);
    },
    inject(message, label) {
        const attack = { id: message.id, label, status: 'pending' };
        attempts.set(message.id, attack);
        renderAttempt(attack);
        this.carry('client', 'server', message, true);
        // No handler ran and nothing was refused: the request was dropped.
        setTimeout(() => { if (attack.status === 'pending') settle(attack, 'refused', 'No effect'); }, DELAY + 600);
    }
};

const attempts = new Map();
let endpoints = null;
let key = null;

// #region wiring
async function connect(encrypted) {
    const client = CrossBus.createSecure({ peerId: 'client', allowedOrigins: ['wire'] });
    const server = CrossBus.createSecure({ peerId: 'server', allowedOrigins: ['wire'] });

    // The application gives both endpoints the same key.
    key ??= await Encryption.generateKey();

    // In a real app this is a MessageChannel, iframe or WebSocket.
    // Here the page carries each envelope so you can see and attack it.
    client.addPeer('server', message => wire.carry('client', 'server', message));
    server.addPeer('client', message => wire.carry('server', 'client', message));

    if (encrypted) {
        withEncryption(client, key);
        // Same as withEncryption(server, key), plus a report of each refusal.
        const { encryptHook, decryptHook } = Encryption.createEncryptedHooks(key);
        server.addOutboundHook(encryptHook, 10, { errors: true });
        server.addInboundHook(async (payload, context) => {
            try { return await decryptHook(payload, context); }
            catch (error) { refused(context.requestId, error.code); throw error; }
        }, 10, { errors: true });
    }

    server.handle('account.balance', () => ({ balance: ledger.balance }));
    server.handle('payments.transfer', (data, context) => ledger.transfer(data, context.requestId));
    return { client, server };
}
// #endregion

// ── Attacks: the page holds the wire, not the key ──

function lastRequest(name) {
    return wire.captured.find(entry => entry.message.payload?.name === name || name === '*')?.message;
}

const attacks = {
    replay() {
        const original = lastRequest('payments.transfer');
        if (!original) return note('Send €25 to Alex first, so there is a transfer to replay.');
        wire.inject(structuredClone(original), 'Replay the last transfer');
    },
    forge() {
        wire.inject({
            _cb: 1, version: 1, id: `forged-${Date.now().toString(36)}`, type: 'req', timestamp: Date.now(),
            payload: { name: 'payments.transfer', data: { to: 'Mallory', amount: 500 }, source: 'client', dest: 'server' }
        }, 'Forge a €500 transfer to Mallory');
    },
    tamper() {
        const original = lastRequest('payments.transfer');
        if (!original) return note('Send €25 to Alex first, so there is a transfer to change.');
        const copy = structuredClone(original);
        copy.id = `tampered-${Date.now().toString(36)}`;
        const data = copy.payload.data;
        if (data?._encrypted) {
            // Without the key, the best an attacker can do is change bytes blindly.
            const bytes = atob(data.ciphertext).split('');
            bytes[3] = String.fromCharCode(bytes[3].charCodeAt(0) ^ 1);
            data.ciphertext = btoa(bytes.join(''));
            // GCM authentication fails before the replay check runs.
        } else {
            data.amount = 400;
            data.to = 'Mallory';
        }
        wire.inject(copy, 'Change the amount and recipient');
    }
};

function refused(requestId, code) {
    trace.record('server', 'server', 'bad');
    const attack = attempts.get(requestId);
    if (attack) settle(attack, 'refused', code ?? 'Refused');
}

function settle(attack, status, detail) {
    if (attack.status !== 'pending') return;
    attack.status = status;
    attack.detail = detail;
    renderAttempt(attack);
}

// ── Rendering ────────────────────────────────────────────

function renderLedger() {
    $('#balance').textContent = euro(ledger.balance);
    $('#balance').dataset.state = ledger.entries.some(entry => entry.attack) ? 'bad' : 'ok';
    $('#ledger').replaceChildren(...ledger.entries.slice(0, 6).map(entry => {
        const item = document.createElement('li');
        item.className = entry.attack ? 'is-attack' : '';
        item.innerHTML = '<span></span><b></b>';
        item.querySelector('span').textContent = entry.attack ? `⚠ ${entry.to}` : entry.to;
        if (entry.attack) item.title = 'Transfer made by an attack';
        item.querySelector('b').textContent = `−${euro(entry.amount)}`;
        return item;
    }));
    $('#ledger-empty').hidden = ledger.entries.length > 0;
}

function describe(message) {
    const payload = message.payload ?? {};
    if (message.type === 'req') return { name: payload.name, body: payload.data };
    if (message.type === 'res') return { name: payload.success === false ? 'error' : 'response', body: payload.success === false ? payload.error : payload.data };
    return { name: payload.name ?? message.type, body: payload.data };
}

function renderEnvelope(entry) {
    const list = $('#wire');
    const { name, body } = describe(entry.message);
    const item = document.createElement('li');
    item.className = `env k-${entry.kind}${entry.injected ? ' is-injected' : ''}`;
    item.innerHTML = '<details><summary><span class="dir"></span><span class="kind"></span><span class="name"></span><code class="body"></code></summary><pre></pre></details>';
    item.querySelector('.dir').textContent = entry.injected ? 'attacker → server' : entry.from === 'client' ? 'client → server' : 'server → client';
    item.querySelector('.kind').textContent = { req: 'request', res: 'response', bad: 'error', sig: 'signal' }[entry.kind];
    item.querySelector('.name').textContent = name ?? '';
    item.querySelector('.body').textContent = JSON.stringify(body) ?? 'null';
    item.querySelector('pre').textContent = JSON.stringify(entry.message, null, 2);
    list.prepend(item);
    while (list.children.length > 40) list.lastElementChild.remove();
    $('#wire-empty').hidden = true;
}

function renderAttempt(attack) {
    let item = $(`#attempts [data-id="${CSS.escape(attack.id)}"]`);
    if (!item) {
        item = document.createElement('li');
        item.dataset.id = attack.id;
        item.innerHTML = '<span class="label"></span><span class="badge"></span>';
        $('#attempts').prepend(item);
    }
    item.querySelector('.label').textContent = attack.label;
    const badge = item.querySelector('.badge');
    badge.className = `badge ${attack.status === 'pending' ? 'idle' : attack.status === 'refused' ? 'ok' : 'bad'}`;
    badge.textContent = attack.status === 'pending' ? 'on the wire…' : attack.status === 'refused' ? `Refused · ${attack.detail}` : attack.detail;
    item.dataset.status = attack.status;
    $('#attempts-empty').hidden = true;
}

function note(text) { $('#client-result').textContent = text; }

async function reset(encrypted) {
    endpoints?.client.destroy();
    endpoints?.server.destroy();
    endpoints = null;
    ledger.balance = 1000;
    ledger.entries = [];
    wire.captured = [];
    attempts.clear();
    $('#wire').replaceChildren();
    $('#attempts').replaceChildren();
    $('#wire-empty').hidden = false;
    $('#attempts-empty').hidden = false;
    trace.reset();
    renderLedger();
    document.body.dataset.encrypted = String(encrypted);
    $('#mode').textContent = encrypted ? 'Encrypted with AES-256-GCM' : 'Plaintext';
    note('Choose an action.');
    endpoints = await connect(encrypted);
    document.body.dataset.ready = 'true';
}

// ── Controls ─────────────────────────────────────────────

$('#check').addEventListener('click', async () => {
    note('Waiting for the server…');
    const { balance } = await endpoints.client.request('server', 'account.balance', {});
    note(`Balance: ${euro(balance)}`);
});

$('#pay').addEventListener('click', async () => {
    note('Waiting for the server…');
    try {
        const result = await endpoints.client.request('server', 'payments.transfer', { to: 'Alex', amount: 25 });
        note(`Sent ${euro(result.sent)} to ${result.to}. Balance ${euro(result.balance)}.`);
    } catch (error) {
        note(`${error.code ?? 'Error'}: ${error.message}`);
    }
});

for (const [name, run] of Object.entries(attacks)) $(`#attack-${name}`).addEventListener('click', run);
$('#encryption').addEventListener('change', event => reset(event.target.value === 'on'));
$('#reset').addEventListener('click', () => reset(document.body.dataset.encrypted === 'true'));

mountSource($('#src-wiring'), new URL('./secure-channel.js', import.meta.url), 'wiring');
reset(true);
