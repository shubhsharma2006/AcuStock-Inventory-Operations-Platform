const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const apiKeySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  keyPrefix: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  keyHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['ADMIN', 'MANAGER', 'USER'],
    default: 'MANAGER'
  },
  scopes: [{
    type: String,
    enum: [
      'read:stock', 'write:stock',
      'read:items', 'write:items',
      'read:orders', 'write:orders',
      'read:shipments', 'write:shipments',
      'read:reservations', 'write:reservations'
    ]
  }],
  expiresAt: {
    type: Date,
    default: null
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  lastUsedIp: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

apiKeySchema.index({ tenantId: 1, isActive: 1 });
apiKeySchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('ApiKey', apiKeySchema);
