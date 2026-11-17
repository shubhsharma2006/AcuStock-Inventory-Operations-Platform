/**
 * PaymentReceipt Model — Customer Payment Collection
 * ─────────────────────────────────────────────────────────────
 * Tracks inbound customer collections, partial payments, and
 * links payments to invoices and customer 360 credit ledger.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const paymentReceiptSchema = new mongoose.Schema({
  receiptNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMode: {
    type: String,
    enum: ['UPI', 'NEFT_RTGS', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'CREDIT_CARD'],
    default: 'BANK_TRANSFER'
  },
  transactionReference: {
    type: String,
    trim: true,
    default: ''
  },
  bankName: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  receivedBy: {
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

paymentReceiptSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });
paymentReceiptSchema.index({ tenantId: 1, invoiceId: 1 });
paymentReceiptSchema.index({ tenantId: 1, companyId: 1, paymentDate: -1 });

paymentReceiptSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('PaymentReceipt', paymentReceiptSchema);

