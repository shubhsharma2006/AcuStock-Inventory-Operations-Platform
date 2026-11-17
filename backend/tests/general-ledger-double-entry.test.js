/**
 * Automated Test Suite: Double-Entry General Ledger (GL) & Financial Reporting Engine
 * ─────────────────────────────────────────────────────────────
 * Validates:
 * 1. Chart of Accounts categorization & normal balances
 * 2. Strict invariant enforcement (Debits === Credits)
 * 3. Commercial outbound tax invoice journal posting (AR vs Revenue + GST)
 * 4. Customer payment receipt posting (Bank vs AR)
 * 5. Inbound vendor bill posting (GRNI + Input GST vs AP)
 * 6. Outbound vendor payment voucher posting (AP vs Bank)
 * 7. Inventory scrap write-off posting (Scrap Loss vs Inventory)
 * 8. Trial Balance equality verification
 * 9. P&L Net Operating Income computation
 * 10. Balance Sheet fundamental identity (Assets = Liabilities + Equity)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── In-Memory Double-Entry Simulation Models ───────────────────────

class AccountLedger {
  constructor() {
    this.accounts = new Map();
    this.seedDefaultAccounts();
  }

  seedDefaultAccounts() {
    const list = [
      { code: '1010', name: 'Cash on Hand', type: 'ASSET', normal: 'DEBIT' },
      { code: '1020', name: 'Bank - Operating Account', type: 'ASSET', normal: 'DEBIT' },
      { code: '1200', name: 'Accounts Receivable (AR)', type: 'ASSET', normal: 'DEBIT' },
      { code: '1300', name: 'Inventory Asset', type: 'ASSET', normal: 'DEBIT' },
      { code: '1400', name: 'Goods Received Not Invoiced (GRNI)', type: 'ASSET', normal: 'CREDIT' },
      { code: '1510', name: 'Input CGST Tax Credit', type: 'ASSET', normal: 'DEBIT' },
      { code: '1520', name: 'Input SGST Tax Credit', type: 'ASSET', normal: 'DEBIT' },
      { code: '2000', name: 'Accounts Payable (AP)', type: 'LIABILITY', normal: 'CREDIT' },
      { code: '2110', name: 'Output CGST Payable', type: 'LIABILITY', normal: 'CREDIT' },
      { code: '2120', name: 'Output SGST Payable', type: 'LIABILITY', normal: 'CREDIT' },
      { code: '3000', name: "Owner's Capital", type: 'EQUITY', normal: 'CREDIT' },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normal: 'CREDIT' },
      { code: '4000', name: 'Wholesale Sales Revenue', type: 'REVENUE', normal: 'CREDIT' },
      { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'EXPENSE', normal: 'DEBIT' },
      { code: '5200', name: 'Inventory Shrinkage & Scrap Loss', type: 'EXPENSE', normal: 'DEBIT' }
    ];

    for (const a of list) {
      this.accounts.set(a.code, { ...a, balance: 0 });
    }
  }

  get(code) {
    return this.accounts.get(code);
  }

  postJournalEntry(lines, memo = '') {
    if (!lines || lines.length < 2) {
      throw new Error('Journal entry must have at least 2 lines.');
    }

    const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
    const totalCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);

    const roundedDr = Math.round(totalDebit * 100) / 100;
    const roundedCr = Math.round(totalCredit * 100) / 100;

    if (Math.abs(roundedDr - roundedCr) > 0.01) {
      throw new Error(`Out of balance journal entry: Debits (₹${roundedDr}) !== Credits (₹${roundedCr})`);
    }

    for (const l of lines) {
      const acc = this.accounts.get(l.code);
      if (!acc) throw new Error(`Unknown account code ${l.code}`);

      const dr = l.debit || 0;
      const cr = l.credit || 0;

      if (acc.normal === 'DEBIT') {
        acc.balance = Math.round((acc.balance + (dr - cr)) * 100) / 100;
      } else {
        acc.balance = Math.round((acc.balance + (cr - dr)) * 100) / 100;
      }
    }

    return {
      memo,
      totalDebit: roundedDr,
      totalCredit: roundedCr,
      lines
    };
  }

  getTrialBalance() {
    let totalDebits = 0;
    let totalCredits = 0;

    const rows = [];
    for (const acc of this.accounts.values()) {
      let debit = 0;
      let credit = 0;

      if (acc.normal === 'DEBIT') {
        if (acc.balance >= 0) debit = acc.balance;
        else credit = Math.abs(acc.balance);
      } else {
        if (acc.balance >= 0) credit = acc.balance;
        else debit = Math.abs(acc.balance);
      }

      totalDebits += debit;
      totalCredits += credit;
      rows.push({ code: acc.code, name: acc.name, debit, credit });
    }

    return {
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.05,
      rows
    };
  }

  getProfitAndLoss() {
    let revenue = 0;
    let cogs = 0;
    let expenses = 0;

    for (const acc of this.accounts.values()) {
      if (acc.type === 'REVENUE') revenue += acc.balance;
      else if (acc.code === '5000') cogs += acc.balance;
      else if (acc.type === 'EXPENSE') expenses += acc.balance;
    }

    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - expenses;

    return { revenue, cogs, grossProfit, expenses, netIncome };
  }

  getBalanceSheet() {
    let assets = 0;
    let liabilities = 0;
    let equity = 0;

    for (const acc of this.accounts.values()) {
      if (acc.type === 'ASSET') assets += acc.balance;
      else if (acc.type === 'LIABILITY') liabilities += acc.balance;
      else if (acc.type === 'EQUITY') equity += acc.balance;
    }

    const pnl = this.getProfitAndLoss();
    const totalEquity = equity + pnl.netIncome;

    return {
      assets: Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      equity: Math.round(totalEquity * 100) / 100,
      isBalanced: Math.abs(assets - (liabilities + totalEquity)) < 0.05
    };
  }
}

// ── Test Suites ────────────────────────────────────────────────────

describe('Double-Entry General Ledger (GL) & Reporting Engine Suite', () => {
  test('1. should reject out-of-balance journal entries', () => {
    const gl = new AccountLedger();

    assert.throws(
      () => {
        gl.postJournalEntry([
          { code: '1200', debit: 1000, credit: 0 },
          { code: '4000', debit: 0, credit: 900 } // Variance of ₹100
        ]);
      },
      /Out of balance journal entry/,
      'Must reject entries where Total Debit !== Total Credit'
    );
  });

  test('2. should post initial owner capital deposit and balance cash vs equity', () => {
    const gl = new AccountLedger();

    // Owner injects ₹5,00,000 capital into bank
    gl.postJournalEntry([
      { code: '1020', debit: 500000, credit: 0 },
      { code: '3000', debit: 0, credit: 500000 }
    ], 'Owner seed capital');

    assert.equal(gl.get('1020').balance, 500000, 'Bank balance should be ₹5,00,000');
    assert.equal(gl.get('3000').balance, 500000, 'Equity balance should be ₹5,00,000');

    const bs = gl.getBalanceSheet();
    assert.equal(bs.assets, 500000);
    assert.equal(bs.equity, 500000);
    assert.ok(bs.isBalanced, 'Assets === Liabilities + Equity');
  });

  test('3. should post automated invoice issuance: AR vs Revenue and Statutory GST', () => {
    const gl = new AccountLedger();

    // Invoice INV-001: ₹1,00,000 Taxable + 9% CGST (₹9,000) + 9% SGST (₹9,000) = ₹1,18,000
    gl.postJournalEntry([
      { code: '1200', debit: 118000, credit: 0 },
      { code: '4000', debit: 0, credit: 100000 },
      { code: '2110', debit: 0, credit: 9000 },
      { code: '2120', debit: 0, credit: 9000 }
    ], 'Invoice INV-001');

    assert.equal(gl.get('1200').balance, 118000, 'Customer owes ₹1,18,000 in AR');
    assert.equal(gl.get('4000').balance, 100000, 'Sales revenue is ₹1,00,000');
    assert.equal(gl.get('2110').balance, 9000, 'Output CGST liability is ₹9,000');
    assert.equal(gl.get('2120').balance, 9000, 'Output SGST liability is ₹9,000');
  });

  test('4. should post customer payment receipt: Bank vs AR reduction', () => {
    const gl = new AccountLedger();

    // 1. Issue Invoice
    gl.postJournalEntry([
      { code: '1200', debit: 118000, credit: 0 },
      { code: '4000', debit: 0, credit: 100000 },
      { code: '2110', debit: 0, credit: 9000 },
      { code: '2120', debit: 0, credit: 9000 }
    ]);

    // 2. Receive ₹1,18,000 in bank
    gl.postJournalEntry([
      { code: '1020', debit: 118000, credit: 0 },
      { code: '1200', debit: 0, credit: 118000 }
    ], 'Customer settlement');

    assert.equal(gl.get('1200').balance, 0, 'AR balance should be zero after full settlement');
    assert.equal(gl.get('1020').balance, 118000, 'Bank balance should reflect ₹1,18,000');
  });

  test('5. should post 3-Way Match Vendor Bill: GRNI + Input GST vs AP', () => {
    const gl = new AccountLedger();

    // Bill BILL-001: ₹50,000 Goods + ₹4,500 Input CGST + ₹4,500 Input SGST = ₹59,000 Payable
    gl.postJournalEntry([
      { code: '1400', debit: 50000, credit: 0 },
      { code: '1510', debit: 4500, credit: 0 },
      { code: '1520', debit: 4500, credit: 0 },
      { code: '2000', debit: 0, credit: 59000 }
    ], 'Vendor Bill BILL-001');

    assert.equal(gl.get('2000').balance, 59000, 'AP should reflect ₹59,000 owed');
    assert.equal(gl.get('1510').balance, 4500, 'Input CGST credit should be ₹4,500');
  });

  test('6. should post inventory dispatch COGS and verify Profit & Loss statement', () => {
    const gl = new AccountLedger();

    // 1. Initial inventory asset of ₹60,000
    gl.postJournalEntry([
      { code: '1300', debit: 60000, credit: 0 },
      { code: '3000', debit: 0, credit: 60000 }
    ]);

    // 2. Invoice ₹1,00,000
    gl.postJournalEntry([
      { code: '1200', debit: 100000, credit: 0 },
      { code: '4000', debit: 0, credit: 100000 }
    ]);

    // 3. Dispatch items costing ₹40,000 (Dr COGS, Cr Inventory)
    gl.postJournalEntry([
      { code: '5000', debit: 40000, credit: 0 },
      { code: '1300', debit: 0, credit: 40000 }
    ]);

    assert.equal(gl.get('1300').balance, 20000, 'Remaining inventory should be ₹20,000');
    assert.equal(gl.get('5000').balance, 40000, 'COGS should be ₹40,000');

    // Verify P&L
    const pnl = gl.getProfitAndLoss();
    assert.equal(pnl.revenue, 100000);
    assert.equal(pnl.cogs, 40000);
    assert.equal(pnl.grossProfit, 60000, 'Gross profit should be ₹60,000');
    assert.equal(pnl.netIncome, 60000, 'Net operating income should be ₹60,000');
  });

  test('7. should maintain Trial Balance equality across complex multi-step supply chain', () => {
    const gl = new AccountLedger();

    // Step 1: Capital ₹2,00,000
    gl.postJournalEntry([{ code: '1020', debit: 200000, credit: 0 }, { code: '3000', debit: 0, credit: 200000 }]);

    // Step 2: Buy Inventory ₹80,000 on credit
    gl.postJournalEntry([{ code: '1300', debit: 80000, credit: 0 }, { code: '2000', debit: 0, credit: 80000 }]);

    // Step 3: Pay vendor ₹50,000 from bank
    gl.postJournalEntry([{ code: '2000', debit: 50000, credit: 0 }, { code: '1020', debit: 0, credit: 50000 }]);

    // Step 4: Sell goods for ₹1,50,000 (Cost ₹45,000)
    gl.postJournalEntry([{ code: '1200', debit: 150000, credit: 0 }, { code: '4000', debit: 0, credit: 150000 }]);
    gl.postJournalEntry([{ code: '5000', debit: 45000, credit: 0 }, { code: '1300', debit: 0, credit: 45000 }]);

    // Step 5: Scrap loss ₹2,000 damaged inventory
    gl.postJournalEntry([{ code: '5200', debit: 2000, credit: 0 }, { code: '1300', debit: 0, credit: 2000 }]);

    const tb = gl.getTrialBalance();
    assert.ok(tb.isBalanced, `Trial Balance must balance: Dr ₹${tb.totalDebits} === Cr ₹${tb.totalCredits}`);
    assert.equal(tb.totalDebits, tb.totalCredits);

    const bs = gl.getBalanceSheet();
    assert.ok(bs.isBalanced, `Balance Sheet must balance: Assets ₹${bs.assets} === Liab+Equity ₹${bs.liabilities + bs.equity}`);
  });
});

