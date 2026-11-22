const express = require('express');
const mongoose = require('mongoose');
const StockTransfer = require('../models/StockTransfer');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const Counter = require('../models/Counter');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const { notifyRoles } = require('../services/notificationHelper');

const router = express.Router();
router.use(requireTenantId);

// Helper: Calculate current stock of product at specific warehouse
async function getWarehouseStock(warehouseId, productId, tenantId, session = null) {
  const matchFilter = {
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    productId: new mongoose.Types.ObjectId(productId),
    isDeleted: false
  };
  matchFilter.tenantId = new mongoose.Types.ObjectId(tenantId);

  const agg = StockLedger.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN']] }, '$quantity', { $multiply: ['$quantity', -1] }]
          }
        }
      }
    }
  ]);

  if (session) agg.session(session);
  const result = await agg;
  return result.length > 0 ? Math.max(0, result[0].total) : 0;
}

/**
 * Helper to execute multi-document mutations atomically within a MongoDB session.
 * Falls back to non-transactional execution only if running in standalone test mode without replica sets.
 */
async function executeWithTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
    } catch (txErr) {
      if (txErr.message && txErr.message.includes('replica set member')) {
        result = await fn(null);
      } else {
        throw txErr;
      }
    }
    return result;
  } finally {
    session.endSession();
  }
}

// GET /api/stock-transfers - List transfers
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, fromWarehouse, toWarehouse, page = 1, limit = 50 } = req.query;
    const filter = {};
    filter.tenantId = req.tenantId;
    if (status) filter.status = status;
    if (fromWarehouse) filter.fromWarehouse = fromWarehouse;
    if (toWarehouse) filter.toWarehouse = toWarehouse;

    // Branch scoping: Non-admins only see transfers involving their assigned warehouse
    if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      filter.$or = [
        { fromWarehouse: req.user.assignedWarehouseId },
        { toWarehouse: req.user.assignedWarehouseId }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [transfers, total] = await Promise.all([
      StockTransfer.find(filter)
        .populate('fromWarehouse', 'name code')
        .populate('toWarehouse', 'name code')
        .populate('transporterId', 'name code trackingUrlPattern')
        .populate('requestedBy', 'name email')
        .populate('approvedBy', 'name email')
        .populate('items.product', 'name sku uom')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StockTransfer.countDocuments(filter)
    ]);

    res.json({
      transfers,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock-transfers/:id - Single transfer
router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    filter.tenantId = req.tenantId;

    const transfer = await StockTransfer.findOne(filter)
      .populate('fromWarehouse', 'name code address contactPerson phone')
      .populate('toWarehouse', 'name code address contactPerson phone')
      .populate('transporterId', 'name code trackingUrlPattern contactPerson phone email')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('shippedBy', 'name email')
      .populate('receivedBy', 'name email')
      .populate('cancelledBy', 'name email')
      .populate('items.product', 'name shortName sku barcode uom salesPrice purchasePrice');

    if (!transfer) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }

    res.json(transfer);
  } catch (error) {
    console.error('Error fetching stock transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/stock-transfers - Create transfer request (DRAFT)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { fromWarehouse, toWarehouse, items, notes } = req.body;

    if (!fromWarehouse || !toWarehouse) {
      return res.status(400).json({ message: 'Both source and destination warehouses are required' });
    }
    if (String(fromWarehouse) === String(toWarehouse)) {
      return res.status(400).json({ message: 'Source and destination warehouses cannot be the same' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one product item is required' });
    }

    // Branch Scoping: Non-admin users can only initiate transfers from their assigned warehouse
    if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      if (String(fromWarehouse) !== String(req.user.assignedWarehouseId)) {
        return res.status(403).json({ message: 'Forbidden: You can only initiate transfers from your assigned warehouse branch.' });
      }
    }

    // Validate warehouse ownership
    const [fromWh, toWh] = await Promise.all([
      Warehouse.findOne({ _id: fromWarehouse, tenantId: req.tenantId, isActive: true }),
      Warehouse.findOne({ _id: toWarehouse, tenantId: req.tenantId, isActive: true })
    ]);
    if (!fromWh) return res.status(404).json({ message: 'Source warehouse not found or inactive' });
    if (!toWh) return res.status(404).json({ message: 'Destination warehouse not found or inactive' });

    // Validate items
    const parsedItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product || !mongoose.Types.ObjectId.isValid(it.product)) {
        return res.status(400).json({ message: `Invalid product ID at index ${i}` });
      }
      const qty = Number(it.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ message: `Quantity must be positive at index ${i}` });
      }
      parsedItems.push({
        product: it.product,
        quantity: qty,
        serialNumbers: Array.isArray(it.serialNumbers) ? it.serialNumbers.map(s => String(s).trim().toUpperCase()) : []
      });
    }

    // Generate sequence number
    let transferNumber;
    try {
      transferNumber = await Counter.getNextSequence(req.tenantId, 'TRANSFER', 'TRF', 6);
    } catch (cErr) {
      transferNumber = `TRF-${Date.now().toString().slice(-6)}`;
    }

    const transfer = new StockTransfer({
      transferNumber,
      fromWarehouse,
      toWarehouse,
      status: 'DRAFT',
      items: parsedItems,
      requestedBy: req.user._id,
      notes: notes ? String(notes).trim() : undefined,
      tenantId: req.tenantId
    });

    await transfer.save();
    res.status(201).json(transfer);
  } catch (error) {
    console.error('Error creating stock transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/approve - Approve transfer
router.put('/:id/approve', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transfer = await StockTransfer.findOne(filter);
    if (!transfer) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }
    if (transfer.status !== 'DRAFT') {
      return res.status(400).json({ message: `Cannot approve transfer in status '${transfer.status}'` });
    }

    transfer.status = 'APPROVED';
    transfer.approvedBy = req.user._id;
    transfer.approvedAt = new Date();
    await transfer.save();

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'system',
      title: `Transfer Approved: ${transfer.transferNumber}`,
      message: `Stock transfer ${transfer.transferNumber} has been approved and is ready to ship.`,
      link: 'stock-transfers',
      priority: 'MEDIUM',
      tenantId: req.tenantId,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      metadata: { transferNumber: transfer.transferNumber }
    }).catch(() => {});

    res.json({ message: 'Transfer approved successfully', transfer });
  } catch (error) {
    console.error('Error approving transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/ship - Mark IN_TRANSIT & create TRANSFER_OUT ledger
router.put('/:id/ship', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const { transporterId, trackingNumber, estimatedArrival } = req.body;

    const transfer = await executeWithTransaction(async (session) => {
      const q = StockTransfer.findOne(filter);
      if (session) q.session(session);
      const trf = await q;

      if (!trf) {
        const err = new Error('Stock transfer not found');
        err.statusCode = 404;
        throw err;
      }
      if (trf.status !== 'APPROVED') {
        const err = new Error(`Cannot ship transfer in status '${trf.status}'. It must be APPROVED first.`);
        err.statusCode = 400;
        throw err;
      }

      // Branch Scoping: Non-admin users can only ship transfers originating from their assigned warehouse
      if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        if (String(trf.fromWarehouse) !== String(req.user.assignedWarehouseId)) {
          const err = new Error('Forbidden: Only the originating warehouse can dispatch this transfer.');
          err.statusCode = 403;
          throw err;
        }
      }

      // Optional logistics info
      if (transporterId) trf.transporterId = transporterId;
      if (trackingNumber) trf.trackingNumber = String(trackingNumber).trim().toUpperCase();
      if (estimatedArrival) trf.estimatedArrival = new Date(estimatedArrival);

      // Verify stock availability at source warehouse within transaction
      for (const it of trf.items) {
        const availStock = await getWarehouseStock(trf.fromWarehouse, it.product, trf.tenantId, session);
        if (availStock < it.quantity) {
          const itemQuery = Item.findOne({ _id: it.product, tenantId: trf.tenantId });
          if (session) itemQuery.session(session);
          const prod = await itemQuery;
          const name = prod ? prod.name : it.product;
          const err = new Error(`Insufficient stock at source warehouse for '${name}'. Available: ${availStock}, Required: ${it.quantity}`);
          err.statusCode = 400;
          throw err;
        }
      }

      // Create TRANSFER_OUT ledger records for each item atomically
      for (const it of trf.items) {
        const outLedger = new StockLedger({
          productId: it.product,
          warehouseId: trf.fromWarehouse,
          transferId: trf._id,
          type: 'TRANSFER_OUT',
          quantity: it.quantity,
          serialNumbers: it.serialNumbers || [],
          createdBy: req.user._id,
          role: req.user.role,
          notes: `Transfer out: ${trf.transferNumber}`,
          tenantId: trf.tenantId
        });
        await outLedger.save(session ? { session } : {});
      }

      trf.status = 'IN_TRANSIT';
      trf.shippedBy = req.user._id;
      trf.shippedAt = new Date();
      await trf.save(session ? { session } : {});
      return trf;
    });

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'system',
      title: `Transfer In Transit: ${transfer.transferNumber}`,
      message: `Stock transfer ${transfer.transferNumber} is now in transit to the destination warehouse.`,
      link: 'stock-transfers',
      priority: 'MEDIUM',
      tenantId: req.tenantId,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      metadata: { transferNumber: transfer.transferNumber }
    }).catch(() => {});

    res.json({ message: 'Stock dispatched and in transit', transfer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error shipping transfer:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/receive - Confirm receipt & create TRANSFER_IN ledger
router.put('/:id/receive', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'USER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };
    const { receivedItems, receiptNotes } = req.body;

    const transfer = await executeWithTransaction(async (session) => {
      const q = StockTransfer.findOne(filter);
      if (session) q.session(session);
      const trf = await q;

      if (!trf) {
        const err = new Error('Stock transfer not found');
        err.statusCode = 404;
        throw err;
      }
      if (trf.status !== 'IN_TRANSIT') {
        const err = new Error(`Cannot receive transfer in status '${trf.status}'. It must be IN_TRANSIT.`);
        err.statusCode = 400;
        throw err;
      }

      // Branch Scoping: Non-admin users can only confirm receipt for transfers destined to their assigned warehouse
      if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        if (String(trf.toWarehouse) !== String(req.user.assignedWarehouseId)) {
          const err = new Error('Forbidden: Only the destination warehouse can confirm receipt for this transfer.');
          err.statusCode = 403;
          throw err;
        }
      }

      let totalShortage = 0;

      // Apply received quantities with strict line ID matching and exact serial tracking
      for (let i = 0; i < trf.items.length; i++) {
        const it = trf.items[i];
        let recQty = it.quantity; // default full if not specified
        let recSerials = it.serialNumbers || [];
        let lineDiscrepancy = null;

        let userRec = null;
        if (Array.isArray(receivedItems)) {
          // Priority 1: Match strictly by transfer line ID (_id or lineId) to prevent same-SKU line collision
          userRec = receivedItems.find(r => 
            (r.lineId && String(r.lineId) === String(it._id)) ||
            (r._id && String(r._id) === String(it._id))
          );

          // Priority 2: Fallback to product only if no other line in this transfer shares the same SKU
          if (!userRec) {
            const linesWithSameProduct = trf.items.filter(item => String(item.product) === String(it.product));
            if (linesWithSameProduct.length === 1) {
              userRec = receivedItems.find(r => String(r.product) === String(it.product));
            }
          }

          if (userRec && userRec.receivedQuantity !== undefined) {
            const entered = Number(userRec.receivedQuantity);
            if (isNaN(entered) || entered < 0) {
              const err = new Error('Received quantity must be a non-negative number.');
              err.statusCode = 400;
              throw err;
            }
            // Strict upper-bound guard: Cannot receive more than shipped
            if (entered > it.quantity) {
              const err = new Error(`Received quantity (${entered}) cannot exceed shipped quantity (${it.quantity}) for product line.`);
              err.statusCode = 400;
              throw err;
            }
            recQty = entered;
            lineDiscrepancy = userRec.discrepancyNotes || userRec.shortageReason || null;

            // Exact serialized verification: If line is serialized, enforce exact count and membership
            if (Array.isArray(it.serialNumbers) && it.serialNumbers.length > 0) {
              if (Array.isArray(userRec.receivedSerials)) {
                if (userRec.receivedSerials.length !== recQty) {
                  const err = new Error(`Received serial count (${userRec.receivedSerials.length}) must match received quantity (${recQty}).`);
                  err.statusCode = 400;
                  throw err;
                }
                const shippedSet = new Set(it.serialNumbers);
                for (const s of userRec.receivedSerials) {
                  if (!shippedSet.has(s)) {
                    const err = new Error(`Serial number "${s}" was not in the shipped serial manifest.`);
                    err.statusCode = 400;
                    throw err;
                  }
                }
                recSerials = [...userRec.receivedSerials];
              } else {
                // If serial list not explicitly supplied, deterministically take exactly recQty serials
                recSerials = it.serialNumbers.slice(0, recQty);
              }
            } else {
              recSerials = [];
            }
          } else {
            // Default full receipt for this line
            recSerials = Array.isArray(it.serialNumbers) ? [...it.serialNumbers] : [];
          }
        }

        const shortage = Math.max(0, it.quantity - recQty);
        totalShortage += shortage;

        it.receivedQuantity = recQty;
        it.shortageQuantity = shortage;
        it.discrepancyNotes = lineDiscrepancy;
        it.receivedSerials = recSerials;

        // Create TRANSFER_IN ledger record atomically for received units
        if (recQty > 0) {
          const inLedger = new StockLedger({
            productId: it.product,
            warehouseId: trf.toWarehouse,
            transferId: trf._id,
            type: 'TRANSFER_IN',
            quantity: recQty,
            serialNumbers: recSerials || [],
            createdBy: req.user._id,
            role: req.user.role,
            notes: `Transfer in: ${trf.transferNumber}${shortage > 0 ? ` (Shortage: ${shortage})` : ''}`,
            tenantId: trf.tenantId
          });
          await inLedger.save(session ? { session } : {});
        }
      }

      trf.status = 'RECEIVED';
      trf.receivedBy = req.user._id;
      trf.receivedAt = new Date();
      if (receiptNotes) trf.receiptNotes = String(receiptNotes).trim();
      await trf.save(session ? { session } : {});
      return trf;
    });

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'order_completed',
      title: `Transfer Completed: ${transfer.transferNumber}`,
      message: `Stock transfer ${transfer.transferNumber} has been received at the destination warehouse.`,
      link: 'stock-transfers',
      priority: 'HIGH',
      tenantId: req.tenantId,
      createdBy: req.user._id,
      createdByRole: req.user.role,
      metadata: { transferNumber: transfer.transferNumber }
    }).catch(() => {});

    res.json({ message: 'Stock successfully received at destination warehouse', transfer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error receiving transfer:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/cancel - Cancel transfer (Atomic Transaction)
router.put('/:id/cancel', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transfer = await executeWithTransaction(async (session) => {
      const q = StockTransfer.findOne(filter);
      if (session) q.session(session);
      const trf = await q;

      if (!trf) {
        const err = new Error('Stock transfer not found');
        err.statusCode = 404;
        throw err;
      }
      if (trf.status === 'RECEIVED') {
        const err = new Error('Cannot cancel an already RECEIVED transfer');
        err.statusCode = 400;
        throw err;
      }
      if (trf.status === 'CANCELLED') {
        const err = new Error('Transfer is already cancelled');
        err.statusCode = 400;
        throw err;
      }

      // If transfer was IN_TRANSIT, reverse the stock back into fromWarehouse atomically!
      if (trf.status === 'IN_TRANSIT') {
        for (const it of trf.items) {
          const revertLedger = new StockLedger({
            productId: it.product,
            warehouseId: trf.fromWarehouse,
            transferId: trf._id,
            type: 'TRANSFER_IN',
            quantity: it.quantity,
            serialNumbers: it.serialNumbers || [],
            createdBy: req.user._id,
            role: req.user.role,
            notes: `Reversal on transfer cancellation: ${trf.transferNumber}`,
            tenantId: trf.tenantId
          });
          await revertLedger.save(session ? { session } : {});
        }
      }

      trf.status = 'CANCELLED';
      trf.cancelledBy = req.user._id;
      trf.cancelledAt = new Date();
      trf.cancelReason = req.body.reason ? String(req.body.reason).trim() : 'Cancelled by user';
      await trf.save(session ? { session } : {});
      return trf;
    });

    res.json({ message: 'Transfer cancelled successfully', transfer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Error cancelling transfer:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
