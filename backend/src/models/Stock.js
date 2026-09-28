const mongoose = require('mongoose');

const stockEntrySchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  batchNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  expiryDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, { _id: false });

const stockSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['SUPPLIER', 'BUYER'],
    uppercase: true
  },
  reference: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  entries: [stockEntrySchema],
  totalQuantity: {
    type: Number,
    required: true,
    min: 1
  },
  totalValue: {
    type: Number,
    required: true,
    min: 0
  },
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
    default: 'PENDING'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
stockSchema.index({ type: 1, status: 1 });
stockSchema.index({ company: 1 });
stockSchema.index({ manager: 1 });
stockSchema.index({ transactionDate: -1 });
stockSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
// Note: reference index is created by unique: true

// Pre-save middleware to calculate totals
stockSchema.pre('save', function(next) {
  if (this.entries && this.entries.length > 0) {
    this.totalQuantity = this.entries.reduce((sum, entry) => sum + entry.quantity, 0);
    this.totalValue = this.entries.reduce((sum, entry) => sum + entry.totalPrice, 0);
  }
  next();
});

// Virtual for formatted transaction date
stockSchema.virtual('formattedDate').get(function() {
  return this.transactionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Method to check if stock entry has serial numbers
stockSchema.methods.hasSerialNumbers = function() {
  return this.entries.some(entry => entry.serialNumbers && entry.serialNumbers.length > 0);
};

// Method to get all serial numbers
stockSchema.methods.getAllSerialNumbers = function() {
  return this.entries.flatMap(entry => entry.serialNumbers || []);
};

// Static method to find stock by reference
stockSchema.statics.findByReference = function(reference, tenantId) {
  const query = { reference: reference.toUpperCase() };
  if (tenantId) query.tenantId = tenantId;
  return this.findOne(query);
};

// Compound index to guarantee uniqueness of reference within each tenant
stockSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
stockSchema.index({ tenantId: 1, type: 1, transactionDate: -1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
stockSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Stock', stockSchema);
