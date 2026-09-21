const express = require('express');
const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const SerialAudit = require('../models/SerialAudit');
const Notification = require('../models/Notification');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const { validateRequest, schemas } = require('../middleware/validateRequest');
const logger = require('../utils/logger');
const { notifyRoles } = require('../services/notificationHelper');

const stockService = require('../services/stock.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const router = express.Router();

// Helper: escape regex special characters to prevent ReDoS / injection
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to create stock notification via centralized helper
async function createStockNotification(type, item, quantity, user) {
  try {
    const threshold = item.lowStockThreshold ?? 10;
    const titles = {
      stock_in:  'New Stock Entry',
      stock_out: 'Stock Dispatched',
      low_stock: 'Low Stock Alert'
    };
    const messages = {
      stock_in:  `${quantity} units of ${item.name} added to inventory`,
      stock_out: `${quantity} units of ${item.name} dispatched`,
      low_stock: `${item.name} is running low — only ${quantity} unit(s) left (threshold: ${threshold})`
    };
    const priorities = {
      stock_in:  'LOW',
      stock_out: 'MEDIUM',
      low_stock: 'HIGH'
    };

    await notifyRoles(['ADMIN', 'MANAGER'], {
      type,
      title:         titles[type],
      message:       messages[type],
      priority:      priorities[type],
      link:          'stock',
      relatedModel:  'Item',
      relatedId:     item._id,
      createdBy:     user._id,
      createdByRole: user.role,
      metadata: {
        productId:    item._id,
        productName:  item.name,
        quantity,
        performedBy:  user.name || user.email
      }
    });
  } catch (error) {
    console.error('Error creating stock notification:', error);
  }
}

// ============================================================
// SERIAL NUMBER ENDPOINTS (SAP/Zoho Style)
// ============================================================

// GET /api/stock/summary - Get real-time stock summary (Total IN - Total OUT per product)
// All authenticated users can access this (for remaining stock view)
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { search } = req.query;

    // Escape regex special characters to prevent injection / ReDoS
    const escapedSearch = search ? escapeRegex(search) : undefined;

    // Build match for search
    let productMatch = {};
    if (escapedSearch) {
      productMatch = {
        $or: [
          { 'productInfo.name': { $regex: escapedSearch, $options: 'i' } },
          { 'productInfo.shortName': { $regex: escapedSearch, $options: 'i' } }
        ]
      };
    }

    // Aggregate stock ledger to get IN and OUT totals per product
    const pipeline = [{ $match: { tenantId: req.tenantId } }];

    pipeline.push(
      // Group by product and type
      {
        $group: {
          _id: { productId: '$productId', type: '$type' },
          total: { $sum: '$quantity' }
        }
      },
      // Regroup by product only
      {
        $group: {
          _id: '$_id.productId',
          totals: {
            $push: {
              type: '$_id.type',
              total: '$total'
            }
          }
        }
      },
      // Lookup product details — only active products
      {
        $lookup: {
          from: 'items',
          let: { productId: '$_id' },
          pipeline: [{ $match: { $expr: { $and: [
            { $eq: ['$_id', '$$productId'] },
            { $eq: ['$tenantId', req.tenantId] }
          ] } } }],
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' },
      // Skip inactive/deleted products
      { $match: { 'productInfo.isActive': { $ne: false } } },
      // Match search if provided
      ...(search ? [{ $match: productMatch }] : []),
      // Project final output — include lowStockThreshold
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$productInfo.name',
          shortName: '$productInfo.shortName',
          lowStockThreshold: { $ifNull: ['$productInfo.lowStockThreshold', 10] },
          totalIn: {
            $reduce: {
              input: '$totals',
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.type', 'IN'] },
                  { $add: ['$$value', '$$this.total'] },
                  '$$value'
                ]
              }
            }
          },
          totalOut: {
            $reduce: {
              input: '$totals',
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.type', 'OUT'] },
                  { $add: ['$$value', '$$this.total'] },
                  '$$value'
                ]
              }
            }
          }
        }
      },
      { $sort: { name: 1 } }
    );

    const stockSummary = await StockLedger.aggregate(pipeline);

    // Also include products with no stock entries (quantity = 0)
    const productsWithStock = stockSummary.map(s => s.productId.toString());
    
    const allProdFilter = { isActive: { $ne: false } };
    if (req.tenantId) allProdFilter.tenantId = req.tenantId;
    if (escapedSearch) {
      allProdFilter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { shortName: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    let allProducts = await Item.find(allProdFilter).select('_id name shortName lowStockThreshold');

    // Add products without ledger entries
    const productsWithoutStock = allProducts
      .filter(p => !productsWithStock.includes(p._id.toString()))
      .map(p => ({
        productId: p._id,
        name: p.name,
        shortName: p.shortName,
        lowStockThreshold: p.lowStockThreshold ?? 10,
        totalIn: 0,
        totalOut: 0
      }));

    const items = [...stockSummary, ...productsWithoutStock].sort((a, b) => 
      a.name.localeCompare(b.name)
    );

    res.json({ items });

  } catch (error) {
    console.error('Stock summary error:', error);
    res.status(500).json({ message: 'Failed to load stock summary' });
  }
});

// GET /api/stock/serials/:productId - Get available serials for a product (for Stock OUT)
// Returns serials that are currently "IN" stock (last action was IN)
router.get('/serials/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const { status = 'available' } = req.query; // available | all
    
    // Verify product exists and get its serial policy
    const itemFilter = { _id: productId };
    if (req.tenantId) itemFilter.tenantId = req.tenantId;

    const item = await Item.findOne(itemFilter);
    if (!item) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const policy = item.serialPolicy || {};
    
    if (!policy.enableSerial) {
      return res.json({ 
        serials: [], 
        policy,
        message: 'Serial numbers are not enabled for this product' 
      });
    }
    
    // Get all serials for this product with their current status
    const matchFilter = { productId: new mongoose.Types.ObjectId(productId) };
    if (req.tenantId) matchFilter.tenantId = req.tenantId;

    const serialsAgg = await SerialAudit.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: 1 } }, // Sort by time to get last action
      { $group: { 
        _id: '$serial',
        lastAction: { $last: '$action' },
        lastActionAt: { $last: '$createdAt' },
        history: { $push: { action: '$action', at: '$createdAt', by: '$performedBy' } }
      }},
      { $sort: { lastActionAt: -1 } }
    ]);
    
    let serials = [];
    
    if (status === 'available') {
      // Only return serials where last action was 'IN' (currently in stock)
      serials = serialsAgg
        .filter(s => s.lastAction === 'IN')
        .map(s => s._id);
    } else if (status === 'out') {
      // Only return serials where last action was 'OUT' (currently out)
      serials = serialsAgg
        .filter(s => s.lastAction === 'OUT')
        .map(s => s._id);
    } else {
      // Return all with their status
      serials = serialsAgg.map(s => ({
        serial: s._id,
        status: s.lastAction === 'IN' ? 'available' : 'out',
        lastAction: s.lastAction,
        lastActionAt: s.lastActionAt
      }));
    }
    
    res.json({
      productId,
      productName: item.name,
      policy,
      totalCount: serials.length,
      serials
    });
  } catch (error) {
    console.error('Get serials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/serial/search?q=ABC - Search serial numbers across all products
// Returns matching serials with product info and current status (IN / OUT)
router.get('/serial/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ results: [] });
    }

    const query = escapeRegex(q.trim().toUpperCase());

    // Find all unique serials matching the query (prefix or substring) scoped to tenant
    const searchMatch = { serial: { $regex: query, $options: 'i' } };
    if (req.tenantId) searchMatch.tenantId = req.tenantId;

    const matches = await SerialAudit.aggregate([
      // Match serial containing the query string (escaped to prevent injection)
      { $match: searchMatch },
      // Sort by time ascending so $last gives the most recent action
      { $sort: { createdAt: 1 } },
      // Get last action per serial
      {
        $group: {
          _id: '$serial',
          productId: { $last: '$productId' },
          lastAction: { $last: '$action' },
          lastActionAt: { $last: '$createdAt' },
          performedBy: { $last: '$performedBy' }
        }
      },
      // Lookup product name
      {
        $lookup: {
          from: 'items',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      // Lookup who last acted
      {
        $lookup: {
          from: 'users',
          localField: 'performedBy',
          foreignField: '_id',
          as: 'actor'
        }
      },
      { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } },
      // Project clean output
      {
        $project: {
          _id: 0,
          serial: '$_id',
          status: { $cond: [{ $eq: ['$lastAction', 'IN'] }, 'in-stock', 'out-of-stock'] },
          lastAction: 1,
          lastActionAt: 1,
          productId: '$product._id',
          productName: '$product.name',
          productShortName: '$product.shortName',
          actorName: '$actor.name'
        }
      },
      { $sort: { serial: 1 } },
      { $limit: 20 }
    ]);

    // Also get a count of how many distinct serials per product match
    const perProduct = {};
    matches.forEach(m => {
      const key = m.productId?.toString() || 'unknown';
      if (!perProduct[key]) {
        perProduct[key] = { productName: m.productName, productShortName: m.productShortName, productId: m.productId, inStock: 0, outOfStock: 0 };
      }
      if (m.status === 'in-stock') perProduct[key].inStock++;
      else perProduct[key].outOfStock++;
    });

    res.json({
      query,
      totalMatches: matches.length,
      perProduct: Object.values(perProduct),
      results: matches
    });
  } catch (error) {
    console.error('Serial search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/serial-policy/:productId - Get serial policy for a product
// Used when Manager/User selects a product to know if serials are required
router.get('/serial-policy/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const itemFilter = { _id: productId };
    if (req.tenantId) itemFilter.tenantId = req.tenantId;

    const item = await Item.findOne(itemFilter).select('name serialPolicy');
    if (!item) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const policy = item.serialPolicy || {
      enableSerial: false,
      requireSerialOnIN: false,
      requireSerialOnOUT: false
    };
    
    res.json({
      productId,
      productName: item.name,
      policy
    });
  } catch (error) {
    console.error('Get serial policy error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/validate-serials - Check if serials already exist globally within tenant
// Used for real-time validation before form submission
router.post('/validate-serials', requireAuth, async (req, res) => {
  try {
    const { serialNumbers = [], productId, action = 'IN' } = req.body;
    
    if (!serialNumbers.length) {
      return res.json({ valid: true, duplicates: [], notAvailable: [] });
    }
    
    const normalizedSerials = serialNumbers.map(s => s.trim().toUpperCase());
    
    // Check for duplicates within the submitted list
    const seenSet = new Set();
    const internalDuplicates = [];
    for (const serial of normalizedSerials) {
      if (seenSet.has(serial)) {
        internalDuplicates.push(serial);
      }
      seenSet.add(serial);
    }
    
    if (action === 'IN') {
      // For Stock IN: Check if any serial has ever been used in this tenant
      const existingFilter = {
        serial: { $in: normalizedSerials },
        action: 'IN'
      };
      if (req.tenantId) existingFilter.tenantId = req.tenantId;

      const existingSerials = await SerialAudit.find(existingFilter).distinct('serial');
      
      return res.json({
        valid: existingSerials.length === 0 && internalDuplicates.length === 0,
        alreadyUsed: existingSerials,
        internalDuplicates,
        message: existingSerials.length > 0 
          ? `Serial(s) already exist: ${existingSerials.join(', ')}` 
          : internalDuplicates.length > 0 
            ? `Duplicate serial(s) in entry: ${internalDuplicates.join(', ')}`
            : 'All serials are valid'
      });
    } else {
      // For Stock OUT: Check if serials are currently available (last action = IN)
      const outMatch = { 
        serial: { $in: normalizedSerials },
        productId: new mongoose.Types.ObjectId(productId)
      };
      if (req.tenantId) outMatch.tenantId = req.tenantId;

      const serialsAgg = await SerialAudit.aggregate([
        { $match: outMatch },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$serial', lastAction: { $last: '$action' } }}
      ]);
      
      const availableMap = new Map(serialsAgg.map(a => [a._id, a.lastAction]));
      const notAvailable = [];
      const notInSystem = [];
      
      for (const serial of normalizedSerials) {
        const lastAction = availableMap.get(serial);
        if (!lastAction) {
          notInSystem.push(serial);
        } else if (lastAction !== 'IN') {
          notAvailable.push(serial);
        }
      }
      
      return res.json({
        valid: notAvailable.length === 0 && notInSystem.length === 0 && internalDuplicates.length === 0,
        notAvailable,
        notInSystem,
        internalDuplicates,
        message: notInSystem.length > 0 
          ? `Serial(s) not found: ${notInSystem.join(', ')}`
          : notAvailable.length > 0 
            ? `Serial(s) already out of stock: ${notAvailable.join(', ')}`
            : 'All serials are valid'
      });
    }
  } catch (error) {
    console.error('Validate serials error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/serial-audit/:serial - Get full audit history for a serial
router.get('/serial-audit/:serial', requireAuth, async (req, res) => {
  try {
    const { serial } = req.params;
    const normalizedSerial = serial.trim().toUpperCase();
    
    const auditFilter = { serial: normalizedSerial };
    if (req.tenantId) auditFilter.tenantId = req.tenantId;

    const auditHistory = await SerialAudit.find(auditFilter)
      .populate('productId', 'name shortName')
      .populate('performedBy', 'name email role')
      .sort({ createdAt: 1 });
    
    if (auditHistory.length === 0) {
      return res.status(404).json({ message: 'Serial number not found in system' });
    }
    
    const lastEntry = auditHistory[auditHistory.length - 1];
    
    res.json({
      serial: normalizedSerial,
      currentStatus: lastEntry.action === 'IN' ? 'In Stock' : 'Out of Stock',
      product: lastEntry.productId,
      totalTransactions: auditHistory.length,
      history: auditHistory.map(h => ({
        action: h.action,
        performedBy: h.performedBy,
        role: h.role,
        timestamp: h.createdAt
      }))
    });
  } catch (error) {
    console.error('Get serial audit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// END SERIAL NUMBER ENDPOINTS
// ============================================================

// POST /api/stock/in - Create a new 'IN' entry
// Allowed: ADMIN, MANAGER, USER (all can perform stock operations)
router.post('/in', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), requirePermission('canStockIn'), validateRequest(schemas.stockIn), async (req, res) => {
  const { productId, quantity, serialNumbers = [], supplier, condition, transaction, modelVariant } = req.body;

  if (!productId || quantity === undefined || quantity === null) {
    return res.status(400).json({ message: 'Product ID and quantity are required' });
  }

  try {
    const payload = stockService.validateStockMovementPayload({
      productId,
      quantity,
      serialNumbers
    });

    const itemFilter = { _id: productId };
    if (req.tenantId) itemFilter.tenantId = req.tenantId;

    const item = await Item.findOne(itemFilter);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Include modelVariant in transaction details
    const transactionData = {
      ...transaction,
      modelVariant: modelVariant || item.shortName || ''
    };

    await stockService.stockIn(
      { productId, quantity: payload.quantity, serialNumbers: payload.serialNumbers, supplier, condition, transaction: transactionData, tenantId: req.tenantId },
      req.user
    );

    // Create notification for stock entry
    await createStockNotification('stock_in', item, quantity, req.user);
    
    // Emit real-time update to all connected clients
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('stock-update', {
        type: 'IN',
        productId,
        productName: item.name,
        quantity,
        tenantId: req.tenantId,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    // Emit business audit event
    logBusinessEvent({
      req,
      action: 'STOCK_IN',
      entityType: 'Item',
      entityId: item._id,
      changes: {
        summary: `Stock IN: ${payload.quantity} units for "${item.name}"`
      },
      details: {
        quantity: payload.quantity,
        supplier,
        condition,
        serialNumbers: payload.serialNumbers
      }
    }).catch(() => {});
    
    res.status(201).json({ success: true, message: 'Stock entry created successfully' });
  } catch (error) {
    console.error('Stock IN error:', error);
    const isBusinessError = error.message && !error.message.toLowerCase().includes('server');
    res.status(isBusinessError ? 400 : 500).json({
      success: false,
      error: error.message || 'Server error'
    });
  }
});

// POST /api/stock/out - Create a new 'OUT' entry
// Allowed: ADMIN, MANAGER, USER (all can perform stock operations)
router.post('/out', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), requirePermission('canStockOut'), validateRequest(schemas.stockOut), async (req, res) => {
  const { productId, quantity, serialNumbers = [], buyer, condition, transaction, modelVariant } = req.body;

  if (!productId || quantity === undefined || quantity === null) {
    return res.status(400).json({ message: 'Product ID and quantity are required' });
  }

  try {
    const payload = stockService.validateStockMovementPayload({
      productId,
      quantity,
      serialNumbers
    });

    const itemFilter = { _id: productId };
    if (req.tenantId) itemFilter.tenantId = req.tenantId;

    const item = await Item.findOne(itemFilter);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Include modelVariant in transaction details
    const transactionData = {
      ...transaction,
      modelVariant: modelVariant || item.shortName || ''
    };

    await stockService.stockOut(
      { productId, quantity: payload.quantity, serialNumbers: payload.serialNumbers, buyer, condition, transaction: transactionData, tenantId: req.tenantId },
      req.user
    );

    // Create notification for stock out
    await createStockNotification('stock_out', item, quantity, req.user);
    
    // Emit real-time update to all connected clients
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('stock-update', {
        type: 'OUT',
        productId,
        productName: item.name,
        quantity,
        tenantId: req.tenantId,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    // Emit business audit event
    logBusinessEvent({
      req,
      action: 'STOCK_OUT',
      entityType: 'Item',
      entityId: item._id,
      changes: {
        summary: `Stock OUT: ${payload.quantity} units for "${item.name}"`
      },
      details: {
        quantity: payload.quantity,
        buyer,
        condition,
        serialNumbers: payload.serialNumbers
      }
    }).catch(() => {});
    
    // Check for low stock alert using item's configured threshold
    const newStock = await item.getCurrentStock();
    const threshold = item.lowStockThreshold ?? 10;
    if (newStock <= threshold && newStock >= 0) {
      await createStockNotification('low_stock', item, newStock, req.user);
      
      // Emit low stock alert
      if (global.emitRealTimeUpdate) {
        global.emitRealTimeUpdate('low-stock-alert', {
          productId,
          productName: item.name,
          currentStock: newStock,
          threshold,
          tenantId: req.tenantId,
          timestamp: new Date()
        });
      }

      // Send Low Stock Alert Email
      if (req.user?.email) {
        const { sendLowStockAlertEmail } = require('../services/email.service');
        sendLowStockAlertEmail({
          to: req.user.email,
          name: req.user.name || 'Operations Lead',
          items: [{
            name: item.name,
            sku: item.sku,
            currentStock: newStock,
            threshold
          }]
        }).catch((err) => logger.warn('Low stock alert email error:', err.message));
      }
    }
    
    res.status(201).json({ success: true, message: 'Stock entry created successfully' });
  } catch (error) {
    console.error('Stock OUT error:', error);
    const isBusinessError = error.message && !error.message.toLowerCase().includes('server');
    res.status(isBusinessError ? 400 : 500).json({
      success: false,
      error: error.message || 'Server error'
    });
  }
});

// GET /api/stock - Get all stock entries with summary
// Data isolation: 
// - Admin sees all activity within tenant
// - Manager/User see only their own entries (CANNOT see Admin activity)
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = {};
    if (req.tenantId) query.tenantId = req.tenantId;
    
    if (req.userRole === 'ADMIN' || req.userRole === 'SUPER_ADMIN') {
      // Admin / Super Admin sees all data in tenant
    } else {
      // Manager and User see only their own data
      query.createdBy = req.userId;
      query.role = { $ne: 'ADMIN' };
    }
    
    const stockEntries = await StockLedger.find(query)
      .populate('productId', 'name shortName')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    // Calculate summary - group by product and sum quantities
    const productSummary = {};
    let totalQuantity = 0;
    
    stockEntries.forEach(entry => {
      const productKey = entry.productId?._id?.toString() || 'unknown';
      if (!productSummary[productKey]) {
        productSummary[productKey] = {
          productId: entry.productId?._id,
          productName: entry.productId?.name || 'Unknown',
          quantity: 0
        };
      }
      const delta = entry.type === 'IN' ? entry.quantity : -entry.quantity;
      productSummary[productKey].quantity += delta || 0;
      totalQuantity += delta || 0;
    });
    
    const stockArray = Object.values(productSummary);
    
    res.json(stockArray);
  } catch (error) {
    console.error('Get all stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/ledger - Get stock ledger with full history
router.get('/ledger', requireAuth, requirePermission('canViewStockLedger'), async (req, res) => {
  try {
    const { productId, type, startDate, endDate, userId, page = 1, limit = 50 } = req.query;
    
    let query = {};
    if (req.tenantId) query.tenantId = req.tenantId;
    
    if (req.userRole === 'ADMIN' || req.userRole === 'SUPER_ADMIN') {
      if (userId) query.createdBy = userId;
    } else {
      query.createdBy = req.userId;
      query.role = { $ne: 'ADMIN' };
    }
    
    if (productId) query.productId = productId;
    if (type) query.type = type.toUpperCase();
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [entries, total] = await Promise.all([
      StockLedger.find(query)
        .populate('productId', 'name shortName hsn')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLedger.countDocuments(query)
    ]);
    
    res.json({
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get stock ledger error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/activity/:userId - Get stock activity for a specific user (ADMIN ONLY)
router.get('/activity/:userId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { productId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    const User = require('../models/User');
    const userFilter = { _id: userId };
    if (req.tenantId) userFilter.tenantId = req.tenantId;

    const targetUser = await User.findOne(userFilter).select('name email role');
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let query = { createdBy: userId };
    if (req.tenantId) query.tenantId = req.tenantId;
    
    if (productId) query.productId = productId;
    if (type) query.type = type.toUpperCase();
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const aggMatch = { createdBy: new mongoose.Types.ObjectId(userId) };
    if (req.tenantId) aggMatch.tenantId = req.tenantId;

    const [entries, total, summary] = await Promise.all([
      StockLedger.find(query)
        .populate('productId', 'name shortName hsn')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLedger.countDocuments(query),
      StockLedger.aggregate([
        { $match: aggMatch },
        { $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } }
        }}
      ])
    ]);
    
    res.json({
      user: targetUser,
      entries,
      summary: summary.reduce((acc, item) => {
        acc[item._id] = { count: item.count, totalQuantity: item.totalQuantity };
        return acc;
      }, {}),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/activity-summary - Get activity summary for all users (ADMIN ONLY)
router.get('/activity-summary', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const User = require('../models/User');

    const userFilter = { role: { $in: ['MANAGER', 'USER'] } };
    if (req.tenantId) userFilter.tenantId = req.tenantId;

    const usersAndManagers = await User.find(userFilter)
      .select('name email role isActive createdAt').lean();

    const aggMatch = { role: { $in: ['MANAGER', 'USER'] } };
    if (req.tenantId) aggMatch.tenantId = req.tenantId;

    const activityAgg = await StockLedger.aggregate([
      { $match: aggMatch },
      {
        $group: {
          _id: { userId: '$createdBy', type: '$type' },
          count:         { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } },
          lastActivity:  { $max: '$createdAt' }
        }
      }
    ]);

    const activityMap = {};
    for (const row of activityAgg) {
      const uid = row._id.userId.toString();
      if (!activityMap[uid]) activityMap[uid] = {};
      activityMap[uid][row._id.type] = {
        count:         row.count,
        totalQuantity: row.totalQuantity,
        lastActivity:  row.lastActivity
      };
    }

    const activitySummary = usersAndManagers.map(user => {
      const uid   = user._id.toString();
      const inA   = activityMap[uid]?.IN  || { count: 0, totalQuantity: 0, lastActivity: null };
      const outA  = activityMap[uid]?.OUT || { count: 0, totalQuantity: 0, lastActivity: null };
      const lastActivity = inA.lastActivity || outA.lastActivity
        ? Math.max(inA.lastActivity?.getTime() || 0, outA.lastActivity?.getTime() || 0)
        : null;

      return {
        userId:      user._id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        isActive:    user.isActive,
        joinedAt:    user.createdAt,
        stockIn:  { count: inA.count,  quantity: inA.totalQuantity  },
        stockOut: { count: outA.count, quantity: outA.totalQuantity },
        lastActivity
      };
    });

    activitySummary.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

    res.json({
      total:    activitySummary.length,
      managers: activitySummary.filter(u => u.role === 'MANAGER'),
      users:    activitySummary.filter(u => u.role === 'USER')
    });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/ledger/:id - Get a single stock ledger entry by ID
router.get('/ledger/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const entry = await StockLedger.findOne(filter)
      .populate('productId', 'name shortName serialPolicy salesPrice purchasePrice')
      .populate('createdBy', 'name email role');

    if (!entry) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }

    res.json({ entry });
  } catch (error) {
    console.error('Get ledger entry error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❌ PUT /api/stock/ledger/:id - DISABLED (Ledger is immutable — SAP-style)
// Corrections must be made via POST /api/stock/ledger/:id/reverse
router.put('/ledger/:id', requireAuth, (req, res) => {
  return res.status(403).json({
    message: 'Stock ledger entries cannot be edited. The ledger is immutable. Use POST /api/stock/ledger/:id/reverse to create a correction entry.',
    code: 'LEDGER_IMMUTABLE'
  });
});

// POST /api/stock/ledger/:id/reverse - Create an offsetting correction entry (ADMIN ONLY)
// Enterprise pattern: errors are corrected by new entries, never by mutating existing ones.
// This preserves audit trail integrity and allows the AI layer to reason from reliable data.
router.post('/ledger/:id/reverse', requireAuth, validateObjectId, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, quantity: overrideQty } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ message: 'A reason for the reversal is required (min 5 characters).', code: 'REASON_REQUIRED' });
    }

    const filter = { _id: id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const original = await StockLedger.findOne(filter).populate('productId', 'name');
    if (!original) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }
    if (original.isDeleted) {
      return res.status(409).json({ message: 'This entry has already been reversed/deleted.', code: 'ALREADY_REVERSED' });
    }

    // Reversal type: flip IN <-> OUT (and TRANSFER variants)
    const reversalTypeMap = { IN: 'OUT', OUT: 'IN', TRANSFER_IN: 'TRANSFER_OUT', TRANSFER_OUT: 'TRANSFER_IN' };
    const reversalType = reversalTypeMap[original.type];
    const reversalQty = overrideQty && overrideQty > 0 ? overrideQty : original.quantity;

    const session = await StockLedger.startSession();
    let reversalEntry;
    try {
      await session.withTransaction(async () => {
        // 1. Soft-delete the original entry
        await StockLedger.updateOne(
          { _id: original._id },
          {
            $set: {
              isDeleted: true,
              deletedBy: req.userId,
              deletedAt: new Date()
            }
          },
          { session, skipTenantIsolation: true }
        );

        // 2. Create the offsetting reversal entry
        reversalEntry = new StockLedger({
          tenantId: original.tenantId,
          companyId: original.companyId,
          productId: original.productId,
          warehouseId: original.warehouseId,
          type: reversalType,
          quantity: reversalQty,
          condition: original.condition,
          serialNumbers: original.serialNumbers,
          partyDetails: original.partyDetails,
          transactionDetails: original.transactionDetails,
          createdBy: req.userId,
          role: req.userRole,
          notes: `[REVERSAL of ${original._id}] ${reason.trim()}`
        });
        await reversalEntry.save({ session });
      });
    } finally {
      await session.endSession();
    }

    logger.info('[AUDIT] Stock entry reversed: %o', {
      originalEntryId: id,
      reversalEntryId: reversalEntry._id,
      reversedBy: req.userId,
      reason: reason.trim(),
      originalQty: original.quantity,
      reversalQty
    });

    logBusinessEvent({
      req,
      action: 'STOCK_ADJUSTED',
      entityType: 'StockLedger',
      entityId: original._id,
      changes: {
        summary: `Reversed stock entry ${original._id} (${reversalType} ${reversalQty} units). Reason: ${reason}`
      },
      details: {
        originalEntryId: original._id,
        reversalEntryId: reversalEntry._id,
        reversalType,
        quantity: reversalQty,
        reason
      },
      severity: 'WARNING'
    }).catch(() => {});

    res.status(201).json({
      message: 'Reversal entry created. Original entry soft-deleted.',
      originalEntryId: original._id,
      reversalEntry: {
        _id: reversalEntry._id,
        type: reversalEntry.type,
        quantity: reversalEntry.quantity,
        notes: reversalEntry.notes
      }
    });
  } catch (error) {
    console.error('Reversal error:', error);
    res.status(500).json({ message: 'Server error during reversal' });
  }
});

// ❌ PUT /api/stock/:id - DISABLED for all other IDs (Ledger is immutable)
router.put('/:id', requireAuth, (req, res) => {
  return res.status(403).json({
    message: 'Stock entries cannot be edited. Ledger is immutable (SAP-style).',
    code: 'LEDGER_IMMUTABLE'
  });
});

// ❌ DELETE /api/stock/ledger/:id - DISABLED (hard delete violates immutability)
// Use POST /api/stock/ledger/:id/reverse to correct entries instead.
router.delete('/ledger/:id', requireAuth, (req, res) => {
  return res.status(403).json({
    message: 'Stock ledger entries cannot be hard-deleted. The ledger is immutable. Use POST /api/stock/ledger/:id/reverse to create a correction entry.',
    code: 'LEDGER_IMMUTABLE'
  });
});

// ❌ DELETE /api/stock/:id - DISABLED for non-Admin (Ledger is immutable)
router.delete('/:id', requireAuth, (req, res) => {
  return res.status(403).json({ 
    message: 'Stock entries cannot be deleted. Ledger is immutable (SAP-style).',
    code: 'LEDGER_IMMUTABLE'
  });
});

// GET /api/stock/:productId - Get stock for a product
router.get('/:productId', requireAuth, validateObjectId, async (req, res) => {
  try {
    const { productId } = req.params;
    const itemFilter = { _id: productId };
    if (req.tenantId) itemFilter.tenantId = req.tenantId;

    const item = await Item.findOne(itemFilter);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    let historyQuery = { productId };
    if (req.tenantId) historyQuery.tenantId = req.tenantId;

    if (req.userRole === 'MANAGER' || req.userRole === 'USER') {
      historyQuery.createdBy = req.userId;
      historyQuery.role = { $ne: 'ADMIN' };
    }

    const stockEntries = await StockLedger.find(historyQuery)
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });
      
    const allQuery = { productId };
    if (req.tenantId) allQuery.tenantId = req.tenantId;

    const allEntries = await StockLedger.find(allQuery);
    const stock = allEntries.reduce((acc, entry) => {
      return acc + (entry.type === 'IN' ? entry.quantity : -entry.quantity);
    }, 0);

    res.json({ productId, stock, history: stockEntries });
  } catch (error) {
    console.error('Get stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;