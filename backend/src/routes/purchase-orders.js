/**
 * Purchase Orders API
 *
 * GET    /api/purchase-orders          — list (ADMIN, MANAGER)
 * POST   /api/purchase-orders          — create draft (ADMIN, MANAGER)
 * GET    /api/purchase-orders/:id      — get one
 * PATCH  /api/purchase-orders/:id      — update draft
 * POST   /api/purchase-orders/:id/approve   — approve (ADMIN)
 * POST   /api/purchase-orders/:id/receive   — receive → auto StockLedger IN (ADMIN, MANAGER)
 * POST   /api/purchase-orders/:id/cancel    — cancel (ADMIN)
 */

const express       = require('express');
const mongoose      = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Item          = require('../models/Item');
const StockLedger   = require('../models/StockLedger');
const SerialAudit   = require('../models/SerialAudit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generatePurchaseOrderPdf } = require('../services/pdfGenerator');
const { logBusinessEvent } = require('../utils/auditHelper');
const { notifyRoles }    = require('../services/notificationHelper');
const logger        = require('../utils/logger');

const router = express.Router();

// ── List ───────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;
    const filter = {};

    filter.tenantId = req.tenantId;
    if (req.query.status) filter.status = req.query.status;
    // Managers only see their own POs
    if (req.userRole === 'MANAGER') filter.createdBy = req.userId;

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PurchaseOrder.countDocuments(filter)
    ]);

    res.set('X-Total-Count', total);
    res.json({ success: true, orders, page, total });
  } catch (err) {
    logger.error('PO list error:', err);
    res.status(500).json({ success: false, error: 'Failed to list purchase orders' });
  }
});

// ── Create ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { supplier, items, expectedDeliveryDate, notes } = req.body;

    if (!supplier?.name) return res.status(400).json({ success: false, error: 'supplier.name is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'items array is required' });

    // Validate referenced products belong to this tenant
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

    const po = new PurchaseOrder({
      supplier,
      items,
      expectedDeliveryDate,
      notes,
      createdBy: req.userId,
      tenantId: req.tenantId,
    });

    await po.save();

    logBusinessEvent({
      req,
      action: 'PO_CREATED',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      changes: {
        after: {
          poNumber: po.poNumber,
          supplier: po.supplier?.name,
          itemsCount: po.items?.length,
          totalAmount: po.totalAmount
        },
        summary: `Created Purchase Order ${po.poNumber || po._id} for "${po.supplier?.name}"`
      }
    }).catch(() => {});

    res.status(201).json({ success: true, purchaseOrder: po });
  } catch (err) {
    logger.error('PO create error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Get One ────────────────────────────────────────────────────
router.get('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const po = await PurchaseOrder.findOne(filter)
      .populate('createdBy approvedBy receivedBy', 'name email')
      .populate('items.productId', 'name shortName');

    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    if (req.userRole === 'MANAGER' && po.createdBy._id.toString() !== req.userId)
      return res.status(403).json({ success: false, error: 'Access denied' });

    res.json({ success: true, purchaseOrder: po });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch purchase order' });
  }
});

// ── Download PDF Purchase Order ───────────────────────────────
router.get('/:id/pdf', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(403).json({ success: false, error: 'Tenant context required', code: 'TENANT_REQUIRED' });
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const po = await PurchaseOrder.findOne(filter)
      .populate('createdBy approvedBy receivedBy', 'name email')
      .populate('items.productId', 'name shortName');

    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }

    if (req.userRole === 'MANAGER' && po.createdBy?._id?.toString() !== req.userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const filename = `PO-${po.poNumber || 'PO'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    generatePurchaseOrderPdf(po, req.tenant, res);
  } catch (err) {
    logger.error('PO PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to generate PO PDF' });
    }
  }
});

// ── Update draft ───────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const po = await PurchaseOrder.findOne(filter);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    if (po.status !== 'draft') return res.status(400).json({ success: false, error: 'Only draft POs can be edited' });
    if (req.userRole === 'MANAGER' && po.createdBy.toString() !== req.userId)
      return res.status(403).json({ success: false, error: 'Access denied' });

    const allowed = ['supplier', 'items', 'expectedDeliveryDate', 'notes'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) po[key] = req.body[key];
    }
    await po.save();
    res.json({ success: true, purchaseOrder: po });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Approve ────────────────────────────────────────────────────
router.post('/:id/approve', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const po = await PurchaseOrder.findOne(filter);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    if (!['draft'].includes(po.status)) return res.status(400).json({ success: false, error: `Cannot approve PO in "${po.status}" status` });

    po.status     = 'approved';
    po.approvedBy = req.userId;
    po.approvedAt = new Date();
    await po.save();

    logBusinessEvent({
      req,
      action: 'PO_STATUS_CHANGED',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      changes: {
        before: { status: 'draft' },
        after: { status: 'approved' },
        summary: `Approved Purchase Order ${po.poNumber || po._id}`
      }
    }).catch(() => {});

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'order_completed',
      title: `PO Approved: ${po.poNumber}`,
      message: `Purchase Order from ${po.supplier?.name || 'supplier'} (${po.poNumber}) has been approved.`,
      link: 'purchase-orders',
      priority: 'MEDIUM',
      tenantId: req.tenantId,
      createdBy: req.userId,
      createdByRole: req.userRole,
      metadata: { poNumber: po.poNumber, supplier: po.supplier?.name, totalValue: po.totalValue }
    }).catch(() => {});

    res.json({ success: true, purchaseOrder: po });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Receive → Auto StockLedger IN ─────────────────────────────
router.post('/:id/receive', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const filter = { _id: req.params.id, tenantId: req.tenantId };

      const po = await PurchaseOrder.findOne(filter).session(session);
      if (!po) throw new Error('Purchase order not found');
      if (!['approved', 'sent'].includes(po.status))
        throw new Error(`Cannot receive PO in "${po.status}" status. Approve it first.`);

      const ledgerIds = [];
      const receivedItemsMap = new Map();
      if (Array.isArray(req.body.receivedItems)) {
        for (const rItem of req.body.receivedItems) {
          if (rItem.productId) {
            receivedItemsMap.set(rItem.productId.toString(), rItem);
          }
        }
      }

      // Create one StockLedger IN entry per line item with serial validation
      for (const line of po.items) {
        const itemFilter = { _id: line.productId, tenantId: req.tenantId };

        const item = await Item.findOne(itemFilter).session(session);
        if (!item) throw new Error(`Product ${line.productId} not found`);

        const rItem = receivedItemsMap.get(line.productId.toString()) || {};
        let lineSerials = Array.isArray(rItem.serialNumbers)
          ? rItem.serialNumbers.map(s => String(s).trim().toUpperCase()).filter(Boolean)
          : [];

        // De-duplicate serials in this line
        lineSerials = [...new Set(lineSerials)];

        const policy = item.serialPolicy || {};
        if (policy.enableSerial && policy.requireSerialOnIN) {
          if (lineSerials.length === 0) {
            throw new Error(`Serial numbers are required for "${item.name}" upon receiving`);
          }
          if (lineSerials.length !== line.quantity) {
            throw new Error(`Expected ${line.quantity} serial number(s) for "${item.name}", received ${lineSerials.length}`);
          }
        }

        // Validate serials are not already in stock
        if (lineSerials.length > 0) {
          if (!req.tenantId) throw new Error('Tenant context is required for serial validation');
          const auditMatch = { serial: { $in: lineSerials }, tenantId: new mongoose.Types.ObjectId(req.tenantId) };

          const existingAudits = await SerialAudit.aggregate([
            { $match: auditMatch },
            { $sort: { createdAt: 1 } },
            { $group: { _id: '$serial', lastAction: { $last: '$action' } } }
          ]).session(session);

          const inStockSerials = existingAudits.filter(a => a.lastAction === 'IN').map(a => a._id);
          if (inStockSerials.length > 0) {
            throw new Error(`Serial numbers already in stock for "${item.name}": ${inStockSerials.join(', ')}`);
          }
        }

        const [ledger] = await StockLedger.create([{
          productId:    line.productId,
          type:         'IN',
          quantity:     line.quantity,
          serialNumbers: lineSerials,
          condition:    rItem.condition || 'new',
          partyDetails: {
            name:    po.supplier.name,
            email:   po.supplier.email,
            phone:   po.supplier.phone,
            address: po.supplier.address
          },
          transactionDetails: { reference: po.poNumber, notes: `Received from PO ${po.poNumber}` },
          createdBy: req.userId,
          role:      req.userRole,
          tenantId:  req.tenantId,
        }], { session });

        ledgerIds.push(ledger._id);

        // Record SerialAudit IN entries
        if (lineSerials.length > 0) {
          const auditEntries = lineSerials.map(serial => ({
            serial,
            productId:   line.productId,
            action:      'IN',
            performedBy: req.userId,
            role:        req.userRole,
            tenantId:    req.tenantId,
          }));
          await SerialAudit.insertMany(auditEntries, { session });
        }
      }

      po.status     = 'received';
      po.receivedBy = req.userId;
      po.receivedAt = new Date();
      po.ledgerEntries = ledgerIds;
      await po.save({ session });

      result = po;
    });

    logBusinessEvent({
      req,
      action: 'PO_RECEIVED',
      entityType: 'PurchaseOrder',
      entityId: result._id,
      changes: {
        after: { status: result.status },
        summary: `Received Purchase Order ${result.poNumber || result._id}`
      }
    }).catch(() => {});

    notifyRoles(['ADMIN', 'MANAGER'], {
      type: 'order_completed',
      title: `Stock Received: ${result.poNumber}`,
      message: `Purchase Order ${result.poNumber} from ${result.supplier?.name || 'supplier'} has been fully received — stock updated.`,
      link: 'purchase-orders',
      priority: 'HIGH',
      tenantId: req.tenantId,
      createdBy: req.userId,
      createdByRole: req.userRole,
      metadata: { poNumber: result.poNumber, supplier: result.supplier?.name, totalValue: result.totalValue }
    }).catch(() => {});

    res.json({ success: true, message: 'PO received — stock updated', purchaseOrder: result });
  } catch (err) {
    logger.error('PO receive error:', err);
    res.status(400).json({ success: false, error: err.message });
  } finally {
    session.endSession();
  }
});

// ── Cancel ─────────────────────────────────────────────────────
router.post('/:id/cancel', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const po = await PurchaseOrder.findOne(filter);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    if (['received', 'cancelled'].includes(po.status))
      return res.status(400).json({ success: false, error: `Cannot cancel PO in "${po.status}" status` });

    po.status = 'cancelled';
    await po.save();

    logBusinessEvent({
      req,
      action: 'PO_STATUS_CHANGED',
      entityType: 'PurchaseOrder',
      entityId: po._id,
      changes: {
        after: { status: 'cancelled' },
        summary: `Cancelled Purchase Order ${po.poNumber || po._id}`
      },
      severity: 'WARNING'
    }).catch(() => {});

    res.json({ success: true, purchaseOrder: po });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
