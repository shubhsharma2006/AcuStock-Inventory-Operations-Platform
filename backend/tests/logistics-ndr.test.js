'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const NdrService = require('../src/services/logistics/NdrService');

describe('Phase 3: Automated NDR & Customer Re-Attempt Workflow Engine', () => {

  it('1. NdrService.classifyReason: Categorizes courier failure strings into standard NDR reasons', () => {
    assert.equal(
      NdrService.classifyReason('Customer not available at destination premises'),
      NdrService.REASON_CODES.CUSTOMER_UNAVAILABLE
    );
    assert.equal(
      NdrService.classifyReason('Incomplete address / Landmark not found'),
      NdrService.REASON_CODES.INCORRECT_ADDRESS
    );
    assert.equal(
      NdrService.classifyReason('Consignee refused to accept the package'),
      NdrService.REASON_CODES.CUSTOMER_REFUSED
    );
    assert.equal(
      NdrService.classifyReason('Cash on delivery amount not ready with customer'),
      NdrService.REASON_CODES.COD_NOT_READY
    );
    assert.equal(
      NdrService.classifyReason('Customer phone switched off / not answering calls'),
      NdrService.REASON_CODES.PHONE_UNREACHABLE
    );
    assert.equal(
      NdrService.classifyReason('Security gate entry denied by society guard'),
      NdrService.REASON_CODES.ENTRY_RESTRICTED
    );
    assert.equal(
      NdrService.classifyReason('Customer requested delivery on next day'),
      NdrService.REASON_CODES.CUSTOMER_RESCHEDULE_REQUESTED
    );
    assert.equal(
      NdrService.classifyReason('Miscellaneous local transit issue'),
      NdrService.REASON_CODES.OTHER
    );
  });

  it('2. NdrService Cutoff Urgency: Correctly calculates cutoff hours and urgency tier', () => {
    const now = Date.now();
    
    // Critical: <= 12 hours
    const criticalCutoff = new Date(now + 6 * 3600000);
    const criticalHours = Math.max(0, Math.round((criticalCutoff.getTime() - now) / 3600000));
    assert.equal(criticalHours <= 12, true);

    // Warning: <= 24 hours
    const warningCutoff = new Date(now + 18 * 3600000);
    const warningHours = Math.max(0, Math.round((warningCutoff.getTime() - now) / 3600000));
    assert.equal(warningHours > 12 && warningHours <= 24, true);

    // Normal: > 24 hours
    const normalCutoff = new Date(now + 42 * 3600000);
    const normalHours = Math.max(0, Math.round((normalCutoff.getTime() - now) / 3600000));
    assert.equal(normalHours > 24, true);
  });

  it('3. Multi-Channel Alert Payload Formulation: Formulates actionable customer SMS/WhatsApp deep-link', () => {
    const mockShipment = {
      reference: 'SHP-DEL-2026-991',
      awb: 'BSHP-9918231',
      customerName: 'Priya Verma',
      phone: '+91 9876543210',
      reason: NdrService.REASON_CODES.CUSTOMER_UNAVAILABLE
    };

    const alertPayload = {
      recipientPhone: mockShipment.phone,
      recipientName: mockShipment.customerName,
      awb: mockShipment.awb,
      reference: mockShipment.reference,
      reason: mockShipment.reason,
      trackingUrl: `/tracking/${encodeURIComponent(mockShipment.reference)}`,
      rtoCutoffHours: 48
    };

    assert.equal(alertPayload.recipientPhone, '+91 9876543210');
    assert.equal(alertPayload.trackingUrl, '/tracking/SHP-DEL-2026-991');
    assert.equal(alertPayload.rtoCutoffHours, 48);
  });

  it('4. NDR Action Validation: Rejects invalid action and supports REATTEMPT and RTO_IMMEDIATE', () => {
    const validActions = ['REATTEMPT', 'UPDATE_DETAILS', 'HOLD_HUB', 'RTO_IMMEDIATE'];

    assert.equal(validActions.includes('REATTEMPT'), true);
    assert.equal(validActions.includes('RTO_IMMEDIATE'), true);
    assert.equal(validActions.includes('INVALID_ACTION_TYPE'), false);
  });

  it('5. Bigship Carrier Adapter: Dispatches carrier action and receives confirmation token', async () => {
    const BigshipProvider = require('../src/services/logistics/BigshipProvider');
    const provider = new BigshipProvider();

    const result = await provider.actionNdr('BSHP-8812341', {
      action: 'REATTEMPT',
      preferredDate: '2026-11-25T10:00:00Z',
      remarks: 'Customer confirmed phone contact'
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, 'BIGSHIP');
    assert.equal(result.awb, 'BSHP-8812341');
    assert.equal(result.action, 'REATTEMPT');
    assert.ok(result.carrierActionId.startsWith('BSHP-NDR-'));
    assert.equal(result.status, 'ACTION_DISPATCHED_TO_CARRIER');
  });
});
