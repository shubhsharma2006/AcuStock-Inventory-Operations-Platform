/**
 * JournalEntry Model — Double-Entry General Ledger
 * ─────────────────────────────────────────────────────────────
 * Represents atomic double-entry bookkeeping journal entries.
 * Enforces strict mathematical balance invariant: Total Debit === Total Credit.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const journalLineSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
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
  debit: {
    type: Number,
    min: 0,
    default: 0
  },
  credit: {
    type: Number,
    min: 0,
    default: 0
  },
  description: {
    type: String,
    trim: true,
    default: ''
  }
});

const journalEntrySchema = new mongoose.Schema({
  entryNumber: {
    type: String,
    required: true,
    trim: true
  },
  entryDate: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  sourceDocument: {
    documentType: {
      type: String,
      enum: [
        'INVOICE',
        'PAYMENT_RECEIPT',
        'VENDOR_BILL',
        'VENDOR_PAYMENT',
        'GOODS_RECEIPT',
        'SALES_DISPATCH',
        'INVENTORY_ADJUSTMENT',
        'CREDIT_NOTE',
        'MANUAL'
      ],
      default: 'MANUAL',
      index: true
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: ''
    }
  },
  memo: {
    type: String,
    trim: true,
    default: ''
  },
  lines: {
    type: [journalLineSchema],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length >= 2;
      },
      message: 'A journal entry must contain at least 2 lines (at least one debit and one credit).'
    }
  },
  totalDebit: {
    type: Number,
    default: 0
  },
  totalCredit: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['POSTED', 'DRAFT', 'VOID'],
    default: 'POSTED',
    index: true
  },
  postedBy: {
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

// Pre-save validation: Invariant Check (Debits must equal Credits)
journalEntrySchema.pre('validate', function() {
  if (this.lines && this.lines.length > 0) {
    const dr = this.lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
    const cr = this.lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

    this.totalDebit = Math.round(dr * 100) / 100;
    this.totalCredit = Math.round(cr * 100) / 100;

    if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) {
      throw new Error(`Out of balance journal entry: Debits (₹${this.totalDebit}) do not equal Credits (₹${this.totalCredit})`);
    }
  }
});

journalEntrySchema.index({ tenantId: 1, entryNumber: 1 }, { unique: true });
journalEntrySchema.index({ tenantId: 1, entryDate: -1 });

journalEntrySchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('JournalEntry', journalEntrySchema);

