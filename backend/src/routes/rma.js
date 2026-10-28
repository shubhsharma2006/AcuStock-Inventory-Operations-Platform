const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const SerialAudit = require('../models/SerialAudit');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const Warehouse = require('../models/Warehouse');
const Warranty = require('../models/Warranty');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const { requireAuth, requireTenantId } = require('../middleware/auth');

router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/rma/passport/:code
 * 360° Digital Product Passport & Lifecycle Lookup
 * Accepts a serial number, SKU, or product ID
 */
router.get('/passport/:code', async (req, res) => {
  try {
    const rawCode = (req.params.code || '').trim();
    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(req.tenantId);
    const codeUpper = rawCode.toUpperCase();

    // 1. Check if code matches a Serial Number in SerialAudit
    const serialAudits = await SerialAudit.find({
      serial: codeUpper,
      tenantId: tenantObjectId
    })
      .sort({ createdAt: 1 })
      .populate('performedBy', 'name username email role')
      .populate('warehouseId', 'name code address')
      .populate('salesOrderId', 'orderNumber customer buyer orderDate')
      .populate('purchaseOrderId', 'orderNumber supplierName orderDate')
      .lean();

    if (serialAudits && serialAudits.length > 0) {
      const lastAudit = serialAudits[serialAudits.length - 1];
      const productId = lastAudit.productId;

      const [product, warranty, warehouses] = await Promise.all([
        Item.findOne({ _id: productId, tenantId: req.tenantId }).lean(),
        Warranty.findOne({
          serialNumber: codeUpper,
          tenantId: req.tenantId,
          isActive: true
        }).lean({ virtuals: true }),
        Warehouse.find({ tenantId: req.tenantId, isActive: true }).select('name code isDefault').lean()
      ]);

      // Calculate lifecycle status
      let currentStatus = 'OUT';
      const inStockActions = ['IN', 'RETURN_RESTOCK', 'REPAIR_DONE'];
      if (inStockActions.includes(lastAudit.action)) {
        currentStatus = 'IN_STOCK';
      } else if (['INSPECTION', 'REPAIR_START'].includes(lastAudit.action)) {
        currentStatus = 'UNDER_REPAIR';
      } else if (lastAudit.action === 'SCRAP_WRITEOFF') {
        currentStatus = 'SCRAPPED';
      } else if (lastAudit.action === 'OUT') {
        currentStatus = 'DISPATCHED_TO_CUSTOMER';
      }

      // Look up sales order / buyer information if dispatched
      let buyerInfo = null;
      let salesOrderInfo = null;
      const outAudit = [...serialAudits].reverse().find(a => a.action === 'OUT');
      if (outAudit && outAudit.salesOrderId) {
        salesOrderInfo = outAudit.salesOrderId;
        buyerInfo = outAudit.salesOrderId.customer || outAudit.salesOrderId.buyer || null;
      }

      // Also check warranty for buyer details if available
      if (!buyerInfo && warranty?.sellerWarranty?.buyerName) {
        buyerInfo = {
          name: warranty.sellerWarranty.buyerName,
          phone: warranty.sellerWarranty.buyerPhone,
          email: warranty.sellerWarranty.buyerEmail
        };
      }

      return res.json({
        success: true,
        type: 'SERIAL',
        serial: codeUpper,
        currentStatus,
        lastAction: lastAudit.action,
        lastActionAt: lastAudit.createdAt,
        lastLocation: lastAudit.warehouseId ? lastAudit.warehouseId.name : 'Unknown Warehouse',
        product: {
          _id: product?._id,
          name: product?.name || 'Product',
          sku: product?.sku || '',
          price: product?.sellingPrice || product?.price || 0,
          category: product?.category?.name || 'General',
          unit: product?.unit?.abbreviation || 'pcs',
          imageUrl: product?.imageUrl || null
        },
        warranty: warranty ? {
          sellerStatus: warranty.sellerWarranty?.status || 'none',
          sellerExpiry: warranty.sellerWarranty?.expiryDate,
          purchaseStatus: warranty.purchaseWarranty?.status || 'none',
          claimsCount: (warranty.claims || []).length
        } : null,
        buyer: buyerInfo,
        salesOrder: salesOrderInfo,
        history: serialAudits.map(a => ({
          action: a.action,
          at: a.createdAt,
          by: a.performedBy ? (a.performedBy.name || a.performedBy.username) : 'System',
          role: a.role,
          notes: a.dispositionNotes || a.returnReason || '',
          warehouse: a.warehouseId ? a.warehouseId.name : null
        })),
        availableWarehouses: warehouses
      });
    }

    // 2. Check if code matches a Product SKU or _id
    const itemQuery = {
      tenantId: req.tenantId,
      $or: [
        { sku: { $regex: `^${rawCode}$`, $options: 'i' } }
      ]
    };
    if (mongoose.Types.ObjectId.isValid(rawCode)) {
      itemQuery.$or.push({ _id: new mongoose.Types.ObjectId(rawCode) });
    }

    const item = await Item.findOne(itemQuery).lean();

    if (item) {
      // Find current stock across warehouses
      const [stockAgg, warehouses] = await Promise.all([
        StockLedger.aggregate([
          { $match: { productId: item._id, tenantId: tenantObjectId } },
          { $group: {
            _id: '$warehouseId',
            totalIn: { $sum: { $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] }, '$quantity', 0] } },
            totalOut: { $sum: { $cond: [{ $in: ['$type', ['OUT', 'TRANSFER_OUT', 'ADJUSTMENT_OUT']] }, '$quantity', 0] } }
          }},
          { $lookup: { from: 'warehouses', localField: '_id', foreignField: '_id', as: 'warehouse' } },
          { $unwind: { path: '$warehouse', preserveNullAndEmptyArrays: true } }
        ]),
        Warehouse.find({ tenantId: req.tenantId, isActive: true }).select('name code isDefault').lean()
      ]);

      const warehouseStock = stockAgg.map(s => ({
        warehouseId: s._id,
        warehouseName: s.warehouse?.name || 'Main Warehouse',
        currentStock: Math.max(0, (s.totalIn || 0) - (s.totalOut || 0))
      }));

      const totalStock = warehouseStock.reduce((acc, w) => acc + w.currentStock, 0);

      return res.json({
        success: true,
        type: 'PRODUCT_SKU',
        product: {
          _id: item._id,
          name: item.name,
          sku: item.sku,
          price: item.sellingPrice || item.price || 0,
          category: item.category?.name || 'General',
          unit: item.unit?.abbreviation || 'pcs',
          imageUrl: item.imageUrl || null,
          totalStock
        },
        warehouseStock,
        availableWarehouses: warehouses
      });
    }

    return res.status(404).json({
      success: false,
      error: `No product or serial number found matching barcode "${rawCode}"`
    });
  } catch (error) {
    console.error('RMA passport lookup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/rma/disposition
 * Processes 1-Click Barcode RMA Actions:
 * - RETURN_RESTOCK: Returns good item to sellable inventory (+1)
 * - REPAIR_START: Moves defective item to Quarantine / Repair Lab
 * - REPAIR_DONE: Restores repaired item to sellable stock
 * - SCRAP_WRITEOFF: Marks unit unfixable / scrap loss (-1)
 */
router.post('/disposition', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { serial, disposition, warehouseId, notes, returnReason } = req.body;

    if (!serial || !disposition) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Serial number and disposition are required' });
    }

    const serialUpper = serial.trim().toUpperCase();
    const validDispositions = ['RETURN_RESTOCK', 'REPAIR_START', 'REPAIR_DONE', 'SCRAP_WRITEOFF'];
    if (!validDispositions.includes(disposition)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: `Invalid disposition. Must be one of: ${validDispositions.join(', ')}` });
    }

    // Find the last SerialAudit entry to verify existence and determine product
    const lastAudit = await SerialAudit.findOne({
      serial: serialUpper,
      tenantId: req.tenantId
    })
      .sort({ createdAt: -1 })
      .session(session);

    if (!lastAudit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: `Serial ${serialUpper} not found in system` });
    }

    const productId = lastAudit.productId;
    const resolvedWarehouseId = warehouseId || lastAudit.warehouseId || null;

    // 1. Record new SerialAudit entry
    const newAudit = new SerialAudit({
      serial: serialUpper,
      productId,
      action: disposition,
      warehouseId: resolvedWarehouseId,
      dispositionNotes: notes || '',
      returnReason: returnReason || '',
      performedBy: req.user._id,
      role: req.user.role || 'ADMIN',
      companyId: req.user.companyId || lastAudit.companyId,
      tenantId: req.tenantId
    });
    await newAudit.save({ session });

    // 2. Handle StockLedger adjustments
    if (disposition === 'RETURN_RESTOCK' || disposition === 'REPAIR_DONE') {
      // Add back to inventory (+1 stock)
      let whId = resolvedWarehouseId;
      if (!whId) {
        const defaultWh = await Warehouse.findOne({ tenantId: req.tenantId, isActive: true }).session(session);
        if (defaultWh) whId = defaultWh._id;
      }

      const ledgerEntry = new StockLedger({
        productId,
        warehouseId: whId,
        type: 'ADJUSTMENT_IN',
        quantity: 1,
        serialNumbers: [serialUpper],
        adjustmentReason: returnReason ? `RMA_${returnReason}` : (disposition === 'REPAIR_DONE' ? 'REPAIR_COMPLETED_RESTOCK' : 'CUSTOMER_RETURN_RESTOCK'),
        createdBy: req.user._id,
        role: req.user.role || 'ADMIN',
        companyId: req.user.companyId || lastAudit.companyId,
        tenantId: req.tenantId
      });
      await ledgerEntry.save({ session });
    } else if (disposition === 'SCRAP_WRITEOFF') {
      // If previous status was in stock, deduct (-1 stock)
      const inStockActions = ['IN', 'RETURN_RESTOCK', 'REPAIR_DONE'];
      if (inStockActions.includes(lastAudit.action)) {
        const ledgerEntry = new StockLedger({
          productId,
          warehouseId: resolvedWarehouseId,
          type: 'ADJUSTMENT_OUT',
          quantity: 1,
          serialNumbers: [serialUpper],
          adjustmentReason: returnReason ? `SCRAP_${returnReason}` : 'RMA_DEFECTIVE_SCRAP_WRITEOFF',
          createdBy: req.user._id,
          role: req.user.role || 'ADMIN',
          companyId: req.user.companyId || lastAudit.companyId,
          tenantId: req.tenantId
        });
        await ledgerEntry.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Serial ${serialUpper} successfully processed with disposition: ${disposition}`,
      serial: serialUpper,
      disposition
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('RMA disposition error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/rma/bulk-register-serials
 * Efficiently registers newly printed serial numbers (e.g. 200 units) into inventory
 */
router.post('/bulk-register-serials', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, warehouseId, serials } = req.body;

    if (!productId || !Array.isArray(serials) || serials.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'productId and serials array are required' });
    }

    const cleanSerials = [...new Set(serials.map(s => String(s).trim().toUpperCase()))].filter(Boolean);
    if (cleanSerials.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'No valid serial numbers provided' });
    }

    // Check if any of these serials already exist in tenant
    const existingAudits = await SerialAudit.aggregate([
      { $match: { serial: { $in: cleanSerials }, tenantId: new mongoose.Types.ObjectId(req.tenantId) } },
      { $group: { _id: '$serial' } }
    ]).session(session);

    if (existingAudits.length > 0) {
      const duplicateSerials = existingAudits.map(d => d._id);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: `The following serial(s) already exist in inventory: ${duplicateSerials.slice(0, 5).join(', ')}${duplicateSerials.length > 5 ? ` (+${duplicateSerials.length - 5} more)` : ''}`
      });
    }

    // Resolve target warehouse
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId || !mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
      const defaultWh = await Warehouse.findOne({ tenantId: req.tenantId, isActive: true }).session(session);
      if (defaultWh) targetWarehouseId = defaultWh._id;
    }

    // Bulk insert into SerialAudit
    const auditEntries = cleanSerials.map(s => ({
      serial: s,
      productId: new mongoose.Types.ObjectId(productId),
      action: 'IN',
      warehouseId: targetWarehouseId,
      dispositionNotes: 'Bulk Serial Packaging Registration',
      performedBy: req.user._id,
      role: req.user.role || 'ADMIN',
      companyId: req.user.companyId,
      tenantId: req.tenantId
    }));
    await SerialAudit.insertMany(auditEntries, { session });

    // Insert StockLedger entry so total stock count matches the registered serials
    const ledgerEntry = new StockLedger({
      productId: new mongoose.Types.ObjectId(productId),
      warehouseId: targetWarehouseId,
      type: 'IN',
      quantity: cleanSerials.length,
      serialNumbers: cleanSerials,
      adjustmentReason: 'BULK_SERIAL_BARCODE_REGISTRATION',
      createdBy: req.user._id,
      role: req.user.role || 'ADMIN',
      companyId: req.user.companyId,
      tenantId: req.tenantId
    });
    await ledgerEntry.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      registeredCount: cleanSerials.length,
      message: `Successfully registered ${cleanSerials.length} unit serial numbers into inventory`
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Bulk register serials error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
