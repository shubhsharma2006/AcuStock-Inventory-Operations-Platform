/**
 * distributed-lock.test.js
 * Unit test suite for multi-container distributed leader election
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { acquireLeaderLock, releaseLeaderLock, instanceId } = require('../src/services/distributedLock');

describe('Distributed Leader Lock Service Tests', () => {
  it('acquires leader lock successfully on initial attempt', async () => {
    const lockKey = `test:lock:${Date.now()}`;
    const acquired = await acquireLeaderLock(lockKey, 10);
    assert.equal(acquired, true);

    // Clean up
    await releaseLeaderLock(lockKey);
  });

  it('rejects duplicate acquisition attempt while lock is already held', async () => {
    const lockKey = `test:lock:conflict:${Date.now()}`;
    const firstAttempt = await acquireLeaderLock(lockKey, 10);
    assert.equal(firstAttempt, true);

    // Second attempt on same key should return false
    const secondAttempt = await acquireLeaderLock(lockKey, 10);
    assert.equal(secondAttempt, false);

    // Release lock
    await releaseLeaderLock(lockKey);
  });

  it('allows re-acquisition after release', async () => {
    const lockKey = `test:lock:reacquire:${Date.now()}`;
    const first = await acquireLeaderLock(lockKey, 10);
    assert.equal(first, true);

    await releaseLeaderLock(lockKey);

    const second = await acquireLeaderLock(lockKey, 10);
    assert.equal(second, true);

    await releaseLeaderLock(lockKey);
  });
});
