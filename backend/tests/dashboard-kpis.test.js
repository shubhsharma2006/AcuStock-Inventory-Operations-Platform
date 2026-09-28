const test = require('node:test');
const assert = require('node:assert/strict');

test('KPIs - Period to dead-stock window calculation', () => {
  function getDeadStockDays(period, now = new Date('2026-09-23T12:00:00Z')) {
    let deadStockDays = 30;
    if (period === '7d')  deadStockDays = 7;
    if (period === '30d') deadStockDays = 30;
    if (period === '90d') deadStockDays = 90;
    if (period === 'ytd') {
      deadStockDays = Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86400000);
    }
    return deadStockDays;
  }

  assert.equal(getDeadStockDays('7d'), 7);
  assert.equal(getDeadStockDays('30d'), 30);
  assert.equal(getDeadStockDays('90d'), 90);
  assert.ok(getDeadStockDays('ytd') > 250); // In Sept 2026, >250 days passed
  assert.equal(getDeadStockDays('invalid'), 30); // Default to 30d
});

test('KPIs - Valuation & Gross Margin Potential formula', () => {
  function calculateMargin(valuationAtCost, valuationAtRetail) {
    if (!valuationAtRetail || valuationAtRetail <= 0) return 0;
    return parseFloat((((valuationAtRetail - valuationAtCost) / valuationAtRetail) * 100).toFixed(1));
  }

  // Cost = 600, Retail = 1000 -> Margin = 40.0%
  assert.equal(calculateMargin(600, 1000), 40.0);

  // Cost = 1000, Retail = 1000 -> Margin = 0.0%
  assert.equal(calculateMargin(1000, 1000), 0.0);

  // Retail = 0 (no sales price set) -> Margin = 0
  assert.equal(calculateMargin(500, 0), 0);

  // Cost = 800, Retail = 1000 -> Margin = 20.0%
  assert.equal(calculateMargin(800, 1000), 20.0);
});

test('KPIs - Stockout threshold logic validates reorder levels', () => {
  const products = [
    { name: 'Item A', currentStock: 2, threshold: 10, isStockoutRisk: true },
    { name: 'Item B', currentStock: 0, threshold: 5,  isStockoutRisk: true },
    { name: 'Item C', currentStock: 12, threshold: 10, isStockoutRisk: false },
    { name: 'Item D', currentStock: 10, threshold: 10, isStockoutRisk: true }, // at threshold is risk
  ];

  for (const item of products) {
    const isRisk = item.currentStock <= item.threshold;
    assert.equal(isRisk, item.isStockoutRisk, `Mismatch for ${item.name}`);
  }
});
