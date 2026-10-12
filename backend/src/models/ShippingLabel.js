const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const addressSubSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  company: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  pincode: { type: String, trim: true },
  phone: { type: String, trim: true }
}, { _id: false });

const shippingLabelSchema = new mongoose.Schema({
  labelNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Package',
    required: true,
    index: true
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    index: true
  },
  carrier: {
    type: String,
    required: true,
    trim: true
  },
  trackingNumber: {
    type: String,
    required: true,
    trim: true
  },
  labelFormat: {
    type: String,
    enum: ['THERMAL_4X6', 'A4_PACKING_SLIP', 'BOTH'],
    default: 'THERMAL_4X6'
  },
  pdfStorageKey: {
    type: String,
    required: true
  },
  packingSlipStorageKey: {
    type: String
  },
  status: {
    type: String,
    enum: ['GENERATED', 'VOIDED'],
    default: 'GENERATED',
    index: true
  },
  shipFrom: addressSubSchema,
  shipTo: addressSubSchema,
  metadata: {
    weight: Number,
    totalUnits: Number,
    dimensions: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

shippingLabelSchema.index({ tenantId: 1, labelNumber: 1 }, { unique: true });
shippingLabelSchema.index({ tenantId: 1, packageId: 1 });
shippingLabelSchema.index({ tenantId: 1, trackingNumber: 1 });

shippingLabelSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('ShippingLabel', shippingLabelSchema);
