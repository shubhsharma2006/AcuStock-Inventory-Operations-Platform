const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const Warranty      = require('../models/Warranty');
const Notification  = require('../models/Notification');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/warranty/stats ────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const pMatch = { isActive: true, 'purchaseWarranty.months': { $gt: 0 } };
    const sMatch = { isActive: true, 'sellerWarranty.months': { $gt: 0 }, 'sellerWarranty.status': { $nin: ['not-sold', 'none'] } };
    const notSoldFilter = { isActive: true, 'sellerWarranty.status': 'not-sold' };

    if (req.tenantId) {
      pMatch.tenantId = req.tenantId;
      sMatch.tenantId = req.tenantId;
      notSoldFilter.tenantId = req.tenantId;
    }

    const [purchase, seller] = await Promise.all([
      Warranty.aggregate([
        { $match: pMatch },
        { $group: { _id: '$purchaseWarranty.status', count: { $sum: 1 } } }
      ]),
      Warranty.aggregate([
        { $match: sMatch },
        { $group: { _id: '$sellerWarranty.status', count: { $sum: 1 } } }
      ])
    ]);

    const toMap = arr => arr.reduce((m, r) => { m[r._id] = r.count; return m; }, {});
    const pMap  = toMap(purchase);
    const sMap  = toMap(seller);

    res.json({
      purchase: { active: pMap['active'] || 0, expiringSoon: pMap['expiring-soon'] || 0, expired: pMap['expired'] || 0 },
      seller:   { active: sMap['active'] || 0, expiringSoon: sMap['expiring-soon'] || 0, expired: sMap['expired'] || 0 },
      notSold:  await Warranty.countDocuments(notSoldFilter)
    });
  } catch (err) {
    console.error('warranty stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/warranty/serial/:serial ──────────────────────────
router.get('/serial/:serial', async (req, res) => {
  try {
    const filter = {
      serialNumber: req.params.serial.trim().toUpperCase(),
      isActive: true
    };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warranty = await Warranty.findOne(filter)
      .populate('productId', 'name sku unit category')
      .populate('stockLedgerId', 'type createdAt transactionDetails')
      .populate('createdBy', 'username name')
      .lean({ virtuals: true });

    if (!warranty) return res.status(404).json({ message: 'Warranty not found for this serial number' });
    res.json(warranty);
  } catch (err) {
    console.error('warranty serial lookup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/warranty ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { type, status, productId, search, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (req.tenantId) filter.tenantId = req.tenantId;

    // Data isolation: non-SUPER_ADMIN users see only their own company's records if companyId is set
    if (req.user.role !== 'SUPER_ADMIN' && req.user.companyId) {
      filter.companyId = req.user.companyId;
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }

    if (status) {
      const statusFilters = [];
      if (!type || type === 'purchase' || type === 'both') statusFilters.push({ 'purchaseWarranty.status': status });
      if (!type || type === 'seller'   || type === 'both') statusFilters.push({ 'sellerWarranty.status': status });
      if (statusFilters.length) filter.$or = statusFilters;
    }

    if (search) {
      const rx = new RegExp(search.trim(), 'i');
      const searchFilters = [
        { serialNumber: rx },
        { 'sellerWarranty.buyerName': rx },
        { 'sellerWarranty.buyerPhone': rx },
        { 'purchaseWarranty.supplierName': rx }
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilters }];
        delete filter.$or;
      } else {
        filter.$or = searchFilters;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [warranties, total] = await Promise.all([
      Warranty.find(filter)
        .populate('productId', 'name sku unit')
        .populate('createdBy', 'username name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true }),
      Warranty.countDocuments(filter)
    ]);

    res.json({ warranties, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('warranty list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/warranty/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });

    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warranty = await Warranty.findOne(filter)
      .populate('productId', 'name sku unit category')
      .populate('stockLedgerId', 'type createdAt transactionDetails partyDetails')
      .populate('createdBy', 'username name')
      .populate('claims.raisedBy', 'username name')
      .populate('claims.resolvedBy', 'username name')
      .lean({ virtuals: true });

    if (!warranty) return res.status(404).json({ message: 'Warranty not found' });
    res.json(warranty);
  } catch (err) {
    console.error('warranty get error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/warranty/:id/claim ──────────────────────────────
router.post('/:id/claim', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });

    const { claimType, description } = req.body;
    if (!claimType || !['purchase', 'seller'].includes(claimType))
      return res.status(400).json({ message: 'claimType must be "purchase" or "seller"' });
    if (!description || description.trim().length < 5)
      return res.status(400).json({ message: 'Description is required (min 5 chars)' });

    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warranty = await Warranty.findOne(filter);
    if (!warranty) return res.status(404).json({ message: 'Warranty not found' });

    warranty.claims.push({ claimType, description: description.trim(), raisedBy: req.user._id, status: 'open' });
    await warranty.save();

    try {
      await Notification.create({
        targetRole: 'ADMIN',
        type: 'warranty-claim',
        icon: '🛠️',
        title: 'Warranty Claim Raised',
        message: `A ${claimType} warranty claim was raised for serial ${warranty.serialNumber || 'N/A'}.`,
        link: 'warranty-list',
        tenantId: req.tenantId || undefined,
        metadata: {
          warrantyId:  String(warranty._id),
          serialNumber: warranty.serialNumber,
          claimType,
          claimId: String(warranty.claims[warranty.claims.length - 1]._id)
        }
      });
      if (global.emitRealTimeUpdate) {
        global.emitRealTimeUpdate('notification', {
          message: 'New warranty claim',
          tenantId: req.tenantId
        }, 'admin');
      }
    } catch (_) { /* non-critical */ }

    res.json({ message: 'Claim raised successfully', warranty });
  } catch (err) {
    console.error('warranty claim error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/warranty/:id/claim/:claimId ──────────────────────
// Only ADMIN or MANAGER can resolve/reject warranty claims
router.put('/:id/claim/:claimId', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid warranty ID' });

    const { status, resolution } = req.body;
    const validStatuses = ['open', 'in-progress', 'resolved', 'rejected'];
    if (!status || !validStatuses.includes(status))
      return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` });

    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warranty = await Warranty.findOne(filter);
    if (!warranty) return res.status(404).json({ message: 'Warranty not found' });

    const claim = warranty.claims.id(req.params.claimId);
    if (!claim) return res.status(404).json({ message: 'Claim not found' });

    claim.status = status;
    if (resolution) claim.resolution = resolution.trim();
    if (status === 'resolved' || status === 'rejected') {
      claim.resolvedAt = new Date();
      claim.resolvedBy = req.user._id;
    }

    await warranty.save();
    res.json({ message: 'Claim updated', warranty });
  } catch (err) {
    console.error('warranty claim update error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
