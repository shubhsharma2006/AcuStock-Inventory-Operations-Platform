const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');

test('uses a 15 minute default lockout window when no env override is provided', async () => {
  delete process.env.LOCK_DURATION_MINUTES;

  const user = new User({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'USER'
  });

  const updates = [];
  user.updateOne = async (update) => {
    updates.push(update);
  };

  for (let i = 0; i < 5; i += 1) {
    await user.incrementLoginAttempts();
  }

  assert.equal(updates.length, 5);
  const lastUpdate = updates[updates.length - 1];
  const lockUntil = lastUpdate.$set.lockUntil;
  assert.ok(lockUntil instanceof Date);
  const diff = lockUntil.getTime() - Date.now();
  assert.ok(diff >= 14 * 60 * 1000 && diff <= 16 * 60 * 1000);
});

test('honors LOCK_DURATION_MINUTES for custom lockout windows', async () => {
  process.env.LOCK_DURATION_MINUTES = '3';

  const user = new User({
    name: 'Test User',
    email: 'test2@example.com',
    password: 'password123',
    role: 'USER'
  });

  const updates = [];
  user.updateOne = async (update) => {
    updates.push(update);
  };

  for (let i = 0; i < 5; i += 1) {
    await user.incrementLoginAttempts();
  }

  assert.equal(updates.length, 5);
  const lastUpdate = updates[updates.length - 1];
  const lockUntil = lastUpdate.$set.lockUntil;
  const diff = lockUntil.getTime() - Date.now();
  assert.ok(diff >= 2 * 60 * 1000 && diff <= 4 * 60 * 1000);
});
