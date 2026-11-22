'use strict';

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const walletTransactionSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['TOPUP', 'FREIGHT_DEBIT', 'DISCREPANCY_DEBIT', 'DISPUTE_REFUND', 'COD_EARLY_CREDIT'],
    required: true
  },
  amount: { type: Number, required: true },
  runningBalance: { type: Number, required: true },
  awb: { type: String, trim: true, uppercase: true },
  reference: { type: String, trim: true, uppercase: true },
  carrier: { type: String, trim: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  costCenter: { type: String, trim: true, default: 'General Operations' },
  description: { type: String, trim: true },
  paymentId: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const monthlyGstInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, trim: true },
  month: { type: Number, required: true }, // 1-12
  year: { type: Number, required: true },
  sacCode: { type: String, default: '996511' }, // Goods Transport Services
  totalShipments: { type: Number, default: 0 },
  taxableAmount: { type: Number, required: true, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  totalGst: { type: Number, required: true, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['GENERATED', 'PAID', 'SETTLED'], default: 'GENERATED' },
  generatedAt: { type: Date, default: Date.now }
}, { _id: false });

const logisticsWalletSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true
  },
  billingType: {
    type: String,
    enum: ['PREPAID', 'POSTPAID'],
    default: 'PREPAID'
  },
  balance: {
    type: Number,
    default: 0
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  creditUsed: {
    type: Number,
    default: 0
  },
  autoRecharge: {
    enabled: { type: Boolean, default: false },
    thresholdAmount: { type: Number, default: 2000 },
    topUpAmount: { type: Number, default: 5000 },
    paymentMethod: { type: String, default: 'UPI_AUTOPAY' }
  },
  transactions: [walletTransactionSchema],
  monthlyInvoices: [monthlyGstInvoiceSchema]
}, {
  timestamps: true
});

logisticsWalletSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('LogisticsWallet', logisticsWalletSchema);
