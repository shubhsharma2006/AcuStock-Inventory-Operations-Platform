const express = require('express');
const mongoose = require('mongoose');
const SupplierPerformanceService = require('../services/supplierPerformance.service');
const SupplierProfile = require('../models/SupplierProfile');
const Company = require('../models/Company');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/suppliers/leaderboard
 * Ranked supplier list by performance score
 */
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const leaderboard = await SupplierPerformanceService.getSupplierLeaderboard(req.tenantId, limit);
    res.json({ success: true, count: leaderboard.length, leaderboard });
  } catch (error) {
    logger.error('Error getting supplier leaderboard', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/suppliers
 * List all suppliers for this tenant with performance metrics
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const companies = await Company.find({
      tenantId: req.tenantId,
      $or: [{ isSupplier: true }, { supplierProfile: { $ne: null } }]
    })
      .populate('supplierProfile')
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, count: companies.length, suppliers: companies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/suppliers/:companyId/scorecard
 * Specific supplier scorecard
 */
router.get('/:companyId/scorecard', requireAuth, validateObjectId('companyId'), async (req, res) => {
  try {
    const profile = await SupplierProfile.findOne({
      tenantId: req.tenantId,
      companyId: req.params.companyId
    }).populate('companyId', 'name email phone address industry').lean();

    if (!profile) {
      // Evaluate on the fly if profile doesn't exist yet
      const evaluated = await SupplierPerformanceService.evaluateSupplier(req.tenantId, req.params.companyId);
      return res.json({ success: true, ...evaluated });
    }

    const overallScore = profile.performance?.overallScore || 0;
    res.json({
      success: true,
      supplier: profile.companyId,
      profileId: profile._id,
      supplierCode: profile.supplierCode,
      paymentTerms: profile.paymentTerms,
      leadTimeDays: profile.leadTimeDays,
      performance: profile.performance,
      ratingTier: SupplierPerformanceService.getRatingTier(overallScore)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/suppliers/:companyId/evaluate
 * Trigger evaluation/recalculation of scorecard
 */
router.post('/:companyId/evaluate', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('companyId'), async (req, res) => {
  try {
    const result = await SupplierPerformanceService.evaluateSupplier(req.tenantId, req.params.companyId);
    res.json({ success: true, message: 'Supplier evaluated successfully', ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/suppliers/:companyId/profile
 * Update profile configuration (terms, lead time, code, notes)
 */
router.put('/:companyId/profile', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('companyId'), async (req, res) => {
  try {
    const { supplierCode, paymentTerms, leadTimeDays, minimumOrderValue, currency, notes } = req.body;

    const profile = await SupplierProfile.findOneAndUpdate(
      { tenantId: req.tenantId, companyId: req.params.companyId },
      {
        $set: {
          ...(supplierCode !== undefined && { supplierCode: supplierCode.trim().toUpperCase() }),
          ...(paymentTerms !== undefined && { paymentTerms }),
          ...(leadTimeDays !== undefined && { leadTimeDays: Number(leadTimeDays) }),
          ...(minimumOrderValue !== undefined && { minimumOrderValue: Number(minimumOrderValue) }),
          ...(currency !== undefined && { currency: currency.trim().toUpperCase() }),
          ...(notes !== undefined && { notes: notes.trim() })
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Company.updateOne(
      { _id: req.params.companyId, tenantId: req.tenantId },
      { $set: { supplierProfile: profile._id, isSupplier: true } }
    );

    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

