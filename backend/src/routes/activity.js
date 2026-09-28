const express = require('express');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/activity
 * Paginated business & security activity feed
 * Allowed: ADMIN, MANAGER
 */
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { page, limit } = normalizePaginationQuery(req.query);
    const { action, entityType, entityId, performedBy, severity, from, to, search } = req.query;

    const filter = {};
    const queryOptions = {};
    if (req.tenantId) {
      filter.tenantId = req.tenantId;
    } else if (req.user?.role === 'SUPER_ADMIN') {
      queryOptions.skipTenantIsolation = true;
    } else {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }

    if (action && typeof action === 'string') {
      filter.action = action.trim().toUpperCase();
    }

    if (entityType && typeof entityType === 'string') {
      filter.entityType = entityType.trim();
    }

    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) {
      filter.entityId = new mongoose.Types.ObjectId(entityId);
    }

    if (performedBy && mongoose.Types.ObjectId.isValid(performedBy)) {
      filter.performedBy = new mongoose.Types.ObjectId(performedBy);
    }

    if (severity && ['INFO', 'WARNING', 'CRITICAL'].includes(severity.toUpperCase())) {
      filter.severity = severity.toUpperCase();
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) filter.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) filter.createdAt.$lte = toDate;
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { 'changes.summary': { $regex: escaped, $options: 'i' } },
        { performedByName: { $regex: escaped, $options: 'i' } },
        { action: { $regex: escaped, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      AuditLog.find(filter)
        .setOptions(queryOptions)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter, queryOptions)
    ]);

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const sanitized = activities.map((item) => {
      if (!isAdmin) {
        const { ipAddress, userAgent, ...rest } = item;
        return rest;
      }
      return item;
    });

    res.json({
      success: true,
      activities: sanitized,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    logger.error('Error fetching activity log:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve activity logs' });
  }
});

/**
 * GET /api/activity/entity/:type/:id
 * Retrieve activity history for a specific entity (e.g. Item, PurchaseOrder, SalesOrder)
 * Allowed: ADMIN, MANAGER
 */
router.get('/entity/:type/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const { type, id } = req.params;
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

    const filter = {
      entityType: type,
      entityId: new mongoose.Types.ObjectId(id)
    };

    const queryOptions = {};
    if (req.tenantId) {
      filter.tenantId = req.tenantId;
    } else if (req.user?.role === 'SUPER_ADMIN') {
      queryOptions.skipTenantIsolation = true;
    } else {
      return res.status(403).json({ success: false, error: 'Tenant context required' });
    }

    const activities = await AuditLog.find(filter)
      .setOptions(queryOptions)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
    const sanitized = activities.map((item) => {
      if (!isAdmin) {
        const { ipAddress, userAgent, ...rest } = item;
        return rest;
      }
      return item;
    });

    res.json({
      success: true,
      activities: sanitized,
      count: sanitized.length
    });
  } catch (error) {
    logger.error('Error fetching entity activity:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve entity activity' });
  }
});

module.exports = router;
