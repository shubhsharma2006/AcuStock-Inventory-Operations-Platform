const test = require('node:test');
const assert = require('node:assert/strict');
const { createCsrfMiddleware } = require('../src/middleware/csrf');

test('allows safe methods and safe paths without a token', () => {
  const middleware = createCsrfMiddleware({ isProduction: false });
  let responseStatus = null;

  const req = { method: 'GET', path: '/api/auth/login', cookies: {}, headers: {} };
  const res = {
    cookie() {},
    status(code) {
      responseStatus = code;
      return this;
    },
    json() {
      return this;
    }
  };

  middleware(req, res, () => {
    responseStatus = 200;
  });

  assert.equal(responseStatus, 200);
});

test('rejects unsafe methods without a matching token', () => {
  const middleware = createCsrfMiddleware({ isProduction: false });
  let responseStatus = null;

  const req = { method: 'POST', path: '/api/stock/in', cookies: {}, headers: {} };
  const res = {
    cookie() {},
    status(code) {
      responseStatus = code;
      return this;
    },
    json() {
      return this;
    }
  };

  middleware(req, res, () => {
    throw new Error('next should not run');
  });

  assert.equal(responseStatus, 403);
});
