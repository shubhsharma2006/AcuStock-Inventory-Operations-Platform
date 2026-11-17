/**
 * VendorBill Model — Accounts Payable (AP) & 3-Way Match Verification
 * ─────────────────────────────────────────────────────────────
 * Represents incoming commercial bills from suppliers.
 * Reconciles Purchase Order (PO) vs Goods Receipt (GRN) vs Billed items,
 * flags price/quantity variances, and manages outbound vendor debt.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const vendorBillItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    trim: true,
    default: ''
  },
  hsnCode: {
    type: String,
    trim: true,
    default: '8471'
  },
  quantityBilled: {
    type: Number,
    required: true,
    min: 1
  },
  unitPriceBilled: {
    type: Number,
    required: true,
    min: 0
  },
  taxableAmount: {
    type: Number,
    required: true,
    min: 0
  },
  gstRate: {
    type: Number,
    default: 18,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  }
});

const vendorBillSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    trim: true
  },
  vendorInvoiceNumber: {
    type: String,
    required: true,
    trim: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    index: true
  },
  billDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  dueDate: {
    type: Date,
    required: true,
    index: true
  },
  paymentTerms: {
    type: String,
    default: 'NET_30'
  },
  items: [vendorBillItemSchema],
  financialSummary: {
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, required: true, default: 0 },
    isInterState: { type: Boolean, default: false }
  },
  matchingEngine: {
    status: {
      type: String,
      enum: ['PERFECT_MATCH', 'QUANTITY_VARIANCE', 'PRICE_VARIANCE', 'OVER_BILLED', 'OVERRIDDEN'],
      default: 'PERFECT_MATCH',
      index: true
    },
    quantityVarianceUnits: { type: Number, default: 0 },
    priceVarianceAmount: { type: Number, default: 0 },
    approvedForPayment: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvalNotes: { type: String, trim: true, default: '' },
    inspectedAt: { type: Date }
  },
  payments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorPayment'
  }],
  status: {
    type: String,
    enum: ['UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'CANCELLED'],
    default: 'UNDER_REVIEW',
    index: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
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

vendorBillSchema.index({ tenantId: 1, billNumber: 1 }, { unique: true });
vendorBillSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
vendorBillSchema.index({ tenantId: 1, supplierId: 1, billDate: -1 });

vendorBillSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('VendorBill', vendorBillSchema);

