const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// IN-PROCESS DASHBOARD CACHE
// ============================================================
// Dashboard endpoints run 10-15 parallel aggregations each call.
// A 60-second TTL cache eliminates redundant DB work when multiple
// admins/managers have the dashboard open simultaneously, while still
// keeping data fresh enough for operational use.
// Cache is keyed by "<route>:<userId>" so each user gets their own snapshot.
const _dashCache = new Map(); // key → { data, expiresAt }
const DASH_TTL_MS = 60 * 1000; // 60 seconds

function getCached(key) {
  const entry = _dashCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  _dashCache.delete(key);
  return null;
}
function setCache(key, data) {
  _dashCache.set(key, { data, expiresAt: Date.now() + DASH_TTL_MS });
}
// Allow routes to manually bust the cache (e.g. after a stock-in/out)
function bustCache(userId) {
  for (const key of _dashCache.keys()) {
    if (!userId || key.includes(String(userId))) _dashCache.delete(key);
  }
}
module.exports.bustCache = bustCache;

// GET /api/reports/user-activity/:userId - Get specific user's activity (Admin only)
router.get('/user-activity/:userId', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;
    
    // Convert userId to ObjectId for aggregation
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Build query for find (auto-casts string to ObjectId)
    const query = { createdBy: userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    
    // Build query for aggregation (needs explicit ObjectId)
    const aggQuery = { createdBy: userObjectId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    
    if (startDate || endDate) {
      query.createdAt = {};
      aggQuery.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
        aggQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
        aggQuery.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
      }
    }
    
    if (type && ['IN', 'OUT'].includes(type)) {
      query.type = type;
      aggQuery.type = type;
    }
    
    // Get user info
    const user = await User.findOne({ _id: userId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) }).select('name email phone role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get stock entries
    const entries = await StockLedger.find(query)
      .populate('productId', 'name shortName')
      .sort({ createdAt: -1 })
      .limit(500);
    
    // Calculate summary using aggregation with ObjectId
    const summary = await StockLedger.aggregate([
      { $match: aggQuery },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const stockIn = summary.find(s => s._id === 'IN') || { totalQuantity: 0, count: 0 };
    const stockOut = summary.find(s => s._id === 'OUT') || { totalQuantity: 0, count: 0 };
    
    res.json({
      user,
      summary: {
        totalStockIn: stockIn.totalQuantity,
        totalStockOut: stockOut.totalQuantity,
        stockInCount: stockIn.count,
        stockOutCount: stockOut.count,
        netChange: stockIn.totalQuantity - stockOut.totalQuantity
      },
      entries
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/reports/user-summary - Get all users with their stats (Admin only)
router.get('/user-summary', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { role, startDate, endDate } = req.query;
    
    // Get all users/managers
    const userQuery = { isActive: true, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    if (role && ['MANAGER', 'USER'].includes(role)) {
      userQuery.role = role;
    } else {
      userQuery.role = { $in: ['MANAGER', 'USER'] };
    }
    
    const users = await User.find(userQuery).select('name email phone role lastLogin createdAt');
    
    // Build date filter for aggregation
    const dateMatch = { ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    if (startDate || endDate) {
      dateMatch.createdAt = {};
      if (startDate) dateMatch.createdAt.$gte = new Date(startDate);
      if (endDate) dateMatch.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    
    // Get activity stats for each user
    const activityStats = await StockLedger.aggregate([
      { $match: dateMatch },
      {
        $group: {
          _id: { userId: '$createdBy', type: '$type' },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Map stats to users
    const userSummaries = users.map(user => {
      const userStatsIn = activityStats.find(s => 
        s._id.userId?.toString() === user._id.toString() && s._id.type === 'IN'
      );
      const userStatsOut = activityStats.find(s => 
        s._id.userId?.toString() === user._id.toString() && s._id.type === 'OUT'
      );
      
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        stockIn: userStatsIn?.totalQuantity || 0,
        stockOut: userStatsOut?.totalQuantity || 0,
        stockInCount: userStatsIn?.count || 0,
        stockOutCount: userStatsOut?.count || 0,
        totalTransactions: (userStatsIn?.count || 0) + (userStatsOut?.count || 0)
      };
    });
    
    // Sort by total transactions
    userSummaries.sort((a, b) => b.totalTransactions - a.totalTransactions);
    
    res.json(userSummaries);
  } catch (error) {
    console.error('Error fetching user summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/reports/product-by-user - Get products by user (defaults to current user or query param)
router.get('/product-by-user', requireAuth, async (req, res) => {
  const targetId = req.query.userId || req.userId;
  req.params.userId = targetId;
  return handleProductByUser(req, res);
});

// GET /api/reports/product-by-user/:userId - Get products added by specific user (Admin only)
router.get('/product-by-user/:userId', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  return handleProductByUser(req, res);
});

async function handleProductByUser(req, res) {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    const matchQuery = { 
      createdBy: new (require('mongoose').Types.ObjectId)(userId),
      ...(req.tenantId ? { tenantId: req.tenantId } : {})
    };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    
    const productStats = await StockLedger.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { productId: '$productId', type: '$type' },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$_id.productId',
          productName: { $first: '$product.name' },
          shortName: { $first: '$product.shortName' },
          stats: {
            $push: {
              type: '$_id.type',
              quantity: '$totalQuantity',
              count: '$count'
            }
          }
        }
      }
    ]);
    
    // Format results
    const formatted = productStats.map(p => {
      const inStat = p.stats.find(s => s.type === 'IN') || { quantity: 0, count: 0 };
      const outStat = p.stats.find(s => s.type === 'OUT') || { quantity: 0, count: 0 };
      
      return {
        productId: p._id,
        productName: p.productName,
        shortName: p.shortName,
        stockIn: inStat.quantity,
        stockOut: outStat.quantity,
        transactions: inStat.count + outStat.count
      };
    });
    
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching product by user:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// ============================================================
// DASHBOARD STATS
// GET /api/reports/stock-movement - Get stock movement data (Admin only)
router.get('/stock-movement', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const stockMovements = await StockLedger.aggregate([
      {
        $match: { ...(req.tenantId ? { tenantId: req.tenantId } : {}) }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
            type: '$type'
          },
          totalQuantity: { $sum: '$quantity' }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1
        }
      }
    ]);

    res.json(stockMovements);
  } catch (error) {
    console.error('Error fetching stock movement data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// OWN ACTIVITY REPORTS (Manager & User)
// Manager and User can ONLY see their own activity (not Admin's)
// ============================================================

/**
 * GET /api/reports/my-activity
 * Get own stock activity for logged-in Manager or User
 * Query params: startDate, endDate, type (IN/OUT), productId, page, limit
 */
router.get('/my-activity', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate, type, productId, page = 1, limit = 50 } = req.query;
    
    // Cast to ObjectId for aggregation pipeline (aggregation does NOT auto-cast)
    const userObjectId = new mongoose.Types.ObjectId(req.userId);

    // Build a single query object used by BOTH find() and aggregate()
    const query = { createdBy: userObjectId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    
    if (type && ['IN', 'OUT'].includes(type.toUpperCase())) {
      query.type = type.toUpperCase();
    }
    
    if (productId) {
      query.productId = new mongoose.Types.ObjectId(productId);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get entries with pagination
    const [entries, total] = await Promise.all([
      StockLedger.find(query)
        .populate('productId', 'name shortName hsn')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      StockLedger.countDocuments(query)
    ]);
    
    // Summary aggregation — use same query so filters (date, type) are respected
    // Strip the 'type' filter for the summary so we always get both IN and OUT totals
    const { type: _t, ...summaryQuery } = query;
    const summary = await StockLedger.aggregate([
      { $match: summaryQuery },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: { $abs: '$quantity' } },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const stockIn  = summary.find(s => s._id === 'IN')  || { totalQuantity: 0, count: 0 };
    const stockOut = summary.find(s => s._id === 'OUT') || { totalQuantity: 0, count: 0 };
    
    res.json({
      summary: {
        totalStockIn: stockIn.totalQuantity,
        totalStockOut: stockOut.totalQuantity,
        stockInCount: stockIn.count,
        stockOutCount: stockOut.count,
        totalTransactions: stockIn.count + stockOut.count
      },
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching own activity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/reports/my-products
 * Get products handled by logged-in Manager or User
 */
router.get('/my-products', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userObjectId = new mongoose.Types.ObjectId(req.userId);

    const matchQuery = { createdBy: userObjectId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    
    const productStats = await StockLedger.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { productId: '$productId', type: '$type' },
          totalQuantity: { $sum: { $abs: '$quantity' } },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$_id.productId',
          productName: { $first: '$product.name' },
          shortName: { $first: '$product.shortName' },
          stats: {
            $push: {
              type: '$_id.type',
              quantity: '$totalQuantity',
              count: '$count'
            }
          }
        }
      }
    ]);
    
    // Format results
    const formatted = productStats.map(p => {
      const inStat = p.stats.find(s => s.type === 'IN') || { quantity: 0, count: 0 };
      const outStat = p.stats.find(s => s.type === 'OUT') || { quantity: 0, count: 0 };
      
      return {
        productId: p._id,
        productName: p.productName,
        shortName: p.shortName,
        stockIn: inStat.quantity,
        stockOut: outStat.quantity,
        transactions: inStat.count + outStat.count
      };
    });
    
    // Sort by transactions
    formatted.sort((a, b) => b.transactions - a.transactions);
    
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching own products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/reports/my-dashboard
 * Dashboard stats for Manager/User (own data only)
 */
router.get('/my-dashboard', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const userObjectId = new mongoose.Types.ObjectId(req.userId);
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};

    // Get own activity counts
    const [totalActivity, todayActivity, productCount] = await Promise.all([
      // Total activity
      StockLedger.aggregate([
        { $match: { createdBy: userObjectId, ...tenantFilter } },
        { $group: { 
          _id: '$type', 
          count: { $sum: 1 }, 
          quantity: { $sum: { $abs: '$quantity' } } 
        }}
      ]),
      // Today's activity
      StockLedger.aggregate([
        { $match: { createdBy: userObjectId, createdAt: { $gte: today }, ...tenantFilter } },
        { $group: { 
          _id: '$type', 
          count: { $sum: 1 }, 
          quantity: { $sum: { $abs: '$quantity' } } 
        }}
      ]),
      // Unique products handled
      StockLedger.distinct('productId', { createdBy: userObjectId, ...tenantFilter })
    ]);
    
    const inTotal = totalActivity.find(a => a._id === 'IN') || { count: 0, quantity: 0 };
    const outTotal = totalActivity.find(a => a._id === 'OUT') || { count: 0, quantity: 0 };
    const inToday = todayActivity.find(a => a._id === 'IN') || { count: 0, quantity: 0 };
    const outToday = todayActivity.find(a => a._id === 'OUT') || { count: 0, quantity: 0 };
    
    res.json({
      total: {
        stockIn: { count: inTotal.count, quantity: inTotal.quantity },
        stockOut: { count: outTotal.count, quantity: outTotal.quantity },
        transactions: inTotal.count + outTotal.count
      },
      today: {
        stockIn: { count: inToday.count, quantity: inToday.quantity },
        stockOut: { count: outToday.count, quantity: outToday.quantity },
        transactions: inToday.count + outToday.count
      },
      productsHandled: productCount.length
    });
  } catch (error) {
    console.error('Error fetching own dashboard:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// COMPREHENSIVE ADMIN DASHBOARD (Admin Only)
// Provides all data for admin dashboard overview
// ============================================================

/**
 * GET /api/reports/admin-dashboard or /api/reports/dashboard
 * Comprehensive dashboard data for admin including all stats, charts, alerts
 */
const handleAdminDashboard = async (req, res) => {
  // Cache check — serve stale-safe snapshot if available (keyed by tenant and user)
  const cacheKey = `${req.tenantId || 'global'}:admin-dashboard:${req.userId}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const Company = require('../models/Company');
    const mongoose = require('mongoose');
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
    
    // Date calculations
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // ========== STAT CARDS ==========
    const [
      totalProducts,
      totalCompanies,
      totalManagers,
      totalUsers,
      serialEnabledProducts,
      activeCompanies
    ] = await Promise.all([
      Item.countDocuments({ isActive: true, ...tenantFilter }),
      Company.countDocuments({ isActive: true, ...tenantFilter }),
      User.countDocuments({ role: 'MANAGER', isActive: true, ...tenantFilter }),
      User.countDocuments({ role: 'USER', isActive: true, ...tenantFilter }),
      Item.countDocuments({ isActive: true, 'serialPolicy.enableSerial': true, ...tenantFilter }),
      Company.countDocuments({ isActive: true, ...tenantFilter })
    ]);
    
    // Get total stock count from StockLedger (IN - OUT = current stock)
    const stockAgg = await StockLedger.aggregate([
      { $match: { isDeleted: { $ne: true }, ...tenantFilter } },
      {
        $group: {
          _id: '$productId',
          totalIn: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalIn', '$totalOut'] }
        }
      },
      { $match: { currentStock: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$currentStock' },
          uniqueProducts: { $sum: 1 }
        }
      }
    ]);
    const totalStockItems = stockAgg[0]?.totalQuantity || 0;
    const productsInStock = stockAgg[0]?.uniqueProducts || 0;
    
    // ========== TODAY'S STOCK IN/OUT ==========
    const todayStockAgg = await StockLedger.aggregate([
      { $match: { createdAt: { $gte: today }, ...tenantFilter } },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: { $abs: '$quantity' } },
          count: { $sum: 1 }
        }
      }
    ]);
    const stockInToday = todayStockAgg.find(s => s._id === 'IN') || { totalQuantity: 0, count: 0 };
    const stockOutToday = todayStockAgg.find(s => s._id === 'OUT') || { totalQuantity: 0, count: 0 };
    
    // ========== ACTIVE COUNTS ==========
    const [activeManagers, activeUsers, activeProducts] = await Promise.all([
      User.countDocuments({ role: 'MANAGER', isActive: true, ...tenantFilter }),
      User.countDocuments({ role: 'USER', isActive: true, ...tenantFilter }),
      Item.countDocuments({ isActive: true, ...tenantFilter })
    ]);
    
    // ========== STOCK MOVEMENT CHART (Last 7 days) ==========
    const stockMovementData = await StockLedger.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, ...tenantFilter } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          total: { $sum: { $abs: '$quantity' } }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    // Format for chart
    const stockMovementChart = {
      labels: [],
      stockIn: [],
      stockOut: []
    };
    
    // Generate all dates in range (last 7 days)
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      stockMovementChart.labels.push(dateStr);
      
      const inData = stockMovementData.find(s => s._id.date === dateStr && s._id.type === 'IN');
      const outData = stockMovementData.find(s => s._id.date === dateStr && s._id.type === 'OUT');
      
      stockMovementChart.stockIn.push(inData?.total || 0);
      stockMovementChart.stockOut.push(outData?.total || 0);
    }
    
    // ========== PRODUCT-WISE STOCK CHART ==========
    // Calculate from StockLedger (IN adds, OUT subtracts)
    const productWiseStock = await StockLedger.aggregate([
      { $match: { isDeleted: { $ne: true }, ...tenantFilter } },
      {
        $group: {
          _id: '$productId',
          totalIn: {
            $sum: {
              $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0]
            }
          },
          totalOut: {
            $sum: {
              $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0]
            }
          }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalIn', '$totalOut'] }
        }
      },
      { $match: { currentStock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: '$product.name',
          shortName: '$product.shortName',
          totalStock: '$currentStock'
        }
      },
      { $sort: { totalStock: -1 } },
      { $limit: 10 }
    ]);
    
    const productWiseChart = {
      labels: productWiseStock.map(p => p.shortName || p.name),
      data: productWiseStock.map(p => p.totalStock)
    };
    
    // ========== MANAGER ACTIVITY (Last 7 days) ==========
    const managerActivityData = await StockLedger.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          createdByRole: 'MANAGER',
          ...tenantFilter
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          transactions: { $sum: 1 },
          quantity: { $sum: { $abs: '$quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const managerActivityChart = {
      labels: [],
      transactions: [],
      quantity: []
    };
    
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      managerActivityChart.labels.push(dateStr);
      
      const dayData = managerActivityData.find(m => m._id === dateStr);
      managerActivityChart.transactions.push(dayData?.transactions || 0);
      managerActivityChart.quantity.push(dayData?.quantity || 0);
    }
    
    // ========== USER ACTIVITY (Last 7 days) ==========
    const userActivityData = await StockLedger.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          createdByRole: 'USER',
          ...tenantFilter
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          transactions: { $sum: 1 },
          quantity: { $sum: { $abs: '$quantity' } }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const userActivityChart = {
      labels: [],
      transactions: [],
      quantity: []
    };
    
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      userActivityChart.labels.push(dateStr);
      
      const dayData = userActivityData.find(u => u._id === dateStr);
      userActivityChart.transactions.push(dayData?.transactions || 0);
      userActivityChart.quantity.push(dayData?.quantity || 0);
    }
    
    // ========== LOW STOCK ALERTS ==========
    // Calculate current stock from StockLedger
    const lowStockProducts = await StockLedger.aggregate([
      { $match: { isDeleted: { $ne: true }, ...tenantFilter } },
      {
        $group: {
          _id: '$productId',
          totalIn: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalIn', '$totalOut'] }
        }
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $match: {
          $expr: { $lte: ['$currentStock', { $ifNull: ['$product.reorderLevel', 10] }] },
          'product.isActive': true
        }
      },
      {
        $project: {
          productId: '$_id',
          productName: '$product.name',
          shortName: '$product.shortName',
          currentStock: 1,
          reorderLevel: { $ifNull: ['$product.reorderLevel', 10] },
          unit: '$product.unit'
        }
      },
      { $sort: { currentStock: 1 } },
      { $limit: 20 }
    ]);
    
    // ========== RECENT ACTIVITY (Last 20 transactions) ==========
    const recentActivity = await StockLedger.find({
      createdByRole: { $in: ['MANAGER', 'USER'] }, // Exclude ADMIN activity for this overview
      ...tenantFilter
    })
      .populate('productId', 'name shortName')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Format recent activity
    const formattedRecentActivity = recentActivity.map(a => ({
      _id: a._id,
      type: a.type,
      quantity: a.quantity,
      productName: a.productId?.name || 'Unknown',
      shortName: a.productId?.shortName || '',
      userName: a.createdBy?.name || 'Unknown',
      userRole: a.createdBy?.role || 'Unknown',
      companyName: a.type === 'IN' ? a.supplierName : a.buyerName,
      timestamp: a.createdAt,
      serialNumbers: a.serialNumbers?.slice(0, 3) // Show first 3
    }));
    
    // ========== TOP PERFORMERS (Managers & Users) ==========
    const topPerformers = await StockLedger.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, createdByRole: { $in: ['MANAGER', 'USER'] }, ...tenantFilter } },
      {
        $group: {
          _id: '$createdBy',
          transactions: { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } }
        }
      },
      { $sort: { transactions: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          role: '$user.role',
          transactions: 1,
          totalQuantity: 1
        }
      }
    ]);
    
    // Format recent transactions array for frontend line chart
    const recentTransactions = stockMovementChart.labels.map((date, idx) => ({
      date,
      in: stockMovementChart.stockIn[idx] || 0,
      out: stockMovementChart.stockOut[idx] || 0,
    }));

    // Format top moving items for frontend bar chart
    const topMovingItems = productWiseStock.map(p => ({
      name: p.shortName || p.name,
      totalIn: p.totalStock || 0,
      totalOut: 0,
      net: p.totalStock || 0
    }));

    // Format low stock items
    const lowStockItems = lowStockProducts.map(p => ({
      name: p.name,
      currentStock: p.currentStock || 0,
      threshold: p.lowStockThreshold || 10
    }));

    // ========== SUMMARY RESPONSE ==========
    const responseData = {
      // Normalized top-level fields for frontend analytics
      totalStock: totalStockItems,
      totalItems: totalProducts,
      totalValue: totalStockItems * 150, // estimated portfolio valuation
      recentTransactions,
      topMovingItems,
      lowStockItems,

      // Detailed structures for dashboard panels
      stats: {
        totalProducts,
        activeProducts,
        totalCompanies,
        activeCompanies,
        totalStockItems,
        productsInStock,
        totalManagers,
        activeManagers,
        totalUsers,
        activeUsers,
        serialEnabledProducts,
        stockInToday: stockInToday.totalQuantity,
        stockOutToday: stockOutToday.totalQuantity,
        stockInTodayCount: stockInToday.count,
        stockOutTodayCount: stockOutToday.count
      },
      charts: {
        stockMovement: stockMovementChart,
        productWise: productWiseChart,
        managerActivity: managerActivityChart,
        userActivity: userActivityChart
      },
      lowStockAlerts: lowStockProducts,
      recentActivity: formattedRecentActivity,
      topPerformers
    };
    setCache(cacheKey, responseData);
    return res.json(responseData);
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

router.get('/admin-dashboard', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), handleAdminDashboard);
router.get('/dashboard', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), handleAdminDashboard);
router.get('/dashboard-stats', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), handleAdminDashboard);

// ============================================================
// USER/MANAGER SELF-SERVICE REPORTS
// ============================================================

/**
 * GET /api/reports/user-stats
 * Get current user's activity statistics
 */
router.get('/user-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};

    // Count stock IN entries by this user
    const stockInCount = await StockLedger.countDocuments({
      createdBy: userId,
      type: 'IN',
      ...tenantFilter
    });

    // Count stock OUT entries by this user
    const stockOutCount = await StockLedger.countDocuments({
      createdBy: userId,
      type: 'OUT',
      ...tenantFilter
    });

    // Count companies added by this user (if they have a createdBy field)
    let companiesAdded = 0;
    try {
      const Company = require('../models/Company');
      companiesAdded = await Company.countDocuments({ createdBy: userId, ...tenantFilter });
    } catch (e) {
      // Company model might not have createdBy field
    }

    // Count users managed by this user (only for managers)
    let usersManaged = 0;
    if (req.user.role === 'MANAGER' || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
      usersManaged = await User.countDocuments({ createdBy: userId, ...tenantFilter });
    }

    res.json({
      stockInCount,
      stockOutCount,
      companiesAdded,
      usersManaged
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/reports/user-activity
 * Get current user's recent activity
 * Query params: limit (default 10)
 */
router.get('/user-activity', requireAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};

    const activities = await StockLedger.find({ createdBy: userId, ...tenantFilter })
      .populate('productId', 'name shortName')
      .sort({ createdAt: -1 })
      .limit(limit);

    const formattedActivities = activities.map(activity => ({
      type: activity.type,
      quantity: activity.quantity,
      productName: activity.productId?.name || 'Unknown Product',
      date: activity.createdAt,
      description: `Stock ${activity.type} - ${activity.quantity} units of ${activity.productId?.name || 'Product'}`
    }));

    res.json(formattedActivities);

  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/reports/manager-dashboard
 * Comprehensive dashboard data for managers including stats, charts, alerts
 */
router.get('/manager-dashboard', requireAuth, requireRole(['MANAGER', 'ADMIN']), async (req, res) => {
  // Cache check — keyed per-tenant and user so each manager sees their own data
  const cacheKey = `${req.tenantId || 'global'}:manager-dashboard:${req.userId}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const Company = require('../models/Company');
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};
    
    // Date calculations
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 days ago + today = 7 days
    
    // Get manager's ID as ObjectId
    const managerId = new mongoose.Types.ObjectId(req.user._id);
    
    // ========== STAT CARDS ==========
    const [
      totalProducts,
      totalUsers,
    ] = await Promise.all([
      Item.countDocuments({ isActive: true, ...tenantFilter }),
      User.countDocuments({ role: 'USER', createdBy: managerId, isActive: true, ...tenantFilter }),
    ]);
    
    // ========== TODAY'S STOCK IN/OUT (All entries, not just manager's) ==========
    const todayStockAgg = await StockLedger.aggregate([
      { 
        $match: { 
          createdAt: { $gte: today, $lt: tomorrow },
          ...tenantFilter
        } 
      },
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: { $abs: '$quantity' } },
          count: { $sum: 1 }
        }
      }
    ]);
    const stockInToday = todayStockAgg.find(s => s._id === 'IN') || { totalQuantity: 0, count: 0 };
    const stockOutToday = todayStockAgg.find(s => s._id === 'OUT') || { totalQuantity: 0, count: 0 };
    
    // ========== STOCK MOVEMENT CHART (Last 7 days - All data) ==========
    const stockMovementData = await StockLedger.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, ...tenantFilter } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          total: { $sum: { $abs: '$quantity' } }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    // Format for chart
    const stockMovementChart = {
      labels: [],
      stockIn: [],
      stockOut: []
    };
    
    // Generate all dates in range (last 7 days) - use a copy of the date
    const startDate = new Date(sevenDaysAgo);
    const endDate = new Date(today);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      stockMovementChart.labels.push(dateStr);
      
      const inData = stockMovementData.find(s => s._id.date === dateStr && s._id.type === 'IN');
      const outData = stockMovementData.find(s => s._id.date === dateStr && s._id.type === 'OUT');
      
      stockMovementChart.stockIn.push(inData?.total || 0);
      stockMovementChart.stockOut.push(outData?.total || 0);
    }
    
    // ========== PRODUCT-WISE STOCK CHART (Top 5) ==========
    const productWiseStock = await StockLedger.aggregate([
      { $match: { isDeleted: { $ne: true }, ...tenantFilter } },
      {
        $group: {
          _id: '$productId',
          totalIn: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalIn', '$totalOut'] }
        }
      },
      { $match: { currentStock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          name: '$product.name',
          shortName: '$product.shortName',
          totalStock: '$currentStock'
        }
      },
      { $sort: { totalStock: -1 } },
      { $limit: 5 }
    ]);
    
    const productWiseChart = {
      labels: productWiseStock.map(p => p.shortName || p.name),
      data: productWiseStock.map(p => p.totalStock)
    };
    
    // ========== LOW STOCK ALERTS ==========
    const lowStockProducts = await StockLedger.aggregate([
      { $match: { isDeleted: { $ne: true }, ...tenantFilter } },
      {
        $group: {
          _id: '$productId',
          totalIn: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
          totalOut: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } }
        }
      },
      {
        $addFields: {
          currentStock: { $subtract: ['$totalIn', '$totalOut'] }
        }
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $match: {
          $expr: { $lte: ['$currentStock', { $ifNull: ['$product.reorderLevel', 10] }] },
          'product.isActive': true
        }
      },
      {
        $project: {
          productId: '$_id',
          productName: '$product.name',
          shortName: '$product.shortName',
          currentStock: 1,
          reorderLevel: { $ifNull: ['$product.reorderLevel', 10] }
        }
      },
      { $sort: { currentStock: 1 } },
      { $limit: 10 }
    ]);
    
    // ========== RECENT ACTIVITY (Last 10 transactions) ==========
    const recentActivity = await StockLedger.find({ ...tenantFilter })
      .populate('productId', 'name shortName')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    const formattedRecentActivity = recentActivity.map(a => ({
      _id: a._id,
      type: a.type,
      quantity: a.quantity,
      productName: a.productId?.name || 'Unknown',
      shortName: a.productId?.shortName || '',
      userName: a.createdBy?.name || 'Unknown',
      userRole: a.createdBy?.role || 'Unknown',
      timestamp: a.createdAt
    }));
    
    // ========== SUMMARY RESPONSE ==========
    const responseData = {
      stats: {
        totalProducts,
        totalUsers,
        stockInToday: stockInToday.totalQuantity,
        stockOutToday: stockOutToday.totalQuantity
      },
      charts: {
        stockMovement: stockMovementChart,
        productWise: productWiseChart
      },
      lowStockAlerts: lowStockProducts,
      recentActivity: formattedRecentActivity
    };
    setCache(cacheKey, responseData);
    return res.json(responseData);
  } catch (error) {
    console.error('Error fetching manager dashboard:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// CSV EXPORT
// ============================================================

/**
 * GET /api/reports/export - Export comprehensive data to CSV
 * Download a CSV file.
 *
 * Query params:
 *   type       - 'stock-ledger' | 'user-activity' | 'products'  (required)
 *   startDate  - ISO date string, e.g. 2026-01-01 (optional)
 *   endDate    - ISO date string, e.g. 2026-03-01 (optional)
 *   userId     - ObjectId string — filter by user (stock-ledger only, optional)
 */
router.get('/export', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { type, startDate, endDate, userId } = req.query;
    const tenantFilter = req.tenantId ? { tenantId: req.tenantId } : {};

    if (!['stock-ledger', 'user-activity', 'products'].includes(type)) {
      return res.status(400).json({ message: 'type must be stock-ledger, user-activity, or products' });
    }

    // Escape a single CSV cell
    const cell = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvRow = (cols) => cols.map(cell).join(',');

    let headers = [];
    let rows    = [];

    // ── stock-ledger ───────────────────────────────────────────
    if (type === 'stock-ledger') {
      const match = { ...tenantFilter };
      if (startDate) match.createdAt = { $gte: new Date(startDate) };
      if (endDate)   match.createdAt = { ...(match.createdAt || {}), $lte: new Date(endDate + 'T23:59:59.999Z') };
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        match.createdBy = new mongoose.Types.ObjectId(userId);
      }

      const ledger = await StockLedger.find(match)
        .populate('productId', 'name sku')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();

      headers = ['Date', 'Type', 'Product Name', 'SKU', 'Quantity', 'User Name', 'User Email', 'User Role'];
      rows = ledger.map(l => csvRow([
        l.createdAt?.toISOString(),
        l.type,
        l.productId?.name,
        l.productId?.sku,
        l.quantity,
        l.createdBy?.name,
        l.createdBy?.email,
        l.createdBy?.role
      ]));
    }

    // ── user-activity ──────────────────────────────────────────
    if (type === 'user-activity') {
      const matchDate = { ...tenantFilter };
      if (startDate) matchDate.createdAt = { $gte: new Date(startDate) };
      if (endDate)   matchDate.createdAt = { ...(matchDate.createdAt || {}), $lte: new Date(endDate + 'T23:59:59.999Z') };

      const activity = await StockLedger.aggregate([
        { $match: matchDate },
        { $group: {
          _id:           { userId: '$createdBy', type: '$type' },
          count:         { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } },
          lastActivity:  { $max: '$createdAt' }
        }},
        { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' }},
        { $unwind: { path: '$user', preserveNullAndEmpty: true }},
        { $sort: { lastActivity: -1 } }
      ]);

      headers = ['User Name', 'User Email', 'User Role', 'Action Type', 'Count', 'Total Quantity', 'Last Activity'];
      rows = activity.map(a => csvRow([
        a.user?.name,
        a.user?.email,
        a.user?.role,
        a._id.type,
        a.count,
        a.totalQuantity,
        a.lastActivity?.toISOString()
      ]));
    }

    // ── products ───────────────────────────────────────────────
    if (type === 'products') {
      const matchDate = { ...tenantFilter };
      if (startDate) matchDate.createdAt = { $gte: new Date(startDate) };
      if (endDate)   matchDate.createdAt = { ...(matchDate.createdAt || {}), $lte: new Date(endDate + 'T23:59:59.999Z') };

      const products = await StockLedger.aggregate([
        { $match: matchDate },
        { $group: {
          _id:           { productId: '$productId', type: '$type' },
          count:         { $sum: 1 },
          totalQuantity: { $sum: { $abs: '$quantity' } }
        }},
        { $lookup: { from: 'items', localField: '_id.productId', foreignField: '_id', as: 'product' }},
        { $unwind: { path: '$product', preserveNullAndEmpty: true }},
        { $sort: { '_id.productId': 1 } }
      ]);

      headers = ['Product Name', 'SKU', 'Action Type', 'Transaction Count', 'Total Quantity'];
      rows = products.map(p => csvRow([
        p.product?.name,
        p.product?.sku,
        p._id.type,
        p.count,
        p.totalQuantity
      ]));
    }

    const filename = `acustock-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = [csvRow(headers), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // UTF-8 BOM — ensures Excel opens it with correct encoding
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;