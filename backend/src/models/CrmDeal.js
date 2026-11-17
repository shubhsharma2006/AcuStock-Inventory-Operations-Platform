/**
 * CrmDeal Model — CRM Leads, Deals & Quotation Pipeline
 * ─────────────────────────────────────────────────────────────
 * Powers the Quote-to-Cash engine connecting customer opportunities
 * with live warehouse inventory fulfillment (ATP & Sales Orders).
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const crmLineItemSchema = new mongoose.Schema({
  productId: {
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
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxRatePercent: {
    type: Number,
    default: 18, // 18% GST default in India
    min: 0,
    max: 100
  },
  lineTotal: {
    type: Number,
    default: 0
  },
  atpAvailable: {
    type: Number,
    default: 0
  }
}, { _id: true });

const crmActivitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['STAGE_CHANGE', 'NOTE', 'QUOTE_SENT', 'STOCK_RESERVED', 'SO_CONVERTED', 'DEAL_CREATED'],
    default: 'NOTE'
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  user: {
    type: String,
    default: 'System'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const crmDealSchema = new mongoose.Schema({
  dealNumber: {
    type: String,
    required: true,
    index: true,
    trim: true,
    uppercase: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null,
    index: true
  },
  contact: {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    designation: { type: String, trim: true }
  },
  stage: {
    type: String,
    enum: ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'],
    default: 'LEAD',
    index: true
  },
  value: {
    type: Number,
    default: 0,
    min: 0
  },
  probability: {
    type: Number,
    default: 20,
    min: 0,
    max: 100
  },
  expectedCloseDate: {
    type: Date
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  items: [crmLineItemSchema],
  quoteNumber: {
    type: String,
    trim: true,
    index: true
  },
  quotationNumber: {
    type: String,
    trim: true
  },
  quotationSentAt: {
    type: Date
  },
  quoteValidityDays: {
    type: Number,
    default: 7,
    min: 1,
    max: 90
  },
  quoteExpiresAt: {
    type: Date,
    default: null
  },
  paymentTerms: {
    type: String,
    enum: ['ADVANCE', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'COD'],
    default: 'NET_30'
  },
  taxBreakdown: {
    taxableAmount: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    isInterState: { type: Boolean, default: false }
  },
  softReservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockReservation',
    default: null
  },
  softReservationExpiresAt: {
    type: Date,
    default: null
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    default: null,
    index: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  lostReason: {
    type: String,
    trim: true
  },
  activityLog: [crmActivitySchema],
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

crmDealSchema.index({ tenantId: 1, stage: 1 });
crmDealSchema.index({ tenantId: 1, dealNumber: 1 });
crmDealSchema.index({ tenantId: 1, companyId: 1 });
crmDealSchema.index({ tenantId: 1, createdAt: -1 });

crmDealSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('CrmDeal', crmDealSchema);

