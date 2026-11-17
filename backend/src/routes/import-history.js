const express = require('express');
const mongoose = require('mongoose');
const ImportHistory = require('../models/ImportHistory');
const Item = require('../models/Item');
const Company = require('../models/Company');
const WarehouseLocation = require('../models/WarehouseLocation');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/import-history
 * List past bulk imports
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { entityType, page = 1, limit = 20 } = req.query;
    const filter = { tenantId: req.tenantId };
    if (entityType) filter.entityType = entityType.toUpperCase();

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [imports, total] = await Promise.all([
      ImportHistory.find(filter)
        .populate('createdBy', 'name email role')
        .populate('rolledBackBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('-errors') // Exclude heavy errors array from list view
        .lean(),
      ImportHistory.countDocuments(filter)
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      imports
    });
  } catch (error) {
    logger.error('Error listing import history', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/import-history/:id
 * Retrieve specific import batch with full error log
 */
router.get('/:id', requireAuth, validateObjectId('id'), async (req, res) => {
  try {
    const importRecord = await ImportHistory.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('createdBy', 'name email role')
      .populate('rolledBackBy', 'name email role')
      .lean();

    if (!importRecord) {
      return res.status(404).json({ success: false, message: 'Import history record not found' });
    }

    res.json({ success: true, importRecord });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/import-history/:id/rollback
 * Soft delete or remove records created in this import batch
 */
router.post('/:id/rollback', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const importRecord = await ImportHistory.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!importRecord) {
      return res.status(404).json({ success: false, message: 'Import record not found' });
    }

    if (importRecord.isRolledBack) {
      return res.status(400).json({ success: false, message: 'This import batch has already been rolled back.' });
    }

    const idsToRollback = importRecord.importedRecordIds || [];
    let deletedCount = 0;

    if (idsToRollback.length > 0) {
      switch (importRecord.entityType) {
        case 'PRODUCTS':
          const itemRes = await Item.updateMany(
            { _id: { $in: idsToRollback }, tenantId: req.tenantId },
            { $set: { isActive: false, isDeleted: true } }
          );
          deletedCount = itemRes.modifiedCount;
          break;
        case 'COMPANIES':
          const compRes = await Company.updateMany(
            { _id: { $in: idsToRollback }, tenantId: req.tenantId },
            { $set: { isActive: false } }
          );
          deletedCount = compRes.modifiedCount;
          break;
        case 'LOCATIONS':
          const locRes = await WarehouseLocation.updateMany(
            { _id: { $in: idsToRollback }, tenantId: req.tenantId },
            { $set: { isActive: false } }
          );
          deletedCount = locRes.modifiedCount;
          break;
        default:
          return res.status(400).json({ success: false, message: `Rollback not supported for entity type ${importRecord.entityType}` });
      }
    }

    importRecord.isRolledBack = true;
    importRecord.rolledBackAt = new Date();
    importRecord.rolledBackBy = req.userId;
    importRecord.status = 'ROLLED_BACK';
    await importRecord.save();

    res.json({
      success: true,
      message: `Successfully rolled back import ${importRecord.importNumber}. Deactivated ${deletedCount} records.`,
      deletedCount
    });
  } catch (error) {
    logger.error('Error rolling back import', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

