/**
 * TrackingEvent — Immutable carrier status event log.
 * Recorded by background poller, inbound webhooks, and manual actions.
 */
const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const schema = new mongoose.Schema({
  shipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  carrierType: {
    type: String,
    required: true,
    enum: ['PORTER', 'DELHIVERY', 'DTDC', 'BLUEDART', 'DMRC', 'IN_HOUSE', 'OTHER']
  },
  awb: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED'],
    required: true
  },
  location: {
    type: String,
    trim: true
  },
  // GPS Coordinates (provided by Porter hyperlocal tracking)
  geoLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  recordedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['POLL', 'WEBHOOK', 'MANUAL'],
    default: 'POLL'
  }
}, {
  timestamps: true
});

schema.index({ shipmentId: 1, recordedAt: -1 });
schema.index({ tenantId: 1, recordedAt: -1 });
schema.index({ awb: 1 });

schema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('TrackingEvent', schema);
