const express = require('express');
const mongoose = require('mongoose');
const Package = require('../models/Package');
const SalesOrder = require('../models/SalesOrder');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const StockReservation = require('../models/StockReservation');
const InventoryLot = require('../models/InventoryLot');
const SerialAudit = require('../models/SerialAudit');
const PurchaseOrder = require('../models/PurchaseOrder');
const Counter = require('../models/Counter');
const { requireAuth, requireTenantId, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const lotService = require('../services/lot.service');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();
router.use(requireTenantId);

/**
 * Helper to generate package number: PKG-YYYYMMDD-NNNNN
 */
async function generatePackageNumber(tenantId, session) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PKG-${dateStr}-`;

  const count = await Package.countDocuments({
    tenantId,
    packageNumber: { $regex: `^${prefix}` }
  }).session(session);

  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

/**
 * GET /api/packages
 * List packages with optional filtering and pagination
 */
router.get('/', requireAuth, requirePermission('canViewProducts'), async (req, res) => {
  try {
    const { salesOrderId, status, search } = req.query;
    const { page, limit } = normalizePaginationQuery(req.query);

    const filter = { tenantId: req.tenantId };

    if (salesOrderId && mongoose.Types.ObjectId.isValid(salesOrderId)) {
      filter.salesOrderId = new mongoose.Types.ObjectId(salesOrderId);
    }

    if (status) {
      filter.status = status.toUpperCase();
    }

    if (search && typeof search === 'string') {
      filter.$or = [
        { packageNumber: { $regex: search.trim(), $options: 'i' } },
        { trackingNumber: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const total = await Package.countDocuments(filter);
    const packages = await Package.find(filter)
      .populate('salesOrderId', 'soNumber buyer status')
      .populate('lineItems.productId', 'name sku uom')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      packages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/packages/:id
 * Get single package details
 */
router.get('/:id', requireAuth, requirePermission('canViewProducts'), validateObjectId, async (req, res) => {
  try {
    const pkg = await Package.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('salesOrderId')
      .populate('lineItems.productId')
      .populate('lineItems.lotId')
      .populate('shippingLabelId')
      .populate('createdBy', 'name email role')
      .lean();

    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    return res.json({ success: true, package: pkg });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/packages
 * Create package for partial sales-order fulfillment
 */
router.post('/', requireAuth, requirePermission('canCreatePackages'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let createdPackage = null;

    await session.withTransaction(async () => {
      const {
        salesOrderId,
        lineItems = [],
        carrier,
        trackingNumber,
        weight,
        dimensions,
        notes
      } = req.body;

      if (!salesOrderId || !mongoose.Types.ObjectId.isValid(salesOrderId)) {
        throw new Error('Valid salesOrderId is required');
      }

      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new Error('At least one lineItem is required to create a package');
      }

      const so = await SalesOrder.findOne({
        _id: salesOrderId,
        tenantId: req.tenantId
      }).session(session);

      if (!so) {
        throw new Error('Sales order not found');
      }

      if (!['confirmed', 'partially_fulfilled', 'picking'].includes(so.status)) {
        throw new Error(`Cannot package sales order with status "${so.status}". Must be confirmed or partially_fulfilled.`);
      }

      const packageLineItems = [];

      for (const itemRequest of lineItems) {
        const qty = Number(itemRequest.quantity);
        if (!qty || qty <= 0) {
          throw new Error('Each package line item must have a positive quantity');
        }

        const soLine = so.items.find((line) => {
          if (itemRequest.orderLineId) {
            return String(line._id) === String(itemRequest.orderLineId);
          }
          return String(line.productId) === String(itemRequest.productId);
        });

        if (!soLine) {
          throw new Error(`Item ${itemRequest.productId} not found on this sales order`);
        }

        const currentFulfilled = soLine.fulfilledQty || 0;
        const remainingToFulfill = soLine.quantity - currentFulfilled;

        if (qty > remainingToFulfill) {
          throw new Error(
            `Cannot fulfill ${qty} units for product ${soLine.productId}. Only ${remainingToFulfill} units remaining on order.`
          );
        }

        const item = await Item.findOne({ _id: soLine.productId, tenantId: req.tenantId }).session(session);
        if (!item) {
          throw new Error(`Product ${soLine.productId} not found or inactive`);
        }

        let lotDoc = null;
        if (item.trackingMode === 'BATCH') {
          if (itemRequest.lotId) {
            lotDoc = await InventoryLot.findOne({
              _id: itemRequest.lotId,
              productId: item._id,
              tenantId: req.tenantId,
              status: 'ACTIVE'
            }).session(session);

            if (!lotDoc) {
              throw new Error(`Specified lot ${itemRequest.lotId} not found or not active`);
            }
          }
        }

        if (item.trackingMode === 'SERIAL') {
          const serials = (itemRequest.serialNumbers || []).map((s) => String(s).trim().toUpperCase());
          if (item.serialPolicy?.requireSerialOnOUT && serials.length !== qty) {
            throw new Error(`Serial-tracked item requires ${qty} serial numbers, received ${serials.length}`);
          }
        }

        // Update soLine progress
        soLine.fulfilledQty = currentFulfilled + qty;
        soLine.backorderedQty = Math.max(0, soLine.quantity - soLine.fulfilledQty);
        soLine.isBackordered = soLine.backorderedQty > 0;

        // If reserved, update active reservation
        if (soLine.reservedQty > 0) {
          const matchingReservation = await StockReservation.findOne({
            orderId: so._id,
            productId: soLine.productId,
            status: 'ACTIVE',
            tenantId: req.tenantId
          }).session(session);

          if (matchingReservation) {
            if (qty >= matchingReservation.reservedQty) {
              matchingReservation.status = 'FULFILLED';
              matchingReservation.fulfilledAt = new Date();
              soLine.reservedQty = 0;
            } else {
              matchingReservation.reservedQty -= qty;
              soLine.reservedQty = matchingReservation.reservedQty;
            }
            await matchingReservation.save({ session });
          }
        }

        packageLineItems.push({
          productId: soLine.productId,
          quantity: qty,
          serialNumbers: (itemRequest.serialNumbers || []).map((s) => String(s).trim().toUpperCase()),
          lotId: lotDoc ? lotDoc._id : undefined,
          lotNumber: lotDoc ? lotDoc.lotNumber : itemRequest.lotNumber,
          expiryDate: lotDoc ? lotDoc.expiryDate : itemRequest.expiryDate
        });
      }

      // Check overall order fulfillment state
      const totalOrdered = so.items.reduce((sum, line) => sum + line.quantity, 0);
      const totalFulfilled = so.items.reduce((sum, line) => sum + (line.fulfilledQty || 0), 0);
      const hasBackorders = so.items.some((line) => (line.backorderedQty || 0) > 0);

      if (totalFulfilled >= totalOrdered) {
        so.status = 'fulfilled';
        so.fulfillmentStatus = 'FULFILLED';
      } else {
        so.status = 'partially_fulfilled';
        so.fulfillmentStatus = hasBackorders ? 'BACKORDERED' : 'PARTIALLY_FULFILLED';
      }

      const packageNumber = await generatePackageNumber(req.tenantId, session);

      const pkg = new Package({
        packageNumber,
        salesOrderId: so._id,
        status: 'CREATED',
        lineItems: packageLineItems,
        carrier,
        trackingNumber,
        weight,
        dimensions,
        notes,
        createdBy: req.user._id,
        tenantId: req.tenantId
      });

      await pkg.save({ session });

      so.packages.push(pkg._id);
      await so.save({ session });

      createdPackage = pkg;
    });

    await logBusinessEvent({
      req,
      action: 'PACKAGE_CREATED',
      entityType: 'Package',
      entityId: createdPackage._id,
      changes: {
        summary: `Package ${createdPackage.packageNumber} created for sales order`,
        after: {
          packageNumber: createdPackage.packageNumber,
          lineItemCount: createdPackage.lineItems.length
        }
      },
      tenantId: req.tenantId
    });

    return res.status(201).json({
      success: true,
      package: createdPackage,
      message: `Package ${createdPackage.packageNumber} created successfully`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/packages/:id/dispatch
 * Dispatch package and record inventory OUT
 */
router.post('/:id/dispatch', requireAuth, requirePermission('canDispatchPackages'), validateObjectId, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let dispatchedPackage = null;

    await session.withTransaction(async () => {
      const pkg = await Package.findOne({ _id: req.params.id, tenantId: req.tenantId }).session(session);
      if (!pkg) {
        throw new Error('Package not found');
      }

      if (pkg.status === 'SHIPPED' || pkg.status === 'DELIVERED') {
        throw new Error(`Package is already ${pkg.status.toLowerCase()}`);
      }

      if (pkg.status === 'CANCELLED') {
        throw new Error('Cannot dispatch a cancelled package');
      }

      const so = await SalesOrder.findOne({ _id: pkg.salesOrderId, tenantId: req.tenantId }).session(session);
      if (!so) {
        throw new Error('Sales order not found for this package');
      }

      // Record StockLedger OUT for each line item in package
      for (const line of pkg.lineItems) {
        const item = await Item.findOne({ _id: line.productId, tenantId: req.tenantId }).session(session);
        if (!item) {
          throw new Error(`Item ${line.productId} not found`);
        }

        let lotAllocations = [];
        if (item.trackingMode === 'BATCH' && line.lotId) {
          const lot = await InventoryLot.findOne({ _id: line.lotId, tenantId: req.tenantId }).session(session);
          if (!lot) {
            throw new Error(`Lot not found for package line item`);
          }
          if (lot.remainingQty < line.quantity) {
            throw new Error(`Insufficient stock in lot ${lot.lotNumber}. Available: ${lot.remainingQty}, Required: ${line.quantity}`);
          }
          lot.remainingQty -= line.quantity;
          if (lot.remainingQty === 0) {
            lot.status = 'DEPLETED';
          }
          await lot.save({ session });

          lotAllocations = [{
            lotId: lot._id,
            lotNumber: lot.lotNumber,
            quantity: line.quantity,
            expiryDate: lot.expiryDate
          }];
        }

        const serials = (line.serialNumbers || []).map((s) => s.trim().toUpperCase());
        if (item.trackingMode === 'SERIAL' && serials.length > 0) {
          const audits = serials.map((serial) => ({
            productId: item._id,
            serial,
            action: 'OUT',
            performedBy: req.user._id,
            role: req.user.role,
            tenantId: req.tenantId
          }));
          await SerialAudit.insertMany(audits, { session });
        }

        // Ledger entry (Append only)
        const ledgerEntry = await StockLedger.create([{
          productId: line.productId,
          type: 'OUT',
          quantity: line.quantity,
          serialNumbers: serials,
          lotAllocations,
          condition: 'new',
          partyDetails: {
            customerName: so.buyer.name,
            customerPhone: so.buyer.phone,
            customerEmail: so.buyer.email,
            customerAddress: so.buyer.address
          },
          transactionDetails: {
            transactionId: pkg.packageNumber,
            deliveredBy: pkg.carrier || req.body.carrier || 'Courier',
            transactionDate: new Date()
          },
          createdBy: req.user._id,
          role: req.user.role,
          tenantId: req.tenantId
        }], { session });

        so.ledgerEntries.push(ledgerEntry[0]._id);
      }

      pkg.status = 'SHIPPED';
      pkg.shippedAt = new Date();
      if (req.body.carrier) pkg.carrier = req.body.carrier;
      if (req.body.trackingNumber) pkg.trackingNumber = req.body.trackingNumber;
      await pkg.save({ session });

      // If all lines on SO are fulfilled and all packages on SO are SHIPPED, mark SO dispatched
      const allPackages = await Package.find({
        salesOrderId: so._id,
        tenantId: req.tenantId
      }).session(session);

      const allShipped = allPackages.every((p) => p.status === 'SHIPPED' || p.status === 'DELIVERED');
      const totalOrdered = so.items.reduce((sum, line) => sum + line.quantity, 0);
      const totalFulfilled = so.items.reduce((sum, line) => sum + (line.fulfilledQty || 0), 0);

      if (allShipped && totalFulfilled >= totalOrdered) {
        so.status = 'dispatched';
        so.dispatchedAt = new Date();
        so.dispatchedBy = req.user._id;
      }
      await so.save({ session });

      dispatchedPackage = pkg;
    });

    await logBusinessEvent({
      req,
      action: 'PACKAGE_DISPATCHED',
      entityType: 'Package',
      entityId: dispatchedPackage._id,
      changes: {
        summary: `Package ${dispatchedPackage.packageNumber} dispatched via ${dispatchedPackage.carrier || 'courier'}`,
        after: { status: 'SHIPPED', shippedAt: dispatchedPackage.shippedAt }
      },
      tenantId: req.tenantId
    });

    return res.json({
      success: true,
      package: dispatchedPackage,
      message: `Package ${dispatchedPackage.packageNumber} dispatched successfully`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/packages/:id/cancel
 * Cancel an undelivered/undispatched package and restore order line quantities
 */
router.post('/:id/cancel', requireAuth, requirePermission('canCancelPackages'), validateObjectId, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let cancelledPackage = null;

    await session.withTransaction(async () => {
      const pkg = await Package.findOne({ _id: req.params.id, tenantId: req.tenantId }).session(session);
      if (!pkg) {
        throw new Error('Package not found');
      }

      if (['SHIPPED', 'DELIVERED'].includes(pkg.status)) {
        throw new Error(`Cannot cancel a package that has already been dispatched/shipped`);
      }

      if (pkg.status === 'CANCELLED') {
        throw new Error('Package is already cancelled');
      }

      const so = await SalesOrder.findOne({ _id: pkg.salesOrderId, tenantId: req.tenantId }).session(session);
      if (so) {
        for (const line of pkg.lineItems) {
          const soLine = so.items.find((item) => String(item.productId) === String(line.productId));
          if (soLine) {
            soLine.fulfilledQty = Math.max(0, (soLine.fulfilledQty || 0) - line.quantity);
            soLine.backorderedQty = Math.max(0, soLine.quantity - soLine.fulfilledQty);
            soLine.isBackordered = soLine.backorderedQty > 0;
          }
        }

        const totalFulfilled = so.items.reduce((sum, line) => sum + (line.fulfilledQty || 0), 0);
        so.status = totalFulfilled > 0 ? 'partially_fulfilled' : 'confirmed';
        so.fulfillmentStatus = totalFulfilled > 0 ? 'PARTIALLY_FULFILLED' : 'UNFULFILLED';

        await so.save({ session });
      }

      pkg.status = 'CANCELLED';
      await pkg.save({ session });

      cancelledPackage = pkg;
    });

    await logBusinessEvent({
      req,
      action: 'PACKAGE_CANCELLED',
      entityType: 'Package',
      entityId: cancelledPackage._id,
      changes: {
        summary: `Package ${cancelledPackage.packageNumber} was cancelled`,
        after: { status: 'CANCELLED' }
      },
      tenantId: req.tenantId
    });

    return res.json({
      success: true,
      package: cancelledPackage,
      message: `Package ${cancelledPackage.packageNumber} cancelled successfully`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/packages/backorder-to-po
 * Create Purchase Order(s) from backordered sales order line items
 */
router.post('/backorder-to-po', requireAuth, requirePermission('canCreatePoFromBackorder'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let createdPo = null;

    await session.withTransaction(async () => {
      const { salesOrderId, supplierId, items: requestedItems } = req.body;

      if (!salesOrderId || !mongoose.Types.ObjectId.isValid(salesOrderId)) {
        throw new Error('Valid salesOrderId is required');
      }

      const so = await SalesOrder.findOne({ _id: salesOrderId, tenantId: req.tenantId }).session(session);
      if (!so) {
        throw new Error('Sales order not found');
      }

      const backorderedLines = so.items.filter((line) => (line.backorderedQty || 0) > 0);
      if (backorderedLines.length === 0) {
        throw new Error('Sales order has no backordered items');
      }

      const poItems = [];
      let resolvedSupplierId = supplierId;

      for (const line of backorderedLines) {
        const item = await Item.findOne({ _id: line.productId, tenantId: req.tenantId }).session(session);
        if (!item) continue;

        if (!resolvedSupplierId && item.preferredSupplierId) {
          resolvedSupplierId = item.preferredSupplierId;
        }

        const qtyToOrder = line.backorderedQty || (line.quantity - (line.fulfilledQty || 0));
        poItems.push({
          productId: line.productId,
          quantity: qtyToOrder,
          unitPrice: item.purchasePrice || line.unitPrice,
          lineTotal: qtyToOrder * (item.purchasePrice || line.unitPrice)
        });
      }

      if (poItems.length === 0) {
        throw new Error('No valid backordered items to create purchase order');
      }

      if (!resolvedSupplierId) {
        throw new Error('Supplier ID is required (no preferred supplier found on items)');
      }

      // Generate PO number
      const poCount = await PurchaseOrder.countDocuments({ tenantId: req.tenantId }).session(session);
      const poNumber = `PO-${String(poCount + 1).padStart(6, '0')}`;

      const po = new PurchaseOrder({
        poNumber,
        supplierId: resolvedSupplierId,
        items: poItems,
        status: 'draft',
        notes: `Auto-generated from backorders on ${so.soNumber}`,
        createdBy: req.user._id,
        tenantId: req.tenantId
      });

      await po.save({ session });
      createdPo = po;
    });

    await logBusinessEvent({
      req,
      action: 'PO_CREATED_FROM_BACKORDER',
      entityType: 'PurchaseOrder',
      entityId: createdPo._id,
      changes: {
        summary: `Purchase order ${createdPo.poNumber} created from backorders on sales order`,
        after: { poNumber: createdPo.poNumber, itemCount: createdPo.items.length }
      },
      tenantId: req.tenantId
    });

    return res.status(201).json({
      success: true,
      purchaseOrder: createdPo,
      message: `Purchase order ${createdPo.poNumber} created from backordered items`
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

module.exports = router;
