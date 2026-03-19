const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────────
// Helper: parse a human-readable warranty period into months
// e.g. "12 months" → 12, "2 years" → 24, "90 days" → 3
// ──────────────────────────────────────────────────────────────
function parseMonths(period) {
  if (!period || typeof period !== 'string') return 0;
  const lower = period.trim().toLowerCase();
  const num = parseFloat(lower);
  if (isNaN(num) || num <= 0) return 0;
  if (lower.includes('year'))  return Math.round(num * 12);
  if (lower.includes('month')) return Math.round(num);
  if (lower.includes('day'))   return Math.round(num / 30);
  return 0;
}

function computeStatus(expiryDate, hasPeriod) {
  if (!hasPeriod) return 'none';
  if (!expiryDate) return 'none';
  const now = new Date();
  if (expiryDate < now) return 'expired';
  const daysLeft = (expiryDate - now) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 30) return 'expiring-soon';
  return 'active';
}

// ── Claim sub-document ─────────────────────────────────────────
const claimSchema = new mongoose.Schema({
  claimType: { type: String, enum: ['purchase', 'seller'], required: true },
  raisedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: { type: String, maxlength: 1000 },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'rejected'],
    default: 'open'
  },
  resolvedAt: Date,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolution: { type: String, maxlength: 1000 }
}, { timestamps: true });

// ── Main schema ────────────────────────────────────────────────
const warrantySchema = new mongoose.Schema({
  stockLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLedger', index: true },
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  // One doc per serial (null for non-serialised batches)
  serialNumber:  { type: String, trim: true, uppercase: true, index: true, default: null },

  // ── Purchase warranty (supplier → us) ─────────────────────
  purchaseWarranty: {
    period:       { type: String, default: '' },
    months:       { type: Number, default: 0 },
    startDate:    { type: Date },
    expiryDate:   { type: Date, index: true },
    supplierName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'expiring-soon', 'expired', 'none'],
      default: 'none'
    }
  },

  // ── Seller warranty (us → customer) ───────────────────────
  sellerWarranty: {
    period:      { type: String, default: '' },
    months:      { type: Number, default: 0 },
    startDate:   { type: Date },
    expiryDate:  { type: Date, index: true },
    buyerName:   { type: String, default: '' },
    buyerPhone:  { type: String, default: '', index: true },
    buyerEmail:  { type: String, default: '' },
    companyName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'expiring-soon', 'expired', 'none', 'not-sold'],
      default: 'not-sold'
    }
  },

  claims:    [claimSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:     { type: String, maxlength: 1000 },
  isActive:  { type: Boolean, default: true }

}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// ── Compound indexes ───────────────────────────────────────────
// Unique on (productId + serialNumber) so a returned-and-restocked serial
// can never produce a second Warranty document. The stock.service upserts
// against this key; the DB enforces it as a hard constraint.
// sparse: true allows multiple docs where serialNumber is null (non-serial products).
warrantySchema.index({ productId: 1, serialNumber: 1 }, { unique: true, sparse: true });
warrantySchema.index({ 'purchaseWarranty.expiryDate': 1, 'purchaseWarranty.status': 1 });
warrantySchema.index({ 'sellerWarranty.expiryDate': 1, 'sellerWarranty.status': 1 });

// ── Pre-save: auto-refresh statuses ───────────────────────────
warrantySchema.pre('save', function (next) {
  this.purchaseWarranty.status = computeStatus(
    this.purchaseWarranty.expiryDate,
    !!this.purchaseWarranty.period
  );
  if (this.sellerWarranty.status !== 'not-sold') {
    this.sellerWarranty.status = computeStatus(
      this.sellerWarranty.expiryDate,
      !!this.sellerWarranty.period
    );
  }
  next();
});

// ── Virtuals: days remaining ───────────────────────────────────
warrantySchema.virtual('purchaseDaysLeft').get(function () {
  if (!this.purchaseWarranty.expiryDate) return null;
  return Math.ceil((this.purchaseWarranty.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
});
warrantySchema.virtual('sellerDaysLeft').get(function () {
  if (!this.sellerWarranty.expiryDate) return null;
  return Math.ceil((this.sellerWarranty.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
});

// ── Static helpers ─────────────────────────────────────────────
warrantySchema.statics.parseMonths = parseMonths;

warrantySchema.statics.buildPurchaseWarranty = function (period, startDate, supplierName) {
  const months = parseMonths(period);
  if (!months) return { period: period || '', months: 0, status: 'none' };
  const start  = startDate || new Date();
  const expiry = new Date(start);
  expiry.setMonth(expiry.getMonth() + months);
  return { period, months, startDate: start, expiryDate: expiry, supplierName: supplierName || '', status: computeStatus(expiry, true) };
};

warrantySchema.statics.buildSellerWarranty = function (period, startDate, buyerInfo = {}) {
  const months = parseMonths(period);
  if (!months) return { period: period || '', months: 0, status: 'none' };
  const start  = startDate || new Date();
  const expiry = new Date(start);
  expiry.setMonth(expiry.getMonth() + months);
  return {
    period, months, startDate: start, expiryDate: expiry,
    buyerName:   buyerInfo.buyerName   || buyerInfo.customerName  || '',
    buyerPhone:  buyerInfo.buyerPhone  || buyerInfo.customerPhone || '',
    buyerEmail:  buyerInfo.buyerEmail  || buyerInfo.customerEmail || '',
    companyName: buyerInfo.companyName || '',
    status: computeStatus(expiry, true)
  };
};

module.exports = mongoose.model('Warranty', warrantySchema);
