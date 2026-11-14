import { it, expect } from 'bun:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
it('preserves Node base64 validation, view boundaries and exact owned chunk storage', async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const { stdout } = await promisify(execFile)(
        'node',
        ['tests/experiments/stream-codec.mjs', root + 'src/core/stream.js'],
        { cwd: root }
    );
    expect(JSON.parse(stdout)).toMatchObject({
        canonicalLengths: 6,
        atobParityCases: 4121,
        exactOwnedStorage: true,
        plainUint8Array: true
    });
});
