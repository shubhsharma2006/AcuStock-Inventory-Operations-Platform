const mongoose = require('mongoose');

/**
 * Transporter Schema
 * Stores logistics/transporter company information
 */
const TransporterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Transporter name is required'],
      trim: true
    },
    contactPerson: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true
    },
    vehicleTypes: [{
      type: String,
      enum: ['Truck', 'Mini Truck', 'Tempo', 'Container', 'Trailer', 'Van', 'Other']
    }],
    serviceAreas: [{
      type: String,
      trim: true
    }],
    isActive: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      trim: true
    },
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Soft-delete fields (hard-delete replaced by soft-delete for audit trail)
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
TransporterSchema.index({ tenantId: 1, name: 1 });
TransporterSchema.index({ tenantId: 1, isActive: 1 });
TransporterSchema.index({ name: 'text', contactPerson: 'text', city: 'text' });
TransporterSchema.index({ createdBy: 1 });
TransporterSchema.index({ isActive: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
TransporterSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Transporter', TransporterSchema);
