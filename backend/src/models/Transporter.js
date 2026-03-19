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
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for search
TransporterSchema.index({ name: 'text', contactPerson: 'text', city: 'text' });
TransporterSchema.index({ createdBy: 1 });
TransporterSchema.index({ isActive: 1 });

module.exports = mongoose.model('Transporter', TransporterSchema);
