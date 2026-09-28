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
async function getWarehouseStock(warehouseId, productId, tenantId) {
  const matchFilter = {
    warehouseId: new mongoose.Types.ObjectId(warehouseId),
    productId: new mongoose.Types.ObjectId(productId),
    isDeleted: false
  };
  matchFilter.tenantId = new mongoose.Types.ObjectId(tenantId);

  const result = await StockLedger.aggregate([
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
  return result.length > 0 ? Math.max(0, result[0].total) : 0;
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

    const transfer = await StockTransfer.findOne(filter);
    if (!transfer) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }
    if (transfer.status !== 'APPROVED') {
      return res.status(400).json({ message: `Cannot ship transfer in status '${transfer.status}'. It must be APPROVED first.` });
    }

    // Branch Scoping: Non-admin users can only ship transfers originating from their assigned warehouse
    if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      if (String(transfer.fromWarehouse) !== String(req.user.assignedWarehouseId)) {
        return res.status(403).json({ message: 'Forbidden: Only the originating warehouse can dispatch this transfer.' });
      }
    }

    // Optional logistics info
    const { transporterId, trackingNumber, estimatedArrival } = req.body;
    if (transporterId) transfer.transporterId = transporterId;
    if (trackingNumber) transfer.trackingNumber = String(trackingNumber).trim().toUpperCase();
    if (estimatedArrival) transfer.estimatedArrival = new Date(estimatedArrival);

    // Verify stock availability at source warehouse
    for (const it of transfer.items) {
      const availStock = await getWarehouseStock(transfer.fromWarehouse, it.product, transfer.tenantId);
      if (availStock < it.quantity) {
        const prod = await Item.findOne({ _id: it.product, tenantId: transfer.tenantId });
        const name = prod ? prod.name : it.product;
        return res.status(400).json({
          message: `Insufficient stock at source warehouse for '${name}'. Available: ${availStock}, Required: ${it.quantity}`
        });
      }
    }

    // Create TRANSFER_OUT ledger records for each item
    for (const it of transfer.items) {
      const outLedger = new StockLedger({
        productId: it.product,
        warehouseId: transfer.fromWarehouse,
        transferId: transfer._id,
        type: 'TRANSFER_OUT',
        quantity: it.quantity,
        serialNumbers: it.serialNumbers || [],
        createdBy: req.user._id,
        role: req.user.role,
        notes: `Transfer out: ${transfer.transferNumber}`,
        tenantId: transfer.tenantId
      });
      await outLedger.save();
    }

    transfer.status = 'IN_TRANSIT';
    transfer.shippedBy = req.user._id;
    transfer.shippedAt = new Date();
    await transfer.save();

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
    console.error('Error shipping transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/receive - Confirm receipt & create TRANSFER_IN ledger
router.put('/:id/receive', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'USER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transfer = await StockTransfer.findOne(filter);
    if (!transfer) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }
    if (transfer.status !== 'IN_TRANSIT') {
      return res.status(400).json({ message: `Cannot receive transfer in status '${transfer.status}'. It must be IN_TRANSIT.` });
    }

    // Branch Scoping: Non-admin users can only confirm receipt for transfers destined to their assigned warehouse
    if (req.user.assignedWarehouseId && !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      if (String(transfer.toWarehouse) !== String(req.user.assignedWarehouseId)) {
        return res.status(403).json({ message: 'Forbidden: Only the destination warehouse can confirm receipt for this transfer.' });
      }
    }

    const { receivedItems } = req.body;

    // Apply received quantities
    for (let i = 0; i < transfer.items.length; i++) {
      const it = transfer.items[i];
      let recQty = it.quantity; // default full
      let recSerials = it.serialNumbers;

      if (Array.isArray(receivedItems)) {
        const userRec = receivedItems.find(r => String(r.product) === String(it.product) || String(r._id) === String(it._id));
        if (userRec && userRec.receivedQuantity !== undefined) {
          recQty = Math.max(0, Number(userRec.receivedQuantity));
          recSerials = Array.isArray(userRec.receivedSerials) ? userRec.receivedSerials : it.serialNumbers;
        }
      }

      it.receivedQuantity = recQty;
      it.receivedSerials = recSerials;

      // Create TRANSFER_IN ledger record for received items
      if (recQty > 0) {
        const inLedger = new StockLedger({
          productId: it.product,
          warehouseId: transfer.toWarehouse,
          transferId: transfer._id,
          type: 'TRANSFER_IN',
          quantity: recQty,
          serialNumbers: recSerials || [],
          createdBy: req.user._id,
          role: req.user.role,
          notes: `Transfer in: ${transfer.transferNumber}`,
          tenantId: transfer.tenantId
        });
        await inLedger.save();
      }
    }

    transfer.status = 'RECEIVED';
    transfer.receivedBy = req.user._id;
    transfer.receivedAt = new Date();
    await transfer.save();

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
    console.error('Error receiving transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/stock-transfers/:id/cancel - Cancel transfer
router.put('/:id/cancel', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transfer = await StockTransfer.findOne(filter);
    if (!transfer) {
      return res.status(404).json({ message: 'Stock transfer not found' });
    }
    if (transfer.status === 'RECEIVED') {
      return res.status(400).json({ message: 'Cannot cancel an already RECEIVED transfer' });
    }
    if (transfer.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Transfer is already cancelled' });
    }

    // If transfer was IN_TRANSIT, reverse the stock back into fromWarehouse!
    if (transfer.status === 'IN_TRANSIT') {
      for (const it of transfer.items) {
        const revertLedger = new StockLedger({
          productId: it.product,
          warehouseId: transfer.fromWarehouse,
          transferId: transfer._id,
          type: 'TRANSFER_IN',
          quantity: it.quantity,
          serialNumbers: it.serialNumbers || [],
          createdBy: req.user._id,
          role: req.user.role,
          notes: `Reversal on transfer cancellation: ${transfer.transferNumber}`,
          tenantId: transfer.tenantId
        });
        await revertLedger.save();
      }
    }

    transfer.status = 'CANCELLED';
    transfer.cancelledBy = req.user._id;
    transfer.cancelledAt = new Date();
    transfer.cancelReason = req.body.reason ? String(req.body.reason).trim() : 'Cancelled by user';
    await transfer.save();

    res.json({ message: 'Transfer cancelled successfully', transfer });
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
