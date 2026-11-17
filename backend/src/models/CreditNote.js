/**
 * CreditNote Model — Statutory Indian GST Credit Note (Section 34 CGST Act)
 * ─────────────────────────────────────────────────────────────
 * Represents formal credit adjustments against issued commercial tax invoices.
 * Legally reverses output tax liability (CGST+SGST or IGST),
 * adjusts customer AR balance, and cross-references original invoice details.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const creditNoteItemSchema = new mongoose.Schema({
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
  cgstAmount: {
    type: Number,
    default: 0
  },
  sgstAmount: {
    type: Number,
    default: 0
  },
  igstAmount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  }
});

const creditNoteSchema = new mongoose.Schema({
  creditNoteNumber: {
    type: String,
    required: true,
    trim: true
  },
  rmaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RMA',
    index: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  originalInvoiceNumber: {
    type: String,
    required: true,
    trim: true
  },
  originalInvoiceDate: {
    type: Date
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  creditNoteDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  reason: {
    type: String,
    trim: true,
    default: '01-Sales Return' // Standard GST Reason code
  },
  billingAddress: {
    name: { type: String, required: true },
    gstin: { type: String, trim: true, default: '' },
    state: { type: String, default: 'Maharashtra' },
    stateCode: { type: String, default: '27' },
    city: { type: String, default: '' },
    pincode: { type: String, default: '' }
  },
  items: [creditNoteItemSchema],
  financialSummary: {
    taxableAmount: { type: Number, required: true, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },
    isInterState: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['ISSUED', 'ALLOCATED', 'REFUNDED', 'VOID'],
    default: 'ISSUED',
    index: true
  },
  allocatedToInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  issuedBy: {
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

creditNoteSchema.index({ tenantId: 1, creditNoteNumber: 1 }, { unique: true });
creditNoteSchema.index({ tenantId: 1, companyId: 1, creditNoteDate: -1 });

creditNoteSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('CreditNote', creditNoteSchema);

