'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const maintenanceModeMiddleware = require('../src/middleware/maintenanceMode');
const { inspectFileBuffer } = require('../src/middleware/uploadValidation');

test('Maintenance Mode - Bypasses exempt paths (/api/health)', async () => {
  const middleware = maintenanceModeMiddleware();
  process.env.MAINTENANCE_MODE = 'true';

  let nextCalled = false;
  const req = { path: '/api/health' };
  const res = {
    setHeader: () => {},
    status: () => ({ json: () => {} })
  };

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, 'Health check must bypass maintenance mode');
  delete process.env.MAINTENANCE_MODE;
});

test('Maintenance Mode - Bypasses super-admin user', async () => {
  const middleware = maintenanceModeMiddleware();
  process.env.MAINTENANCE_MODE = 'true';

  let nextCalled = false;
  const req = {
    path: '/api/items',
    user: { isSuperAdmin: true }
  };
  const res = {
    setHeader: () => {},
    status: () => ({ json: () => {} })
  };

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, 'SuperAdmin must bypass maintenance mode');
  delete process.env.MAINTENANCE_MODE;
});

test('Maintenance Mode - Blocks normal requests with 503 and Retry-After header', async () => {
  const middleware = maintenanceModeMiddleware();
  process.env.MAINTENANCE_MODE = 'true';

  let statusCode = 0;
  let headers = {};
  let jsonBody = null;

  const req = {
    path: '/api/items',
    user: { isSuperAdmin: false }
  };
  const res = {
    setHeader: (name, val) => { headers[name] = val; },
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { jsonBody = data; }
      };
    }
  };

  await middleware(req, res, () => {});

  assert.equal(statusCode, 503, 'Must return HTTP 503');
  assert.equal(headers['Retry-After'], '1800', 'Must send Retry-After header');
  assert.equal(jsonBody.code, 'PLATFORM_MAINTENANCE');

  delete process.env.MAINTENANCE_MODE;
});

test('Upload Polyglot Shield - Blocks invalid PDF headers', () => {
  const fakePdf = Buffer.from('NOT_A_REAL_PDF_HEADER');
  const res = inspectFileBuffer(fakePdf, 'application/pdf');
  assert.equal(res.clean, false);
  assert.match(res.reason, /Invalid PDF format/);
});

test('Upload Polyglot Shield - Accepts authentic %PDF header', () => {
  const realPdf = Buffer.from('%PDF-1.7\n%Valid content');
  const res = inspectFileBuffer(realPdf, 'application/pdf');
  assert.equal(res.clean, true);
});

test('Upload Polyglot Shield - Blocks fake JPEG missing SOI marker', () => {
  const fakeJpeg = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  const res = inspectFileBuffer(fakeJpeg, 'image/jpeg');
  assert.equal(res.clean, false);
  assert.match(res.reason, /Invalid JPEG format/);
});

test('Upload Polyglot Shield - Accepts authentic JPEG SOI marker', () => {
  const realJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00]);
  const res = inspectFileBuffer(realJpeg, 'image/jpeg');
  assert.equal(res.clean, true);
});

