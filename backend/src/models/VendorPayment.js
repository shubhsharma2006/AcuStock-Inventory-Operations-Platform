/**
 * VendorPayment Model — Outbound Payment Vouchers & Accounts Payable (AP)
 * ─────────────────────────────────────────────────────────────
 * Records disbursement of funds to suppliers against approved vendor bills.
 * Reconciles vendor bill balance, updates company payable ledger,
 * and tracks bank remittance coordinates (UTR, Cheque number).
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const vendorPaymentSchema = new mongoose.Schema({
  voucherNumber: {
    type: String,
    required: true,
    trim: true
  },
  vendorBillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorBill',
    required: true,
    index: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  paymentDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  paymentMode: {
    type: String,
    enum: ['NEFT_RTGS', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'WIRE', 'CARD', 'CASH'],
    default: 'NEFT_RTGS'
  },
  transactionReference: {
    type: String,
    trim: true,
    default: '' // UTR number, wire confirmation, or cheque #
  },
  bankName: {
    type: String,
    trim: true,
    default: ''
  },
  debitAccount: {
    type: String,
    trim: true,
    default: ''
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  paidBy: {
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

vendorPaymentSchema.index({ tenantId: 1, voucherNumber: 1 }, { unique: true });
vendorPaymentSchema.index({ tenantId: 1, supplierId: 1, paymentDate: -1 });

vendorPaymentSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('VendorPayment', vendorPaymentSchema);

