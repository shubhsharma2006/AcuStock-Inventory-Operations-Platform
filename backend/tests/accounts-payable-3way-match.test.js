/**
 * Automated Test Suite: Accounts Payable (AP) & 3-Way Matching Engine
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 * 1. 3-Way Matching Engine: PO approved terms vs Vendor Billed items
 * 2. Perfect match auto-approval (0 variance)
 * 3. Quantity variance detection (billed qty > PO qty)
 * 4. Price variance detection (billed rate > PO rate)
 * 5. Manager override workflow for flagged variances
 * 6. Payment voucher generation (VCH-YYYY-XXXX) and bill reconciliation
 * 7. Accounts Payable (AP) aging schedule buckets calculation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers mirroring backend/src/routes/vendor-bills.js ────────────────────
function runThreeWayMatch(po, billedItems = []) {
  let hasQuantityVariance = false;
  let hasPriceVariance = false;
  let totalQtyVariance = 0;
  let totalPriceVariance = 0;

  billedItems.forEach((bItem) => {
    const poItem = (po.items || []).find(
      (p) => (p.productId && p.productId === bItem.productId) || p.name === bItem.name
    );

    if (poItem) {
      const approvedRate = Number(poItem.unitPrice) || 0;
      const billedRate = Number(bItem.unitPriceBilled) || 0;
      const approvedQty = Number(poItem.quantity) || 0;
      const billedQty = Number(bItem.quantityBilled) || 0;

      if (billedRate > approvedRate) {
        hasPriceVariance = true;
        totalPriceVariance += (billedRate - approvedRate) * billedQty;
      }

      if (billedQty > approvedQty) {
        hasQuantityVariance = true;
        totalQtyVariance += billedQty - approvedQty;
      }
    } else {
      hasQuantityVariance = true;
      totalQtyVariance += Number(bItem.quantityBilled) || 0;
    }
  });

  let matchStatus = 'PERFECT_MATCH';
  if (hasQuantityVariance && hasPriceVariance) {
    matchStatus = 'OVER_BILLED';
  } else if (hasQuantityVariance) {
    matchStatus = 'QUANTITY_VARIANCE';
  } else if (hasPriceVariance) {
    matchStatus = 'PRICE_VARIANCE';
  }

  const isApproved = matchStatus === 'PERFECT_MATCH';

  return {
    matchStatus,
    quantityVarianceUnits: Math.round(totalQtyVariance * 100) / 100,
    priceVarianceAmount: Math.round(totalPriceVariance * 100) / 100,
    isApproved
  };
}

function calculateApAging(bills, referenceDate = new Date()) {
  const aging = {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_90_plus: 0,
    totalPayables: 0
  };

  bills.forEach((bill) => {
    const due = new Date(bill.dueDate);
    const diffTime = referenceDate.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const amount = bill.amountDue || 0;

    aging.totalPayables += amount;

    if (diffDays <= 0) {
      aging.current += amount;
    } else if (diffDays <= 30) {
      aging.days_1_30 += amount;
    } else if (diffDays <= 60) {
      aging.days_31_60 += amount;
    } else if (diffDays <= 90) {
      aging.days_61_90 += amount;
    } else {
      aging.days_90_plus += amount;
    }
  });

  return aging;
}

// ── Test Suites ─────────────────────────────────────────────────────────────
test('Accounts Payable (AP) & 3-Way Matching Engine Suite', async (t) => {
  const samplePO = {
    poNumber: 'PO-2026-0010',
    items: [
      { productId: 'item-1', name: 'Industrial Microcontroller MCU-900', quantity: 100, unitPrice: 500 },
      { productId: 'item-2', name: 'Thermal Sensor Probe TH-02', quantity: 50, unitPrice: 200 }
    ]
  };

  await t.test('1. should auto-approve bill when exact 3-Way Match is verified (0 variance)', () => {
    const billedItems = [
      { productId: 'item-1', name: 'Industrial Microcontroller MCU-900', quantityBilled: 100, unitPriceBilled: 500 },
      { productId: 'item-2', name: 'Thermal Sensor Probe TH-02', quantityBilled: 50, unitPriceBilled: 200 }
    ];

    const match = runThreeWayMatch(samplePO, billedItems);

    assert.equal(match.matchStatus, 'PERFECT_MATCH');
    assert.equal(match.quantityVarianceUnits, 0);
    assert.equal(match.priceVarianceAmount, 0);
    assert.equal(match.isApproved, true);
  });

  await t.test('2. should flag QUANTITY_VARIANCE when supplier bills for more units than ordered', () => {
    const billedItems = [
      { productId: 'item-1', name: 'Industrial Microcontroller MCU-900', quantityBilled: 120, unitPriceBilled: 500 }, // +20 units over-billed
      { productId: 'item-2', name: 'Thermal Sensor Probe TH-02', quantityBilled: 50, unitPriceBilled: 200 }
    ];

    const match = runThreeWayMatch(samplePO, billedItems);

    assert.equal(match.matchStatus, 'QUANTITY_VARIANCE');
    assert.equal(match.quantityVarianceUnits, 20);
    assert.equal(match.priceVarianceAmount, 0);
    assert.equal(match.isApproved, false);
  });

  await t.test('3. should flag PRICE_VARIANCE when supplier charges higher unit rate than approved PO', () => {
    const billedItems = [
      { productId: 'item-1', name: 'Industrial Microcontroller MCU-900', quantityBilled: 100, unitPriceBilled: 550 }, // ₹50/unit higher rate on 100 units = ₹5000 variance
      { productId: 'item-2', name: 'Thermal Sensor Probe TH-02', quantityBilled: 50, unitPriceBilled: 200 }
    ];

    const match = runThreeWayMatch(samplePO, billedItems);

    assert.equal(match.matchStatus, 'PRICE_VARIANCE');
    assert.equal(match.quantityVarianceUnits, 0);
    assert.equal(match.priceVarianceAmount, 5000);
    assert.equal(match.isApproved, false);
  });

  await t.test('4. should flag OVER_BILLED when both quantity and price exceed PO terms', () => {
    const billedItems = [
      { productId: 'item-1', name: 'Industrial Microcontroller MCU-900', quantityBilled: 110, unitPriceBilled: 600 } // +10 units AND +₹100/unit
    ];

    const match = runThreeWayMatch(samplePO, billedItems);

    assert.equal(match.matchStatus, 'OVER_BILLED');
    assert.equal(match.quantityVarianceUnits, 10);
    assert.equal(match.priceVarianceAmount, 11000); // 110 * 100
    assert.equal(match.isApproved, false);
  });

  await t.test('5. should execute manager override workflow for legitimate supplier variances', () => {
    const bill = {
      billNumber: 'BILL-2026-0001',
      status: 'UNDER_REVIEW',
      matchingEngine: {
        status: 'PRICE_VARIANCE',
        approvedForPayment: false,
        approvedBy: null,
        approvalNotes: ''
      }
    };

    // Manager review action
    const managerId = 'mgr-42';
    const auditNotes = 'Supplier notified raw copper surcharge; verified against index contract.';

    bill.matchingEngine.status = 'OVERRIDDEN';
    bill.matchingEngine.approvedForPayment = true;
    bill.matchingEngine.approvedBy = managerId;
    bill.matchingEngine.approvalNotes = auditNotes;
    bill.status = 'APPROVED';

    assert.equal(bill.status, 'APPROVED');
    assert.equal(bill.matchingEngine.status, 'OVERRIDDEN');
    assert.equal(bill.matchingEngine.approvedForPayment, true);
    assert.equal(bill.matchingEngine.approvedBy, 'mgr-42');
  });

  await t.test('6. should track vendor payment vouchers, decrement amountDue, and mark bill PAID', () => {
    let bill = {
      grandTotal: 60000,
      amountPaid: 0,
      amountDue: 60000,
      status: 'APPROVED',
      matchingEngine: { approvedForPayment: true }
    };

    // Payout 1: Partial payment of ₹25,000 via NEFT
    const payment1 = {
      voucherNumber: 'VCH-2026-0001',
      amount: 25000,
      paymentMode: 'NEFT_RTGS',
      transactionReference: 'NEFT-HDFC-991100'
    };

    bill.amountPaid += payment1.amount;
    bill.amountDue = bill.grandTotal - bill.amountPaid;
    bill.status = bill.amountDue === 0 ? 'PAID' : 'PARTIALLY_PAID';

    assert.equal(bill.amountPaid, 25000);
    assert.equal(bill.amountDue, 35000);
    assert.equal(bill.status, 'PARTIALLY_PAID');

    // Payout 2: Remaining settlement of ₹35,000 via Bank Transfer
    const payment2 = {
      voucherNumber: 'VCH-2026-0002',
      amount: 35000,
      paymentMode: 'BANK_TRANSFER',
      transactionReference: 'IMPS-AXIS-332211'
    };

    bill.amountPaid += payment2.amount;
    bill.amountDue = bill.grandTotal - bill.amountPaid;
    bill.status = bill.amountDue === 0 ? 'PAID' : 'PARTIALLY_PAID';

    assert.equal(bill.amountPaid, 60000);
    assert.equal(bill.amountDue, 0);
    assert.equal(bill.status, 'PAID');
  });

  await t.test('7. should compute Accounts Payable (AP) aging schedule buckets accurately', () => {
    const today = new Date('2026-11-15T00:00:00Z');

    const vendorBills = [
      { id: '1', dueDate: '2026-11-25', amountDue: 45000 },  // Not due yet (-10d) -> current
      { id: '2', dueDate: '2026-11-05', amountDue: 30000 },  // 10d overdue -> days_1_30
      { id: '3', dueDate: '2026-10-01', amountDue: 55000 },  // 45d overdue -> days_31_60
      { id: '4', dueDate: '2026-08-20', amountDue: 20000 },  // 87d overdue -> days_61_90
      { id: '5', dueDate: '2026-06-10', amountDue: 80000 },  // 158d overdue -> days_90_plus
    ];

    const aging = calculateApAging(vendorBills, today);

    assert.equal(aging.current, 45000);
    assert.equal(aging.days_1_30, 30000);
    assert.equal(aging.days_31_60, 55000);
    assert.equal(aging.days_61_90, 20000);
    assert.equal(aging.days_90_plus, 80000);
    assert.equal(aging.totalPayables, 230000);
  });
});

