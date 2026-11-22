'use strict';

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const codRemittanceItemSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
  awb: { type: String, required: true, trim: true, uppercase: true },
  reference: { type: String, trim: true, uppercase: true },
  customerName: { type: String, trim: true },
  deliveredAt: { type: Date },
  declaredCodAmount: { type: Number, required: true, min: 0 },
  collectedCodAmount: { type: Number, required: true, min: 0 },
  freightDeductions: { type: Number, default: 0, min: 0 },
  codHandlingFee: { type: Number, default: 0, min: 0 },
  earlyCodFee: { type: Number, default: 0, min: 0 },
  netRemitted: { type: Number, required: true },
  discrepancyAmount: { type: Number, default: 0 },
  discrepancyReason: { type: String, trim: true }
}, { _id: false });

const codRemittanceSchema = new mongoose.Schema({
  remittanceNumber: {
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
  carrierName: {
    type: String,
    required: true,
    trim: true
  },
  bankDetails: {
    utrNumber: { type: String, required: true, trim: true, uppercase: true },
    bankName: { type: String, trim: true, default: 'HDFC Bank' },
    accountNumber: { type: String, trim: true },
    transferDate: { type: Date, default: Date.now }
  },
  cycle: {
    type: String,
    enum: ['STANDARD_T7', 'EARLY_T1', 'EARLY_T2'],
    default: 'STANDARD_T7'
  },
  orders: [codRemittanceItemSchema],
  financialSummary: {
    totalOrders: { type: Number, required: true, min: 1 },
    grossCodCollected: { type: Number, required: true, min: 0 },
    totalFreightDeducted: { type: Number, default: 0, min: 0 },
    totalEarlyCodFees: { type: Number, default: 0, min: 0 },
    netRemittedAmount: { type: Number, required: true, min: 0 },
    discrepancyCount: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['PROCESSING', 'REMITTED', 'RECONCILED', 'DISCREPANCY_FLAGGED'],
    default: 'REMITTED',
    index: true
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

codRemittanceSchema.index({ tenantId: 1, remittanceNumber: 1 }, { unique: true });
codRemittanceSchema.index({ tenantId: 1, 'bankDetails.utrNumber': 1 });
codRemittanceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

codRemittanceSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('CodRemittance', codRemittanceSchema);
