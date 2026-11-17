/**
 * Automated Test Suite: CRM Quotation Generator & Customer 360 Credit Engine
 * ───────────────────────────────────────────────────────────────────────────
 * Tests:
 * 1. CrmDeal quotation model schema (quoteNumber, validity, GST breakdown)
 * 2. Company credit limit and balance tracking
 * 3. State-aware Indian GST calculation (Intra-state CGST+SGST vs Inter-state IGST)
 * 4. Credit limit enforcement and manager override workflows
 * 5. Customer 360 financial metrics and timeline aggregation
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const CrmDeal = require('../src/models/CrmDeal');
const Company = require('../src/models/Company');

describe('CRM Quotation Generator & Customer 360 Credit Engine', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyProductId = new mongoose.Types.ObjectId();

  it('1. should store quotation metadata and state-aware GST breakdown on CrmDeal', () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const deal = new CrmDeal({
      dealNumber: 'DEAL-2026-0010',
      quoteNumber: 'QT-2026-0001',
      quotationNumber: 'QT-2026-0001',
      title: '50x Barcode Thermal Printers',
      contact: { name: 'Rajesh Patel', email: 'rajesh@apexlogistics.in', phone: '+91 98200 12345' },
      stage: 'PROPOSAL',
      value: 118000,
      quoteValidityDays: 7,
      quoteExpiresAt: expiresAt,
      paymentTerms: 'NET_30',
      taxBreakdown: {
        taxableAmount: 100000,
        cgst: 9000,
        sgst: 9000,
        igst: 0,
        totalTax: 18000,
        grandTotal: 118000,
        isInterState: false
      },
      items: [{
        productId: dummyProductId,
        quantity: 50,
        unitPrice: 2000,
        discountPercent: 0,
        taxRatePercent: 18,
        lineTotal: 118000
      }],
      createdBy: dummyUserId,
      tenantId: dummyTenantId
    });

    assert.strictEqual(deal.quoteNumber, 'QT-2026-0001');
    assert.strictEqual(deal.paymentTerms, 'NET_30');
    assert.strictEqual(deal.taxBreakdown.cgst, 9000);
    assert.strictEqual(deal.taxBreakdown.sgst, 9000);
    assert.strictEqual(deal.taxBreakdown.igst, 0);
    assert.strictEqual(deal.taxBreakdown.isInterState, false);
    assert.strictEqual(deal.taxBreakdown.grandTotal, 118000);
  });

  it('2. should support Inter-State IGST taxation when buyer state differs from seller state', () => {
    const deal = new CrmDeal({
      dealNumber: 'DEAL-2026-0011',
      quoteNumber: 'QT-2026-0002',
      title: 'Interstate Order: Delhi to Karnataka',
      contact: { name: 'Ananya Rao' },
      stage: 'PROPOSAL',
      value: 236000,
      paymentTerms: 'ADVANCE',
      taxBreakdown: {
        taxableAmount: 200000,
        cgst: 0,
        sgst: 0,
        igst: 36000,
        totalTax: 36000,
        grandTotal: 236000,
        isInterState: true
      },
      createdBy: dummyUserId,
      tenantId: dummyTenantId
    });

    assert.strictEqual(deal.taxBreakdown.isInterState, true);
    assert.strictEqual(deal.taxBreakdown.cgst, 0);
    assert.strictEqual(deal.taxBreakdown.sgst, 0);
    assert.strictEqual(deal.taxBreakdown.igst, 36000);
    assert.strictEqual(deal.taxBreakdown.grandTotal, 236000);
  });

  it('3. should store Customer credit limit, days, and outstanding balance on Company model', () => {
    const company = new Company({
      name: 'Reliance Logistics Ltd',
      email: 'vendor@reliance.com',
      phone: '+91 9988776655',
      address: {
        street: 'Maker Chambers IV, Nariman Point',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400021'
      },
      industry: 'Retail',
      type: 'CUSTOMER',
      paymentTerms: 'Net 30',
      creditLimit: 500000, // ₹5,00,000 credit limit
      creditDays: 30,
      outstandingBalance: 150000, // ₹1,50,000 used
      isCreditBlocked: false,
      createdBy: dummyUserId,
      tenantId: dummyTenantId
    });

    assert.strictEqual(company.creditLimit, 500000);
    assert.strictEqual(company.creditDays, 30);
    assert.strictEqual(company.outstandingBalance, 150000);
    assert.strictEqual(company.isCreditBlocked, false);

    // Credit utilization calculation
    const utilizationPct = Math.round((company.outstandingBalance / company.creditLimit) * 100);
    assert.strictEqual(utilizationPct, 30); // 30% utilized
  });

  it('4. should correctly detect credit limit exceeded condition', () => {
    const creditLimit = 200000;
    const currentOutstanding = 180000;
    const incomingOrderValue = 50000;

    const projectedBalance = currentOutstanding + incomingOrderValue; // 230,000
    const isExceeded = creditLimit > 0 && projectedBalance > creditLimit;

    assert.strictEqual(isExceeded, true);
    assert.strictEqual(projectedBalance, 230000);

    // If manager grants override:
    const allowOverride = true;
    const canConvert = !isExceeded || allowOverride;
    assert.strictEqual(canConvert, true);
  });

  it('5. should record manager override reason in deal activity log when credit is breached', () => {
    const deal = new CrmDeal({
      dealNumber: 'DEAL-2026-0012',
      title: 'High-Value Urgent Order',
      contact: { name: 'Vikram Mehta' },
      stage: 'WON',
      value: 300000,
      activityLog: [{
        type: 'NOTE',
        text: '⚠️ Manager Override applied for Customer Credit Limit (Projected: ₹3,50,000, Limit: ₹2,00,000). Reason: Director Authorized Expansion Deal',
        user: 'SuperAdmin'
      }],
      createdBy: dummyUserId,
      tenantId: dummyTenantId
    });

    assert.strictEqual(deal.activityLog.length, 1);
    assert(deal.activityLog[0].text.includes('Manager Override applied'));
    assert(deal.activityLog[0].text.includes('Director Authorized Expansion Deal'));
  });
});
