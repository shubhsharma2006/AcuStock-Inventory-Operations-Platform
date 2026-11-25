'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const LogisticsNotificationService = require('../src/services/logistics/LogisticsNotificationService');

describe('Omnichannel Logistics Notification Gateway (WhatsApp & SMS)', () => {

  it('1. Phone Normalization: Converts varied domestic/international inputs to E.164 standard', () => {
    // 10 digits without country code
    assert.equal(LogisticsNotificationService.cleanPhoneNumber('9876543210'), '919876543210');

    // 11 digits with leading zero
    assert.equal(LogisticsNotificationService.cleanPhoneNumber('09876543210'), '919876543210');

    // Formatted with spaces, brackets, and hyphens
    assert.equal(LogisticsNotificationService.cleanPhoneNumber('+91 (987) 65-43210'), '919876543210');

    // Invalid / empty
    assert.equal(LogisticsNotificationService.cleanPhoneNumber(''), null);
    assert.equal(LogisticsNotificationService.cleanPhoneNumber(null), null);
  });

  it('2. Deep Link Formatter: Formats relative tracking routes into absolute browser links', () => {
    const relativeUrl = '/tracking/TRF-DEL-2026-001';
    const absolute = LogisticsNotificationService.formatTrackingLink(relativeUrl);
    assert.ok(absolute.includes('/tracking/TRF-DEL-2026-001'));
    assert.ok(absolute.startsWith('http'));

    // Already absolute
    const existing = 'https://custom-tracking.acustock.app/track/123';
    assert.equal(LogisticsNotificationService.formatTrackingLink(existing), existing);
  });

  it('3. NDR Delivery Exception Alert: Formulates urgent action message with re-attempt deep link', async () => {
    const result = await LogisticsNotificationService.sendNdrAlert({
      phone: '9876543210',
      customerName: 'Rahul Verma',
      awb: 'DEL-9912001',
      reference: 'ORD-2026-8812',
      reason: 'Customer Unavailable',
      rtoCutoffHours: 24,
      trackingUrl: '/tracking/ORD-2026-8812'
    });

    assert.equal(result.success, true);
    assert.equal(result.channel, 'WHATSAPP_PRIMARY');
    assert.equal(result.phone, '919876543210');
    assert.ok(result.actionUrl.includes('/tracking/ORD-2026-8812'));
  });

  it('4. Dispatch Alert: Formulates courier milestone tracking link', async () => {
    const result = await LogisticsNotificationService.sendDispatchedAlert({
      phone: '+91 9988776655',
      customerName: 'Priya Sharma',
      awb: 'BLU-8821920',
      reference: 'ORD-9910',
      carrier: 'Blue Dart Express',
      expectedDeliveryDate: new Date('2026-11-26')
    });

    assert.equal(result.success, true);
    assert.equal(result.phone, '919988776655');
  });

  it('5. Early COD Settlement Alert: Formulates UTR confirmation for merchant accounts', async () => {
    const result = await LogisticsNotificationService.sendEarlyCodSettlementAlert({
      phone: '9123456789',
      merchantName: 'Acme Retailers',
      amount: 45000,
      utrNumber: 'HDFC0001928374',
      cycle: 'EARLY_T1'
    });

    assert.equal(result.success, true);
    assert.equal(result.phone, '919123456789');
  });
});
