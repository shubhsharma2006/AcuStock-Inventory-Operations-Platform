/**
 * fleet-tracking.test.js
 * Unit test suite for Live Fleet & Porter Dispatch Control Tower
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Shipment = require('../src/models/Shipment');
const TrackingEvent = require('../src/models/TrackingEvent');

describe('Live Fleet & Porter Control Tower — Schema & Logic Tests', () => {
  it('validates podDetails, currentLocation and geofenceEvents schema extensions on Shipment', () => {
    const shipment = new Shipment({
      reference: 'SHP-TEST-FLEET-01',
      tenantId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      quantity: 50,
      customerName: 'Delhi Robotics Lab',
      phone: '+91 9876543210',
      address: 'Plot 42, Okhla Phase 3',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110020',
      carrierType: 'PORTER',
      porterDetails: {
        tripId: 'CRN-PRT-882190',
        driverName: 'Ramesh Verma',
        driverPhone: '+91 9811223344',
        vehicleType: 'TATA_ACE',
        vehicleNumber: 'DL-01-EA-4921',
        estimatedFare: 420,
        pickupOtp: '1092',
        deliveryOtp: '4918'
      },
      currentLocation: {
        lat: 28.6139,
        lng: 77.2090,
        speed: 38,
        heading: 145,
        updatedAt: new Date()
      },
      geofenceEvents: [
        {
          eventType: 'CUSTOMER_GEOFENCE_ENTER',
          timestamp: new Date(),
          details: 'Entered 1km radius of delivery destination'
        }
      ]
    });

    assert.equal(shipment.carrierType, 'PORTER');
    assert.equal(shipment.porterDetails.tripId, 'CRN-PRT-882190');
    assert.equal(shipment.porterDetails.pickupOtp, '1092');
    assert.equal(shipment.porterDetails.deliveryOtp, '4918');
    assert.equal(shipment.currentLocation.speed, 38);
    assert.equal(shipment.currentLocation.heading, 145);
    assert.equal(shipment.geofenceEvents.length, 1);
    assert.equal(shipment.geofenceEvents[0].eventType, 'CUSTOMER_GEOFENCE_ENTER');
  });

  it('validates e-POD completion fields and digital signature storage', () => {
    const shipment = new Shipment({
      reference: 'SHP-TEST-POD-01',
      tenantId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      quantity: 10,
      customerName: 'AeroTech Systems',
      phone: '+91 9876543211',
      address: 'Sector 62',
      city: 'Noida',
      state: 'UP',
      pincode: '201301',
      carrierType: 'IN_HOUSE',
      status: 'OUT_FOR_DELIVERY',
      podDetails: {
        signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        recipientName: 'Vikas Sharma',
        recipientPhone: '+91 9876543211',
        deliveredAt: new Date(),
        verifiedOtp: '4918'
      }
    });

    assert.ok(shipment.podDetails.signature.startsWith('data:image/png;base64,'));
    assert.equal(shipment.podDetails.recipientName, 'Vikas Sharma');
    assert.equal(shipment.podDetails.verifiedOtp, '4918');
    assert.ok(shipment.podDetails.deliveredAt instanceof Date);
  });

  it('validates TrackingEvent geolocation breadcrumbs creation', () => {
    const event = new TrackingEvent({
      shipmentId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      carrierType: 'PORTER',
      awb: 'CRN-PRT-882190',
      status: 'IN_TRANSIT',
      location: '28.6139, 77.2090',
      geoLocation: {
        lat: 28.6139,
        lng: 77.2090
      },
      metadata: {
        speed: 42,
        heading: 120,
        eta: '12 mins',
        distanceRemainingKm: 5.4
      },
      source: 'MANUAL'
    });

    assert.equal(event.geoLocation.lat, 28.6139);
    assert.equal(event.geoLocation.lng, 77.2090);
    assert.equal(event.metadata.speed, 42);
    assert.equal(event.metadata.eta, '12 mins');
  });

  it('tests customer name privacy masking for public tracking', () => {
    const maskCustomer = (name) => (name ? `${name.charAt(0)}***` : 'Customer');
    assert.equal(maskCustomer('Shubh Sharma'), 'S***');
    assert.equal(maskCustomer('AeroTech Dynamics'), 'A***');
    assert.equal(maskCustomer(''), 'Customer');
    assert.equal(maskCustomer(null), 'Customer');
  });

  it('tests Porter fare calculation logic', () => {
    const PORTER_RATES = {
      '2_WHEELER': { baseFare: 45, perKmRate: 12 },
      '3_WHEELER': { baseFare: 160, perKmRate: 18 },
      'TATA_ACE': { baseFare: 220, perKmRate: 22 },
      '8FT_PICKUP': { baseFare: 320, perKmRate: 26 }
    };

    const calcFare = (vehicleType, distanceKm) => {
      const config = PORTER_RATES[vehicleType] || PORTER_RATES['TATA_ACE'];
      return Math.round(config.baseFare + distanceKm * config.perKmRate);
    };

    // 10km on 2-Wheeler: 45 + 10 * 12 = 165
    assert.equal(calcFare('2_WHEELER', 10), 165);
    // 14.2km on Tata Ace: 220 + 14.2 * 22 = 220 + 312.4 = 532.4 -> 532
    assert.equal(calcFare('TATA_ACE', 14.2), 532);
    // 25km on 8ft Pickup: 320 + 25 * 26 = 320 + 650 = 970
    assert.equal(calcFare('8FT_PICKUP', 25), 970);
  });
});
