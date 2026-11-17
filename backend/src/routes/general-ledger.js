/**
 * General Ledger (GL) & Financial Statements Express Routes
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET  /api/gl/accounts            Chart of Accounts with live balances
 * - POST /api/gl/accounts            Create user-defined ledger account
 * - POST /api/gl/accounts/seed-default Initialize standard 20+ accounts
 * - GET  /api/gl/journal-entries     General journal ledger
 * - POST /api/gl/journal-entries     Manual double-entry posting
 * - GET  /api/gl/trial-balance       Trial Balance report verifying Dr === Cr
 * - GET  /api/gl/profit-and-loss     P&L Statement (Revenue, COGS, Gross Profit, Net Income)
 * - GET  /api/gl/balance-sheet       Balance Sheet (Assets = Liabilities + Equity)
 */

const express = require('express');
const router = express.Router();

const Account = require('../models/Account');
const JournalEntry = require('../models/JournalEntry');
const journalEngine = require('../services/journalEngine.service');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('general-ledger', 'FULL_ACCESS'));

// ── GET /api/gl/accounts — Chart of Accounts ───────────────────────
router.get('/accounts', async (req, res) => {
  try {
    let accounts = await Account.find({ tenantId: req.tenantId })
      .sort({ accountCode: 1 })
      .lean();

    if (accounts.length === 0) {
      await journalEngine.seedDefaultChartOfAccounts(req.tenantId);
      accounts = await Account.find({ tenantId: req.tenantId })
        .sort({ accountCode: 1 })
        .lean();
    }

    res.json({ success: true, accounts });
  } catch (err) {
    logger.error('Get COA accounts error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/gl/accounts — Create Custom Account ──────────────────
router.post('/accounts', async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountType,
      subType = '',
      normalBalance,
      description = ''
    } = req.body;

    if (!accountCode || !accountName || !accountType || !normalBalance) {
      return res.status(400).json({
        success: false,
        error: 'accountCode, accountName, accountType, and normalBalance are required'
      });
    }

    const existing = await Account.findOne({
      accountCode: accountCode.trim(),
      tenantId: req.tenantId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Account code ${accountCode} already exists in Chart of Accounts`
      });
    }

    const account = new Account({
      accountCode: accountCode.trim(),
      accountName: accountName.trim(),
      accountType,
      subType: subType.trim(),
      normalBalance,
      description: description.trim(),
      isSystemAccount: false,
      tenantId: req.tenantId
    });

    await account.save();

    res.status(201).json({
      success: true,
      message: `Account ${account.accountCode} — ${account.accountName} created successfully`,
      account
    });
  } catch (err) {
    logger.error('Create account error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/gl/accounts/seed-default — Explicit Seed Trigger ─────
router.post('/accounts/seed-default', async (req, res) => {
  try {
    await journalEngine.seedDefaultChartOfAccounts(req.tenantId);
    const accounts = await Account.find({ tenantId: req.tenantId })
      .sort({ accountCode: 1 })
      .lean();

    res.json({
      success: true,
      message: 'Standard Chart of Accounts verified and populated',
      accounts
    });
  } catch (err) {
    logger.error('Seed COA error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/gl/journal-entries — General Journal ──────────────────
router.get('/journal-entries', async (req, res) => {
  try {
    const { startDate, endDate, documentType, page = 1, limit = 25 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (documentType) {
      filter['sourceDocument.documentType'] = documentType;
    }

    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(startDate);
      if (endDate) filter.entryDate.$lte = new Date(endDate);
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const [entries, total] = await Promise.all([
      JournalEntry.find(filter)
        .sort({ entryDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('postedBy', 'name email')
        .lean(),
      JournalEntry.countDocuments(filter)
    ]);

    res.json({
      success: true,
      entries,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    logger.error('List journal entries error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/gl/journal-entries — Manual Double-Entry Posting ─────
router.post('/journal-entries', async (req, res) => {
  try {
    const {
      entryDate,
      memo = 'Manual Journal Entry',
      referenceNumber = '',
      lines = []
    } = req.body;

    const entry = await journalEngine.postEntry(req.tenantId, {
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      sourceDocument: {
        documentType: 'MANUAL',
        referenceNumber: referenceNumber || 'MANUAL-JE'
      },
      memo,
      lines,
      postedBy: req.userId
    });

    res.status(201).json({
      success: true,
      message: `Journal Entry ${entry.entryNumber} posted successfully`,
      entry
    });
  } catch (err) {
    logger.error('Post manual journal entry error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/gl/trial-balance — Trial Balance Report ───────────────
router.get('/trial-balance', async (req, res) => {
  try {
    const accounts = await Account.find({ tenantId: req.tenantId })
      .sort({ accountCode: 1 })
      .lean();

    let totalDebits = 0;
    let totalCredits = 0;

    const trialLines = accounts.map((acc) => {
      const bal = Number(acc.currentBalance) || 0;
      let debit = 0;
      let credit = 0;

      if (acc.normalBalance === 'DEBIT') {
        if (bal >= 0) debit = bal;
        else credit = Math.abs(bal);
      } else {
        if (bal >= 0) credit = bal;
        else debit = Math.abs(bal);
      }

      totalDebits += debit;
      totalCredits += credit;

      return {
        accountId: acc._id,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100
      };
    });

    const roundedDebits = Math.round(totalDebits * 100) / 100;
    const roundedCredits = Math.round(totalCredits * 100) / 100;
    const isBalanced = Math.abs(roundedDebits - roundedCredits) < 0.05;

    res.json({
      success: true,
      asOfDate: new Date(),
      isBalanced,
      totalDebits: roundedDebits,
      totalCredits: roundedCredits,
      variance: Math.round(Math.abs(roundedDebits - roundedCredits) * 100) / 100,
      lines: trialLines
    });
  } catch (err) {
    logger.error('Trial balance error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/gl/profit-and-loss — P&L Statement ────────────────────
router.get('/profit-and-loss', async (req, res) => {
  try {
    const accounts = await Account.find({
      tenantId: req.tenantId,
      accountType: { $in: ['REVENUE', 'EXPENSE'] }
    })
      .sort({ accountCode: 1 })
      .lean();

    const revenueAccounts = accounts.filter((a) => a.accountType === 'REVENUE');
    const cogsAccounts = accounts.filter((a) => a.subType === 'COST_OF_GOODS_SOLD');
    const expenseAccounts = accounts.filter(
      (a) => a.accountType === 'EXPENSE' && a.subType !== 'COST_OF_GOODS_SOLD'
    );

    const totalRevenue = revenueAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const totalCogs = cogsAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0;

    const totalExpenses = expenseAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const netIncome = grossProfit - totalExpenses;

    res.json({
      success: true,
      asOfDate: new Date(),
      statement: {
        revenue: {
          accounts: revenueAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, balance: a.currentBalance || 0 })),
          total: totalRevenue
        },
        cogs: {
          accounts: cogsAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, balance: a.currentBalance || 0 })),
          total: totalCogs
        },
        grossProfit,
        grossMarginPct,
        operatingExpenses: {
          accounts: expenseAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, balance: a.currentBalance || 0 })),
          total: totalExpenses
        },
        netIncome
      }
    });
  } catch (err) {
    logger.error('Profit and loss error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/gl/balance-sheet — Balance Sheet ──────────────────────
router.get('/balance-sheet', async (req, res) => {
  try {
    const [assetAccounts, liabilityAccounts, equityAccounts, pnlAccounts] = await Promise.all([
      Account.find({ tenantId: req.tenantId, accountType: 'ASSET' }).sort({ accountCode: 1 }).lean(),
      Account.find({ tenantId: req.tenantId, accountType: 'LIABILITY' }).sort({ accountCode: 1 }).lean(),
      Account.find({ tenantId: req.tenantId, accountType: 'EQUITY' }).sort({ accountCode: 1 }).lean(),
      Account.find({ tenantId: req.tenantId, accountType: { $in: ['REVENUE', 'EXPENSE'] } }).lean()
    ]);

    // Calculate current net income to add to Equity
    const totalRev = pnlAccounts.filter((a) => a.accountType === 'REVENUE').reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const totalExp = pnlAccounts.filter((a) => a.accountType === 'EXPENSE').reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const currentPeriodNetIncome = totalRev - totalExp;

    const totalAssets = assetAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const totalLiabilities = liabilityAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const totalEquityWithoutIncome = equityAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);
    const totalEquity = totalEquityWithoutIncome + currentPeriodNetIncome;

    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05;

    res.json({
      success: true,
      asOfDate: new Date(),
      isBalanced,
      assets: {
        accounts: assetAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, subType: a.subType, balance: a.currentBalance || 0 })),
        total: totalAssets
      },
      liabilities: {
        accounts: liabilityAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, subType: a.subType, balance: a.currentBalance || 0 })),
        total: totalLiabilities
      },
      equity: {
        accounts: equityAccounts.map((a) => ({ code: a.accountCode, name: a.accountName, subType: a.subType, balance: a.currentBalance || 0 })),
        currentPeriodNetIncome,
        total: totalEquity
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity
    });
  } catch (err) {
    logger.error('Balance sheet error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

