'use strict';

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const crossBorderItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  hsCode: { type: String, required: true, trim: true }, // 6-8 digit ITC-HS
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD', uppercase: true, trim: true },
  totalValue: { type: Number, required: true, min: 0 },
  countryOfOrigin: { type: String, default: 'IN', uppercase: true }
}, { _id: false });

const crossBorderPackageSchema = new mongoose.Schema({
  packageNumber: { type: Number, required: true },
  weightKg: { type: Number, required: true, min: 0.1 },
  dimensionsCm: {
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true }
  },
  volumetricWeightKg: { type: Number, required: true }
}, { _id: false });

const crossBorderShipmentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  shipmentReference: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  awb: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  carrier: {
    type: String,
    enum: ['DHL_EXPRESS', 'FEDEX_PRIORITY', 'ARAMEX_INTERNATIONAL', 'UPS_WORLDWIDE'],
    required: true
  },
  incoterm: {
    type: String,
    enum: ['DAP', 'DDP'], // DAP: Buyer pays duty, DDP: Seller pays duty
    default: 'DAP'
  },
  exportType: {
    type: String,
    enum: ['COMMERCIAL', 'SAMPLE', 'GIFT', 'REPAIR_RETURN'],
    default: 'COMMERCIAL'
  },
  status: {
    type: String,
    enum: ['DRAFT', 'CUSTOMS_CLEARED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CUSTOMS_HOLD', 'CANCELLED'],
    default: 'CUSTOMS_CLEARED'
  },
  exporterDetails: {
    companyName: { type: String, required: true },
    iec: { type: String, required: true }, // 10-digit Import Export Code
    adCode: { type: String, required: true }, // 14-digit Bank Authorized Dealer Code
    gstin: { type: String, required: true },
    pan: { type: String, required: true },
    lutNumber: { type: String, default: 'AD270425000912K' },
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: 'IN' }
    }
  },
  consigneeDetails: {
    fullName: { type: String, required: true },
    companyName: { type: String },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    taxId: { type: String }, // e.g. VAT/EORI/EIN
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      stateProvince: { type: String },
      postalCode: { type: String, required: true },
      countryCode: { type: String, required: true, uppercase: true } // US, GB, AE, etc.
    }
  },
  packages: [crossBorderPackageSchema],
  items: [crossBorderItemSchema],
  customsDeclaration: {
    csbType: { type: String, enum: ['CSB_IV', 'CSB_V'], default: 'CSB_V' }, // Courier Shipping Bill V (Commercial)
    csbNumber: { type: String, required: true },
    portOfExport: { type: String, default: 'INDEL4' }, // Delhi IGI Airport / INBOM4 Mumbai
    estimatedDutyTax: { type: Number, default: 0 },
    dutyCurrency: { type: String, default: 'USD' },
    deMinimisExceeded: { type: Boolean, default: false },
    signedDeclaration: { type: Boolean, default: true }
  },
  financials: {
    freightCharge: { type: Number, required: true },
    insuranceCharge: { type: Number, default: 0 },
    estimatedDuties: { type: Number, default: 0 },
    totalCharges: { type: Number, required: true },
    billingCurrency: { type: String, default: 'INR' }
  },
  dates: {
    bookingDate: { type: Date, default: Date.now },
    expectedDeliveryDate: { type: Date },
    clearedAt: { type: Date },
    deliveredAt: { type: Date }
  }
}, {
  timestamps: true
});

crossBorderShipmentSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('CrossBorderShipment', crossBorderShipmentSchema);
