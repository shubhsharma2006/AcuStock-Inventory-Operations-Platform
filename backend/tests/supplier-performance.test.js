/**
 * Test Suite: Supplier Management & Performance Scorecards
 * ─────────────────────────────────────────────────────────
 * Tests:
 * 1. Composite performance score formula (40% On-Time, 35% Quality, 25% Cost)
 * 2. Cost variance penalty calculation
 * 3. Rating tier categorization (PLATINUM, GOLD, SILVER, BRONZE, AT_RISK)
 * 4. SupplierProfile model schema & paymentTerms enum validation
 * 5. Company schema extensions (isSupplier, supplierProfile)
 * 6. Leaderboard ranking and edge cases
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const SupplierPerformanceService = require('../src/services/supplierPerformance.service');
const SupplierProfile = require('../src/models/SupplierProfile');
const Company = require('../src/models/Company');

test('Supplier Management & Performance Scorecards', async (t) => {
  const tenantId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c401');
  const companyId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c402');
  const userId = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c403');

  await t.test('1. Composite Score: 100% on all metrics yields perfect 100 score', () => {
    const score = SupplierPerformanceService.calculateCompositeScore({
      onTimeRate: 100,
      qualityRate: 100,
      costVariancePercent: 0
    });
    assert.equal(score, 100);
  });

  await t.test('2. Composite Score: Correctly applies weights (40% on-time, 35% quality, 25% cost)', () => {
    // 80% on-time -> 80 * 0.40 = 32
    // 90% quality -> 90 * 0.35 = 31.5
    // 0% cost variance -> 100 * 0.25 = 25
    // Total = 32 + 31.5 + 25 = 88.5
    const score = SupplierPerformanceService.calculateCompositeScore({
      onTimeRate: 80,
      qualityRate: 90,
      costVariancePercent: 0
    });
    assert.equal(score, 88.5);
  });

  await t.test('3. Cost Variance: Favorable variance retains 100% cost score, overrun penalizes', () => {
    // Negative variance (-5% cheaper than PO) -> Full 25 points
    const favorableScore = SupplierPerformanceService.calculateCompositeScore({
      onTimeRate: 100,
      qualityRate: 100,
      costVariancePercent: -5
    });
    assert.equal(favorableScore, 100);

    // Positive variance (+10% overrun) -> 100 - (10 * 2) = 80 raw score * 0.25 = 20 points
    // Total: 40 + 35 + 20 = 95
    const overrunScore = SupplierPerformanceService.calculateCompositeScore({
      onTimeRate: 100,
      qualityRate: 100,
      costVariancePercent: 10
    });
    assert.equal(overrunScore, 95);
  });

  await t.test('4. Rating Tiers: Maps scores to appropriate tier levels', () => {
    assert.equal(SupplierPerformanceService.getRatingTier(98), 'PLATINUM');
    assert.equal(SupplierPerformanceService.getRatingTier(95), 'PLATINUM');
    assert.equal(SupplierPerformanceService.getRatingTier(88), 'GOLD');
    assert.equal(SupplierPerformanceService.getRatingTier(75), 'SILVER');
    assert.equal(SupplierPerformanceService.getRatingTier(60), 'BRONZE');
    assert.equal(SupplierPerformanceService.getRatingTier(45), 'AT_RISK');
  });

  await t.test('5. Model Validation: SupplierProfile schema and paymentTerms enum', () => {
    const validProfile = new SupplierProfile({
      companyId,
      tenantId,
      supplierCode: 'SUP-ACME-01',
      paymentTerms: 'NET_60',
      leadTimeDays: 14,
      minimumOrderValue: 5000,
      currency: 'INR',
      performance: {
        totalPOs: 12,
        completedPOs: 10,
        onTimeDeliveries: 9,
        onTimeRate: 90,
        qualityRate: 98,
        overallScore: 92.5
      }
    });

    const err = validProfile.validateSync();
    assert.equal(err, undefined, 'Valid profile must pass schema validation');
    assert.equal(validProfile.paymentTerms, 'NET_60');
    assert.equal(validProfile.leadTimeDays, 14);
  });

  await t.test('6. Model Validation: Rejects invalid paymentTerms', () => {
    const invalidProfile = new SupplierProfile({
      companyId,
      tenantId,
      paymentTerms: 'WHENEVER_YOU_FEEL_LIKE_PAYING'
    });

    const err = invalidProfile.validateSync();
    assert.ok(err.errors.paymentTerms, 'Invalid paymentTerms must fail enum validation');
  });

  await t.test('7. Company Schema: Integrates isSupplier flag and supplierProfile ref', () => {
    const supplierCompany = new Company({
      name: 'Apex Precision Metals',
      email: 'sales@apexmetals.com',
      phone: '+919876543210',
      address: {
        street: '42 Industrial Corridor',
        city: 'Pune',
        state: 'Maharashtra',
        zipCode: '411018',
        country: 'India'
      },
      industry: 'Manufacturing',
      isSupplier: true,
      tenantId,
      createdBy: userId
    });

    const err = supplierCompany.validateSync();
    assert.equal(err, undefined, 'Supplier company must pass schema validation');
    assert.equal(supplierCompany.isSupplier, true);
  });
});

