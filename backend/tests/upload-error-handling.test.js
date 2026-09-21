const test = require('node:test');
const assert = require('node:assert/strict');
const { getUploadErrorResponse } = require('../src/routes/items');

test('maps oversized uploads to a 413 response', () => {
  const response = getUploadErrorResponse({ code: 'LIMIT_FILE_SIZE', message: 'File too large' });

  assert.equal(response.statusCode, 413);
  assert.equal(response.error, 'File too large');
});

test('maps invalid upload types to a 400 response', () => {
  const response = getUploadErrorResponse({ code: 'LIMIT_UNEXPECTED_FILE', message: 'Unexpected field' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.error, 'Unexpected field');
});
