const mongoose = require('mongoose');

const stockLedgerSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  condition: {
    type: String,
    enum: ['New', 'Repair', 'Demo', 'new', 'refurbished', 'used', 'damaged'],
    default: 'New'
  },
  // Supplier/Buyer details
  partyDetails: {
    companyName:     { type: String, trim: true, maxlength: 150 },
    customerName:    { type: String, trim: true, maxlength: 100 },
    customerPhone:   { type: String, trim: true, maxlength: 20  },
    customerEmail:   { type: String, trim: true, maxlength: 150, lowercase: true },
    customerAddress: { type: String, trim: true, maxlength: 300 },
    city:            { type: String, trim: true, maxlength: 100 },
    state:           { type: String, trim: true, maxlength: 100 },
    pincode:         { type: String, trim: true, maxlength: 10  }
  },
  // Transaction details
  transactionDetails: {
    supplierType:         { type: String, trim: true, maxlength: 50  },
    paymentMethod:        { type: String, trim: true, maxlength: 50  },
    transactionId:        { type: String, trim: true, maxlength: 100 },
    warrantyPeriod:       { type: String, trim: true, maxlength: 50  },
    sellerWarrantyPeriod: { type: String, trim: true, maxlength: 50  },
    deliveredBy:          { type: String, trim: true, maxlength: 100 },
    receivedBy:           { type: String, trim: true, maxlength: 100 },
    transactionDate: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'],
    required: true
  },
  // Edit tracking fields
  lastEditedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastEditedAt: {
    type: Date
  },
  editHistory: [{
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    editedAt: {
      type: Date
    },
    changes: [{
      field: String,
      from: mongoose.Schema.Types.Mixed,
      to: mongoose.Schema.Types.Mixed
    }]
  }],
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true
});

stockLedgerSchema.index({ productId: 1, createdAt: -1 });
stockLedgerSchema.index({ productId: 1, type: 1, createdAt: -1 });
stockLedgerSchema.index({ createdBy: 1, createdAt: -1 });
stockLedgerSchema.index({ 'partyDetails.companyName': 1 });
stockLedgerSchema.index({ isDeleted: 1, productId: 1 });

module.exports = mongoose.model('StockLedger', stockLedgerSchema);
