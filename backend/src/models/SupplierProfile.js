const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const supplierProfileSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  supplierCode: {
    type: String,
    uppercase: true,
    trim: true,
    maxlength: 30
  },
  paymentTerms: {
    type: String,
    enum: ['NET_15', 'NET_30', 'NET_45', 'NET_60', 'NET_90', 'COD', 'PREPAID', 'CUSTOM'],
    default: 'NET_30'
  },
  leadTimeDays: {
    type: Number,
    default: 7,
    min: 1
  },
  minimumOrderValue: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true,
    trim: true
  },
  performance: {
    totalPOs: { type: Number, default: 0 },
    completedPOs: { type: Number, default: 0 },
    onTimeDeliveries: { type: Number, default: 0 },
    lateDeliveries: { type: Number, default: 0 },
    onTimeRate: { type: Number, default: 100, min: 0, max: 100 }, // percentage
    avgDeliveryDays: { type: Number, default: 0 },
    totalUnitsReceived: { type: Number, default: 0 },
    rejectedUnits: { type: Number, default: 0 },
    qualityRate: { type: Number, default: 100, min: 0, max: 100 }, // percentage
    totalOrderedValue: { type: Number, default: 0 },
    totalActualValue: { type: Number, default: 0 },
    costVariancePercent: { type: Number, default: 0 },
    overallScore: { type: Number, default: 100, min: 0, max: 100 }, // composite score
    lastEvaluatedAt: { type: Date }
  },
  certifications: [{
    name: String,
    issuedBy: String,
    validUntil: Date
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

supplierProfileSchema.index({ tenantId: 1, companyId: 1 }, { unique: true });
supplierProfileSchema.index({ tenantId: 1, 'performance.overallScore': -1 });

supplierProfileSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('SupplierProfile', supplierProfileSchema);

