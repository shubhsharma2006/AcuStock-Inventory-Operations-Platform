/**
 * Security Suite: NoSQL & Query Injection Protection Tests
 * ─────────────────────────────────────────────────────────────
 * Verifies that:
 * 1. Deep sanitizer strips keys starting with '$' (e.g. {"$gt": ""}).
 * 2. Deep sanitizer strips keys containing '.' (dot-notation injection).
 * 3. Legitimate values containing '$' (e.g. "$150.00") are preserved.
 * 4. Nested objects and arrays are recursively sanitized.
 * 5. Read-only req.query objects in Express are mutated in-place safely.
 * 6. Regex escaper sanitizes special characters and rejects catastrophic ReDoS patterns.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { noSqlSanitizer, sanitize, sanitizeInPlace } = require('../src/middleware/noSqlSanitizer');
const { escapeRegex, isSafeRegexPattern } = require('../src/utils/regex');

test('NoSQL Sanitizer - Strips operator keys starting with $', () => {
  const malicious = {
    username: 'admin',
    password: { $gt: '' },
    $where: 'sleep(5000)'
  };

  const clean = sanitize(malicious);
  assert.equal(clean.username, 'admin');
  assert.equal(clean.password && Object.keys(clean.password).length, 0);
  assert.equal('$where' in clean, false);
});

test('NoSQL Sanitizer - Strips keys containing dot notation', () => {
  const malicious = {
    'user.role': 'SUPER_ADMIN',
    'settings.isAdmin': true,
    safeField: 'ok'
  };

  const clean = sanitize(malicious);
  assert.equal('user.role' in clean, false);
  assert.equal('settings.isAdmin' in clean, false);
  assert.equal(clean.safeField, 'ok');
});

test('NoSQL Sanitizer - Preserves legitimate values with dollar signs', () => {
  const legitimate = {
    productName: 'Special Item',
    priceString: '$99.99',
    description: 'Cost is $50 to $100',
    tags: ['$premium', 'fast-delivery']
  };

  const clean = sanitize(legitimate);
  assert.equal(clean.productName, 'Special Item');
  assert.equal(clean.priceString, '$99.99');
  assert.equal(clean.description, 'Cost is $50 to $100');
  assert.deepEqual(clean.tags, ['$premium', 'fast-delivery']);
});

test('NoSQL Sanitizer - Recursively sanitizes nested objects and arrays', () => {
  const nested = {
    filters: [
      { field: 'category', $ne: 'deleted' },
      { 'nested.key': 'val', valid: 123 }
    ],
    deep: {
      level1: {
        level2: {
          $regex: '.*',
          legit: 'yes'
        }
      }
    }
  };

  const clean = sanitize(nested);
  assert.equal('$ne' in clean.filters[0], false);
  assert.equal('nested.key' in clean.filters[1], false);
  assert.equal(clean.filters[1].valid, 123);
  assert.equal('$regex' in clean.deep.level1.level2, false);
  assert.equal(clean.deep.level1.level2.legit, 'yes');
});

test('NoSQL Sanitizer Middleware - Mutates Express request in-place', () => {
  const req = {
    body: {
      user: 'alice',
      password: { $ne: null }
    },
    query: {
      search: 'item',
      $where: 'bad()'
    },
    params: {
      id: '507f1f77bcf86cd799439011'
    }
  };

  let nextCalled = false;
  noSqlSanitizer(req, {}, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal('$ne' in req.body.password, false);
  assert.equal(req.body.user, 'alice');
  assert.equal('$where' in req.query, false);
  assert.equal(req.query.search, 'item');
  assert.equal(req.params.id, '507f1f77bcf86cd799439011');
});

test('Regex Escaper & ReDoS Defense', () => {
  // Metacharacters escaped
  const searchInput = 'iPhone 15 (Pro+Max) [512GB] & $100?';
  const escaped = escapeRegex(searchInput);
  assert.equal(escaped.includes('\\('), true);
  assert.equal(escaped.includes('\\)'), true);
  assert.equal(escaped.includes('\\['), true);
  assert.equal(escaped.includes('\\]'), true);
  assert.equal(escaped.includes('\\$'), true);
  assert.equal(escaped.includes('\\+'), true);

  // Length capping (max 100 chars)
  const longInput = 'a'.repeat(200);
  assert.equal(escapeRegex(longInput).length, 100);

  // Catastrophic backtracking detection
  assert.equal(isSafeRegexPattern('simple search'), true);
  assert.equal(isSafeRegexPattern('^[a-zA-Z0-9_-]+$'), true);
  assert.equal(isSafeRegexPattern('((a+)+)+$'), false); // Nested ReDoS pattern
  assert.equal(isSafeRegexPattern('(a*)*'), false);     // Nested ReDoS pattern
});
