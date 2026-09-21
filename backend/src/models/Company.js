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
