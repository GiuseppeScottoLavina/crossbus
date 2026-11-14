// Verify retained evidence; this deliberately does not claim to rerun hardware.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'benchmarks/qualification/2026-11-14/';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
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
        sha(await readFile('dist/crossbus.min.js'))
    );
    for (const [path, hash] of Object.entries(receipt.hashes)) {
        if (!expectedHashes.has(path)) expectedHashes.set(path, sha(await readFile(path)));
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
