const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Unit name is required'],
    trim: true,
    maxlength: [100, 'Unit name cannot exceed 100 characters']
  },
  shortName: {
    type: String,
    required: [true, 'Short name is required'],
    trim: true,
    maxlength: [20, 'Short name cannot exceed 20 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Multi-tenant compound index for uniqueness within organization
unitSchema.index({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
unitSchema.index({ tenantId: 1, isActive: 1 });
unitSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });
unitSchema.index({ isActive: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
unitSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Unit', unitSchema);
