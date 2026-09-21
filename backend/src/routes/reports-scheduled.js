/**
 * Scheduled Reports API
 * GET  /api/reports/scheduled        — list all generated reports (ADMIN only)
 * GET  /api/reports/scheduled/:id    — get single report by ID
 * POST /api/reports/scheduled/trigger — manually trigger a report now
 */

const express = require('express');
const Report  = require('../models/Report');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateDailySummary, generateWeeklyLowStock } = require('../services/reportScheduler');
const logger  = require('../utils/logger');

const router = express.Router();

// GET /api/reports/scheduled — list reports with pagination + type filter
router.get('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const typeFilter = {
      ...(req.query.type ? { type: req.query.type } : {}),
      tenantId: req.tenantId
    };

    const [reports, total] = await Promise.all([
      Report.find(typeFilter)
        .select('-data') // omit heavy payload in list view
        .sort({ generatedAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(typeFilter)
    ]);

    res.set('X-Total-Count', total);
    res.set('X-Total-Pages', Math.ceil(total / limit));
    res.json({ success: true, reports, page, total });
  } catch (err) {
    logger.error('Error listing scheduled reports:', err);
    res.status(500).json({ success: false, error: 'Failed to list reports' });
  }
});

// GET /api/reports/scheduled/:id — full report data
router.get('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    res.json({ success: true, report });
  } catch (err) {
    logger.error('Error fetching report:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

// POST /api/reports/scheduled/trigger — manually trigger now (ADMIN only)
router.post('/trigger', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  const { type = 'daily_summary' } = req.body;

  const allowed = ['daily_summary', 'weekly_low_stock'];
  if (!allowed.includes(type)) {
    return res.status(400).json({ success: false, error: `type must be one of: ${allowed.join(', ')}` });
  }

  try {
    let report;
    if (type === 'daily_summary') {
      report = await generateDailySummary('manual', req.tenantId);
    } else {
      report = await generateWeeklyLowStock('manual', req.tenantId);
    }
    res.json({ success: true, message: `${type} generated`, report });
  } catch (err) {
    logger.error('Error triggering report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
