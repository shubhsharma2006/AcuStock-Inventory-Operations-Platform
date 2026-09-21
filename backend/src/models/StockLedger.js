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
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    index: true
  },
  transferId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockTransfer',
    index: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT'],
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

stockLedgerSchema.index({ tenantId: 1, productId: 1, type: 1, createdAt: -1 });
stockLedgerSchema.index({ tenantId: 1, createdAt: -1 });
stockLedgerSchema.index({ productId: 1, createdAt: -1 });
stockLedgerSchema.index({ productId: 1, type: 1, createdAt: -1 });
stockLedgerSchema.index({ createdBy: 1, createdAt: -1 });
stockLedgerSchema.index({ 'partyDetails.companyName': 1 });
stockLedgerSchema.index({ isDeleted: 1, productId: 1 });

/**
 * Immutability Guard — Schema-Level Mutation Protection
 * ──────────────────────────────────────────────────────
 * Blocks any attempt to directly mutate StockLedger fields via Mongoose
 * update operations. Only soft-delete lifecycle fields are permitted.
 *
 * Rationale: The AI reasoning layer relies on ledger data as ground truth.
 * Silent mutations would corrupt forecasting, RCA, and balance calculations.
 *
 * Corrections must go through POST /api/stock/ledger/:id/reverse which
 * creates an explicit, auditable offsetting entry.
 */
const LEDGER_IMMUTABLE_FIELDS_ALLOWED = new Set(['isDeleted', 'deletedBy', 'deletedAt']);

const assertLedgerImmutability = function () {
  const update = this.getUpdate();
  if (!update) return;

  // Collect all top-level field keys being set (handles both $set and direct operators)
  const setPayload = update.$set || update;
  const candidateFields = Object.keys(setPayload).filter(k => !k.startsWith('$'));

  const disallowed = candidateFields.filter(k => !LEDGER_IMMUTABLE_FIELDS_ALLOWED.has(k));
  if (disallowed.length > 0) {
    throw new Error(
      `[LedgerImmutability] Cannot mutate StockLedger fields: [${disallowed.join(', ')}]. ` +
      'Use POST /api/stock/ledger/:id/reverse to create a correction entry.'
    );
  }
};

stockLedgerSchema.pre('updateOne', assertLedgerImmutability);
stockLedgerSchema.pre('updateMany', assertLedgerImmutability);
stockLedgerSchema.pre('findOneAndUpdate', assertLedgerImmutability);
stockLedgerSchema.pre('findByIdAndUpdate', assertLedgerImmutability);

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
stockLedgerSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('StockLedger', stockLedgerSchema);
