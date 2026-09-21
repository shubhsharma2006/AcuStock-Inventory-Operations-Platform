const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  receivedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  receivedSerials: [{
    type: String,
    trim: true,
    uppercase: true
  }]
}, { _id: true });

const stockTransferSchema = new mongoose.Schema({
  transferNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  fromWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  toWarehouse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  status: {
    type: String,
    enum: ['DRAFT', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'],
    default: 'DRAFT',
    index: true
  },
  items: {
    type: [transferItemSchema],
    validate: {
      validator: function (items) {
        return Array.isArray(items) && items.length > 0;
      },
      message: 'Transfer must contain at least one item'
    }
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  shippedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  shippedAt: {
    type: Date
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  receivedAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: {
    type: Date
  },
  cancelReason: {
    type: String,
    trim: true,
    maxlength: 300
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
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

stockTransferSchema.index({ tenantId: 1, transferNumber: 1 }, { unique: true });
stockTransferSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
stockTransferSchema.index({ tenantId: 1, fromWarehouse: 1 });
stockTransferSchema.index({ tenantId: 1, toWarehouse: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
stockTransferSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
