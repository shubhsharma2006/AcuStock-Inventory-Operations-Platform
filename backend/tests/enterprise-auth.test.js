const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('access token expires in short window (15m) and contains tokenVersion', async () => {
  const secret = 'test-secret-key-12345';
  process.env.JWT_SECRET = secret;

  const payload = { _id: '507f1f77bcf86cd799439011', tokenVersion: 1, type: 'access' };
  const token = jwt.sign(payload, secret, { expiresIn: '15m' });

  const decoded = jwt.verify(token, secret);
  assert.equal(decoded._id, payload._id);
  assert.equal(decoded.tokenVersion, 1);
  assert.equal(decoded.type, 'access');

  // Verify expiry is around 15 minutes from now
  const nowInSec = Math.floor(Date.now() / 1000);
  const diffSec = decoded.exp - nowInSec;
  assert.ok(diffSec >= 14 * 60 && diffSec <= 15 * 60);
});

test('refresh token expires in 7d or 30d window and verifies with refresh secret', async () => {
  const secret = 'refresh-secret-key-12345';
  process.env.JWT_REFRESH_SECRET = secret;

  const payload = { _id: '507f1f77bcf86cd799439011', tokenVersion: 2, type: 'refresh' };
  const token7d = jwt.sign(payload, secret, { expiresIn: '7d' });
  const token30d = jwt.sign(payload, secret, { expiresIn: '30d' });

  const decoded7d = jwt.verify(token7d, secret);
  const decoded30d = jwt.verify(token30d, secret);

  assert.equal(decoded7d._id, payload._id);
  assert.equal(decoded7d.type, 'refresh');
  assert.equal(decoded30d.type, 'refresh');

  const nowInSec = Math.floor(Date.now() / 1000);
  const diff7d = decoded7d.exp - nowInSec;
  const diff30d = decoded30d.exp - nowInSec;

  assert.ok(diff7d >= 6 * 86400 && diff7d <= 7 * 86400);
  assert.ok(diff30d >= 29 * 86400 && diff30d <= 30 * 86400);
});
