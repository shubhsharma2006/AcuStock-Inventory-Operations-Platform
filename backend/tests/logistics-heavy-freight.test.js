'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const EWayBillEngine = require('../src/services/logistics/EWayBillEngine');
const FreightEngine = require('../src/services/logistics/FreightEngine');

describe('Phase 4: B2B Heavy Freight, PTL/FTL Cargo Booking & E-Way Bill Engine', () => {

  it('1. EWayBillEngine.isEWayBillMandatory: Enforces GST statutory value thresholds', () => {
    // Inter-state movement >= ₹50,000 requires E-Way bill
    assert.equal(EWayBillEngine.isEWayBillMandatory(50000, true), true);
    assert.equal(EWayBillEngine.isEWayBillMandatory(75000, true), true);
    assert.equal(EWayBillEngine.isEWayBillMandatory(49999, true), false);

    // Intra-state threshold (₹1,00,000)
    assert.equal(EWayBillEngine.isEWayBillMandatory(95000, false), false);
    assert.equal(EWayBillEngine.isEWayBillMandatory(100000, false), true);
  });

  it('2. EWayBillEngine.validateVehicleNumber: Validates Indian commercial vehicle registration patterns', () => {
    // Valid formats
    const valid1 = EWayBillEngine.validateVehicleNumber('DL-01-AB-1234');
    assert.equal(valid1.isValid, true);
    assert.equal(valid1.formatted, 'DL-01-AB-1234');

    const valid2 = EWayBillEngine.validateVehicleNumber('MH12DE4321');
    assert.equal(valid2.isValid, true);
    assert.equal(valid2.formatted, 'MH-12-DE-4321');

    const valid3 = EWayBillEngine.validateVehicleNumber('KA04A9999');
    assert.equal(valid3.isValid, true);

    // Invalid formats
    const invalid1 = EWayBillEngine.validateVehicleNumber('INVALID-TRUCK');
    assert.equal(invalid1.isValid, false);
    assert.ok(invalid1.error.includes('Invalid Indian vehicle registration format'));

    const invalid2 = EWayBillEngine.validateVehicleNumber('12345');
    assert.equal(invalid2.isValid, false);
  });

  it('3. EWayBillEngine.calculateValidity: Computes statutory validity by distance and cargo classification', () => {
    const startDate = new Date('2026-11-20T10:00:00Z');

    // Regular cargo: 1 day per 200 km
    const reg150Km = EWayBillEngine.calculateValidity(150, false, startDate);
    assert.equal(reg150Km.validityDays, 1);

    const reg450Km = EWayBillEngine.calculateValidity(450, false, startDate);
    assert.equal(reg450Km.validityDays, 3); // ceil(450/200) = 3 days

    // Over Dimensional Cargo (ODC): 1 day per 20 km
    const odc100Km = EWayBillEngine.calculateValidity(100, true, startDate);
    assert.equal(odc100Km.validityDays, 5); // ceil(100/20) = 5 days
  });

  it('4. EWayBillEngine.generateEWayBill: Generates compliant 12-digit number and Part A + Part B', () => {
    const ewb = EWayBillEngine.generateEWayBill({
      docNo: 'INV-2026-9041',
      docDate: new Date('2026-11-20T10:00:00Z'),
      fromGstin: '27AAAAA0000A1Z5',
      fromTrdName: 'AcuStock Central Warehouse',
      fromPincode: '400001',
      fromState: 'Maharashtra',
      toGstin: '29BBBBB0000B1Z8',
      toTrdName: 'Bangalore Regional Hub',
      toPincode: '560001',
      toState: 'Karnataka',
      totalValue: 125000,
      distanceKm: 980,
      transporterName: 'V-Trans Express',
      vehicleNumber: 'MH-12-AB-9921'
    });

    assert.equal(ewb.success, true);
    assert.equal(ewb.ewbNumber.length, 12);
    assert.ok(ewb.ewbNumber.startsWith('27')); // Maharashtra state prefix
    assert.equal(ewb.validityDays, 5); // ceil(980/200) = 5 days
    assert.equal(ewb.partA.totalValue, 125000);
    assert.equal(ewb.partB.vehicleNumber, 'MH-12-AB-9921');
    assert.ok(ewb.qrCodeData.includes(ewb.ewbNumber));
  });

  it('5. FreightEngine: Calculates PTL and FTL quotes with capacity and vehicle allocations', () => {
    const quotes = FreightEngine.calculateFreightQuotes({
      originPincode: '400001', // Mumbai
      destPincode: '411001',   // Pune
      grossWeightKg: 1200,     // 1.2 Tonnes
      palletCount: 3,
      declaredValue: 180000
    });

    assert.equal(quotes.isEWayBillRequired, true);
    assert.ok(quotes.distanceKm > 0);

    // PTL Quotes
    assert.ok(Array.isArray(quotes.ptlQuotes));
    assert.ok(quotes.ptlQuotes.length >= 3);
    const vtrans = quotes.ptlQuotes.find(q => q.id === 'VTRANS_PTL');
    assert.ok(vtrans);
    assert.equal(vtrans.billableWeightKg, 1200);
    assert.ok(vtrans.totalAmount > 0);

    // FTL Options (Must include vehicles with payload >= 1200kg, filter out Tata Ace 750kg)
    assert.ok(Array.isArray(quotes.ftlOptions));
    const hasTataAce = quotes.ftlOptions.some(v => v.vehicleType === 'TATA_ACE_750KG');
    assert.equal(hasTataAce, false, 'Tata Ace should not be allocated for 1200kg cargo (max 750kg)');

    const bolero = quotes.ftlOptions.find(v => v.vehicleType === 'BOLERO_PICKUP_1500KG');
    assert.ok(bolero, 'Bolero Pickup (1500kg) must be available');
    assert.ok(bolero.totalAmount > 0);

    const canter = quotes.ftlOptions.find(v => v.vehicleType === 'EICHER_14FT_4000KG');
    assert.ok(canter, '14ft Canter (4000kg) must be available');
  });
});
