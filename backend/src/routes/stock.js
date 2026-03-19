const express = require('express');
const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const SerialAudit = require('../models/SerialAudit');
const Notification = require('../models/Notification');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const logger = require('../utils/logger');
const { notifyRoles } = require('../services/notificationHelper');

const stockService = require('../services/stock.service');
const router = express.Router();

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

    // Build match for search
    let productMatch = {};
    if (search) {
      productMatch = {
        $or: [
          { 'productInfo.name': { $regex: search, $options: 'i' } },
          { 'productInfo.shortName': { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Aggregate stock ledger to get IN and OUT totals per product
    const stockSummary = await StockLedger.aggregate([
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
          localField: '_id',
          foreignField: '_id',
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
    ]);

    // Also include products with no stock entries (quantity = 0)
    const productsWithStock = stockSummary.map(s => s.productId.toString());
    
    let allProducts = await Item.find(
      search ? {
        isActive: { $ne: false },
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { shortName: { $regex: search, $options: 'i' } }
        ]
      } : { isActive: { $ne: false } }
    ).select('_id name shortName lowStockThreshold');

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
    const item = await Item.findById(productId);
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
    const serialsAgg = await SerialAudit.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
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

    const query = q.trim().toUpperCase();

    // Find all unique serials matching the query (prefix or substring)
    const matches = await SerialAudit.aggregate([
      // Match serial containing the query string
      { $match: { serial: { $regex: query, $options: 'i' } } },
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
    
    const item = await Item.findById(productId).select('name serialPolicy');
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

// GET /api/stock/validate-serials - Check if serials already exist globally
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
      // For Stock IN: Check if any serial has ever been used globally
      const existingSerials = await SerialAudit.find({
        serial: { $in: normalizedSerials },
        action: 'IN'
      }).distinct('serial');
      
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
      const serialsAgg = await SerialAudit.aggregate([
        { $match: { 
          serial: { $in: normalizedSerials },
          productId: new mongoose.Types.ObjectId(productId)
        }},
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
    
    const auditHistory = await SerialAudit.find({ serial: normalizedSerial })
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
router.post('/in', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), requirePermission('canStockIn'), async (req, res) => {
  const { productId, quantity, serialNumbers = [], supplier, condition, transaction, modelVariant } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ message: 'Product ID and quantity are required' });
  }

  try {
    const item = await Item.findById(productId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Include modelVariant in transaction details
    const transactionData = {
      ...transaction,
      modelVariant: modelVariant || item.shortName || ''
    };

    await stockService.stockIn(
      { productId, quantity, serialNumbers, supplier, condition, transaction: transactionData },
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
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Stock IN error:', error);
    // Business-logic errors thrown by stockService (serialdup, inactive item, etc.) → 400
    const isBusinessError = error.message && !error.message.toLowerCase().includes('server');
    res.status(isBusinessError ? 400 : 500).json({ message: error.message || 'Server error' });
  }
});

// POST /api/stock/out - Create a new 'OUT' entry
// Allowed: ADMIN, MANAGER, USER (all can perform stock operations)
router.post('/out', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), requirePermission('canStockOut'), async (req, res) => {
  const { productId, quantity, serialNumbers = [], buyer, condition, transaction, modelVariant } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ message: 'Product ID and quantity are required' });
  }

  try {
    const item = await Item.findById(productId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Include modelVariant in transaction details
    const transactionData = {
      ...transaction,
      modelVariant: modelVariant || item.shortName || ''
    };

    await stockService.stockOut(
      { productId, quantity, serialNumbers, buyer, condition, transaction: transactionData },
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
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }
    
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
          timestamp: new Date()
        });
      }
    }
    
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Stock OUT error:', error);
    // Business-logic errors thrown by stockService (insufficient stock, serial not available, etc.) → 400
    const isBusinessError = error.message && !error.message.toLowerCase().includes('server');
    res.status(isBusinessError ? 400 : 500).json({ message: error.message || 'Server error' });
  }
});

// GET /api/stock - Get all stock entries with summary
// Data isolation: 
// - Admin sees all activity
// - Manager/User see only their own entries (CANNOT see Admin activity)
router.get('/', requireAuth, async (req, res) => {
  try {
    // Build query based on role
    let query = {};
    
    if (req.userRole === 'ADMIN' || req.userRole === 'SUPER_ADMIN') {
      // Admin / Super Admin sees all data (no filter)
    } else {
      // Manager and User see only their own data
      query.createdBy = req.userId;
      // Also exclude any Admin entries from their view
      query.role = { $ne: 'ADMIN' };
    }
    
    // Get stock ledger entries based on role
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
      // IN = add, OUT = subtract (both stored as positive numbers)
      const delta = entry.type === 'IN' ? entry.quantity : -entry.quantity;
      productSummary[productKey].quantity += delta || 0;
      totalQuantity += delta || 0;
    });
    
    // Return stock as an array with quantity field for frontend compatibility
    const stockArray = Object.values(productSummary);
    
    res.json(stockArray);
  } catch (error) {
    console.error('Get all stock error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stock/ledger - Get stock ledger with full history
// Data isolation: 
// - Admin sees all (can filter by userId to see individual activity)
// - Manager/User see only their own entries (CANNOT see Admin activity)
router.get('/ledger', requireAuth, requirePermission('canViewStockLedger'), async (req, res) => {
  try {
    const { productId, type, startDate, endDate, userId, page = 1, limit = 50 } = req.query;
    
    // Build query based on role (data isolation)
    let query = {};
    
    if (req.userRole === 'ADMIN' || req.userRole === 'SUPER_ADMIN') {
      // Admin / Super Admin can see all activity, optionally filter by userId
      if (userId) {
        query.createdBy = userId;
      }
      // No other restrictions
    } else {
      // Manager/User see only their own data AND cannot see Admin activity
      query.createdBy = req.userId;
      query.role = { $ne: 'ADMIN' }; // Exclude Admin entries from their view
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
// Admin can view individual Manager or User activity
router.get('/activity/:userId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { productId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    // Verify the user exists
    const User = require('../models/User');
    const targetUser = await User.findById(userId).select('name email role');
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let query = { createdBy: userId };
    
    if (productId) query.productId = productId;
    if (type) query.type = type.toUpperCase();
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [entries, total, summary] = await Promise.all([
      StockLedger.find(query)
        .populate('productId', 'name shortName hsn')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLedger.countDocuments(query),
      StockLedger.aggregate([
        { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
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
// Admin can see overview of all Manager and User activity
router.get('/activity-summary', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const User = require('../models/User');

    // Get all managers and users
    const usersAndManagers = await User.find({
      role: { $in: ['MANAGER', 'USER'] }
    }).select('name email role isActive createdAt').lean();

    // Single aggregation instead of N+1 individual queries.
    // Groups by (userId × type) so we get IN/OUT counts for every user in one round-trip.
    const activityAgg = await StockLedger.aggregate([
      { $match: { role: { $in: ['MANAGER', 'USER'] } } },
      {
        $group: {
          _id: { userId: '$createdBy', type: '$type' },
          count:         { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } },
          lastActivity:  { $max: '$createdAt' }
        }
      }
    ]);

    // Build a lookup map: userId → { IN: {...}, OUT: {...} }
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

    // Sort by last activity (most recent first)
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

    const entry = await StockLedger.findById(id)
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

// ❌ PUT /api/stock/:id - DISABLED (Ledger is immutable)
// NOTE: This must come AFTER PUT /ledger/:id to avoid swallowing that route
router.put('/ledger/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, condition, partyDetails, transactionDetails, notes, serialNumbers } = req.body;
    
    // Find the entry first
    const entry = await StockLedger.findById(id).populate('productId', 'name');
    
    if (!entry) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }
    
    // Store original values for audit
    const originalValues = {
      quantity: entry.quantity,
      condition: entry.condition,
      partyDetails: entry.partyDetails,
      transactionDetails: entry.transactionDetails,
      notes: entry.notes
    };
    
    // Track what was changed
    const changes = [];
    
    // Update allowed fields
    if (quantity !== undefined && quantity !== entry.quantity) {
      changes.push({ field: 'quantity', from: entry.quantity, to: quantity });
      entry.quantity = quantity;
    }
    
    if (condition !== undefined && condition !== entry.condition) {
      changes.push({ field: 'condition', from: entry.condition, to: condition });
      entry.condition = condition;
    }
    
    if (partyDetails !== undefined) {
      changes.push({ field: 'partyDetails', from: entry.partyDetails, to: partyDetails });
      entry.partyDetails = { ...entry.partyDetails, ...partyDetails };
    }
    
    if (transactionDetails !== undefined) {
      changes.push({ field: 'transactionDetails', from: entry.transactionDetails, to: transactionDetails });
      entry.transactionDetails = { ...entry.transactionDetails, ...transactionDetails };
    }
    
    if (notes !== undefined) {
      changes.push({ field: 'notes', from: entry.notes, to: notes });
      entry.notes = notes;
    }
    
    if (serialNumbers !== undefined) {
      changes.push({ field: 'serialNumbers', from: entry.serialNumbers?.length || 0, to: serialNumbers.length });
      entry.serialNumbers = serialNumbers;
    }
    
    // Add edit metadata
    entry.lastEditedBy = req.userId;
    entry.lastEditedAt = new Date();
    entry.editHistory = entry.editHistory || [];
    entry.editHistory.push({
      editedBy: req.userId,
      editedAt: new Date(),
      changes: changes
    });
    
    await entry.save();

    logger.info('[AUDIT] Stock entry edited: %o', { 
      entryId: id, 
      editedBy: req.userId, 
      changes 
    });
    
    res.json({ 
      message: 'Stock entry updated successfully',
      entry: entry,
      changes: changes
    });
  } catch (error) {
    console.error('Edit stock entry error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❌ PUT /api/stock/:id - DISABLED for all other IDs (Ledger is immutable)
router.put('/:id', requireAuth, (req, res) => {
  return res.status(403).json({
    message: 'Stock entries cannot be edited. Ledger is immutable (SAP-style).',
    code: 'LEDGER_IMMUTABLE'
  });
});

// DELETE /api/stock/ledger/:id - Delete stock ledger entry (ADMIN ONLY)
// Note: This allows Admin to delete entries, but creates an audit trail
router.delete('/ledger/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the entry first
    const entry = await StockLedger.findById(id).populate('productId', 'name');
    
    if (!entry) {
      return res.status(404).json({ message: 'Stock entry not found' });
    }
    
    // Store entry info for audit log before deletion
    const entryInfo = {
      entryId: entry._id,
      productId: entry.productId?._id,
      productName: entry.productId?.name,
      quantity: entry.quantity,
      type: entry.type,
      deletedBy: req.userId,
      deletedAt: new Date()
    };
    
    // Delete the entry
    await StockLedger.findByIdAndDelete(id);

    logger.info('[AUDIT] Stock entry deleted: %o', entryInfo);
    
    res.json({ 
      message: 'Stock entry deleted successfully',
      deletedEntry: entryInfo
    });
  } catch (error) {
    console.error('Delete stock entry error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ❌ DELETE /api/stock/:id - DISABLED for non-Admin (Ledger is immutable)
router.delete('/:id', requireAuth, (req, res) => {
  return res.status(403).json({ 
    message: 'Stock entries cannot be deleted. Ledger is immutable (SAP-style).',
    code: 'LEDGER_IMMUTABLE'
  });
});

// GET /api/stock/:productId - Get stock for a product
// Data isolation: Manager/User cannot see Admin activity
router.get('/:productId', requireAuth, validateObjectId, async (req, res) => {
  try {
    const { productId } = req.params;
    const item = await Item.findById(productId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Data isolation for history
    let historyQuery = { productId };
    if (req.userRole === 'MANAGER' || req.userRole === 'USER') {
      // See only their own entries, exclude Admin activity
      historyQuery.createdBy = req.userId;
      historyQuery.role = { $ne: 'ADMIN' };
    }
    // ADMIN and SUPER_ADMIN see all history for this product

    const stockEntries = await StockLedger.find(historyQuery)
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });
      
    // Total stock is global (IN - OUT)
    const allEntries = await StockLedger.find({ productId });
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