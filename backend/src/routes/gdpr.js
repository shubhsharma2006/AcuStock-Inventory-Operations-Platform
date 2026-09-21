/**
 * GDPR Compliance Toolkit
 *
 * GET    /api/gdpr/export          — export all own data as JSON (self only)
 * DELETE /api/gdpr/delete-account  — anonymize + soft-delete account (self only)
 *
 * Data export includes: profile, stock ledger entries, audit logs.
 * Account deletion anonymizes PII while preserving ledger integrity.
 */

const express     = require('express');
const User        = require('../models/User');
const StockLedger = require('../models/StockLedger');
const AuditLog    = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const logger      = require('../utils/logger');

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────

function anonymizeName(userId) {
  return `DeletedUser_${userId.toString().slice(-6)}`;
}

// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /api/gdpr/export
 * Returns a JSON document with all data the user owns.
 * Rate-limited by the general API limiter — one export per ~5 minutes.
 */
/**
 * GET /api/gdpr/export
 * Returns a JSON document with all data the user owns.
 * Rate-limited by the general API limiter — one export per ~5 minutes.
 */
router.get('/export', requireAuth, async (req, res) => {
  try {
    const tenantFilter = { tenantId: req.tenantId };

    const [user, ledgerEntries, auditEntries] = await Promise.all([
      User.findOne({ _id: req.userId, ...tenantFilter }).select(
        'name email phone role isActive createdAt updatedAt lastLogin'
      ),
      StockLedger.find({ createdBy: req.userId, ...tenantFilter })
        .populate('productId', 'name shortName')
        .sort({ createdAt: -1 })
        .limit(10_000),   // hard cap — protects against huge exports
      AuditLog.find({ performedBy: req.userId, ...tenantFilter })
        .sort({ createdAt: -1 })
        .limit(5_000)
    ]);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const payload = {
      exportedAt:    new Date().toISOString(),
      exportVersion: '1.0',
      profile:       user.toJSON(),
      stockLedger:   ledgerEntries,
      auditLog:      auditEntries
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="acustock-data-export-${req.userId}.json"`);
    res.json(payload);

    logger.info(`GDPR export for user ${req.userId} (${user.email || user.phone})`);
  } catch (err) {
    logger.error('GDPR export error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate data export' });
  }
});

/**
 * DELETE /api/gdpr/delete-account
 * Body: { confirmPhrase: "DELETE MY ACCOUNT" }
 *
 * - Anonymizes PII (name, email, phone)
 * - Sets isDeleted = true, deletedAt = now
 * - Preserves ledger entries (createdBy still references the user)
 * - Invalidates all tokens via tokenVersion bump
 */
router.delete('/delete-account', requireAuth, async (req, res) => {
  const { confirmPhrase } = req.body;

  // Require explicit confirmation to prevent accidental deletion
  if (confirmPhrase !== 'DELETE MY ACCOUNT') {
    return res.status(400).json({
      success: false,
      error:   'Confirmation phrase required',
      hint:    'Send { "confirmPhrase": "DELETE MY ACCOUNT" }'
    });
  }

  try {
    const user = await User.findOne({ _id: req.userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.isDeleted) {
      return res.status(409).json({ success: false, error: 'Account already deleted' });
    }

    // Prevent deleting SUPER_ADMIN (would lock out the entire system)
    if (user.isSuperAdmin) {
      return res.status(403).json({ success: false, error: 'Super admin accounts cannot be self-deleted' });
    }

    await User.findByIdAndUpdate(req.userId, {
      $set: {
        name:        anonymizeName(req.userId),
        email:       null,
        phone:       null,
        isDeleted:   true,
        deletedAt:   new Date(),
        isActive:    false,
        tokenVersion: (user.tokenVersion || 0) + 1  // invalidate all existing JWTs
      }
    });

    // Audit log (using system-level data since user PII is now gone)
    try {
      await AuditLog.create({
        action:      'GDPR_ACCOUNT_DELETION',
        performedBy: req.userId,
        ipAddress:   req.ip,
        userAgent:   req.headers['user-agent'],
        tenantId:    req.tenantId || undefined,
        metadata:    { selfInitiated: true }
      });
    } catch (_) { /* non-blocking */ }

    logger.info(`GDPR account deletion: user ${req.userId} anonymized`);

    // Clear auth cookie
    res.clearCookie('authToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
    res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
    res.json({ success: true, message: 'Account deleted and data anonymized. You have been signed out.' });
  } catch (err) {
    logger.error('GDPR account deletion error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

module.exports = router;
