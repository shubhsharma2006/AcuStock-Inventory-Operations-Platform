const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Transporter = require('../src/models/Transporter');

test('Transporter - schema validation with required fields', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const carrier = new Transporter({
    name: 'Blue Dart Express',
    code: 'bluedart',
    trackingUrlPattern: 'https://www.bluedart.com/tracking?track={awb}',
    contactPerson: 'Ramesh Sharma',
    phone: '+91 98765 12345',
    email: 'tracking@bluedart.com',
    gstin: '27AAAAA0000A1Z5',
    isActive: true,
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  assert.equal(carrier.name, 'Blue Dart Express');
  assert.equal(carrier.code, 'BLUEDART'); // Uppercased automatically
  assert.equal(carrier.isActive, true);
  assert.equal(carrier.validateSync(), undefined);
});

test('Transporter - rejects missing name or code', () => {
  const dummyTenantId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  const carrier = new Transporter({
    createdBy: dummyUserId,
    tenantId: dummyTenantId
  });

  const err = carrier.validateSync();
  assert.ok(err);
  assert.ok(err.errors.name);
  assert.ok(err.errors.code);
});

test('Transporter - tracking URL pattern replacement helper', () => {
  function generateTrackingUrl(pattern, awb) {
    if (!pattern || !awb) return null;
    return pattern.replace(/\{awb\}|\{trackingNumber\}|\{tracking_number\}/gi, String(awb).trim());
  }

  const pattern1 = 'https://delhivery.com/track/package/{awb}';
  assert.equal(generateTrackingUrl(pattern1, '1234567890'), 'https://delhivery.com/track/package/1234567890');

  const pattern2 = 'https://track.dtdc.com/?trackingNumber={trackingNumber}';
  assert.equal(generateTrackingUrl(pattern2, 'DTC998877'), 'https://track.dtdc.com/?trackingNumber=DTC998877');

  const pattern3 = 'https://shipment.acustock.com/{tracking_number}/live';
  assert.equal(generateTrackingUrl(pattern3, 'ACU-TRF-01'), 'https://shipment.acustock.com/ACU-TRF-01/live');

  assert.equal(generateTrackingUrl(pattern1, ''), null);
  assert.equal(generateTrackingUrl(null, '12345'), null);
});
