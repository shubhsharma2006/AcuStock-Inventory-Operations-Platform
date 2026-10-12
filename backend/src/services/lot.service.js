const mongoose = require('mongoose');
const InventoryLot = require('../models/InventoryLot');
const Item = require('../models/Item');

const NEAR_EXPIRY_DAYS = 30;

/**
 * Allocate lots for stock consumption using FEFO or FIFO strategy
 * @param {Object} params
 * @param {string|ObjectId} params.productId
 * @param {number} params.requestedQty
 * @param {string|ObjectId} params.tenantId
 * @param {mongoose.ClientSession} params.session
 * @param {'FEFO'|'FIFO'} [params.strategy='FEFO']
 * @param {string|ObjectId} [params.preferredLotId=null]
 * @returns {Promise<Array<{ lotId: ObjectId, lotNumber: string, quantity: number, expiryDate: Date }>>}
 */
async function allocateLots({
  productId,
  requestedQty,
  tenantId,
  session,
  strategy = 'FEFO',
  preferredLotId = null
}) {
  if (!productId || !requestedQty || requestedQty <= 0) {
    throw new Error('Valid productId and positive requestedQty are required for lot allocation');
  }

  const now = new Date();
  const baseFilter = {
    tenantId,
    productId,
    status: 'ACTIVE',
    remainingQty: { $gt: 0 },
    expiryDate: { $gt: now }
  };

  let candidateLots = [];

  if (preferredLotId) {
    const preferredLot = await InventoryLot.findOne({
      _id: preferredLotId,
      ...baseFilter
    }).session(session);

    if (preferredLot) {
      candidateLots.push(preferredLot);
    }
  }

  const sortCriteria = strategy === 'FIFO'
    ? { createdAt: 1, expiryDate: 1 }
    : { expiryDate: 1, createdAt: 1 }; // Default: FEFO (First-Expired, First-Out)

  const remainingLots = await InventoryLot.find({
    ...baseFilter,
    ...(preferredLotId ? { _id: { $ne: preferredLotId } } : {})
  })
    .sort(sortCriteria)
    .session(session);

  candidateLots = candidateLots.concat(remainingLots);

  let unallocated = requestedQty;
  const allocations = [];

  for (const lot of candidateLots) {
    if (unallocated <= 0) break;

    const allocQty = Math.min(lot.remainingQty, unallocated);
    lot.remainingQty -= allocQty;
    if (lot.remainingQty === 0) {
      lot.status = 'DEPLETED';
    }

    await lot.save({ session });

    allocations.push({
      lotId: lot._id,
      lotNumber: lot.lotNumber,
      quantity: allocQty,
      expiryDate: lot.expiryDate
    });

    unallocated -= allocQty;
  }

  if (unallocated > 0) {
    throw new Error(`Insufficient available lot stock for item ${productId}. Short by ${unallocated} units.`);
  }

  return allocations;
}

/**
 * Create a new inventory lot
 */
async function createLot({ lotData, tenantId, session }) {
  if (!lotData.lotNumber) {
    throw new Error('lotNumber is required');
  }
  if (!lotData.productId) {
    throw new Error('productId is required');
  }
  if (!lotData.expiryDate) {
    throw new Error('expiryDate is required');
  }

  const existing = await InventoryLot.findOne({
    tenantId,
    lotNumber: String(lotData.lotNumber).trim().toUpperCase()
  }).session(session);

  if (existing) {
    throw new Error(`Lot number "${lotData.lotNumber}" already exists in this organization`);
  }

  const lot = new InventoryLot({
    ...lotData,
    lotNumber: String(lotData.lotNumber).trim().toUpperCase(),
    tenantId,
    initialQty: Number(lotData.quantity || lotData.initialQty),
    remainingQty: Number(lotData.quantity || lotData.remainingQty || lotData.initialQty),
    status: 'ACTIVE'
  });

  await lot.save({ session });
  return lot;
}

/**
 * Get lot availability summary for a product
 */
async function getLotAvailability({ productId, tenantId }) {
  const now = new Date();
  const nearExpiryDate = new Date(now.getTime() + NEAR_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const lots = await InventoryLot.find({
    tenantId,
    productId,
    status: { $in: ['ACTIVE', 'BLOCKED'] },
    remainingQty: { $gt: 0 }
  })
    .sort({ expiryDate: 1 })
    .lean();

  return lots.map((lot) => ({
    ...lot,
    isExpired: new Date(lot.expiryDate) <= now,
    isNearExpiry: new Date(lot.expiryDate) > now && new Date(lot.expiryDate) <= nearExpiryDate,
    daysUntilExpiry: Math.ceil((new Date(lot.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }));
}

/**
 * Block a lot from being allocated
 */
async function blockLot({ lotId, reason, userId, tenantId }) {
  const lot = await InventoryLot.findOne({ _id: lotId, tenantId });
  if (!lot) {
    throw new Error('Inventory lot not found');
  }
  if (lot.status === 'DEPLETED') {
    throw new Error('Cannot block a depleted lot');
  }

  lot.status = 'BLOCKED';
  lot.blockedReason = reason || 'Administratively blocked';
  lot.blockedAt = new Date();
  lot.blockedBy = userId;

  await lot.save();
  return lot;
}

/**
 * Unblock a previously blocked lot
 */
async function unblockLot({ lotId, userId, tenantId }) {
  const lot = await InventoryLot.findOne({ _id: lotId, tenantId });
  if (!lot) {
    throw new Error('Inventory lot not found');
  }
  if (lot.status !== 'BLOCKED') {
    throw new Error('Lot is not currently blocked');
  }

  const now = new Date();
  lot.status = lot.expiryDate <= now ? 'EXPIRED' : 'ACTIVE';
  lot.blockedReason = undefined;
  lot.blockedAt = undefined;
  lot.blockedBy = undefined;

  await lot.save();
  return lot;
}

module.exports = {
  allocateLots,
  createLot,
  getLotAvailability,
  blockLot,
  unblockLot,
  NEAR_EXPIRY_DAYS
};
