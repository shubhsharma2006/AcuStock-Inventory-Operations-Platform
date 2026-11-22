'use strict';

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const freightBookingSchema = new mongoose.Schema({
  bookingNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['PTL', 'FTL'],
    required: true,
    default: 'PTL'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  origin: {
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    companyName: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    contactPerson: { type: String, trim: true },
    contactPhone: { type: String, trim: true }
  },
  destination: {
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    companyName: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    contactPerson: { type: String, trim: true },
    contactPhone: { type: String, trim: true }
  },
  cargoDetails: {
    palletCount: { type: Number, default: 0, min: 0 },
    boxCount: { type: Number, default: 1, min: 1 },
    grossWeightKg: { type: Number, required: true, min: 1 },
    volumetricWeightKg: { type: Number, default: 0, min: 0 },
    cargoType: { type: String, enum: ['GENERAL', 'INDUSTRIAL_PARTS', 'ELECTRONICS', 'PERISHABLE', 'HAZARDOUS'], default: 'GENERAL' },
    declaredValue: { type: Number, required: true, min: 0 },
    isFragile: { type: Boolean, default: false }
  },
  vehicleDetails: {
    vehicleType: {
      type: String,
      enum: ['TATA_ACE_750KG', 'BOLERO_PICKUP_1500KG', 'EICHER_14FT_4000KG', 'TRUCK_19FT_7500KG', 'TRAILER_32FT_15000KG', 'PTL_SHARED_CARGO'],
      default: 'PTL_SHARED_CARGO'
    },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    driverName: { type: String, trim: true },
    driverPhone: { type: String, trim: true },
    maxPayloadKg: { type: Number }
  },
  pricing: {
    baseFreight: { type: Number, required: true, min: 0 },
    docketCharge: { type: Number, default: 0, min: 0 },
    loadingCharges: { type: Number, default: 0, min: 0 },
    fuelSurcharge: { type: Number, default: 0, min: 0 },
    gstAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 }
  },
  carrier: {
    transporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transporter' },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    lrNumber: { type: String, trim: true, uppercase: true }, // Lorry Receipt / GR No
    trackingAwb: { type: String, trim: true, uppercase: true }
  },
  ewayBill: {
    ewbNumber: { type: String, trim: true, uppercase: true },
    generatedAt: { type: Date },
    validUpto: { type: Date },
    distanceKm: { type: Number, min: 1 },
    qrCodeData: { type: String },
    hsnCode: { type: String, trim: true, default: '8471' },
    isOverDimensional: { type: Boolean, default: false },
    status: { type: String, enum: ['NOT_REQUIRED', 'PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED'], default: 'NOT_REQUIRED' }
  },
  status: {
    type: String,
    enum: ['BOOKED', 'ALLOCATED', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    default: 'BOOKED',
    index: true
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['BOOKED', 'ALLOCATED', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']
    },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    updatedBy: { type: String, trim: true }
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

freightBookingSchema.index({ tenantId: 1, bookingNumber: 1 }, { unique: true });
freightBookingSchema.index({ tenantId: 1, 'carrier.lrNumber': 1 });
freightBookingSchema.index({ tenantId: 1, 'ewayBill.ewbNumber': 1 });
freightBookingSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

freightBookingSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('FreightBooking', freightBookingSchema);
