const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true, default: 'India' }
  },
  industry: {
    type: String,
    required: true,
    enum: ['Manufacturing', 'Retail', 'Healthcare', 'Technology', 'Construction', 'Other']
  },
  website: {
    type: String,
    trim: true,
    match: [/^https?:\/\/.*/, 'Please enter a valid URL']
  },
  taxId: {
    type: String,
    trim: true
  },
  legalName: {
    type: String,
    trim: true
  },
  shortName: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['SUPPLIER', 'BUYER', 'MANUFACTURER', 'PARTNER', 'CUSTOMER'],
    default: 'SUPPLIER'
  },
  pan: {
    type: String,
    trim: true,
    uppercase: true
  },
  cin: {
    type: String,
    trim: true,
    uppercase: true
  },
  msme: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  paymentTerms: {
    type: String,
    default: 'Net 30'
  },
  creditLimit: {
    type: Number,
    default: 0,
    min: 0
  },
  creditDays: {
    type: Number,
    default: 30,
    min: 0
  },
  outstandingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  isCreditBlocked: {
    type: Boolean,
    default: false
  },
  creditBlockReason: {
    type: String,
    trim: true
  },
  creditOverrideUntil: {
    type: Date,
    default: null
  },
  currency: {
    type: String,
    default: 'INR'
  },
  notes: {
    type: String,
    trim: true
  },
  shippingAddress: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String, default: 'India' }
  },
  isSupplier: {
    type: Boolean,
    default: false,
    index: true
  },
  supplierProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierProfile',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
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

// Indexes for multi-tenant query performance
companySchema.index({ tenantId: 1, name: 1 });
companySchema.index({ tenantId: 1, email: 1 });
companySchema.index({ tenantId: 1, isActive: 1 });
companySchema.index({ name: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
companySchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Company', companySchema);
