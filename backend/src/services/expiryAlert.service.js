/**
 * Expiry Alert & FEFO (First Expired, First Out) Picking Service
 * ─────────────────────────────────────────────────────────────
 * Implements:
 * 1. Urgency tier classification based on shelf-life days remaining
 * 2. Deterministic FEFO pick sequence generation
 * 3. Near-expiry lot scanning and alerting thresholds
 */

'use strict';

const mongoose = require('mongoose');
const InventoryLot = require('../models/InventoryLot');
const Item = require('../models/Item');
const logger = require('../utils/logger');

class ExpiryAlertService {
  /**
   * Classify expiry urgency tier given an expiry date.
   *
   * @param {Date|string} expiryDate
   * @param {Date} [referenceDate] - Default: current date
   * @returns {{
   *   daysRemaining: number,
   *   tier: 'EXPIRED'|'CRITICAL'|'WARNING'|'NOTICE'|'NORMAL',
   *   badgeColor: string
   * }}
   */
  static categorizeExpiry(expiryDate, referenceDate = new Date()) {
    const exp = new Date(expiryDate);
    const ref = new Date(referenceDate);

    const diffMs = exp.getTime() - ref.getTime();
    const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return { daysRemaining, tier: 'EXPIRED', badgeColor: 'red' };
    }
    if (daysRemaining <= 30) {
      return { daysRemaining, tier: 'CRITICAL', badgeColor: 'orange' };
    }
    if (daysRemaining <= 60) {
      return { daysRemaining, tier: 'WARNING', badgeColor: 'yellow' };
    }
    if (daysRemaining <= 90) {
      return { daysRemaining, tier: 'NOTICE', badgeColor: 'blue' };
    }
    return { daysRemaining, tier: 'NORMAL', badgeColor: 'green' };
  }

  /**
   * Generate FEFO pick recommendation order.
   * Sorts active lots by earliest expiry date first and allocates requested quantity.
   *
   * @param {Array<{ _id: string, lotNumber: string, remainingQty: number, expiryDate: Date }>} lots
   * @param {number} requestedQty
   */
  static getFEFOPickRecommendation(lots = [], requestedQty = 1) {
    let unfulfilledQty = Math.max(1, Number(requestedQty) || 1);
    const now = new Date();

    // Filter active lots with stock, sort ascending by expiry date (earliest first)
    const activeLots = [...lots]
      .filter(l => l && (Number(l.remainingQty) || 0) > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    const pickSequence = [];
    let hasNearExpiryAllocated = false;
    let hasExpiredAllocated = false;

    for (const lot of activeLots) {
      if (unfulfilledQty <= 0) break;

      const available = Number(lot.remainingQty) || 0;
      const allocateQty = Math.min(available, unfulfilledQty);
      const { daysRemaining, tier } = this.categorizeExpiry(lot.expiryDate, now);

      if (tier === 'EXPIRED') hasExpiredAllocated = true;
      if (tier === 'CRITICAL') hasNearExpiryAllocated = true;

      pickSequence.push({
        lotId: lot._id,
        lotNumber: lot.lotNumber,
        allocateQty,
        lotRemainingQty: available,
        expiryDate: lot.expiryDate,
        daysRemaining,
        tier
      });

      unfulfilledQty -= allocateQty;
    }

    return {
      requestedQty,
      allocatedTotal: requestedQty - unfulfilledQty,
      unfulfilledQty,
      isFullyAllocated: unfulfilledQty === 0,
      hasNearExpiryAllocated,
      hasExpiredAllocated,
      pickSequence
    };
  }

  /**
   * Scan active lots across tenant and group into dashboard urgency buckets.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {object} options
   */
  static async getExpiryDashboard(tenantId, options = {}) {
    const { warehouseId } = options;
    const filter = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $in: ['ACTIVE', 'BLOCKED'] },
      remainingQty: { $gt: 0 }
    };
    if (warehouseId) {
      filter.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }

    const lots = await InventoryLot.find(filter)
      .populate('productId', 'name sku uom')
      .populate('warehouseId', 'name code')
      .sort({ expiryDate: 1 })
      .lean();

    const now = new Date();
    const buckets = {
      EXPIRED: [],
      CRITICAL: [],
      WARNING: [],
      NOTICE: [],
      NORMAL: []
    };

    lots.forEach(lot => {
      const { daysRemaining, tier } = this.categorizeExpiry(lot.expiryDate, now);
      buckets[tier].push({
        ...lot,
        daysRemaining,
        tier
      });
    });

    return {
      summary: {
        expiredCount: buckets.EXPIRED.length,
        criticalCount: buckets.CRITICAL.length,
        warningCount: buckets.WARNING.length,
        noticeCount: buckets.NOTICE.length,
        normalCount: buckets.NORMAL.length,
        totalActiveLots: lots.length
      },
      buckets
    };
  }
}

module.exports = ExpiryAlertService;

