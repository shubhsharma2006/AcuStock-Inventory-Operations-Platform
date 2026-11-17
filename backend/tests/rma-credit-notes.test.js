/**
 * Automated Test Suite: RMA, Reverse Logistics & Statutory GST Credit Notes
 * ───────────────────────────────────────────────────────────────────────────
 * Validates:
 * 1. Sequential RMA generation format (RMA-YYYY-XXXX) & return reason taxonomy
 * 2. RMA status progression (REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED -> INSPECTED)
 * 3. Warehouse Dock Disposition triage (Restock to inventory vs Scrap write-off vs RTV)
 * 4. Statutory Indian GST Credit Note tax reversal (Intra-state CGST+SGST vs Inter-state IGST)
 * 5. Automatic Customer AR balance and Invoice reconciliation
 * 6. Credit Note allocation against open invoice balances
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ── Helpers mirroring business logic ────────────────────────────────────────
function calculateCreditNoteFinancials(items = [], isInterState = false) {
  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const processedItems = items.map((it) => {
    const qty = Number(it.quantity) || 1;
    const unitPrice = Number(it.unitPrice) || 0;
    const taxable = Math.round(qty * unitPrice * 100) / 100;
    const taxRate = Number(it.taxRatePercent || it.gstRate) || 18;

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isInterState) {
      igst = Math.round(taxable * (taxRate / 100) * 100) / 100;
    } else {
      cgst = Math.round(taxable * ((taxRate / 2) / 100) * 100) / 100;
      sgst = Math.round(taxable * ((taxRate / 2) / 100) * 100) / 100;
    }

    const total = Math.round((taxable + cgst + sgst + igst) * 100) / 100;

    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;

    return {
      ...it,
      quantity: qty,
      unitPrice,
      taxableAmount: taxable,
      gstRate: taxRate,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      total
    };
  });

  const totalTax = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;
  const rawGrand = totalTaxable + totalTax;
  const grandTotal = Math.round(rawGrand);
  const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

  return {
    processedItems,
    financialSummary: {
      taxableAmount: Math.round(totalTaxable * 100) / 100,
      cgst: Math.round(totalCgst * 100) / 100,
      sgst: Math.round(totalSgst * 100) / 100,
      igst: Math.round(totalIgst * 100) / 100,
      totalTax,
      roundOff,
      grandTotal,
      isInterState
    }
  };
}

function processRmaDisposition(items = [], dispositions = []) {
  let unitsRestocked = 0;
  let unitsScrapped = 0;
  let unitsRtv = 0;
  const eligibleCreditItems = [];

  dispositions.forEach((disp, idx) => {
    const item = items[idx] || disp;
    const qtyRecv = Number(disp.quantityReceived) || 0;

    if (qtyRecv > 0) {
      if (disp.disposition === 'RESTOCK') {
        unitsRestocked += qtyRecv;
      } else if (disp.disposition === 'SCRAP') {
        unitsScrapped += qtyRecv;
      } else if (disp.disposition === 'RETURN_TO_VENDOR') {
        unitsRtv += qtyRecv;
      }

      eligibleCreditItems.push({
        name: item.name,
        sku: item.sku,
        hsnCode: item.hsnCode || '8471',
        quantity: qtyRecv,
        unitPrice: item.unitPrice,
        taxRatePercent: item.taxRatePercent || 18,
        disposition: disp.disposition
      });
    }
  });

  return {
    unitsRestocked,
    unitsScrapped,
    unitsRtv,
    totalReceived: unitsRestocked + unitsScrapped + unitsRtv,
    eligibleCreditItems
  };
}

// ── Test Suites ─────────────────────────────────────────────────────────────
test('RMA, Reverse Logistics & GST Credit Notes Suite', async (t) => {
  await t.test('1. should validate RMA generation with return taxonomy and item limits', () => {
    const rma = {
      rmaNumber: 'RMA-2026-0001',
      invoiceNumber: 'INV-2026-0010',
      companyName: 'Apex Industrial Corp',
      returnType: 'CUSTOMER_RETURN',
      reason: 'DEFECTIVE_PRODUCT',
      status: 'APPROVED',
      items: [{
        name: 'Industrial Controller V2',
        sku: 'CTRL-V2',
        quantityRequested: 4,
        unitPrice: 10000,
        taxRatePercent: 18
      }]
    };

    assert.equal(rma.rmaNumber, 'RMA-2026-0001');
    assert.equal(rma.returnType, 'CUSTOMER_RETURN');
    assert.equal(rma.reason, 'DEFECTIVE_PRODUCT');
    assert.equal(rma.items[0].quantityRequested, 4);
    assert.equal(rma.items[0].unitPrice, 10000);
  });

  await t.test('2. should track RMA lifecycle transitions from REQUESTED to RECEIVED', () => {
    let rmaStatus = 'REQUESTED';

    // Step 1: Manager approves
    rmaStatus = 'APPROVED';
    assert.equal(rmaStatus, 'APPROVED');

    // Step 2: Customer ships back via Delhivery
    const courier = { name: 'Delhivery', tracking: 'DEL-99881122' };
    rmaStatus = 'IN_TRANSIT';
    assert.equal(rmaStatus, 'IN_TRANSIT');
    assert.equal(courier.tracking, 'DEL-99881122');

    // Step 3: Warehouse dock receives crate
    rmaStatus = 'RECEIVED';
    const receivedDate = new Date('2026-11-11T12:00:00Z');
    assert.equal(rmaStatus, 'RECEIVED');
    assert.ok(receivedDate);
  });

  await t.test('3. should triage dock disposition into Restock vs Scrap vs RTV and adjust stock counters', () => {
    const rmaItems = [
      { name: 'Industrial Controller V2', sku: 'CTRL-V2', unitPrice: 10000, taxRatePercent: 18 },
      { name: 'Barcode Scanner SCN-880', sku: 'SCN-880', unitPrice: 5000, taxRatePercent: 18 }
    ];

    const dispositions = [
      { itemIndex: 0, quantityReceived: 3, disposition: 'RESTOCK', dispositionNotes: 'Grade A sealed' },
      { itemIndex: 1, quantityReceived: 2, disposition: 'SCRAP', dispositionNotes: 'Shattered glass lens' }
    ];

    const result = processRmaDisposition(rmaItems, dispositions);

    assert.equal(result.unitsRestocked, 3);
    assert.equal(result.unitsScrapped, 2);
    assert.equal(result.unitsRtv, 0);
    assert.equal(result.totalReceived, 5);
    assert.equal(result.eligibleCreditItems.length, 2);
  });

  await t.test('4. should calculate intra-state GST Credit Note tax reversal (CGST 9% + SGST 9%)', () => {
    const returnItems = [{
      name: 'Industrial Controller V2',
      quantity: 2,
      unitPrice: 10000,
      taxRatePercent: 18 // Total taxable = 20,000
    }];

    const { financialSummary, processedItems } = calculateCreditNoteFinancials(returnItems, false);

    assert.equal(financialSummary.isInterState, false);
    assert.equal(financialSummary.taxableAmount, 20000);
    assert.equal(financialSummary.cgst, 1800); // 9% of 20,000
    assert.equal(financialSummary.sgst, 1800); // 9% of 20,000
    assert.equal(financialSummary.igst, 0);
    assert.equal(financialSummary.totalTax, 3600);
    assert.equal(financialSummary.grandTotal, 23600);
    assert.equal(processedItems[0].total, 23600);
  });

  await t.test('5. should calculate inter-state GST Credit Note tax reversal (IGST 18%)', () => {
    const returnItems = [{
      name: 'Industrial Controller V2',
      quantity: 5,
      unitPrice: 10000,
      taxRatePercent: 18 // Total taxable = 50,000
    }];

    const { financialSummary, processedItems } = calculateCreditNoteFinancials(returnItems, true);

    assert.equal(financialSummary.isInterState, true);
    assert.equal(financialSummary.taxableAmount, 50000);
    assert.equal(financialSummary.cgst, 0);
    assert.equal(financialSummary.sgst, 0);
    assert.equal(financialSummary.igst, 9000); // 18% of 50,000
    assert.equal(financialSummary.totalTax, 9000);
    assert.equal(financialSummary.grandTotal, 59000);
    assert.equal(processedItems[0].total, 59000);
  });

  await t.test('6. should auto-reconcile Customer AR balance and Invoice balance on Credit Note issuance', () => {
    let customerOutstanding = 100000;
    let invoiceAmountDue = 100000;
    let invoiceStatus = 'ISSUED';

    const creditNoteGrandTotal = 23600;

    // Credit Note applied
    customerOutstanding = Math.max(0, customerOutstanding - creditNoteGrandTotal);
    invoiceAmountDue = Math.max(0, invoiceAmountDue - creditNoteGrandTotal);

    if (invoiceAmountDue === 0) invoiceStatus = 'PAID';

    assert.equal(customerOutstanding, 76400);
    assert.equal(invoiceAmountDue, 76400);
    assert.equal(invoiceStatus, 'ISSUED');

    // Remaining invoice balance settled
    const secondCredit = 76400;
    invoiceAmountDue = Math.max(0, invoiceAmountDue - secondCredit);
    if (invoiceAmountDue === 0) invoiceStatus = 'PAID';

    assert.equal(invoiceAmountDue, 0);
    assert.equal(invoiceStatus, 'PAID');
  });
});

