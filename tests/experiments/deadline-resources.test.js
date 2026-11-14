import { it, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
it('uses one real Node timer for 128 live RPCs and releases it on destruction', () => {
    const result = spawnSync('node', ['tests/experiments/deadline-resources.mjs'], {
        encoding: 'utf8'
    });
    expect({ status: result.status, error: result.stderr }).toEqual({ status: 0, error: '' });
    expect(JSON.parse(result.stdout)).toEqual({
        checkedRequests: 128,
        createdTimers: 1,
        liveAfterDestroy: 0
    });
});
