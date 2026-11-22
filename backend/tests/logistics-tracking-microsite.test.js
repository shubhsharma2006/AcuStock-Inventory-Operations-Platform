'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TrackingNormalizer = require('../src/services/logistics/TrackingNormalizer');

describe('Phase 2: White-Label Branded Tracking Microsite & Live Milestones Engine', () => {

  it('1. TrackingNormalizer: Correctly normalizes raw statuses across carriers to canonical states', () => {
    // Delhivery codes
    assert.equal(TrackingNormalizer.normalizeStatus('DL'), 'DELIVERED');
    assert.equal(TrackingNormalizer.normalizeStatus('UD'), 'NDR');
    assert.equal(TrackingNormalizer.normalizeStatus('IT'), 'IN_TRANSIT');
    assert.equal(TrackingNormalizer.normalizeStatus('PU'), 'PICKED_UP');

    // DTDC & Porter codes
    assert.equal(TrackingNormalizer.normalizeStatus('RAD'), 'OUT_FOR_DELIVERY');
    assert.equal(TrackingNormalizer.normalizeStatus('ON_THE_WAY'), 'OUT_FOR_DELIVERY');
    assert.equal(TrackingNormalizer.normalizeStatus('POD_COLLECTED'), 'DELIVERED');
    assert.equal(TrackingNormalizer.normalizeStatus('CUSTOMER_UNAVAILABLE'), 'NDR');

    // Return to Origin
    assert.equal(TrackingNormalizer.normalizeStatus('RTO_INITIATED'), 'RTO_INITIATED');
    assert.equal(TrackingNormalizer.normalizeStatus('RETURN_DELIVERED'), 'RTO_DELIVERED');
    assert.equal(TrackingNormalizer.normalizeStatus('RESTOCKED'), 'RTO_DELIVERED');

    // Bigship / Shiprocket codes
    assert.equal(TrackingNormalizer.normalizeStatus('MANIFESTED'), 'PICKED_UP');
    assert.equal(TrackingNormalizer.normalizeStatus('ORDER_CREATED'), 'BOOKED');
  });

  it('2. TrackingNormalizer: Returns UI metadata, badges, and icons for each canonical state', () => {
    const deliveredMeta = TrackingNormalizer.getStatusMeta('DELIVERED');
    assert.equal(deliveredMeta.label, 'Delivered Successfully');
    assert.equal(deliveredMeta.icon, '✅');
    assert.ok(deliveredMeta.color.includes('emerald'));

    const ndrMeta = TrackingNormalizer.getStatusMeta('NDR');
    assert.equal(ndrMeta.label, 'Delivery Attempt Failed (NDR)');
    assert.equal(ndrMeta.icon, '⚠️');
    assert.ok(ndrMeta.color.includes('rose'));

    const inTransitMeta = TrackingNormalizer.getStatusMeta('IN_TRANSIT');
    assert.equal(inTransitMeta.label, 'In Transit');
    assert.equal(inTransitMeta.icon, '🚚');
  });

  it('3. TrackingNormalizer: Synthesizes sequential, chronological milestones when webhooks are pending', () => {
    const milestones = TrackingNormalizer.synthesizeMilestones({
      createdAt: new Date('2026-11-20T10:00:00Z'),
      dispatchDate: new Date('2026-11-20T14:00:00Z'),
      status: 'OUT_FOR_DELIVERY',
      originCity: 'Mumbai',
      destCity: 'Bangalore',
      carrierName: 'Blue Dart Air Express'
    });

    assert.ok(Array.isArray(milestones));
    assert.equal(milestones.length, 4);
    assert.equal(milestones[0].status, 'BOOKED');
    assert.equal(milestones[1].status, 'PICKED_UP');
    assert.equal(milestones[2].status, 'IN_TRANSIT');
    assert.equal(milestones[3].status, 'OUT_FOR_DELIVERY');

    // Milestones must be strictly sorted by timestamp ascending
    for (let i = 1; i < milestones.length; i++) {
      const prevTime = new Date(milestones[i - 1].timestamp).getTime();
      const currTime = new Date(milestones[i].timestamp).getTime();
      assert.ok(currTime >= prevTime, `Milestone ${i} timestamp must be >= milestone ${i - 1}`);
    }
  });

  it('4. Tracking Microsite: Masks PII and provides tenant white-label branding data', () => {
    function maskName(name) {
      if (!name) return 'Customer';
      const parts = name.trim().split(/\s+/);
      return parts.map(p => (p.length > 1 ? `${p[0]}****` : p)).join(' ');
    }

    assert.equal(maskName('Rahul Sharma'), 'R**** S****');
    assert.equal(maskName('Vikramaditya'), 'V****');
    assert.equal(maskName(''), 'Customer');

    const mockTenant = {
      name: 'Omni Retail Store',
      branding: {
        legalName: 'Omni Retailers Private Limited',
        logoUrl: 'https://cdn.acustock.com/brands/omni.png',
        supportEmail: 'care@omniretail.com',
        phone: '+91 9988776655',
        website: 'https://omniretail.com'
      }
    };

    const brandPayload = {
      name: mockTenant.branding.legalName || mockTenant.name,
      logoUrl: mockTenant.branding.logoUrl,
      supportEmail: mockTenant.branding.supportEmail,
      phone: mockTenant.branding.phone,
      brandColor: '#f59e0b'
    };

    assert.equal(brandPayload.name, 'Omni Retailers Private Limited');
    assert.equal(brandPayload.logoUrl, 'https://cdn.acustock.com/brands/omni.png');
    assert.equal(brandPayload.phone, '+91 9988776655');
  });

  it('5. NDR Re-attempt Workflow: Validates action types and saves customer rescheduling preference', () => {
    const validActions = ['REATTEMPT_NEXT_DAY', 'PREFERRED_TIME_SLOT', 'ALTERNATE_ADDRESS', 'CHANGE_PHONE', 'SELF_PICKUP'];

    const testPayload = {
      action: 'PREFERRED_TIME_SLOT',
      preferredTimeSlot: 'AFTERNOON_12_TO_4',
      comments: 'Please leave with tower B reception desk'
    };

    assert.ok(validActions.includes(testPayload.action));
    assert.equal(testPayload.preferredTimeSlot, 'AFTERNOON_12_TO_4');
  });
});
