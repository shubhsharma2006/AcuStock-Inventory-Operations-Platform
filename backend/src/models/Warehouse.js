const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  address: {
    street:  { type: String, trim: true },
    city:    { type: String, trim: true },
    state:   { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' }
  },
  contactPerson: {
    type: String,
    trim: true,
    maxlength: 100
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 25
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  capacity: {
    type: Number,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
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

warehouseSchema.index({ tenantId: 1, code: 1 }, { unique: true });
warehouseSchema.index({ tenantId: 1, isActive: 1, name: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
warehouseSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Warehouse', warehouseSchema);
