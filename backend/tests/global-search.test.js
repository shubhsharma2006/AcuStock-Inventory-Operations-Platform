const test = require('node:test');
const assert = require('node:assert/strict');
const searchRouter = require('../src/routes/search');

test('Global Search - ReDoS-safe regex escaping', () => {
  const { escapeRegex } = searchRouter;
  assert.equal(typeof escapeRegex, 'function');

  // Metacharacters should all be safely escaped
  const dangerousInputs = [
    'hello.*world',
    'product[0-9]+',
    '(admin|root)',
    'price$^?{}',
    '\\special//test'
  ];

  for (const input of dangerousInputs) {
    const escaped = escapeRegex(input);
    // Should safely construct RegExp without throwing error or executing unbounded backtracking
    const re = new RegExp(escaped);
    assert.ok(re.test(input), `Failed to match exact literal string for input: ${input}`);
  }
});

test('Global Search - Quick actions catalogue integrity', () => {
  const { QUICK_ACTIONS } = searchRouter;
  assert.ok(Array.isArray(QUICK_ACTIONS));
  assert.ok(QUICK_ACTIONS.length >= 15, 'Expected comprehensive quick actions catalogue');

  for (const action of QUICK_ACTIONS) {
    assert.ok(typeof action.title === 'string' && action.title.length > 0);
    assert.ok(typeof action.subtitle === 'string');
    assert.ok(typeof action.url === 'string' && action.url.startsWith('/'));
    assert.ok(Array.isArray(action.keywords) && action.keywords.length > 0);
  }
});

test('Global Search - Fuzzy action matcher resolves user intent', () => {
  const { matchActions } = searchRouter;

  // Empty query should return empty array
  assert.deepEqual(matchActions(''), []);
  assert.deepEqual(matchActions('   '), []);

  // "stock in" should rank Stock IN Entry highest
  const stockInResults = matchActions('stock in');
  assert.ok(stockInResults.length > 0);
  assert.equal(stockInResults[0].title, 'Stock IN Entry');
  assert.equal(stockInResults[0].url, '/stock-in');

  // "po" should rank Create Purchase Order highest
  const poResults = matchActions('po');
  assert.ok(poResults.length > 0);
  assert.ok(poResults.some(r => r.title === 'Create Purchase Order'));

  // "billing" should rank Billing & Plans
  const billingResults = matchActions('billing plan');
  assert.ok(billingResults.length > 0);
  assert.equal(billingResults[0].title, 'Billing & Plans');
  assert.equal(billingResults[0].url, '/billing');

  // "warranty" should match Warranty Tracking
  const warrantyResults = matchActions('warranty');
  assert.ok(warrantyResults.length > 0);
  assert.equal(warrantyResults[0].title, 'Warranty Tracking');
});
