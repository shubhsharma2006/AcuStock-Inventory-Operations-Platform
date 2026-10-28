const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

const {
  extractApiKey,
  authenticateApiKey,
  requireScope
} = require('../src/middleware/apiKeyAuth');

const webhookDispatcher = require('../src/services/webhookDispatcher.service');
const ApiKey = require('../src/models/ApiKey');
const WebhookSubscription = require('../src/models/WebhookSubscription');

test('Item 3: Developer API Keys & Outbound Webhook Engine', async (t) => {
  const testTenant = '507f191e810c19729de860ea';
  const testUser = '507f191e810c19729de860eb';

  await t.test('1. API Key Format & Hashing: Key generation and SHA-256 integrity', async () => {
    const randomSecret = crypto.randomBytes(24).toString('hex');
    const rawKey = `acu_live_${randomSecret}`;
    const keyPrefix = rawKey.substring(0, 15) + '...';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    assert.ok(rawKey.startsWith('acu_live_'), 'Key must start with acu_live_');
    assert.equal(rawKey.length, 57, 'Key length must be 57 characters');
    assert.equal(keyHash.length, 64, 'SHA-256 hash must be 64 hex characters');

    // Model validation
    const apiKeyDoc = new ApiKey({
      name: 'ERP Sync Key',
      keyPrefix,
      keyHash,
      tenantId: testTenant,
      createdBy: testUser,
      role: 'MANAGER',
      scopes: ['read:stock', 'write:stock']
    });

    assert.equal(apiKeyDoc.name, 'ERP Sync Key');
    assert.equal(apiKeyDoc.isActive, true);
    assert.equal(apiKeyDoc.role, 'MANAGER');
  });

  await t.test('2. API Key Header Extraction: Supports X-API-Key and Bearer header', async () => {
    const rawKey = 'acu_live_1234567890abcdef1234567890abcdef12345678';

    // From X-API-Key
    const req1 = { headers: { 'x-api-key': rawKey } };
    assert.equal(extractApiKey(req1), rawKey);

    // From Authorization: Bearer
    const req2 = { headers: { 'authorization': `Bearer ${rawKey}` } };
    assert.equal(extractApiKey(req2), rawKey);

    // Invalid prefix
    const req3 = { headers: { 'authorization': 'Bearer other_token' } };
    assert.equal(extractApiKey(req3), null);

    // Empty
    const req4 = { headers: {} };
    assert.equal(extractApiKey(req4), null);
  });

  await t.test('3. Scope Enforcement Guard: Validates granular API permissions', async () => {
    const guardStockWrite = requireScope('write:stock');

    // User with missing scope
    const reqDenied = {
      user: {
        isApiKey: true,
        role: 'MANAGER',
        scopes: ['read:stock']
      }
    };
    let statusCode = null;
    let jsonResponse = null;
    const resDenied = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { jsonResponse = data; }
        };
      }
    };

    guardStockWrite(reqDenied, resDenied, () => {
      assert.fail('Should not call next when scope is missing');
    });

    assert.equal(statusCode, 403);
    assert.equal(jsonResponse.code, 'INSUFFICIENT_SCOPE');

    // User with matching scope
    const reqAllowed = {
      user: {
        isApiKey: true,
        role: 'MANAGER',
        scopes: ['read:stock', 'write:stock']
      }
    };
    let nextCalled = false;
    guardStockWrite(reqAllowed, {}, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, 'Next should be called when scope is present');
  });

  await t.test('4. Webhook HMAC-SHA256 Signature: Validates payload tamper resistance', async () => {
    const secret = 'whsec_793160000_secret_key_hex';
    const payload = {
      id: 'del_12345',
      event: 'stock.out',
      timestamp: '2026-10-28T09:30:00.000Z',
      tenantId: testTenant,
      data: { productId: 'p1', quantity: 5 }
    };

    const payloadString = JSON.stringify(payload);
    const signature = webhookDispatcher.computeSignature(payloadString, secret);

    assert.ok(signature, 'Signature must be generated');
    assert.equal(signature.length, 64, 'HMAC-SHA256 must be 64 hex characters');

    // Recompute with exact same secret & payload
    const verification = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
    assert.equal(signature, verification, 'Receiver verification must match sender signature');

    // Tampered payload
    const tamperedString = JSON.stringify({ ...payload, data: { productId: 'p1', quantity: 999 } });
    const tamperedVerification = crypto.createHmac('sha256', secret).update(tamperedString).digest('hex');
    assert.notEqual(signature, tamperedVerification, 'Tampered payload must fail signature verification');
  });

  await t.test('5. Webhook HTTP Dispatcher: Sends POST with custom AcuStock headers', async () => {
    let receivedHeaders = null;
    let receivedBody = '';

    // Spin up lightweight local HTTP test receiver
    const testServer = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      req.on('data', chunk => { receivedBody += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
    const port = testServer.address().port;
    const testUrl = `http://127.0.0.1:${port}/webhook-receiver`;

    try {
      const payloadString = JSON.stringify({ test: 'event_data' });
      const signature = 'test_signature_hex';
      const deliveryId = 'del_test_99';

      const result = await webhookDispatcher.sendHttpPost({
        url: testUrl,
        payloadString,
        signature,
        event: 'stock.in',
        deliveryId,
        timeoutMs: 2000
      });

      assert.equal(result.success, true);
      assert.equal(result.statusCode, 200);
      assert.ok(result.durationMs >= 0);
      assert.equal(receivedHeaders['x-acustock-event'], 'stock.in');
      assert.equal(receivedHeaders['x-acustock-delivery'], deliveryId);
      assert.equal(receivedHeaders['x-acustock-signature'], 'sha256=test_signature_hex');
      assert.equal(receivedBody, payloadString);
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  await t.test('6. Webhook Subscription Model: Validates URL scheme and event enum', async () => {
    const validSub = new WebhookSubscription({
      name: 'Alert Hook',
      url: 'https://example.com/webhook',
      secret: 'whsec_123',
      events: ['stock.out', 'stock.low'],
      tenantId: testTenant,
      createdBy: testUser
    });

    assert.equal(validSub.name, 'Alert Hook');
    assert.equal(validSub.events.length, 2);
    assert.equal(validSub.isActive, true);

    // Invalid URL check
    const invalidSub = new WebhookSubscription({
      name: 'Bad Hook',
      url: 'ftp://not-allowed.com',
      secret: 'whsec_123',
      events: ['stock.out'],
      tenantId: testTenant,
      createdBy: testUser
    });

    const validationErr = invalidSub.validateSync();
    assert.ok(validationErr, 'FTP url should fail schema validation');
  });
});
