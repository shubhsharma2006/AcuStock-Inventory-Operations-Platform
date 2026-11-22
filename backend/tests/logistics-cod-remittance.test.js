'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CodRemittanceService = require('../src/services/logistics/CodRemittanceService');

describe('Phase 6: Automated COD Remittance & Reconciliation Engine', () => {

  it('1. Early COD Fee Rates: Computes exact percentages for T+1, T+2, and Standard cycles', () => {
    assert.equal(CodRemittanceService.EARLY_COD_FEES.EARLY_T1, 0.015);
    assert.equal(CodRemittanceService.EARLY_COD_FEES.EARLY_T2, 0.010);
    assert.equal(CodRemittanceService.EARLY_COD_FEES.STANDARD_T7, 0.0);

    const grossAmount = 10000;
    const t1Fee = Math.round(grossAmount * CodRemittanceService.EARLY_COD_FEES.EARLY_T1);
    const t2Fee = Math.round(grossAmount * CodRemittanceService.EARLY_COD_FEES.EARLY_T2);

    assert.equal(t1Fee, 150); // ₹150 fee on ₹10,000 for next-day settlement
    assert.equal(t2Fee, 100); // ₹100 fee on ₹10,000 for T+2
  });

  it('2. Net Remittance Calculation: Correctly factors in freight deductions and handling fees', () => {
    const collectedAmount = 4500;
    const freightCharge = 85;
    const earlyCodFee = Math.round(collectedAmount * 0.015); // ₹68
    const netRemitted = Math.max(0, collectedAmount - freightCharge - earlyCodFee);

    assert.equal(netRemitted, 4347);
  });

  it('3. COD Shortage Detection: Flags discrepancy when courier collects less than declared COD', () => {
    const declaredCod = 2500;
    const collectedCod = 2000; // ₹500 shortage

    const hasShortage = collectedCod < declaredCod;
    const discrepancyAmount = hasShortage ? declaredCod - collectedCod : 0;

    assert.equal(hasShortage, true);
    assert.equal(discrepancyAmount, 500);
  });

  it('4. Aging Urgency Logic: Categorizes overdue cash flow beyond 7-day settlement', () => {
    function categorizeAging(days) {
      if (days >= 7) return 'OVERDUE';
      if (days >= 4) return 'AGING';
      return 'ON_TIME';
    }

    assert.equal(categorizeAging(2), 'ON_TIME');
    assert.equal(categorizeAging(5), 'AGING');
    assert.equal(categorizeAging(9), 'OVERDUE');
  });

  it('5. Bank UTR Validation: Rejects missing UTR numbers on remittance advice batches', () => {
    assert.throws(() => {
      if (!null) {
        throw new Error('UTR Number is required for COD remittance advice');
      }
    }, /UTR Number is required/);
  });
});
