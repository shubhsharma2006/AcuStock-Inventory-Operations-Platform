const express = require('express');
const mongoose = require('mongoose');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const Item = require('../models/Item');
const Company = require('../models/Company');
const PurchaseOrder = require('../models/PurchaseOrder');
const SalesOrder = require('../models/SalesOrder');
const StockLedger = require('../models/StockLedger');

const router = express.Router();
router.use(requireTenantId);

// ── ReDoS-safe regex escaping ────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Quick actions catalogue ──────────────────────────────────
const QUICK_ACTIONS = [
  { title: 'Stock IN Entry',          subtitle: 'Record incoming shipment',           url: '/stock-in',           keywords: ['stock', 'in', 'entry', 'add', 'receive', 'incoming'] },
  { title: 'Stock OUT Entry',         subtitle: 'Dispatch outgoing shipment',         url: '/stock-out',          keywords: ['stock', 'out', 'dispatch', 'send', 'outgoing'] },
  { title: 'Create Purchase Order',   subtitle: 'New procurement request',            url: '/purchase-orders',    keywords: ['purchase', 'order', 'po', 'buy', 'procure'] },
  { title: 'Create Sales Order',      subtitle: 'New customer sales order',           url: '/sales-orders',       keywords: ['sales', 'order', 'so', 'sell', 'customer'] },
  { title: 'Add New Product',         subtitle: 'Create product in master catalogue', url: '/products',           keywords: ['product', 'item', 'add', 'new', 'create'] },
  { title: 'Add Company / Partner',   subtitle: 'Register supplier or buyer',         url: '/companies',          keywords: ['company', 'partner', 'supplier', 'buyer', 'vendor'] },
  { title: 'View Stock Ledger',       subtitle: 'Full transaction audit trail',       url: '/stock-ledger',       keywords: ['ledger', 'audit', 'trail', 'history', 'transactions'] },
  { title: 'Remaining Stock',         subtitle: 'Current inventory levels',           url: '/remaining-stock',    keywords: ['remaining', 'inventory', 'level', 'current', 'balance'] },
  { title: 'View Audit Logs',         subtitle: 'Business activity trail',            url: '/audit-logs',         keywords: ['audit', 'log', 'activity', 'trail'] },
  { title: 'View Reports Hub',        subtitle: 'Analytics and reports',              url: '/reports',            keywords: ['report', 'analytics', 'chart', 'statistics'] },
  { title: 'Notification Center',     subtitle: 'View all notifications',             url: '/notifications',      keywords: ['notification', 'alert', 'bell', 'message'] },
  { title: 'Settings',                subtitle: 'Configure workspace',                url: '/settings',           keywords: ['settings', 'config', 'preference', 'setup'] },
  { title: 'Billing & Plans',         subtitle: 'Manage subscription',                url: '/billing',            keywords: ['billing', 'plan', 'subscribe', 'payment', 'invoice'] },
  { title: 'Permissions',             subtitle: 'Manage user permissions',            url: '/settings/permissions', keywords: ['permission', 'access', 'role', 'rbac'] },
  { title: 'Serial Search & Audit',   subtitle: 'Track serial numbers',               url: '/serials',            keywords: ['serial', 'track', 'number', 'sn'] },
  { title: 'Warranty Tracking',       subtitle: 'Manage warranties & claims',         url: '/warranty',           keywords: ['warranty', 'claim', 'expire'] },
  { title: 'Stock Transfers',         subtitle: 'Inter-warehouse transfers',          url: '/stock-transfers',    keywords: ['transfer', 'warehouse', 'move', 'transit'] },
  { title: 'Shipments & Logistics',   subtitle: 'Track shipments & transporters',     url: '/shipments',          keywords: ['shipment', 'logistics', 'transport', 'carrier', 'delivery'] },
];

// ── Fuzzy action matching ────────────────────────────────────
function matchActions(query) {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];

  const words = lower.split(/\s+/);
  const scored = QUICK_ACTIONS.map(action => {
    let score = 0;
    for (const word of words) {
      if (action.title.toLowerCase().includes(word)) score += 3;
      if (action.subtitle.toLowerCase().includes(word)) score += 1;
      if (action.keywords.some(kw => kw.startsWith(word) || kw.includes(word))) score += 2;
    }
    return { ...action, score };
  });

  return scored
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score, keywords, ...rest }) => rest);
}

// ============================================================
// GET /api/search/global?q=:query&type=:optionalType
// ============================================================
router.get('/global', requireAuth, async (req, res) => {
  try {
    const { q, type } = req.query;
    const query = (q || '').trim();

    if (!query || query.length < 1) {
      return res.json({
        query: '',
        totalMatches: 0,
        categories: {
          products: [],
          serials: [],
          companies: [],
          orders: [],
          actions: matchActions('')
        }
      });
    }

    const tenantId = req.tenantId;
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const tenantFilter = { tenantId };
    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(escapedQuery, 'i');
    const CAP = 5; // Max results per category

    // ── Build parallel queries ──────────────────────────────
    const searches = {};

    // 1. Products
    if (!type || type === 'products') {
      searches.products = Item.find({
        isActive: true,
        ...tenantFilter,
        $or: [
          { name: regex },
          { shortName: regex },
          { sku: regex },
          { barcode: regex },
          { category: regex },
          { brand: regex }
        ]
      })
        .select('_id name shortName sku barcode salesPrice purchasePrice category')
        .limit(CAP)
        .lean();
    }

    // 2. Serials — search in StockLedger for serial numbers
    if (!type || type === 'serials') {
      searches.serials = StockLedger.aggregate([
        {
          $match: {
            tenantId: tenantObjectId,
            serialNumbers: { $elemMatch: regex }
          }
        },
        { $unwind: '$serialNumbers' },
        { $match: { serialNumbers: regex } },
        {
          $group: {
            _id: '$serialNumbers',
            productId: { $first: '$productId' },
            lastType: { $last: '$type' },
            lastDate: { $last: '$createdAt' }
          }
        },
        { $limit: CAP },
        {
          $lookup: {
            from: 'items',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            serial: '$_id',
            productName: { $ifNull: ['$product.name', 'Unknown Product'] },
            status: { $cond: [{ $eq: ['$lastType', 'IN'] }, 'In Stock', 'Dispatched'] },
            lastDate: 1
          }
        }
      ]);
    }

    // 3. Companies
    if (!type || type === 'companies') {
      searches.companies = Company.find({
        isActive: true,
        ...tenantFilter,
        $or: [
          { name: regex },
          { email: regex },
          { phone: regex },
          { taxId: regex },
          { 'address.city': regex }
        ]
      })
        .select('_id name email phone industry')
        .limit(CAP)
        .lean();
    }

    // 4. Orders — parallel PO + SO search
    if (!type || type === 'orders') {
      searches.purchaseOrders = PurchaseOrder.find({
        ...tenantFilter,
        $or: [
          { poNumber: regex },
          { 'supplier.name': regex }
        ]
      })
        .select('_id poNumber supplier.name status totalValue createdAt')
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();

      searches.salesOrders = SalesOrder.find({
        ...tenantFilter,
        $or: [
          { soNumber: regex },
          { 'buyer.name': regex }
        ]
      })
        .select('_id soNumber buyer.name status totalValue createdAt')
        .sort({ createdAt: -1 })
        .limit(CAP)
        .lean();
    }

    // ── Execute all queries in parallel ─────────────────────
    const keys = Object.keys(searches);
    const values = await Promise.all(keys.map(k => searches[k]));
    const results = {};
    keys.forEach((k, i) => { results[k] = values[i]; });

    // ── Format response ─────────────────────────────────────
    const categories = {};

    // Products
    categories.products = (results.products || []).map(p => ({
      id: p._id,
      title: p.name,
      subtitle: [p.sku, p.category].filter(Boolean).join(' • '),
      meta: { salesPrice: p.salesPrice, purchasePrice: p.purchasePrice },
      url: `/products?search=${encodeURIComponent(p.name)}`
    }));

    // Serials
    categories.serials = (results.serials || []).map(s => ({
      id: s.serial,
      title: s.serial,
      subtitle: `${s.productName} • ${s.status}`,
      url: `/serials?q=${encodeURIComponent(s.serial)}`
    }));

    // Companies
    categories.companies = (results.companies || []).map(c => ({
      id: c._id,
      title: c.name,
      subtitle: [c.industry, c.email].filter(Boolean).join(' • '),
      url: `/companies?search=${encodeURIComponent(c.name)}`
    }));

    // Orders (merge PO + SO)
    const po = (results.purchaseOrders || []).map(o => ({
      id: o._id,
      title: `PO ${o.poNumber}`,
      subtitle: `${o.supplier?.name || 'Supplier'} • ${o.status}`,
      type: 'purchase',
      url: '/purchase-orders'
    }));
    const so = (results.salesOrders || []).map(o => ({
      id: o._id,
      title: `SO ${o.soNumber}`,
      subtitle: `${o.buyer?.name || 'Buyer'} • ${o.status}`,
      type: 'sales',
      url: '/sales-orders'
    }));
    categories.orders = [...po, ...so].slice(0, CAP);

    // Quick Actions
    categories.actions = matchActions(query);

    const totalMatches = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);

    res.json({ query, totalMatches, categories });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

router.escapeRegex = escapeRegex;
router.matchActions = matchActions;
router.QUICK_ACTIONS = QUICK_ACTIONS;

module.exports = router;
