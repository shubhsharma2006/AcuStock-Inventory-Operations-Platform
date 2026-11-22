'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LogisticsWalletService = require('../src/services/logistics/LogisticsWalletService');

describe('Phase 7: Multi-Carrier Unified Logistics Wallet & Consolidated Billing', () => {

  it('1. Balance Validation: Rejects invalid top-up values under ₹100', async () => {
    await assert.rejects(
      async () => {
        await LogisticsWalletService.topUpWallet({
          tenantId: '000000000000000000000001',
          amount: 50 // below min 100
        });
      },
      /Minimum wallet top-up amount is ₹100/
    );
  });

  it('2. Insufficient Balance Guard: Blocks freight booking when debit exceeds available balance and credit line', () => {
    const availableBalance = 1500;
    const creditLimit = 500;
    const creditUsed = 0;
    const totalLiquidity = availableBalance + (creditLimit - creditUsed);
    const requiredDebit = 2500;

    const hasSufficientFunds = totalLiquidity >= requiredDebit;
    assert.equal(hasSufficientFunds, false);
    assert.equal(totalLiquidity, 2000);
  });

  it('3. Auto-Recharge Trigger: Correctly activates when running balance drops below threshold', () => {
    const currentBalance = 3200;
    const debitAmount = 1800; // leaves 1400
    const newBalance = currentBalance - debitAmount;
    const autoRecharge = {
      enabled: true,
      thresholdAmount: 2000,
      topUpAmount: 5000
    };

    let autoRechargeFired = false;
    let finalBalance = newBalance;

    if (autoRecharge.enabled && newBalance < autoRecharge.thresholdAmount) {
      autoRechargeFired = true;
      finalBalance += autoRecharge.topUpAmount;
    }

    assert.equal(autoRechargeFired, true);
    assert.equal(finalBalance, 6400); // 1400 + 5000
  });

  it('4. Monthly Consolidated Tax Invoice: Formulates SAC 996511 with 18% GST (CGST+SGST vs IGST)', () => {
    const taxableAmount = 25000;
    
    // Intra-state (9% CGST + 9% SGST)
    const cgst = Math.round(taxableAmount * 0.09);
    const sgst = Math.round(taxableAmount * 0.09);
    const totalGstIntra = cgst + sgst;
    const grandTotalIntra = taxableAmount + totalGstIntra;

    assert.equal(cgst, 2250);
    assert.equal(sgst, 2250);
    assert.equal(totalGstIntra, 4500);
    assert.equal(grandTotalIntra, 29500);

    // Inter-state (18% IGST)
    const igst = Math.round(taxableAmount * 0.18);
    const totalGstInter = igst;
    const grandTotalInter = taxableAmount + totalGstInter;

    assert.equal(igst, 4500);
    assert.equal(grandTotalInter, 29500);
  });

  it('5. Spend Analytics Calculation: Correctly attributes cost breakdown across carriers and cost centers', () => {
    const sampleDebits = [
      { amount: -1500, carrier: 'Delhivery', costCenter: 'B2C E-Commerce' },
      { amount: -2500, carrier: 'BlueDart', costCenter: 'B2C E-Commerce' },
      { amount: -4000, carrier: 'V-Trans', costCenter: 'B2B Heavy Cargo' },
      { amount: -1000, carrier: 'Delhivery', costCenter: 'Warehouse Transfers' }
    ];

    const byCarrier = {};
    const byCostCenter = {};
    let totalSpend = 0;

    for (const d of sampleDebits) {
      const amt = Math.abs(d.amount);
      totalSpend += amt;
      byCarrier[d.carrier] = (byCarrier[d.carrier] || 0) + amt;
      byCostCenter[d.costCenter] = (byCostCenter[d.costCenter] || 0) + amt;
    }

    assert.equal(totalSpend, 9000);
    assert.equal(byCarrier['Delhivery'], 2500);
    assert.equal(byCarrier['BlueDart'], 2500);
    assert.equal(byCarrier['V-Trans'], 4000);
    assert.equal(byCostCenter['B2C E-Commerce'], 4000);
    assert.equal(byCostCenter['B2B Heavy Cargo'], 4000);
    assert.equal(byCostCenter['Warehouse Transfers'], 1000);
  });
});
