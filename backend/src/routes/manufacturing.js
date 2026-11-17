/**
 * Manufacturing & MRP Express Routes
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET  /api/manufacturing/bom/explode/:itemId  Recursive multi-level BOM explosion
 * - GET  /api/manufacturing/work-centers         List shop-floor work centers
 * - POST /api/manufacturing/work-centers         Create/configure work center
 * - POST /api/manufacturing/mrp/run             Execute Net Material Requirements engine
 * - POST /api/manufacturing/mrp/execute         1-Click execute suggested WOs and POs
 * - GET  /api/manufacturing/routing/:kitId      Operation routings for an assembly
 * - POST /api/manufacturing/routing/:kitId      Save operation steps and work center bindings
 * - POST /api/manufacturing/work-orders/:id/progress Advance operation on shop floor
 */

const express = require('express');
const router = express.Router();

const WorkCenter = require('../models/WorkCenter');
const Kit = require('../models/Kit');
const WorkOrder = require('../models/WorkOrder');
const mrpService = require('../services/mrp.service');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('manufacturing', 'FULL_ACCESS'));

// ── GET /api/manufacturing/bom/explode/:itemId — Multi-Level BOM ───
router.get('/bom/explode/:itemId', async (req, res) => {
  try {
    const qty = Math.max(1, parseFloat(req.query.qty) || 1);
    const bomTree = await mrpService.explodeBom(req.tenantId, req.params.itemId, qty);

    if (!bomTree) {
      return res.status(404).json({ success: false, error: 'Item or BOM definition not found' });
    }

    res.json({ success: true, bom: bomTree });
  } catch (err) {
    logger.error('Explode BOM error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/manufacturing/work-centers — List Work Centers ────────
router.get('/work-centers', async (req, res) => {
  try {
    const workCenters = await WorkCenter.find({ tenantId: req.tenantId })
      .sort({ code: 1 })
      .lean();

    res.json({ success: true, workCenters });
  } catch (err) {
    logger.error('List work centers error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/manufacturing/work-centers — Create Work Center ──────
router.post('/work-centers', async (req, res) => {
  try {
    const {
      code,
      name,
      hourlyCost = 500,
      capacityHoursPerDay = 16,
      efficiencyPercent = 85,
      description = '',
      status = 'ACTIVE'
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, error: 'code and name are required' });
    }

    const existing = await WorkCenter.findOne({
      code: code.trim().toUpperCase(),
      tenantId: req.tenantId
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Work Center with code ${code} already exists`
      });
    }

    const workCenter = new WorkCenter({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      hourlyCost: Number(hourlyCost) || 500,
      capacityHoursPerDay: Number(capacityHoursPerDay) || 16,
      efficiencyPercent: Number(efficiencyPercent) || 85,
      description: description.trim(),
      status,
      tenantId: req.tenantId
    });

    await workCenter.save();

    res.status(201).json({
      success: true,
      message: `Work Center ${workCenter.code} (${workCenter.name}) created successfully`,
      workCenter
    });
  } catch (err) {
    logger.error('Create work center error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/manufacturing/mrp/run — Run Net Requirements ─────────
router.post('/mrp/run', async (req, res) => {
  try {
    const { includeSafetyStock = true, horizonDays = 60 } = req.body;
    const mrpResult = await mrpService.runMrp(req.tenantId, {
      includeSafetyStock,
      horizonDays
    });

    res.json({
      success: true,
      mrp: mrpResult
    });
  } catch (err) {
    logger.error('Run MRP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/manufacturing/mrp/execute — Execute Suggestions ──────
router.post('/mrp/execute', async (req, res) => {
  try {
    const { workOrders = [], purchaseOrders = [] } = req.body;

    if (workOrders.length === 0 && purchaseOrders.length === 0) {
      return res.status(400).json({ success: false, error: 'No work orders or purchase orders selected for execution' });
    }

    const result = await mrpService.executeSuggestions(
      req.tenantId,
      { workOrders, purchaseOrders },
      req.userId
    );

    res.status(201).json(result);
  } catch (err) {
    logger.error('Execute MRP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/manufacturing/routing/:kitId — Operation Routings ─────
router.get('/routing/:kitId', async (req, res) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.kitId, tenantId: req.tenantId })
      .populate('routingOperations.workCenterId', 'code name hourlyCost')
      .populate('parentItemId', 'name sku')
      .lean();

    if (!kit) {
      return res.status(404).json({ success: false, error: 'Kit / Assembly not found' });
    }

    res.json({
      success: true,
      kitId: kit._id,
      parentItem: kit.parentItemId,
      routingOperations: kit.routingOperations || []
    });
  } catch (err) {
    logger.error('Get routing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/manufacturing/routing/:kitId — Save Operations ───────
router.post('/routing/:kitId', async (req, res) => {
  try {
    const { routingOperations = [], manufacturingLeadTimeDays = 3 } = req.body;

    const kit = await Kit.findOne({ _id: req.params.kitId, tenantId: req.tenantId });
    if (!kit) {
      return res.status(404).json({ success: false, error: 'Kit / Assembly not found' });
    }

    kit.routingOperations = routingOperations;
    kit.manufacturingLeadTimeDays = Number(manufacturingLeadTimeDays) || 3;
    await kit.save();

    res.json({
      success: true,
      message: `Saved ${routingOperations.length} routing operations for ${kit.name}`,
      kit
    });
  } catch (err) {
    logger.error('Save routing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

