// Verify retained evidence; this deliberately does not claim to rerun hardware.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'benchmarks/qualification/2026-11-14/';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const archived = JSON.parse(await readFile(directory + 'inputs.json', 'utf8'));
const version = archived.version;
assert.equal(version, '0.1.5');
assert.equal(archived.sourceCommit, '1114ea83cfaff39cdf074ee5ff2812b032c64971');
const checkCurrent = process.argv.includes('--check-current');
if (checkCurrent) assert.equal(JSON.parse(await readFile('package.json', 'utf8')).version, version);
const input = async (path) => {
    assert.equal(typeof archived.inputs[path], 'string', 'Missing historical input: ' + path);
    if (checkCurrent) assert.equal(sha(await readFile(path)), sha(archived.inputs[path]), path);
    return archived.inputs[path];
};
const expectedCases = [
    'standard RPC, graph cloning, async hooks and handler guards',
    'compact RPC, graph cloning, async hooks and handler guards',
    'JSON fallback decodes valid RPC and retains handler authorization',
    'typed-view ownership and receiver backing-storage budget',
    'coalesced default deadlines and destruction settle pending RPCs',
    'cross-origin window application/json with real source binding',
    'cross-origin window application/json; charset=utf-8 with real source binding',
    'real module Worker RPC and flow-controlled native binary streaming',
    'base64 stream preserves all byte values and independent chunk padding',
    'stream reorder, idle timeout and UUID v4 conformance'
];
const nonces = new Set();
const expectedHashes = new Map();
for (const name of [
    'chrome-browser',
    'firefox-browser',
    'safari-browser',
    'ipad-browser',
    'ipad-native',
    'ipad-simulator-native',
    'pixel7pro-native'
]) {
    const receipt = JSON.parse(await readFile(directory + name + '.json', 'utf8'));
    assert.ok(receipt.timestamp.startsWith('2026-11-14'));
    assert.equal(
        receipt.hashes['dist/crossbus.min.js'],
        sha(await input('dist/crossbus.min.js'))
    );
    for (const [path, hash] of Object.entries(receipt.hashes)) {
        if (!expectedHashes.has(path)) expectedHashes.set(path, sha(await input(path)));
        assert.equal(
            hash,
            expectedHashes.get(path),
            'Receipt input changed: ' + name + ': ' + path
        );
    }
    if (name.endsWith('-browser')) {
        assert.equal(receipt.kind, name.split('-')[0]);
        assert.equal(receipt.checkedCases, 10);
        assert.deepEqual(
            receipt.cases.map((c) => c.name),
            expectedCases
        );
        assert.ok(
            receipt.cases.every(
                (c) => c.passed === true && Number.isFinite(c.elapsedMs) && c.elapsedMs >= 0
            )
        );
        if (name === 'ipad-browser') {
            assert.equal(receipt.runtime.platformName, 'iOS');
            assert.equal(receipt.runtime['safari:useSimulator'], false);
        }
    } else {
        assert.equal(receipt.libraryVersion, version);
        assert.equal(receipt.physicalDevice, !name.includes('simulator'));
        assert.equal(receipt.platform, name.startsWith('ipad') ? 'ios' : 'android');
        const r = receipt.report;
        assert.equal(r.passed, true);
        assert.equal(r.echoCalls, 2);
        assert.equal(r.nativeReplies, 2);
        assert.equal(r.protectedCalls, 0);
        assert.equal(r.nativeReplyValid, true);
        assert.equal(r.deniedSendBlocked, true);
        assert.equal(r.closedSendBlocked, true);
        assert.match(r.runId, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
        assert.ok(!nonces.has(r.runId));
        nonces.add(r.runId);
        assert.deepEqual(
            r.phases.map((p) => p.phase),
            ['first', 'denied', 'complete']
        );
        assert.deepEqual(r.phases[0].checks, [
            'native echo preserves scalar and Unicode',
            'native handler error propagates',
            'native-initiated RPC returns through actual bridge',
            'malformed/oversized/subframe messages never run protected handler'
        ]);
        assert.deepEqual(r.phases[2].checks, [
            ...r.phases[0].checks.slice(0, 3),
            'wrong-origin navigation never runs protected handler',
            'RPC reinitializes after allowed navigation',
            'destroy cancels pending RPC',
            'destroy removes JavaScript receive callback'
        ]);
        assert.equal(r.phases[1].origin, '<denied fixture origin>');
        if (name === 'pixel7pro-native') {
            assert.equal(receipt.consumedMavenAar, true);
            assert.equal(r.phases[1].androidObjectExposed, false);
        }
    }
    console.log(name, 'verified against', receipt.hashes['dist/crossbus.min.js']);
}

console.log('Historical 0.1.5 receipts verified; no current-device qualification implied.');

// 0.1.7 on a physical iPad (19 November 2026): Safari browser suite, native
// host, and a second native run with a test-only host patch that tries a
// non-JSON reply before the valid one.
{
    const dir = 'benchmarks/qualification/2026-11-19/';
    const archive = JSON.parse(await readFile(dir + 'inputs.json', 'utf8'));
    assert.equal(archive.version, '0.1.7');
    assert.equal(archive.sourceCommit, '313e61d297dd3a0876a9d66e79e29ef0d70f3042');
    const hostPath = 'tests/native/ios-host/Main.swift';
    const original = archive.inputs[hostPath];
    const patched = archive.patchedInputs[hostPath];
    // The archived patched host must be the original plus exactly the patch's lines.
    const patch = (await readFile(dir + 'json-reply-test-host.patch', 'utf8')).split('\n');
    const removed = patch.filter((line) => line.startsWith('-') && !line.startsWith('---')).map((line) => line.slice(1));
    const added = patch.filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
    const without = (text, lines) => {
        const pending = [...lines];
        return text.split('\n').filter((line) => {
            const index = pending.indexOf(line);
            if (index < 0) return true;
            pending.splice(index, 1);
            return false;
        });
    };
    assert.ok(removed.every((line) => original.split('\n').includes(line)) && added.every((line) => patched.split('\n').includes(line)));
    assert.deepEqual(without(original, removed), without(patched, added), 'Patched host is not the original plus the patch');
    const expectedCases017 = [
        expectedCases[0], expectedCases[1],
        'compact-v2 RPC, graph cloning, async hooks and handler guards',
        ...expectedCases.slice(2)
    ];
    const runIds = new Set();
    for (const [name, sources] of [
        ['ipad-safari', archive.inputs],
        ['ipad-native', archive.inputs],
        ['ipad-native-json-guard', { ...archive.inputs, ...archive.patchedInputs }]
    ]) {
        const receipt = JSON.parse(await readFile(dir + name + '.json', 'utf8'));
        assert.ok(receipt.timestamp.startsWith('2026-11-19'));
        for (const [path, hash] of Object.entries(receipt.hashes)) {
            assert.equal(typeof sources[path], 'string', 'Missing archived input: ' + path);
            assert.equal(hash, sha(sources[path]), 'Receipt input changed: ' + name + ': ' + path);
        }
        if (name === 'ipad-safari') {
            assert.equal(receipt.kind, 'ipad');
            assert.equal(receipt.runtime.platformName, 'iOS');
            assert.equal(receipt.runtime['safari:deviceType'], 'iPad');
            assert.equal(receipt.runtime['safari:useSimulator'], false);
            assert.equal(receipt.checkedCases, 11);
            assert.deepEqual(receipt.cases.map((c) => c.name), expectedCases017);
            assert.ok(receipt.cases.every((c) => c.passed === true && Number.isFinite(c.elapsedMs) && c.elapsedMs >= 0));
        } else {
            assert.equal(receipt.libraryVersion, '0.1.7');
            assert.equal(receipt.physicalDevice, true);
            assert.equal(receipt.platform, 'ios');
            const r = receipt.report;
            assert.equal(r.passed, true);
            assert.equal(r.model, 'iPad');
            assert.equal(r.echoCalls, 2);
            assert.equal(r.nativeReplies, 2);
            assert.equal(r.protectedCalls, 0);
            assert.equal(r.nativeReplyValid, true);
            assert.equal(r.deniedSendBlocked, true);
            assert.equal(r.closedSendBlocked, true);
            assert.equal(r.nonJSONRepliesRejected, name === 'ipad-native-json-guard' ? 2 : undefined);
            assert.match(r.runId, /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
            assert.ok(!runIds.has(r.runId));
            runIds.add(r.runId);
            assert.deepEqual(r.phases.map((phase) => phase.phase), ['first', 'denied', 'complete']);
            assert.deepEqual(r.phases[0].checks, [
                'native echo preserves scalar and Unicode',
                'native handler error propagates',
                'native-initiated RPC returns through actual bridge',
                'malformed/oversized/subframe messages never run protected handler'
            ]);
            assert.deepEqual(r.phases[2].checks, [
                ...r.phases[0].checks.slice(0, 3),
                'wrong-origin navigation never runs protected handler',
                'RPC reinitializes after allowed navigation',
                'destroy cancels pending RPC',
                'destroy removes JavaScript receive callback'
            ]);
            assert.equal(r.phases[1].origin, '<denied fixture origin>');
        }
        console.log(name, 'verified against', receipt.hashes['dist/crossbus.min.js']);
    }
    console.log('Historical 0.1.7 iPad receipts verified; no current-device qualification implied.');
}
