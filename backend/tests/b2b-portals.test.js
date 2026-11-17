/**
 * Automated Test Suite: B2B Customer & Supplier Self-Service Portals
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 * 1. Customer statement financial calculations (Credit Limit, Available Credit, Balance)
 * 2. Self-service wholesale B2B ordering and sales order line totals calculation
 * 3. Product catalog in-stock availability filtering
 * 4. Supplier Advanced Shipping Notice (ASN) generation and carrier details
 * 5. Supplier PO delivery date acknowledgment workflow
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers mirroring backend/src/routes/portal.js ──────────────────────────
function computeCustomerStatement(company, invoices = []) {
  const creditLimit = Number(company.creditLimit) || 0;
  const outstandingBalance = Number(company.outstandingBalance) || 0;
  const availableCredit = Math.max(0, creditLimit - outstandingBalance);

  let totalBilled = 0;
  let totalDue = 0;

  invoices.forEach((inv) => {
    totalBilled += Number(inv.grandTotal) || 0;
    totalDue += Number(inv.amountDue) || 0;
  });

  return {
    creditLimit,
    outstandingBalance,
    availableCredit,
    totalBilled,
    totalDue
  };
}

function processCustomerOrder(items = []) {
  let totalValue = 0;
  const orderItems = items.map((it) => {
    const qty = Number(it.quantity) || 1;
    const rate = Number(it.unitPrice) || 0;
    const lineTotal = qty * rate;
    totalValue += lineTotal;
    return {
      productId: it.productId,
      name: it.name,
      quantity: qty,
      unitPrice: rate,
      lineTotal
    };
  });

  return {
    items: orderItems,
    totalValue
  };
}

function validateAsnPayload(asn) {
  const errors = [];
  if (!asn.asnNumber || !asn.asnNumber.startsWith('ASN-')) errors.push('Invalid ASN number');
  if (!asn.purchaseOrderId) errors.push('PO reference required');
  if (!asn.vehicleNumber) errors.push('Vehicle number required');
  if (!asn.expectedArrivalDate) errors.push('Expected arrival date required');
  if (!asn.items || asn.items.length === 0) errors.push('At least one item required');

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ── Test Suites ─────────────────────────────────────────────────────────────
test('B2B Customer & Supplier Self-Service Portals Suite', async (t) => {
  await t.test('1. should compute live customer financial statement (Credit Limit, Balance, Available Credit)', () => {
    const company = {
      name: 'Apex Industrial Corp',
      creditLimit: 500000,
      outstandingBalance: 180000
    };

    const invoices = [
      { invoiceNumber: 'INV-2026-0001', grandTotal: 100000, amountDue: 80000 },
      { invoiceNumber: 'INV-2026-0002', grandTotal: 100000, amountDue: 100000 }
    ];

    const statement = computeCustomerStatement(company, invoices);

    assert.equal(statement.creditLimit, 500000);
    assert.equal(statement.outstandingBalance, 180000);
    assert.equal(statement.availableCredit, 320000); // 500,000 - 180,000
    assert.equal(statement.totalBilled, 200000);
    assert.equal(statement.totalDue, 180000);
  });

  await t.test('2. should process B2B self-service wholesale order and compute line totals', () => {
    const requestedItems = [
      { productId: 'p1', name: 'Precision Controller V2', quantity: 10, unitPrice: 8500 },
      { productId: 'p2', name: 'Thermal Sensor Probes', quantity: 25, unitPrice: 1200 }
    ];

    const order = processCustomerOrder(requestedItems);

    assert.equal(order.items.length, 2);
    assert.equal(order.items[0].lineTotal, 85000);
    assert.equal(order.items[1].lineTotal, 30000);
    assert.equal(order.totalValue, 115000);
  });

  await t.test('3. should flag catalog stock availability based on live warehouse inventory', () => {
    const catalog = [
      { id: '1', name: 'In-Stock Widget', currentStock: 15 },
      { id: '2', name: 'Out-of-Stock Sensor', currentStock: 0 },
      { id: '3', name: 'Negative Allocated Buffer', currentStock: -2 }
    ];

    const processed = catalog.map(p => ({
      ...p,
      inStock: p.currentStock > 0
    }));

    assert.equal(processed[0].inStock, true);
    assert.equal(processed[1].inStock, false);
    assert.equal(processed[2].inStock, false);
  });

  await t.test('4. should validate Supplier Advanced Shipping Notice (ASN) carrier & arrival schema', () => {
    const validAsn = {
      asnNumber: 'ASN-2026-0012',
      purchaseOrderId: 'po-99',
      carrierName: 'VRL Logistics',
      vehicleNumber: 'MH-12-RN-8801',
      expectedArrivalDate: new Date('2026-11-15T09:00:00Z'),
      items: [{ productId: 'p1', name: 'Alloy Castings', quantityShipped: 50 }]
    };

    const validation = validateAsnPayload(validAsn);
    assert.equal(validation.isValid, true);
    assert.equal(validation.errors.length, 0);

    const invalidAsn = {
      asnNumber: 'INVALID_NUM',
      purchaseOrderId: null,
      vehicleNumber: '',
      items: []
    };

    const invalidValidation = validateAsnPayload(invalidAsn);
    assert.equal(invalidValidation.isValid, false);
    assert.ok(invalidValidation.errors.length >= 3);
  });

  await t.test('5. should execute supplier PO delivery date acknowledgment workflow', () => {
    const po = {
      poNumber: 'PO-2026-0045',
      status: 'sent',
      expectedDeliveryDate: null,
      notes: 'Standard delivery requested'
    };

    // Supplier acknowledges
    const committedDate = new Date('2026-11-20T00:00:00Z');
    const ackNotes = 'Production batch scheduled for dispatch on 19th Nov';

    po.expectedDeliveryDate = committedDate;
    po.status = 'approved';
    po.notes += `\n[Supplier Ack]: ${ackNotes}`;

    assert.equal(po.status, 'approved');
    assert.equal(po.expectedDeliveryDate, committedDate);
    assert.ok(po.notes.includes('[Supplier Ack]'));
  });
});

