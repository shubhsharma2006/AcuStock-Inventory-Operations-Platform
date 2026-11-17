/**
 * Account Model — Chart of Accounts (COA)
 * ─────────────────────────────────────────────────────────────
 * Represents master financial ledger accounts categorized across:
 * ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const accountSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
    trim: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  accountType: {
    type: String,
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
    required: true,
    index: true
  },
  subType: {
    type: String,
    trim: true,
    default: ''
  },
  normalBalance: {
    type: String,
    enum: ['DEBIT', 'CREDIT'],
    required: true
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  isSystemAccount: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
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

accountSchema.index({ tenantId: 1, accountCode: 1 }, { unique: true });
accountSchema.index({ tenantId: 1, accountType: 1 });

accountSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Account', accountSchema);

