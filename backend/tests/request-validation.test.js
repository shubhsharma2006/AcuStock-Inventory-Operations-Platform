const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequest, schemas } = require('../src/middleware/validateRequest');

// Helper: create mock req/res/next for middleware testing
function createMocks(body = {}) {
  const req = { body };
  const res = {
    statusCode: null,
    responseBody: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.responseBody = body; return this; }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, wasNextCalled: () => nextCalled };
}

// ============================================================
// stockIn schema
// ============================================================

test('stockIn: rejects missing productId', () => {
  const { req, res, next, wasNextCalled } = createMocks({ quantity: 5 });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
  assert.ok(res.responseBody.details.some(d => d.includes('productId')));
});

test('stockIn: rejects invalid productId format', () => {
  const { req, res, next, wasNextCalled } = createMocks({ productId: 'not-an-id', quantity: 5 });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

test('stockIn: rejects missing quantity', () => {
  const { req, res, next, wasNextCalled } = createMocks({ productId: '507f1f77bcf86cd799439011' });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

test('stockIn: passes with valid productId and quantity', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    productId: '507f1f77bcf86cd799439011',
    quantity: 10
  });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(wasNextCalled(), true);
  assert.equal(res.statusCode, null); // no error response
});

test('stockIn: passes with optional serialNumbers', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    productId: '507f1f77bcf86cd799439011',
    quantity: 2,
    serialNumbers: ['SN001', 'SN002']
  });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(wasNextCalled(), true);
});

test('stockIn: rejects non-array serialNumbers', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    productId: '507f1f77bcf86cd799439011',
    quantity: 1,
    serialNumbers: 'not-an-array'
  });
  validateRequest(schemas.stockIn)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

// ============================================================
// login schema
// ============================================================

test('login: rejects missing identifier', () => {
  const { req, res, next, wasNextCalled } = createMocks({ password: 'secret' });
  validateRequest(schemas.login)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

test('login: rejects missing password', () => {
  const { req, res, next, wasNextCalled } = createMocks({ identifier: 'user@test.com' });
  validateRequest(schemas.login)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

test('login: passes with valid credentials', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    identifier: 'user@test.com',
    password: 'password123'
  });
  validateRequest(schemas.login)(req, res, next);
  assert.equal(wasNextCalled(), true);
});

test('login: rejects identifier over 254 chars', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    identifier: 'a'.repeat(255),
    password: 'password123'
  });
  validateRequest(schemas.login)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});

test('login: rejects password over 128 chars', () => {
  const { req, res, next, wasNextCalled } = createMocks({
    identifier: 'user@test.com',
    password: 'a'.repeat(129)
  });
  validateRequest(schemas.login)(req, res, next);
  assert.equal(res.statusCode, 400);
  assert.equal(wasNextCalled(), false);
});
