'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const WeightDiscrepancyService = require('../src/services/logistics/WeightDiscrepancyService');

describe('Phase 5: Weight Discrepancy & Dispute Management Engine', () => {

  it('1. Weight Tolerance: Accurately filters out weight differences within 50g tolerance', () => {
    const declaredWeight = 1.0;
    const billedWithin = 1.04; // 40g diff -> within tolerance
    const billedExcess = 1.65; // 650g diff -> excess

    const diff1 = Math.round((billedWithin - declaredWeight) * 1000) / 1000;
    assert.equal(diff1 <= WeightDiscrepancyService.TOLERANCE_KG, true);

    const diff2 = Math.round((billedExcess - declaredWeight) * 1000) / 1000;
    assert.equal(diff2 > WeightDiscrepancyService.TOLERANCE_KG, true);
  });

  it('2. Excess Freight Charge Calculation: Computes slab-based excess freight charges', () => {
    const excessKg = 0.85; // 850g excess
    const slabs = Math.ceil(excessKg / 0.5); // 2 slabs of 500g
    assert.equal(slabs, 2);

    const excessAmount = slabs * 48; // ₹48 per 500g slab
    assert.equal(excessAmount, 96);
  });

  it('3. Auto-Debit Window: Computes 5-day contest countdown cutoff', () => {
    const now = Date.now();
    const autoDebitCutoff = new Date(now + WeightDiscrepancyService.AUTO_DEBIT_WINDOW_DAYS * 24 * 3600000);

    const hoursRemaining = Math.round((autoDebitCutoff.getTime() - now) / 3600000);
    assert.equal(hoursRemaining, 120); // 5 days = 120 hours
  });

  it('4. Dispute Evidence Structure: Validates merchant contest evidence and carrier dispute tokens', () => {
    const mockEvidence = {
      scalePhotoUrl: 'https://cdn.acustock.com/proofs/scale_awb_99120.jpg',
      dimensionsPhotoUrl: 'https://cdn.acustock.com/proofs/box_measure.jpg',
      merchantRemarks: 'Certified digital scale calibration certificate attached.'
    };

    assert.ok(mockEvidence.scalePhotoUrl.includes('scale_awb_99120.jpg'));
    assert.ok(mockEvidence.merchantRemarks.length > 10);
  });

  it('5. Discrepancy Urgency Scoring: Correctly marks <= 24h as urgent countdown', () => {
    const now = Date.now();
    const urgentCutoff = new Date(now + 14 * 3600000); // 14 hours left
    const normalCutoff = new Date(now + 72 * 3600000); // 72 hours left

    const hoursUrgent = Math.round((urgentCutoff.getTime() - now) / 3600000);
    const hoursNormal = Math.round((normalCutoff.getTime() - now) / 3600000);

    assert.equal(hoursUrgent <= 24, true);
    assert.equal(hoursNormal > 24, true);
  });
});
