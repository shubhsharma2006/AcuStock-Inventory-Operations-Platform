'use strict';

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const weightDiscrepancySchema = new mongoose.Schema({
  discrepancyId: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  shipmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    required: true,
    index: true
  },
  reference: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  awb: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  carrierName: {
    type: String,
    required: true,
    trim: true
  },
  declared: {
    weightKg: { type: Number, required: true, min: 0 },
    lengthCm: { type: Number, default: 10 },
    widthCm: { type: Number, default: 10 },
    heightCm: { type: Number, default: 10 },
    volumetricWeightKg: { type: Number, default: 0 }
  },
  carrierBilled: {
    weightKg: { type: Number, required: true, min: 0 },
    lengthCm: { type: Number, default: 10 },
    widthCm: { type: Number, default: 10 },
    heightCm: { type: Number, default: 10 },
    volumetricWeightKg: { type: Number, default: 0 },
    scannedAtHub: { type: String, trim: true, default: 'Automated Hub DWS' }
  },
  discrepancy: {
    excessWeightKg: { type: Number, required: true },
    excessAmount: { type: Number, required: true, min: 0 },
    notifiedAt: { type: Date, default: Date.now },
    autoDebitCutoffAt: { type: Date, required: true }
  },
  status: {
    type: String,
    enum: [
      'NEW',
      'DISPUTE_FILED',
      'ACCEPTED_BY_MERCHANT',
      'RESOLVED_IN_FAVOR_OF_MERCHANT',
      'REJECTED_BY_CARRIER',
      'AUTO_DEBITED'
    ],
    default: 'NEW',
    index: true
  },
  disputeEvidence: {
    scalePhotoUrl: { type: String, trim: true },
    dimensionsPhotoUrl: { type: String, trim: true },
    productPhotoUrl: { type: String, trim: true },
    merchantRemarks: { type: String, trim: true, maxlength: 1000 },
    filedAt: { type: Date },
    carrierDisputeId: { type: String, trim: true }
  },
  resolution: {
    resolvedAt: { type: Date },
    refundedAmount: { type: Number, default: 0 },
    carrierComments: { type: String, trim: true }
  }
}, {
  timestamps: true
});

weightDiscrepancySchema.index({ tenantId: 1, discrepancyId: 1 }, { unique: true });
weightDiscrepancySchema.index({ tenantId: 1, awb: 1 });
weightDiscrepancySchema.index({ tenantId: 1, status: 1, 'discrepancy.autoDebitCutoffAt': 1 });

weightDiscrepancySchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WeightDiscrepancy', weightDiscrepancySchema);
