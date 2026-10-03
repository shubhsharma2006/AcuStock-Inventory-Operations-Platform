/**
 * Sales Orders API
 *
 * GET    /api/sales-orders             — list
 * POST   /api/sales-orders             — create draft
 * GET    /api/sales-orders/:id         — get one
 * PATCH  /api/sales-orders/:id         — update draft
 * POST   /api/sales-orders/:id/confirm — confirm order (ADMIN, MANAGER)
 * POST   /api/sales-orders/:id/dispatch — dispatch → auto StockLedger OUT (ADMIN, MANAGER)
 * POST   /api/sales-orders/:id/cancel  — cancel (ADMIN)
 */

const express     = require('express');
const mongoose    = require('mongoose');
const SalesOrder  = require('../models/SalesOrder');
const Item        = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const SerialAudit = require('../models/SerialAudit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateSalesOrderInvoicePdf } = require('../services/pdfGenerator');
const { logBusinessEvent } = require('../utils/auditHelper');
const { notifyRoles }    = require('../services/notificationHelper');
const logger      = require('../utils/logger');

const router = express.Router();

// ── List ───────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;
    const filter = {};

    filter.tenantId = req.tenantId;
    if (req.query.status) filter.status = req.query.status;
    if (req.userRole === 'MANAGER') filter.createdBy = req.userId;

    const [orders, total] = await Promise.all([
      SalesOrder.find(filter)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SalesOrder.countDocuments(filter)
    ]);

    res.set('X-Total-Count', total);
    res.json({ success: true, orders, page, total });
  } catch (err) {
    logger.error('SO list error:', err);
    res.status(500).json({ success: false, error: 'Failed to list sales orders' });
  }
});

// ── Create ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { buyer, items, expectedDeliveryDate, notes } = req.body;
    if (!buyer?.name) return res.status(400).json({ success: false, error: 'buyer.name is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

    // Validate referenced products belong to this tenant
    const Item = require('../models/Item');
    const productIds = items.map(it => it.productId).filter(Boolean);
    if (productIds.length > 0) {
      const count = await Item.countDocuments({
        _id: { $in: productIds },
        tenantId: req.tenantId
      });
      if (count !== productIds.length) {
        return res.status(404).json({ success: false, error: 'One or more referenced products not found' });
      }
    }

    const normalizedBuyer = { ...buyer };
    if (typeof normalizedBuyer.address === 'object' && normalizedBuyer.address !== null) {
      normalizedBuyer.address = Object.values(normalizedBuyer.address).filter(Boolean).join(', ');
    }

    const so = new SalesOrder({
      buyer: normalizedBuyer,
      items,
      expectedDeliveryDate,
      notes,
      createdBy: req.userId,
      tenantId: req.tenantId,
    });
    await so.save();

    logBusinessEvent({
      req,
      action: 'SO_CREATED',
      entityType: 'SalesOrder',
      entityId: so._id,
      changes: {
        after: {
          orderNumber: so.orderNumber,
          buyer: so.buyer?.name,
          itemsCount: so.items?.length,
          totalAmount: so.totalAmount
        },
        summary: `Created Sales Order ${so.orderNumber || so._id} for "${so.buyer?.name}"`
      }
    }).catch(() => {});

    res.status(201).json({ success: true, salesOrder: so });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Get One ────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const so = await SalesOrder.findOne(filter)
      .populate('createdBy confirmedBy dispatchedBy', 'name email')
      .populate('items.productId', 'name shortName');
    if (!so) return res.status(404).json({ success: false, error: 'Sales order not found' });
    if (req.userRole === 'MANAGER' && so.createdBy._id.toString() !== req.userId)
      return res.status(403).json({ success: false, error: 'Access denied' });
    res.json({ success: true, salesOrder: so });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch sales order' });
  }
});

// ── Download PDF Tax Invoice ──────────────────────────────────
router.get('/:id/pdf', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(403).json({ success: false, error: 'Tenant context required', code: 'TENANT_REQUIRED' });
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const so = await SalesOrder.findOne(filter)
      .populate('createdBy confirmedBy dispatchedBy', 'name email')
      .populate('items.productId', 'name shortName');

    if (!so) {
      return res.status(404).json({ success: false, error: 'Sales order not found' });
    }

    if (req.userRole === 'MANAGER' && so.createdBy?._id?.toString() !== req.userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const filename = `Invoice-${so.soNumber || 'SO'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    generateSalesOrderInvoicePdf(so, req.tenant, res);
  } catch (err) {
    logger.error('SO PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate invoice PDF' });
    }
  }
});

// ── Update draft ───────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const so = await SalesOrder.findOne(filter);
    if (!so) return res.status(404).json({ success: false, error: 'Sales order not found' });
    if (so.status !== 'draft') return res.status(400).json({ success: false, error: 'Only draft SOs can be edited' });
    if (req.userRole === 'MANAGER' && so.createdBy.toString() !== req.userId)
      return res.status(403).json({ success: false, error: 'Access denied' });

    const allowed = ['buyer', 'items', 'expectedDeliveryDate', 'notes'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) so[key] = req.body[key];
    }
    await so.save();
    res.json({ success: true, salesOrder: so });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Confirm ────────────────────────────────────────────────────
router.post('/:id/confirm', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const so = await SalesOrder.findOne(filter);
    if (!so) return res.status(404).json({ success: false, error: 'Sales order not found' });
    if (so.status !== 'draft') return res.status(400).json({ success: false, error: `Cannot confirm SO in "${so.status}" status` });

    so.status      = 'confirmed';
    so.confirmedBy = req.userId;
    so.confirmedAt = new Date();
    await so.save();

    logBusinessEvent({
      req,
      action: 'SO_STATUS_CHANGED',
      entityType: 'SalesOrder',
      entityId: so._id,
      changes: {
        before: { status: 'draft' },
        after: { status: 'confirmed' },
        summary: `Confirmed Sales Order ${so.orderNumber || so._id}`
      }
    }).catch(() => {});

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'order_completed',
      title: `SO Confirmed: ${so.soNumber}`,
      message: `Sales Order ${so.soNumber} for ${so.buyer?.name || 'customer'} has been confirmed.`,
      link: 'sales-orders',
      priority: 'MEDIUM',
      tenantId: req.tenantId,
      createdBy: req.userId,
      createdByRole: req.userRole,
      metadata: { soNumber: so.soNumber, buyer: so.buyer?.name, totalValue: so.totalValue }
    }).catch(() => {});

    res.json({ success: true, salesOrder: so });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Dispatch → Auto StockLedger OUT ───────────────────────────
router.post('/:id/dispatch', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const filter = { _id: req.params.id, tenantId: req.tenantId };

      const so = await SalesOrder.findOne(filter).session(session);
      if (!so) throw new Error('Sales order not found');
      if (!['confirmed', 'picking'].includes(so.status))
        throw new Error(`Cannot dispatch SO in "${so.status}" status. Confirm it first.`);

      // Check available stock for all items before creating any OUT entry
      for (const line of so.items) {
        const stockMatch = { productId: line.productId, tenantId: new mongoose.Types.ObjectId(req.tenantId) };

        const stockAgg = await StockLedger.aggregate([
          { $match: stockMatch },
          {
            $group: {
              _id: null,
              available: {
                $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', { $multiply: ['$quantity', -1] }] }
              }
            }
          }
        ]).session(session);

        const available = stockAgg[0]?.available ?? 0;
        if (available < line.quantity) {
          const itemFilter = { _id: line.productId, tenantId: req.tenantId };

          const item = await Item.findOne(itemFilter).select('name').session(session);
          throw new Error(`Insufficient stock for "${item?.name || line.productId}": need ${line.quantity}, have ${available}`);
        }
      }

      const ledgerIds = [];
      const pickedItemsMap = new Map();
      if (Array.isArray(req.body.pickedItems)) {
        for (const pItem of req.body.pickedItems) {
          if (pItem.productId) {
            pickedItemsMap.set(pItem.productId.toString(), pItem);
          }
        }
      }

      for (const line of so.items) {
        const itemFilter = { _id: line.productId, tenantId: req.tenantId };

        const item = await Item.findOne(itemFilter).session(session);
        if (!item) throw new Error(`Product ${line.productId} not found`);

        const pItem = pickedItemsMap.get(line.productId.toString()) || {};
        let lineSerials = Array.isArray(pItem.serialNumbers)
          ? pItem.serialNumbers.map(s => String(s).trim().toUpperCase()).filter(Boolean)
          : [];

        // De-duplicate serials
        lineSerials = [...new Set(lineSerials)];

        const policy = item.serialPolicy || {};
        if (policy.enableSerial && policy.requireSerialOnOUT) {
          if (lineSerials.length === 0) {
            throw new Error(`Serial numbers are required for "${item.name}" upon dispatch`);
          }
          if (lineSerials.length !== line.quantity) {
            throw new Error(`Expected ${line.quantity} serial number(s) for "${item.name}", got ${lineSerials.length}`);
          }
        }

        // Validate serials are currently in stock (last action was IN)
        if (lineSerials.length > 0) {
          if (!req.tenantId) throw new Error('Tenant context is required for serial validation');
          const auditMatch = { serial: { $in: lineSerials }, tenantId: new mongoose.Types.ObjectId(req.tenantId) };

          const existingAudits = await SerialAudit.aggregate([
            { $match: auditMatch },
            { $sort: { createdAt: 1 } },
            { $group: { _id: '$serial', lastAction: { $last: '$action' } } }
          ]).session(session);

          const availableMap = new Map(existingAudits.map(a => [a._id, a.lastAction]));
          const notAvailable = lineSerials.filter(s => availableMap.get(s) !== 'IN');

          if (notAvailable.length > 0) {
            throw new Error(`Serial numbers not available in stock for "${item.name}": ${notAvailable.join(', ')}`);
          }
        }

        const [ledger] = await StockLedger.create([{
          productId:    line.productId,
          type:         'OUT',
          quantity:     line.quantity,
          serialNumbers: lineSerials,
          condition:    'new',
          partyDetails: {
            name:    so.buyer.name,
            email:   so.buyer.email,
            phone:   so.buyer.phone,
            address: so.buyer.address
          },
          transactionDetails: { reference: so.soNumber, notes: `Dispatched via SO ${so.soNumber}` },
          createdBy: req.userId,
          role:      req.userRole,
          tenantId:  req.tenantId,
        }], { session });

        ledgerIds.push(ledger._id);

        // Record SerialAudit OUT entries
        if (lineSerials.length > 0) {
          const auditEntries = lineSerials.map(serial => ({
            serial,
            productId:   line.productId,
            action:      'OUT',
            performedBy: req.userId,
            role:        req.userRole,
            tenantId:    req.tenantId,
          }));
          await SerialAudit.insertMany(auditEntries, { session });
        }
      }

      so.status       = 'dispatched';
      so.dispatchedBy = req.userId;
      so.dispatchedAt = new Date();
      so.ledgerEntries = ledgerIds;
      await so.save({ session });
      result = so;
    });

    logBusinessEvent({
      req,
      action: 'SO_DISPATCHED',
      entityType: 'SalesOrder',
      entityId: result._id,
      changes: {
        after: { status: result.status },
        summary: `Dispatched Sales Order ${result.orderNumber || result._id}`
      }
    }).catch(() => {});

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'order_completed',
      title: `Order Dispatched: ${result.soNumber}`,
      message: `Sales Order ${result.soNumber} for ${result.buyer?.name || 'customer'} has been dispatched — stock deducted.`,
      link: 'sales-orders',
      priority: 'HIGH',
      tenantId: req.tenantId,
      createdBy: req.userId,
      createdByRole: req.userRole,
      metadata: { soNumber: result.soNumber, buyer: result.buyer?.name, totalValue: result.totalValue }
    }).catch(() => {});

    res.json({ success: true, message: 'SO dispatched — stock updated', salesOrder: result });
  } catch (err) {
    logger.error('SO dispatch error:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
});

// ── Cancel ─────────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const so = await SalesOrder.findOne(filter);
    if (!so) return res.status(404).json({ success: false, error: 'Sales order not found' });
    if (['dispatched', 'delivered', 'cancelled'].includes(so.status))
      return res.status(400).json({ success: false, error: `Cannot cancel SO in "${so.status}" status` });

    so.status = 'cancelled';
    await so.save();

    logBusinessEvent({
      req,
      action: 'SO_STATUS_CHANGED',
      entityType: 'SalesOrder',
      entityId: so._id,
      changes: {
        after: { status: 'cancelled' },
        summary: `Cancelled Sales Order ${so.orderNumber || so._id}`
      },
      severity: 'WARNING'
    }).catch(() => {});

    res.json({ success: true, salesOrder: so });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
