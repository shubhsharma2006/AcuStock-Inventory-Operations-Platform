'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const VolumetricEngine = require('../src/services/logistics/VolumetricEngine');
const BigshipProvider = require('../src/services/logistics/BigshipProvider');
const ShiprocketProvider = require('../src/services/logistics/ShiprocketProvider');
const allocationEngine = require('../src/services/logistics/CarrierAllocationEngine');

test('Phase 1: Multi-Carrier Logistics & Rate Allocation Engine', async (t) => {
  await t.test('1. VolumetricEngine: Computes billable weight and detects volumetric dominance', () => {
    // Standard package: 2 kg actual, but 40x30x20 cm = 24,000 / 5000 = 4.8 kg volumetric
    const bulkyBox = VolumetricEngine.calculateWeight({
      actualWeightKg: 2,
      lengthCm: 40,
      widthCm: 30,
      heightCm: 20
    });

    assert.equal(bulkyBox.actualWeightKg, 2);
    assert.equal(bulkyBox.volumetricWeightKg, 4.8);
    assert.equal(bulkyBox.billableWeightKg, 4.8);
    assert.equal(bulkyBox.isVolumetricDominant, true);

    // Dense package: 10 kg actual, but small box 10x10x10 cm = 1,000 / 5000 = 0.2 kg volumetric
    const denseBox = VolumetricEngine.calculateWeight({
      actualWeightKg: 10,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10
    });

    assert.equal(denseBox.actualWeightKg, 10);
    assert.equal(denseBox.volumetricWeightKg, 0.2);
    assert.equal(denseBox.billableWeightKg, 10);
    assert.equal(denseBox.isVolumetricDominant, false);

    // Heavy cargo divisor check (4000)
    const cargoBox = VolumetricEngine.calculateWeight({
      actualWeightKg: 5,
      lengthCm: 40,
      widthCm: 40,
      heightCm: 40,
      isHeavyCargo: true
    });
    assert.equal(cargoBox.divisor, 4000);
    assert.equal(cargoBox.volumetricWeightKg, 16); // 64,000 / 4000 = 16
    assert.equal(cargoBox.billableWeightKg, 16);
  });

  await t.test('2. VolumetricEngine: Resolves transit zones across Indian postal circles', () => {
    // Intra-city (same prefix 400xxx)
    assert.equal(VolumetricEngine.resolveZone('400001', '400050'), 'ZONE_A');

    // Intra-state (Maharashtra 40xxxx to 41xxxx)
    assert.equal(VolumetricEngine.resolveZone('400001', '411001'), 'ZONE_B');

    // Metro-to-Metro (Mumbai 400001 to Delhi 110001)
    assert.equal(VolumetricEngine.resolveZone('400001', '110001'), 'ZONE_C');

    // Rest of India (Mumbai 400001 to Jaipur 302001)
    assert.equal(VolumetricEngine.resolveZone('400001', '302001'), 'ZONE_D');

    // Special Zone (Guwahati Assam 781001)
    assert.equal(VolumetricEngine.resolveZone('400001', '781001'), 'ZONE_E');
  });

  await t.test('3. BigshipProvider: Calculates quotes across Delhivery, Blue Dart, and DTDC Cargo', async () => {
    const bigship = new BigshipProvider();
    const quotes = await bigship.getRates({
      fromPincode: '400001',
      toPincode: '110001',
      actualWeightKg: 3.5,
      lengthCm: 25,
      widthCm: 20,
      heightCm: 15,
      isCod: true,
      declaredValue: 2500
    });

    assert.ok(quotes.length >= 3, 'Must return multiple carrier quotes from Bigship');
    assert.ok(quotes.every(q => q.provider === 'BIGSHIP'));
    assert.ok(quotes.some(q => q.carrierCode.includes('DELHIVERY')));
    assert.ok(quotes.some(q => q.serviceType === 'AIR'));

    const airQuote = quotes.find(q => q.serviceType === 'AIR');
    const surfaceQuote = quotes.find(q => q.serviceType === 'SURFACE');

    assert.ok(airQuote.expectedDays <= surfaceQuote.expectedDays, 'Air express must have lower or equal EDD');
    assert.ok(airQuote.rate > surfaceQuote.rate, 'Air express must have higher rate than surface');

    // This adapter only supplies estimates until a carrier booking integration is configured.
    await assert.rejects(bigship.createShipment({}), /createShipment/);
  });

  await t.test('4. CarrierAllocationEngine: Ranks quotes by policy (CHEAPEST, FASTEST, BEST_RATED)', async () => {
    const params = {
      fromPincode: '400001',
      toPincode: '560001',
      actualWeightKg: 4.0,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 15
    };

    // Test CHEAPEST policy
    const cheapestResult = await allocationEngine.compareAndRank(params, 'CHEAPEST');
    assert.equal(cheapestResult.policy, 'CHEAPEST');
    assert.ok(cheapestResult.quotes.length > 0);
    assert.equal(cheapestResult.recommended.rate, cheapestResult.quotes[0].rate);
    for (let i = 0; i < cheapestResult.quotes.length - 1; i++) {
      assert.ok(cheapestResult.quotes[i].rate <= cheapestResult.quotes[i + 1].rate);
    }

    // Test FASTEST policy
    const fastestResult = await allocationEngine.compareAndRank(params, 'FASTEST');
    assert.equal(fastestResult.policy, 'FASTEST');
    assert.equal(fastestResult.recommended.expectedDays, fastestResult.quotes[0].expectedDays);
    for (let i = 0; i < fastestResult.quotes.length - 1; i++) {
      assert.ok(fastestResult.quotes[i].expectedDays <= fastestResult.quotes[i + 1].expectedDays);
    }

    // Test BEST_RATED policy
    const bestRatedResult = await allocationEngine.compareAndRank(params, 'BEST_RATED');
    assert.equal(bestRatedResult.policy, 'BEST_RATED');
    assert.ok(bestRatedResult.recommended.carrierScore >= 95, 'Recommended top carrier must have top reliability score');

    // Test BALANCED policy default
    const balancedResult = await allocationEngine.compareAndRank(params);
    assert.equal(balancedResult.policy, 'BALANCED');
    assert.ok(balancedResult.recommended.isRecommended, 'Top quote must be marked as recommended');
    assert.ok(balancedResult.totalCarriersEvaluated > 0);
  });
});
