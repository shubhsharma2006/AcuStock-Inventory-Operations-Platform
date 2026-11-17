/**
 * Picking Waves & Put-Wall Sorting Express Route
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET  /api/picking-waves              List picking waves with filters
 * - POST /api/picking-waves/generate     Cluster open Sales Orders into an S-Shape wave
 * - GET  /api/picking-waves/:id          Detailed wave traversal sequence & put-wall state
 * - POST /api/picking-waves/:id/release  Assign picker and release wave to floor
 * - POST /api/picking-waves/:id/pick-item Validate scanner and record picked line item
 * - GET  /api/picking-waves/:id/put-wall Live put-wall 24-cubby matrix
 * - POST /api/picking-waves/:id/sort-item Scan item at put-wall & route to order cubby
 * - POST /api/picking-waves/:id/complete-cubby/:cubbyNumber Seal order and mark ready to ship
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const PickingWave = require('../models/PickingWave');
const SalesOrder = require('../models/SalesOrder');
const Item = require('../models/Item');
const WarehouseLocation = require('../models/WarehouseLocation');
const Counter = require('../models/Counter');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('picking-waves', 'FULL_ACCESS'));

/**
 * Computes S-Shape / Snake traversal sequence from bin code.
 * Standard format: Aisle-Rack-Shelf-Bin (e.g. A01-R02-S03-B01)
 */
function calculateSShapeSequence(binCode = '') {
  const clean = String(binCode).toUpperCase().trim();
  const match = clean.match(/A?(\d+)[-_]R?(\d+)[-_]S?(\d+)/i) || clean.match(/(\d+)/g);

  let aisle = 1;
  let rack = 1;
  let shelf = 1;

  if (match && match.length >= 4) {
    aisle = parseInt(match[1], 10) || 1;
    rack = parseInt(match[2], 10) || 1;
    shelf = parseInt(match[3], 10) || 1;
  } else if (match && match.length >= 2) {
    aisle = parseInt(match[0], 10) || 1;
    rack = parseInt(match[1], 10) || 1;
  }

  // Snake traversal: If aisle is even, traverse rack ascending; if odd, rack descending
  const isEvenAisle = aisle % 2 === 0;
  const effectiveRack = isEvenAisle ? rack : Math.max(1, 100 - rack);

  return aisle * 10000 + effectiveRack * 100 + shelf;
}

// ── GET /api/picking-waves — List Waves ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, waveType, page = 1, limit = 20 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status) filter.status = status;
    if (waveType) filter.waveType = waveType;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const [waves, total] = await Promise.all([
      PickingWave.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('assignedPicker', 'name email')
        .lean(),
      PickingWave.countDocuments(filter)
    ]);

    res.json({
      success: true,
      waves,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    logger.error('List picking waves error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/picking-waves/generate — Auto-Cluster Open Orders ────
router.post('/generate', async (req, res) => {
  try {
    const {
      warehouseId,
      maxOrders = 12,
      waveType = 'BATCH',
      criteria = 'ALL',
      carrier = '',
      notes = ''
    } = req.body;

    // 1. Fetch eligible open Sales Orders
    const soFilter = {
      tenantId: req.tenantId,
      status: { $in: ['confirmed', 'allocated', 'processing', 'draft'] }
    };

    let candidateOrders = await SalesOrder.find(soFilter)
      .sort({ createdAt: 1 })
      .populate('items.productId')
      .populate('companyId', 'name')
      .lean();

    if (candidateOrders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No unfulfilled sales orders available to generate picking wave'
      });
    }

    // Apply filtering criteria
    if (criteria === 'SINGLE_ITEM_ONLY') {
      candidateOrders = candidateOrders.filter((o) => (o.items || []).length === 1);
    } else if (criteria === 'MULTI_ITEM_ONLY') {
      candidateOrders = candidateOrders.filter((o) => (o.items || []).length > 1);
    }

    if (carrier) {
      candidateOrders = candidateOrders.filter((o) =>
        String(o.carrier || '').toLowerCase() === carrier.toLowerCase()
      );
    }

    const selectedOrders = candidateOrders.slice(0, Math.min(parseInt(maxOrders, 10) || 12, 24));

    if (selectedOrders.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No orders matched criteria: ${criteria}${carrier ? ` (${carrier})` : ''}`
      });
    }

    // 2. Consolidate pick lines across all selected orders
    const productAggMap = new Map();

    for (const order of selectedOrders) {
      for (const it of order.items || []) {
        const pId = String(it.productId?._id || it.productId);
        const sku = it.productId?.sku || it.sku || 'SKU-GEN';
        const name = it.productId?.name || it.name || 'Product';
        const barcode = it.productId?.barcode || it.barcode || sku;
        const binCode = it.binLocation || it.productId?.binLocation || 'A01-R01-S01-B01';
        const qty = Number(it.quantity) || 1;

        if (productAggMap.has(pId)) {
          productAggMap.get(pId).requiredQty += qty;
        } else {
          productAggMap.set(pId, {
            productId: pId,
            sku,
            name,
            barcode,
            binCode,
            requiredQty: qty,
            sequenceOrder: calculateSShapeSequence(binCode)
          });
        }
      }
    }

    // Sort pick items by S-Shape sequence
    const pickItems = Array.from(productAggMap.values()).sort(
      (a, b) => a.sequenceOrder - b.sequenceOrder
    );

    // 3. Setup Put-Wall cubbies (1 slot per order)
    const cubbies = selectedOrders.map((order, idx) => ({
      cubbyNumber: idx + 1,
      salesOrderId: order._id,
      orderNumber: order.soNumber || order.orderNumber || `SO-${order._id.toString().slice(-6)}`,
      customerName: order.companyId?.name || order.customerName || 'B2B Customer',
      requiredItems: (order.items || []).map((it) => ({
        productId: it.productId?._id || it.productId,
        sku: it.productId?.sku || it.sku,
        name: it.productId?.name || it.name,
        quantity: Number(it.quantity) || 1
      })),
      sortedItems: [],
      status: 'ASSIGNED'
    }));

    // 4. Generate unique monotonic Wave sequence number
    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(req.tenantId, 'PICKING_WAVE', `WAVE-${currentYear}`, 4);

    const wave = new PickingWave({
      waveNumber: seq,
      warehouseId: warehouseId || null,
      waveType,
      status: 'PLANNED',
      salesOrderIds: selectedOrders.map((o) => o._id),
      pickItems,
      putWall: {
        wallId: `PW-${Math.floor(10 + Math.random() * 90)}`,
        totalCubbies: 24,
        cubbies
      },
      metrics: {
        totalLines: pickItems.length,
        pickedLines: 0,
        totalUnits: pickItems.reduce((acc, p) => acc + p.requiredQty, 0),
        pickedUnits: 0
      },
      notes,
      tenantId: req.tenantId
    });

    await wave.save();

    res.status(201).json({
      success: true,
      message: `Picking Wave ${seq} generated with ${selectedOrders.length} orders and ${pickItems.length} consolidated pick lines`,
      wave
    });
  } catch (err) {
    logger.error('Generate wave error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/picking-waves/:id — Detailed Traversal Sequence ─────────
router.get('/:id', async (req, res) => {
  try {
    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('salesOrderIds', 'soNumber orderNumber status totalAmount')
      .populate('assignedPicker', 'name email')
      .lean();

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    res.json({ success: true, wave });
  } catch (err) {
    logger.error('Get picking wave detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/picking-waves/:id/release — Release to Floor ─────────
router.post('/:id/release', async (req, res) => {
  try {
    const { assignedPickerId } = req.body;
    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    wave.status = 'RELEASED';
    if (assignedPickerId) {
      wave.assignedPicker = assignedPickerId;
    }
    wave.metrics.startedAt = new Date();

    await wave.save();

    res.json({
      success: true,
      message: `Wave ${wave.waveNumber} released to warehouse floor`,
      wave
    });
  } catch (err) {
    logger.error('Release wave error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/picking-waves/:id/pick-item — Scanner Event ──────────
router.post('/:id/pick-item', async (req, res) => {
  try {
    const {
      pickItemId,
      scannedBin,
      scannedSku,
      pickedQty = 1,
      toteBarcode = '',
      isShortPick = false,
      shortPickReason = ''
    } = req.body;

    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    const item = wave.pickItems.id(pickItemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Pick line item not found in wave' });
    }

    // Verify SKU / barcode if provided
    if (scannedSku && item.sku.toLowerCase() !== scannedSku.toLowerCase() && (item.barcode || '').toLowerCase() !== scannedSku.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: `Scanned item (${scannedSku}) does not match expected SKU (${item.sku})`
      });
    }

    if (isShortPick) {
      item.status = 'SHORT_PICKED';
      item.shortPickReason = shortPickReason || 'Insufficient shelf inventory';
      item.pickedQty = Math.min(item.requiredQty, Number(pickedQty) || 0);
    } else {
      item.pickedQty = Math.min(item.requiredQty, (item.pickedQty || 0) + (Number(pickedQty) || 1));
      if (item.pickedQty >= item.requiredQty) {
        item.status = 'PICKED';
      } else {
        item.status = 'IN_PROGRESS';
      }
    }

    if (toteBarcode) {
      item.toteBarcode = toteBarcode;
    }

    // Recompute metrics
    const totalLines = wave.pickItems.length;
    const pickedLines = wave.pickItems.filter((i) => i.status === 'PICKED' || i.status === 'SHORT_PICKED').length;
    const totalUnits = wave.pickItems.reduce((acc, p) => acc + p.requiredQty, 0);
    const pickedUnits = wave.pickItems.reduce((acc, p) => acc + (p.pickedQty || 0), 0);

    wave.metrics.totalLines = totalLines;
    wave.metrics.pickedLines = pickedLines;
    wave.metrics.totalUnits = totalUnits;
    wave.metrics.pickedUnits = pickedUnits;

    if (pickedLines === totalLines) {
      wave.status = 'PICKED';
    } else {
      wave.status = 'IN_PROGRESS';
    }

    await wave.save();

    res.json({
      success: true,
      message: `Item ${item.sku} pick recorded (${item.pickedQty}/${item.requiredQty})`,
      item,
      metrics: wave.metrics,
      waveStatus: wave.status
    });
  } catch (err) {
    logger.error('Pick item error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/picking-waves/:id/put-wall — Live Put-Wall Matrix ─────
router.get('/:id/put-wall', async (req, res) => {
  try {
    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .select('waveNumber status putWall')
      .lean();

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    res.json({
      success: true,
      waveNumber: wave.waveNumber,
      waveStatus: wave.status,
      putWall: wave.putWall
    });
  } catch (err) {
    logger.error('Get put wall error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/picking-waves/:id/sort-item — Put-Wall Scan Router ───
router.post('/:id/sort-item', async (req, res) => {
  try {
    const { scannedBarcode } = req.body;

    if (!scannedBarcode) {
      return res.status(400).json({ success: false, error: 'scannedBarcode is required' });
    }

    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    const cleanCode = String(scannedBarcode).trim().toLowerCase();

    // Find product definition in pickItems
    const matchedProduct = wave.pickItems.find(
      (p) => p.sku.toLowerCase() === cleanCode || (p.barcode || '').toLowerCase() === cleanCode
    );

    if (!matchedProduct) {
      return res.status(404).json({
        success: false,
        error: `Item with barcode/SKU ${scannedBarcode} is not part of this picking wave`
      });
    }

    // Locate candidate cubby that requires this product and has pending units
    let candidateCubby = null;

    for (const cubby of wave.putWall.cubbies) {
      if (cubby.status === 'CLOSED') continue;

      const reqLine = cubby.requiredItems.find(
        (r) => String(r.productId) === String(matchedProduct.productId) || r.sku.toLowerCase() === matchedProduct.sku.toLowerCase()
      );

      if (reqLine) {
        const sortedCount = cubby.sortedItems.filter(
          (s) => String(s.productId) === String(matchedProduct.productId) || s.sku.toLowerCase() === matchedProduct.sku.toLowerCase()
        ).length;

        if (sortedCount < reqLine.quantity) {
          candidateCubby = cubby;
          break;
        }
      }
    }

    if (!candidateCubby) {
      return res.status(400).json({
        success: false,
        error: `No open order cubby requires additional units of SKU ${matchedProduct.sku}`
      });
    }

    // Record the sorted item in this cubby
    candidateCubby.sortedItems.push({
      productId: matchedProduct.productId,
      sku: matchedProduct.sku,
      name: matchedProduct.name,
      quantity: 1,
      sortedAt: new Date()
    });

    // Check if all required items for this order are now satisfied
    const totalRequired = candidateCubby.requiredItems.reduce((acc, r) => acc + (r.quantity || 1), 0);
    const totalSorted = candidateCubby.sortedItems.length;

    const isOrderComplete = totalSorted >= totalRequired;

    if (isOrderComplete) {
      candidateCubby.status = 'READY_TO_PACK';
    } else {
      candidateCubby.status = 'IN_PROGRESS';
    }

    wave.status = 'SORTING';
    await wave.save();

    res.json({
      success: true,
      cubbyNumber: candidateCubby.cubbyNumber,
      orderNumber: candidateCubby.orderNumber,
      customerName: candidateCubby.customerName,
      sku: matchedProduct.sku,
      productName: matchedProduct.name,
      totalRequired,
      totalSorted,
      isOrderComplete,
      message: isOrderComplete
        ? `Order #${candidateCubby.orderNumber} in Cubby ${candidateCubby.cubbyNumber} is 100% COMPLETE! Ready to pack.`
        : `Place in Cubby ${candidateCubby.cubbyNumber} (${totalSorted}/${totalRequired})`
    });
  } catch (err) {
    logger.error('Put wall sort item error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/picking-waves/:id/complete-cubby/:cubbyNumber ───────
router.post('/:id/complete-cubby/:cubbyNumber', async (req, res) => {
  try {
    const wave = await PickingWave.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!wave) {
      return res.status(404).json({ success: false, error: 'Picking wave not found' });
    }

    const cubbyNum = parseInt(req.params.cubbyNumber, 10);
    const cubby = wave.putWall.cubbies.find((c) => c.cubbyNumber === cubbyNum);

    if (!cubby) {
      return res.status(404).json({ success: false, error: `Cubby ${cubbyNum} not found` });
    }

    cubby.status = 'CLOSED';

    // Update SalesOrder status
    await SalesOrder.updateOne(
      { _id: cubby.salesOrderId, tenantId: req.tenantId },
      { $set: { status: 'picked', fulfillmentStatus: 'READY_TO_PACK' } }
    );

    // If all cubbies are closed, mark wave COMPLETED
    const allClosed = wave.putWall.cubbies.every((c) => c.status === 'CLOSED');
    if (allClosed) {
      wave.status = 'COMPLETED';
      wave.metrics.completedAt = new Date();
    }

    await wave.save();

    res.json({
      success: true,
      message: `Cubby ${cubbyNum} sealed and order #${cubby.orderNumber} marked ready for packaging`,
      cubbyStatus: cubby.status,
      waveStatus: wave.status
    });
  } catch (err) {
    logger.error('Complete cubby error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

