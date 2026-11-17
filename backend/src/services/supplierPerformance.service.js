/**
 * Supplier Performance & Scorecard Service
 * ──────────────────────────────────────────
 * Automatically calculates supplier metrics from Purchase Order history:
 * 1. Delivery Timeliness (on-time %)
 * 2. Quality Rate (100% - defect/rejection %)
 * 3. Cost Variance (ordered PO value vs actual received value)
 * 4. Composite Performance Score (weighted 40% on-time, 35% quality, 25% cost)
 */

'use strict';

const mongoose = require('mongoose');
const SupplierProfile = require('../models/SupplierProfile');
const Company = require('../models/Company');
const PurchaseOrder = require('../models/PurchaseOrder');
const logger = require('../utils/logger');

class SupplierPerformanceService {
  /**
   * Calculate composite supplier score from components.
   *
   * @param {{ onTimeRate: number, qualityRate: number, costVariancePercent: number }} metrics
   * @returns {number} Score between 0 and 100
   */
  static calculateCompositeScore({ onTimeRate = 100, qualityRate = 100, costVariancePercent = 0 }) {
    const onTimeWeight = 0.40;
    const qualityWeight = 0.35;
    const costWeight = 0.25;

    const onTimeScore = Math.min(100, Math.max(0, Number(onTimeRate) || 0)) * onTimeWeight;
    const qualityScore = Math.min(100, Math.max(0, Number(qualityRate) || 0)) * qualityWeight;

    // Cost variance: 0 or negative variance is 100% score; positive variance penalizes 2 pts per 1%
    const variance = Number(costVariancePercent) || 0;
    let costRaw = 100;
    if (variance > 0) {
      costRaw = Math.max(0, 100 - (variance * 2));
    }
    const costScore = costRaw * costWeight;

    const overall = onTimeScore + qualityScore + costScore;
    return Math.round(overall * 10) / 10;
  }

  /**
   * Determine performance tier rating based on overall score.
   *
   * @param {number} score
   * @returns {'PLATINUM'|'GOLD'|'SILVER'|'BRONZE'|'AT_RISK'}
   */
  static getRatingTier(score) {
    if (score >= 95) return 'PLATINUM';
    if (score >= 85) return 'GOLD';
    if (score >= 70) return 'SILVER';
    if (score >= 50) return 'BRONZE';
    return 'AT_RISK';
  }

  /**
   * Evaluate and persist performance scorecard for a specific supplier.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string|mongoose.Types.ObjectId} companyId
   */
  static async evaluateSupplier(tenantId, companyId) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    // 1. Fetch completed/received purchase orders for this supplier
    const pos = await PurchaseOrder.find({
      tenantId: tenantObjectId,
      $or: [
        { 'supplier.companyId': companyObjectId },
        { companyId: companyObjectId }
      ],
      status: { $in: ['received', 'partially_received'] }
    }).lean();

    const totalPOs = await PurchaseOrder.countDocuments({
      tenantId: tenantObjectId,
      $or: [
        { 'supplier.companyId': companyObjectId },
        { companyId: companyObjectId }
      ]
    });

    const completedPOs = pos.length;
    let onTimeDeliveries = 0;
    let lateDeliveries = 0;
    let totalUnitsReceived = 0;
    let rejectedUnits = 0;
    let totalOrderedValue = 0;
    let totalActualValue = 0;

    for (const po of pos) {
      const expected = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null;
      const actual = po.actualDeliveryDate ? new Date(po.actualDeliveryDate) : (po.receivedAt ? new Date(po.receivedAt) : null);

      if (expected && actual) {
        if (actual <= expected) {
          onTimeDeliveries++;
        } else {
          lateDeliveries++;
        }
      } else {
        // If no explicit expected date, count as on-time by default
        onTimeDeliveries++;
      }

      // Quality metrics
      if (po.qualityInspection) {
        totalUnitsReceived += (Number(po.qualityInspection.totalUnitsReceived) || 0);
        rejectedUnits += (Number(po.qualityInspection.rejectedUnits) || 0);
      } else {
        // Count PO line quantities as received if no explicit inspection
        const poLineQty = (po.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        totalUnitsReceived += poLineQty;
      }

      // Cost metrics
      const orderedVal = Number(po.totalValue) || 0;
      totalOrderedValue += orderedVal;
      totalActualValue += orderedVal; // fallback if no landed cost override
    }

    const onTimeRate = completedPOs > 0
      ? Math.round((onTimeDeliveries / completedPOs) * 1000) / 10
      : 100;

    const qualityRate = totalUnitsReceived > 0
      ? Math.round(((totalUnitsReceived - rejectedUnits) / totalUnitsReceived) * 1000) / 10
      : 100;

    const costVariancePercent = totalOrderedValue > 0
      ? Math.round(((totalActualValue - totalOrderedValue) / totalOrderedValue) * 1000) / 10
      : 0;

    const overallScore = this.calculateCompositeScore({
      onTimeRate,
      qualityRate,
      costVariancePercent
    });

    // 2. Upsert SupplierProfile
    const performance = {
      totalPOs,
      completedPOs,
      onTimeDeliveries,
      lateDeliveries,
      onTimeRate,
      avgDeliveryDays: 0,
      totalUnitsReceived,
      rejectedUnits,
      qualityRate,
      totalOrderedValue: Math.round(totalOrderedValue * 100) / 100,
      totalActualValue: Math.round(totalActualValue * 100) / 100,
      costVariancePercent,
      overallScore,
      lastEvaluatedAt: new Date()
    };

    let profile = await SupplierProfile.findOne({ tenantId: tenantObjectId, companyId: companyObjectId });
    if (!profile) {
      profile = new SupplierProfile({
        tenantId: tenantObjectId,
        companyId: companyObjectId,
        performance
      });
    } else {
      profile.performance = performance;
    }
    await profile.save();

    // Link in Company model
    await Company.updateOne(
      { _id: companyObjectId, tenantId: tenantObjectId },
      { $set: { supplierProfile: profile._id, isSupplier: true } }
    );

    return {
      supplierId: companyId,
      performance,
      ratingTier: this.getRatingTier(overallScore)
    };
  }

  /**
   * Get supplier leaderboard ranked by composite score.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {number} limit
   */
  static async getSupplierLeaderboard(tenantId, limit = 20) {
    const profiles = await SupplierProfile.find({ tenantId, isActive: true })
      .populate('companyId', 'name email phone industry address')
      .sort({ 'performance.overallScore': -1, 'performance.completedPOs': -1 })
      .limit(limit)
      .lean();

    return profiles.map((p, idx) => ({
      rank: idx + 1,
      profileId: p._id,
      company: p.companyId,
      supplierCode: p.supplierCode,
      paymentTerms: p.paymentTerms,
      leadTimeDays: p.leadTimeDays,
      performance: p.performance,
      ratingTier: this.getRatingTier(p.performance?.overallScore || 0)
    }));
  }
}

module.exports = SupplierPerformanceService;

