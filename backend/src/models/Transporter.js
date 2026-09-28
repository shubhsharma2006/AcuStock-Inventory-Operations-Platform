const mongoose = require('mongoose');

const transporterSchema = new mongoose.Schema({
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
    maxlength: 30
  },
  trackingUrlPattern: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
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
    lowercase: true,
    maxlength: 100
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 20
  },
  isActive: {
    type: Boolean,
    default: true
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

transporterSchema.index({ tenantId: 1, code: 1 }, { unique: true });
transporterSchema.index({ tenantId: 1, isActive: 1, name: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
transporterSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Transporter', transporterSchema);
