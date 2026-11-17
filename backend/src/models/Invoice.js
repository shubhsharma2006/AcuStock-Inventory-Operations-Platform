/**
 * Invoice Model — Commercial GST Tax Invoice & Accounts Receivable
 * ─────────────────────────────────────────────────────────────
 * Represents legally compliant B2B/B2C tax invoices with state-aware
 * Indian GST calculations, E-Way Bill details, and payment reconciliation.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const invoiceItemSchema = new mongoose.Schema({
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
  uom: {
    type: String,
    trim: true,
    default: 'PCS'
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
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxRatePercent: {
    type: Number,
    default: 18,
    min: 0,
    max: 28
  },
  taxableAmount: {
    type: Number,
    default: 0
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
  lineTotal: {
    type: Number,
    default: 0
  }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    default: null
  },
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CrmDeal',
    default: null
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  invoiceDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  billingAddress: {
    name: { type: String, required: true },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    pan: { type: String, trim: true, uppercase: true, default: '' },
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: 'Maharashtra' },
    stateCode: { type: String, default: '27' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' }
  },
  shippingAddress: {
    name: { type: String, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: 'Maharashtra' },
    stateCode: { type: String, default: '27' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' }
  },
  items: {
    type: [invoiceItemSchema],
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'Invoice must contain at least one line item'
    }
  },
  financialSummary: {
    taxableAmount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    isInterState: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
    default: 'ISSUED',
    index: true
  },
  paymentTerms: {
    type: String,
    enum: ['ADVANCE', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'COD'],
    default: 'NET_30'
  },
  eWayBill: {
    ewayBillNumber: { type: String, default: '' },
    generatedAt: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    transporterId: { type: String, default: '' },
    transporterName: { type: String, default: '' },
    vehicleNumber: { type: String, default: '' },
    distanceKm: { type: Number, default: 0 }
  },
  payments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentReceipt'
  }],
  notes: {
    type: String,
    trim: true,
    default: 'Thank you for your business!'
  },
  termsAndConditions: {
    type: String,
    trim: true,
    default: '1. Payment due as per agreed terms.\n2. Goods once sold will only be replaced per warranty policy.'
  },
  createdBy: {
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

invoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ tenantId: 1, companyId: 1, invoiceDate: -1 });

invoiceSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Invoice', invoiceSchema);

