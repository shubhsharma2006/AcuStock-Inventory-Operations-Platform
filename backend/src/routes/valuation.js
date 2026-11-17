const express = require('express');
const mongoose = require('mongoose');
const ValuationService = require('../services/valuation.service');
const LandedCostService = require('../services/landedCost.service');
const LandedCost = require('../models/LandedCost');
const Item = require('../models/Item');
const PurchaseOrder = require('../models/PurchaseOrder');
const Counter = require('../models/Counter');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/valuation/inventory-value
 * Summary of inventory valuation across tenant
 */
router.get('/inventory-value', requireAuth, async (req, res) => {
  try {
    const { warehouseId, method } = req.query;
    const valuation = await ValuationService.getInventoryValuation(req.tenantId, {
      warehouseId,
      method
    });
    res.json({ success: true, ...valuation });
  } catch (error) {
    logger.error('Error fetching inventory valuation', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/valuation/item/:productId
 * Individual item valuation breakdown (WAC, cost layers, PPV if standard)
 */
router.get('/item/:productId', requireAuth, validateObjectId('productId'), async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.productId, tenantId: req.tenantId })
      .select('name sku uom valuationMethod currentWAC standardCost purchasePrice salesPrice costLayers baseCurrency')
      .lean();

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const variance = item.valuationMethod === 'STANDARD'
      ? ValuationService.calculatePPV(item.standardCost, item.purchasePrice, 1)
      : null;

    res.json({
      success: true,
      item,
      variance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/valuation/recalculate/:productId
 * Replay historical receipts to recalculate valuation
 */
router.post('/recalculate/:productId', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('productId'), async (req, res) => {
  try {
    const result = await ValuationService.recalculateItemValuation(req.tenantId, req.params.productId);
    res.json({ success: true, message: 'Valuation recalculated successfully', ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/valuation/landed-cost/apportion
 * Preview apportionment of landed costs across PO line items
 */
router.post('/landed-cost/apportion', requireAuth, async (req, res) => {
  try {
    const { poLines, components, exchangeRate, baseCurrency, poCurrency } = req.body;
    const apportionment = LandedCostService.calculateApportionment(poLines, components, {
      exchangeRate,
      baseCurrency,
      poCurrency
    });
    res.json({ success: true, ...apportionment });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/valuation/landed-cost
 * Save landed cost draft for a Purchase Order
 */
router.post('/landed-cost', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { purchaseOrderId, components, exchangeRate = 1.0, poCurrency, baseCurrency, notes } = req.body;

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, tenantId: req.tenantId }).lean();
    if (!po) {
      return res.status(404).json({ success: false, message: 'Purchase Order not found' });
    }

    const poLines = (po.items || []).map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice
    }));

    const result = LandedCostService.calculateApportionment(poLines, components, {
      exchangeRate,
      poCurrency: poCurrency || po.currency || 'INR',
      baseCurrency: baseCurrency || 'INR'
    });

    const landedCostNumber = `LC-${Date.now().toString().slice(-6)}`;

    const landedCost = await LandedCost.create({
      landedCostNumber,
      purchaseOrderId,
      tenantId: req.tenantId,
      poCurrency: result.poCurrency,
      baseCurrency: result.baseCurrency,
      exchangeRate: result.exchangeRate,
      components,
      totalLandedCost: result.totalLandedCost,
      lineAllocations: result.lineAllocations,
      notes,
      createdBy: req.userId
    });

    res.status(201).json({ success: true, landedCost });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/valuation/landed-cost/:id/finalize
 * Finalize landed cost and update product cost layers
 */
router.post('/landed-cost/:id/finalize', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const finalized = await LandedCostService.finalizeLandedCost(req.tenantId, req.params.id, req.userId);
    res.json({ success: true, message: 'Landed cost finalized and cost layers updated', landedCost: finalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

