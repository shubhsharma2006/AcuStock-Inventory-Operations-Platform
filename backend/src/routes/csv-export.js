/**
 * Bulk CSV Export Routes (supplementary to items.js which handles import)
 *
 * GET /api/stock/export/csv   — stock ledger export (stock.js registers this)
 * GET /api/users/export/csv   — users export (users.js registers this)
 *
 * These are standalone route files mounted by index.js under their respective prefixes.
 */

const express     = require('express');
const StockLedger = require('../models/StockLedger');
const Item        = require('../models/Item');
const User        = require('../models/User');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const logger      = require('../utils/logger');

const router = express.Router();

// Fail-closed tenant isolation guard for all CSV exports
router.use(requireTenantId);

// ── Shared CSV helpers ─────────────────────────────────────────

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // RFC 4180: wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(values) {
  return values.map(escapeCsv).join(',');
}

function sendCsvStream(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Transfer-Encoding', 'chunked');
  // BOM for Excel compatibility
  res.write('\uFEFF');
}

// ── Stock Ledger Export ────────────────────────────────────────

/**
 * GET /api/stock/export/csv
 * Query params: startDate, endDate, type (IN|OUT), productId
 * ADMIN sees all; MANAGER sees own entries.
 */
router.get('/stock/export/csv', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.startDate) filter.createdAt = { $gte: new Date(req.query.startDate) };
    if (req.query.endDate)   filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.endDate + 'T23:59:59.999Z') };
    if (req.query.type && ['IN', 'OUT'].includes(req.query.type)) filter.type = req.query.type;
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.userRole === 'MANAGER') filter.createdBy = req.userId;

    const filename = `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    sendCsvStream(res, filename);

    // Headers row
    res.write(rowToCsv([
      'Date', 'Type', 'Product', 'Short Name', 'Quantity',
      'Serial Numbers', 'Condition', 'Party Name', 'Party Email',
      'Reference', 'Notes', 'Created By', 'Role'
    ]) + '\n');

    // Stream entries in batches to avoid loading all data into memory
    const BATCH_SIZE = 500;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const entries = await StockLedger.find(filter)
        .populate('productId', 'name shortName')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(BATCH_SIZE);

      for (const entry of entries) {
        res.write(rowToCsv([
          entry.createdAt?.toISOString(),
          entry.type,
          entry.productId?.name,
          entry.productId?.shortName,
          entry.quantity,
          (entry.serialNumbers || []).join('; '),
          entry.condition,
          entry.partyDetails?.name,
          entry.partyDetails?.email,
          entry.transactionDetails?.reference,
          entry.transactionDetails?.notes,
          entry.createdBy?.name || entry.createdBy?.email,
          entry.role
        ]) + '\n');
      }

      hasMore = entries.length === BATCH_SIZE;
      skip += BATCH_SIZE;
    }

    res.end();
  } catch (err) {
    logger.error('Stock CSV export error:', err);
    // If headers already sent, just end the stream
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Export failed' });
    } else {
      res.end();
    }
  }
});

// ── Users Export ───────────────────────────────────────────────

/**
 * GET /api/users/export/csv
 * ADMIN only.
 */
router.get('/users/export/csv', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    sendCsvStream(res, filename);

    res.write(rowToCsv([
      'Name', 'Email', 'Phone', 'Role', 'Status',
      'Created At', 'Last Login', 'Force Password Reset'
    ]) + '\n');

    const BATCH_SIZE = 500;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const users = await User.find({ 
        isDeleted: { $ne: true },
        tenantId: req.tenantId
      })
        .select('name email phone role isActive createdAt lastLogin forcePasswordReset')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(BATCH_SIZE);

      for (const user of users) {
        res.write(rowToCsv([
          user.name,
          user.email,
          user.phone,
          user.role,
          user.isActive ? 'Active' : 'Inactive',
          user.createdAt?.toISOString(),
          user.lastLogin?.toISOString(),
          user.forcePasswordReset ? 'Yes' : 'No'
        ]) + '\n');
      }

      hasMore = users.length === BATCH_SIZE;
      skip += BATCH_SIZE;
    }

    res.end();
  } catch (err) {
    logger.error('Users CSV export error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Export failed' });
    else res.end();
  }
});

// ── Items Export ───────────────────────────────────────────────

/**
 * GET /api/items/export/csv
 * ADMIN only.
 */
router.get('/items/export/csv', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filename = `items-${new Date().toISOString().slice(0, 10)}.csv`;
    sendCsvStream(res, filename);

    res.write(rowToCsv([
      'Name', 'Short Name', 'HSN Code', 'Sales Price', 'Purchase Price',
      'MRP', 'Low Stock Threshold', 'Serial Tracking', 'Require Serial IN',
      'Require Serial OUT', 'Status', 'Created At'
    ]) + '\n');

    const BATCH_SIZE = 500;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const items = await Item.find({ tenantId: req.tenantId })
        .sort({ name: 1 })
        .skip(skip)
        .limit(BATCH_SIZE);

      for (const item of items) {
        res.write(rowToCsv([
          item.name,
          item.shortName,
          item.hsn,
          item.salesPrice,
          item.purchasePrice,
          item.mrp,
          item.lowStockThreshold,
          item.serialPolicy?.enableSerial ? 'Yes' : 'No',
          item.serialPolicy?.requireSerialOnIN ? 'Yes' : 'No',
          item.serialPolicy?.requireSerialOnOUT ? 'Yes' : 'No',
          item.isActive ? 'Active' : 'Inactive',
          item.createdAt?.toISOString()
        ]) + '\n');
      }

      hasMore = items.length === BATCH_SIZE;
      skip += BATCH_SIZE;
    }

    res.end();
  } catch (err) {
    logger.error('Items CSV export error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Export failed' });
    else res.end();
  }
});

module.exports = router;
