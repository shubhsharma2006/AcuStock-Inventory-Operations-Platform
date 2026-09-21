const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_STOCK_QUANTITY, normalizeSerialNumbers, validateStockMovementPayload } = require('../src/services/stock.service');

// ============================================================
// validateStockMovementPayload — boundary / edge case tests
// ============================================================

test('MAX_STOCK_QUANTITY is 100,000', () => {
  assert.equal(MAX_STOCK_QUANTITY, 100_000);
});

test('rejects quantity = 0 (below min)', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 0, serialNumbers: [] }),
    /between 1 and 100000/
  );
});

test('accepts quantity = 1 (lower boundary)', () => {
  const result = validateStockMovementPayload({ quantity: 1, serialNumbers: [] });
  assert.equal(result.quantity, 1);
});

test('accepts quantity = 100000 (upper boundary)', () => {
  const result = validateStockMovementPayload({ quantity: 100000, serialNumbers: [] });
  assert.equal(result.quantity, 100000);
});

test('rejects quantity = 100001 (above max)', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 100001, serialNumbers: [] }),
    /between 1 and 100000/
  );
});

test('rejects negative quantity', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: -5, serialNumbers: [] }),
    /between 1 and 100000/
  );
});

test('rejects non-integer float', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 2.5, serialNumbers: [] }),
    /between 1 and 100000/
  );
});

test('rejects NaN quantity', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 'abc', serialNumbers: [] }),
    /between 1 and 100000/
  );
});

test('rejects serial count mismatch with quantity', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 3, serialNumbers: ['A', 'B'] }),
    /Serial numbers count must match quantity/
  );
});

test('rejects duplicate serial numbers (case insensitive)', () => {
  assert.throws(
    () => validateStockMovementPayload({ quantity: 2, serialNumbers: ['abc', 'ABC'] }),
    /Duplicate serial numbers/
  );
});

test('normalizes serial numbers: trims whitespace and uppercases', () => {
  const result = validateStockMovementPayload({ quantity: 2, serialNumbers: ['  abc  ', ' def '] });
  assert.deepEqual(result.serialNumbers, ['ABC', 'DEF']);
});

test('accepts empty serialNumbers with any quantity', () => {
  const result = validateStockMovementPayload({ quantity: 5, serialNumbers: [] });
  assert.equal(result.quantity, 5);
  assert.deepEqual(result.serialNumbers, []);
});

test('accepts quantity as string that parses to valid integer', () => {
  const result = validateStockMovementPayload({ quantity: '10', serialNumbers: [] });
  assert.equal(result.quantity, 10);
});

// ============================================================
// normalizeSerialNumbers — isolated tests
// ============================================================

test('normalizeSerialNumbers: empty array returns empty', () => {
  assert.deepEqual(normalizeSerialNumbers([]), []);
});

test('normalizeSerialNumbers: undefined defaults to empty', () => {
  assert.deepEqual(normalizeSerialNumbers(), []);
});

test('normalizeSerialNumbers: filters null/undefined/blank entries', () => {
  const result = normalizeSerialNumbers([null, undefined, '', '  ', 'ABC']);
  assert.deepEqual(result, ['ABC']);
});

test('normalizeSerialNumbers: trims whitespace', () => {
  assert.deepEqual(normalizeSerialNumbers(['  hello  ', ' world']), ['HELLO', 'WORLD']);
});

test('normalizeSerialNumbers: uppercases all entries', () => {
  assert.deepEqual(normalizeSerialNumbers(['abc', 'DEF', 'GhI']), ['ABC', 'DEF', 'GHI']);
});

test('normalizeSerialNumbers: handles numeric values via String coercion', () => {
  const result = normalizeSerialNumbers([123, 456]);
  assert.deepEqual(result, ['123', '456']);
});
