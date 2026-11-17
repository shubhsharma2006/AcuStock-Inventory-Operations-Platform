/**
 * Journal Engine Service — Automated Double-Entry Bookkeeping
 * ─────────────────────────────────────────────────────────────
 * Enforces the universal fundamental accounting identity:
 *   Debits === Credits
 *
 * Automatically posts balanced journal entries for:
 * - Tax Invoicing & Customer Payments (AR)
 * - Vendor Bills & Supplier Payments (AP)
 * - Goods Receipts & Sales Dispatches (Inventory & COGS)
 * - Inventory Scrap / Shrinkage Adjustments
 * - Statutory GST Credit Notes
 */

const mongoose = require('mongoose');
const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const Counter = require('../models/Counter');
const logger = require('../utils/logger');

const DEFAULT_COA = [
  // ── ASSETS (1000s) ──────────────────────────────────────────────
  { accountCode: '1010', accountName: 'Cash on Hand', accountType: 'ASSET', subType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1020', accountName: 'Bank - Operating Account', accountType: 'ASSET', subType: 'BANK', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1200', accountName: 'Accounts Receivable (AR)', accountType: 'ASSET', subType: 'ACCOUNTS_RECEIVABLE', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1300', accountName: 'Inventory Asset', accountType: 'ASSET', subType: 'INVENTORY', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1400', accountName: 'Goods Received Not Invoiced (GRNI)', accountType: 'ASSET', subType: 'CURRENT_ASSET', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '1510', accountName: 'Input CGST Tax Credit', accountType: 'ASSET', subType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1520', accountName: 'Input SGST Tax Credit', accountType: 'ASSET', subType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '1530', accountName: 'Input IGST Tax Credit', accountType: 'ASSET', subType: 'CURRENT_ASSET', normalBalance: 'DEBIT', isSystemAccount: true },

  // ── LIABILITIES (2000s) ─────────────────────────────────────────
  { accountCode: '2000', accountName: 'Accounts Payable (AP)', accountType: 'LIABILITY', subType: 'ACCOUNTS_PAYABLE', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '2110', accountName: 'Output CGST Payable', accountType: 'LIABILITY', subType: 'TAX_PAYABLE', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '2120', accountName: 'Output SGST Payable', accountType: 'LIABILITY', subType: 'TAX_PAYABLE', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '2130', accountName: 'Output IGST Payable', accountType: 'LIABILITY', subType: 'TAX_PAYABLE', normalBalance: 'CREDIT', isSystemAccount: true },

  // ── EQUITY (3000s) ──────────────────────────────────────────────
  { accountCode: '3000', accountName: "Owner's Equity & Capital", accountType: 'EQUITY', subType: 'EQUITY', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '3100', accountName: 'Retained Earnings', accountType: 'EQUITY', subType: 'RETAINED_EARNINGS', normalBalance: 'CREDIT', isSystemAccount: true },

  // ── REVENUE (4000s) ─────────────────────────────────────────────
  { accountCode: '4000', accountName: 'Wholesale Sales Revenue', accountType: 'REVENUE', subType: 'OPERATING_REVENUE', normalBalance: 'CREDIT', isSystemAccount: true },
  { accountCode: '4100', accountName: 'Shipping & Freight Income', accountType: 'REVENUE', subType: 'OPERATING_REVENUE', normalBalance: 'CREDIT', isSystemAccount: true },

  // ── EXPENSES & COGS (5000s) ─────────────────────────────────────
  { accountCode: '5000', accountName: 'Cost of Goods Sold (COGS)', accountType: 'EXPENSE', subType: 'COST_OF_GOODS_SOLD', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '5100', accountName: 'Inbound Freight & Landed Cost', accountType: 'EXPENSE', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '5200', accountName: 'Inventory Shrinkage & Scrap Loss', accountType: 'EXPENSE', subType: 'INVENTORY_SCRAP', normalBalance: 'DEBIT', isSystemAccount: true },
  { accountCode: '5300', accountName: 'Warehouse Operating Expenses', accountType: 'EXPENSE', subType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isSystemAccount: true },
];

class JournalEngineService {
  /**
   * Seeds default standard Chart of Accounts for a tenant if not present.
   */
  async seedDefaultChartOfAccounts(tenantId) {
    const existing = await Account.find({ tenantId }).select('accountCode').lean();
    const existingCodes = new Set(existing.map((a) => a.accountCode));

    const toInsert = DEFAULT_COA.filter((a) => !existingCodes.has(a.accountCode)).map((a) => ({
      ...a,
      tenantId
    }));

    if (toInsert.length > 0) {
      await Account.insertMany(toInsert);
      logger.info(`[GL] Seeded ${toInsert.length} standard accounts for tenant ${tenantId}`);
    }
  }

  /**
   * Resolves or creates an account by code for this tenant.
   */
  async getAccount(tenantId, code) {
    let acc = await Account.findOne({ tenantId, accountCode: code });
    if (!acc) {
      await this.seedDefaultChartOfAccounts(tenantId);
      acc = await Account.findOne({ tenantId, accountCode: code });
    }
    return acc;
  }

  /**
   * Core posting mechanism: records a balanced JournalEntry and updates account currentBalances.
   */
  async postEntry(tenantId, {
    entryDate = new Date(),
    sourceDocument = { documentType: 'MANUAL', referenceNumber: '' },
    memo = '',
    lines = [],
    postedBy = null
  }) {
    if (!lines || lines.length < 2) {
      throw new Error('A journal entry requires at least 2 lines.');
    }

    const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

    const roundedDr = Math.round(totalDebit * 100) / 100;
    const roundedCr = Math.round(totalCredit * 100) / 100;

    if (Math.abs(roundedDr - roundedCr) > 0.01) {
      throw new Error(`Out of balance journal entry: Debits (₹${roundedDr}) !== Credits (₹${roundedCr})`);
    }

    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(tenantId, 'JOURNAL_ENTRY', `JE-${currentYear}`, 4);

    const entry = new JournalEntry({
      entryNumber: seq,
      entryDate,
      sourceDocument,
      memo,
      lines,
      totalDebit: roundedDr,
      totalCredit: roundedCr,
      status: 'POSTED',
      postedBy,
      tenantId
    });

    await entry.save();

    // Increment / decrement balances on Account masters
    for (const line of lines) {
      const acc = await Account.findOne({ _id: line.accountId, tenantId });
      if (acc) {
        const dr = Number(line.debit) || 0;
        const cr = Number(line.credit) || 0;

        if (acc.normalBalance === 'DEBIT') {
          acc.currentBalance = Math.round(((acc.currentBalance || 0) + (dr - cr)) * 100) / 100;
        } else {
          acc.currentBalance = Math.round(((acc.currentBalance || 0) + (cr - dr)) * 100) / 100;
        }
        await acc.save();
      }
    }

    return entry;
  }

  // ── Event: Outbound Tax Invoice Issued ─────────────────────────────
  async postInvoiceIssued(tenantId, invoice, postedBy = null) {
    const arAcc = await this.getAccount(tenantId, '1200');
    const revAcc = await this.getAccount(tenantId, '4000');
    const cgstAcc = await this.getAccount(tenantId, '2110');
    const sgstAcc = await this.getAccount(tenantId, '2120');
    const igstAcc = await this.getAccount(tenantId, '2130');

    const totalAmount = Number(invoice.grandTotal || invoice.totalAmount || 0);
    const taxable = Number(invoice.taxableAmount || 0);
    const cgst = Number(invoice.cgstAmount || 0);
    const sgst = Number(invoice.sgstAmount || 0);
    const igst = Number(invoice.igstAmount || 0);

    const lines = [
      {
        accountId: arAcc._id,
        accountCode: arAcc.accountCode,
        accountName: arAcc.accountName,
        debit: totalAmount,
        credit: 0,
        description: `Invoice ${invoice.invoiceNumber} receivable`
      },
      {
        accountId: revAcc._id,
        accountCode: revAcc.accountCode,
        accountName: revAcc.accountName,
        debit: 0,
        credit: taxable,
        description: `Revenue from invoice ${invoice.invoiceNumber}`
      }
    ];

    if (cgst > 0) {
      lines.push({
        accountId: cgstAcc._id,
        accountCode: cgstAcc.accountCode,
        accountName: cgstAcc.accountName,
        debit: 0,
        credit: cgst,
        description: 'CGST 9% output tax'
      });
    }
    if (sgst > 0) {
      lines.push({
        accountId: sgstAcc._id,
        accountCode: sgstAcc.accountCode,
        accountName: sgstAcc.accountName,
        debit: 0,
        credit: sgst,
        description: 'SGST 9% output tax'
      });
    }
    if (igst > 0) {
      lines.push({
        accountId: igstAcc._id,
        accountCode: igstAcc.accountCode,
        accountName: igstAcc.accountName,
        debit: 0,
        credit: igst,
        description: 'IGST 18% output tax'
      });
    }

    return this.postEntry(tenantId, {
      entryDate: invoice.invoiceDate || new Date(),
      sourceDocument: {
        documentType: 'INVOICE',
        documentId: invoice._id,
        referenceNumber: invoice.invoiceNumber
      },
      memo: `Tax Invoice ${invoice.invoiceNumber} posted`,
      lines,
      postedBy
    });
  }

  // ── Event: Customer Payment Receipt ───────────────────────────────
  async postPaymentReceived(tenantId, receipt, postedBy = null) {
    const bankAcc = await this.getAccount(tenantId, '1020');
    const arAcc = await this.getAccount(tenantId, '1200');

    const amount = Number(receipt.amount || 0);

    const lines = [
      {
        accountId: bankAcc._id,
        accountCode: bankAcc.accountCode,
        accountName: bankAcc.accountName,
        debit: amount,
        credit: 0,
        description: `Bank deposit via ${receipt.paymentMethod || 'NEFT'}`
      },
      {
        accountId: arAcc._id,
        accountCode: arAcc.accountCode,
        accountName: arAcc.accountName,
        debit: 0,
        credit: amount,
        description: `AR settlement for receipt ${receipt.receiptNumber || 'RCPT'}`
      }
    ];

    return this.postEntry(tenantId, {
      entryDate: receipt.paymentDate || new Date(),
      sourceDocument: {
        documentType: 'PAYMENT_RECEIPT',
        documentId: receipt._id,
        referenceNumber: receipt.receiptNumber || 'RCPT'
      },
      memo: `Customer payment receipt ${receipt.receiptNumber || ''}`,
      lines,
      postedBy
    });
  }

  // ── Event: Inbound Vendor Bill Approved ───────────────────────────
  async postVendorBillApproved(tenantId, bill, postedBy = null) {
    const grniAcc = await this.getAccount(tenantId, '1400');
    const apAcc = await this.getAccount(tenantId, '2000');
    const cgstIn = await this.getAccount(tenantId, '1510');
    const sgstIn = await this.getAccount(tenantId, '1520');
    const igstIn = await this.getAccount(tenantId, '1530');

    const total = Number(bill.grandTotal || bill.totalAmount || 0);
    const taxable = Number(bill.taxableAmount || total);
    const cgst = Number(bill.cgstAmount || 0);
    const sgst = Number(bill.sgstAmount || 0);
    const igst = Number(bill.igstAmount || 0);

    const lines = [
      {
        accountId: grniAcc._id,
        accountCode: grniAcc.accountCode,
        accountName: grniAcc.accountName,
        debit: taxable,
        credit: 0,
        description: `GRNI cleared for vendor bill ${bill.billNumber}`
      }
    ];

    if (cgst > 0) {
      lines.push({
        accountId: cgstIn._id,
        accountCode: cgstIn.accountCode,
        accountName: cgstIn.accountName,
        debit: cgst,
        credit: 0,
        description: 'Input CGST credit'
      });
    }
    if (sgst > 0) {
      lines.push({
        accountId: sgstIn._id,
        accountCode: sgstIn.accountCode,
        accountName: sgstIn.accountName,
        debit: sgst,
        credit: 0,
        description: 'Input SGST credit'
      });
    }
    if (igst > 0) {
      lines.push({
        accountId: igstIn._id,
        accountCode: igstIn.accountCode,
        accountName: igstIn.accountName,
        debit: igst,
        credit: 0,
        description: 'Input IGST credit'
      });
    }

    lines.push({
      accountId: apAcc._id,
      accountCode: apAcc.accountCode,
      accountName: apAcc.accountName,
      debit: 0,
      credit: total,
      description: `Accounts Payable booked for bill ${bill.billNumber}`
    });

    return this.postEntry(tenantId, {
      entryDate: bill.billDate || new Date(),
      sourceDocument: {
        documentType: 'VENDOR_BILL',
        documentId: bill._id,
        referenceNumber: bill.billNumber
      },
      memo: `Vendor Bill ${bill.billNumber} approved via 3-Way Match`,
      lines,
      postedBy
    });
  }

  // ── Event: Outbound Vendor Payment ────────────────────────────────
  async postVendorPayment(tenantId, payment, postedBy = null) {
    const apAcc = await this.getAccount(tenantId, '2000');
    const bankAcc = await this.getAccount(tenantId, '1020');

    const amount = Number(payment.amount || 0);

    const lines = [
      {
        accountId: apAcc._id,
        accountCode: apAcc.accountCode,
        accountName: apAcc.accountName,
        debit: amount,
        credit: 0,
        description: `AP reduction for payment voucher ${payment.voucherNumber || 'PV'}`
      },
      {
        accountId: bankAcc._id,
        accountCode: bankAcc.accountCode,
        accountName: bankAcc.accountName,
        debit: 0,
        credit: amount,
        description: `Bank disbursement via ${payment.paymentMethod || 'NEFT'}`
      }
    ];

    return this.postEntry(tenantId, {
      entryDate: payment.paymentDate || new Date(),
      sourceDocument: {
        documentType: 'VENDOR_PAYMENT',
        documentId: payment._id,
        referenceNumber: payment.voucherNumber || 'PV'
      },
      memo: `Vendor payment voucher ${payment.voucherNumber || ''}`,
      lines,
      postedBy
    });
  }

  // ── Event: Inventory Scrap / Shrinkage Write-Off ───────────────────
  async postInventoryScrap(tenantId, scrapLossValue, referenceNumber = 'SCRAP', postedBy = null) {
    const lossAcc = await this.getAccount(tenantId, '5200');
    const invAcc = await this.getAccount(tenantId, '1300');

    const amount = Number(scrapLossValue || 0);

    const lines = [
      {
        accountId: lossAcc._id,
        accountCode: lossAcc.accountCode,
        accountName: lossAcc.accountName,
        debit: amount,
        credit: 0,
        description: `Inventory shrinkage / scrap expense`
      },
      {
        accountId: invAcc._id,
        accountCode: invAcc.accountCode,
        accountName: invAcc.accountName,
        debit: 0,
        credit: amount,
        description: `Inventory asset write-off`
      }
    ];

    return this.postEntry(tenantId, {
      entryDate: new Date(),
      sourceDocument: {
        documentType: 'INVENTORY_ADJUSTMENT',
        referenceNumber
      },
      memo: `Inventory adjustment write-off: ₹${amount}`,
      lines,
      postedBy
    });
  }
}

module.exports = new JournalEngineService();

