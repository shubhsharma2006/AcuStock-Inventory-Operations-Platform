'use strict';

const mongoose = require('mongoose');
const WeightDiscrepancy = require('../../models/WeightDiscrepancy');
const Shipment = require('../../models/Shipment');
const VolumetricEngine = require('./VolumetricEngine');
const logger = require('../../utils/logger');

/**
 * Enterprise Weight Discrepancy & Dispute Management Service
 */
class WeightDiscrepancyService {
  static AUTO_DEBIT_WINDOW_DAYS = 5; // Standard 5-day carrier contest window
  static TOLERANCE_KG = 0.05;         // 50g tolerance window

  /**
   * Ingest courier billed weight measurement from webhook or automated billing reconciliation.
   */
  static async ingestDiscrepancy({
    awb,
    shipmentId,
    carrierBilledWeightKg,
    carrierBilledDimensions = { length: 15, width: 15, height: 10 },
    scannedAtHub = 'Automated DWS Sorter Hub',
    carrierName
  }) {
    const query = shipmentId ? { _id: shipmentId } : { awb: String(awb).toUpperCase().trim() };
    const shipment = await Shipment.findOne(query);

    if (!shipment) {
      throw new Error(`Shipment not found for weight discrepancy ingestion: ${shipmentId || awb}`);
    }

    const declaredWeight = parseFloat(shipment.weight) || 0.5;
    const billedWeight = Number(carrierBilledWeightKg);

    const excessWeightKg = Math.round((billedWeight - declaredWeight) * 1000) / 1000;

    if (excessWeightKg <= WeightDiscrepancyService.TOLERANCE_KG) {
      logger.info(`ℹ️ [WEIGHT] Billed weight ${billedWeight}kg is within 50g tolerance of declared ${declaredWeight}kg for AWB ${shipment.awb}`);
      return { withinTolerance: true, declaredWeight, billedWeight };
    }

    // Freight excess calculation: ₹48 per 500g slab + GST
    const slabs = Math.ceil(excessWeightKg / 0.5);
    const excessAmount = slabs * 48;

    const now = new Date();
    const autoDebitCutoffAt = new Date(now.getTime() + WeightDiscrepancyService.AUTO_DEBIT_WINDOW_DAYS * 24 * 3600000);
    const discrepancyId = `WD-${Date.now().toString().slice(-8)}`;

    const record = await WeightDiscrepancy.create({
      discrepancyId,
      tenantId: shipment.tenantId,
      shipmentId: shipment._id,
      reference: shipment.reference,
      awb: shipment.awb,
      carrierName: carrierName || shipment.courier || shipment.carrierType || 'Delhivery Express',
      declared: {
        weightKg: declaredWeight,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        volumetricWeightKg: 0.2
      },
      carrierBilled: {
        weightKg: billedWeight,
        lengthCm: carrierBilledDimensions.length || 15,
        widthCm: carrierBilledDimensions.width || 15,
        heightCm: carrierBilledDimensions.height || 10,
        volumetricWeightKg: Math.round(((carrierBilledDimensions.length * carrierBilledDimensions.width * carrierBilledDimensions.height) / 5000) * 100) / 100,
        scannedAtHub
      },
      discrepancy: {
        excessWeightKg,
        excessAmount,
        notifiedAt: now,
        autoDebitCutoffAt
      },
      status: 'NEW'
    });

    logger.warn(`⚠️ [WEIGHT DISCREPANCY] AWB ${shipment.awb}: Declared ${declaredWeight}kg vs Billed ${billedWeight}kg (+${excessWeightKg}kg). Excess fee ₹${excessAmount} pending.`);

    return {
      success: true,
      discrepancyId: record.discrepancyId,
      awb: shipment.awb,
      excessWeightKg,
      excessAmount,
      autoDebitCutoffAt
    };
  }

  /**
   * File dispute against carrier with photographic / scale proof.
   */
  static async fileDispute({
    discrepancyId,
    tenantId,
    merchantRemarks = '',
    scalePhotoUrl = '',
    dimensionsPhotoUrl = '',
    productPhotoUrl = ''
  }) {
    const query = { discrepancyId: discrepancyId.toUpperCase().trim() };
    if (tenantId) query.tenantId = tenantId;

    const record = await WeightDiscrepancy.findOne(query);
    if (!record) {
      throw new Error(`Weight discrepancy not found: ${discrepancyId}`);
    }

    if (record.status !== 'NEW') {
      throw new Error(`Cannot dispute discrepancy in status: ${record.status}`);
    }

    const carrierDisputeId = `DISP-${record.carrierName.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const now = new Date();

    record.status = 'DISPUTE_FILED';
    record.disputeEvidence = {
      scalePhotoUrl,
      dimensionsPhotoUrl,
      productPhotoUrl,
      merchantRemarks: merchantRemarks || 'Package verified on certified warehouse digital scale prior to dispatch.',
      filedAt: now,
      carrierDisputeId
    };

    await record.save();

    logger.info(`🛡️ [DISPUTE FILED] Discrepancy ${discrepancyId} for AWB ${record.awb} disputed with proof (Carrier Token: ${carrierDisputeId})`);

    return {
      success: true,
      discrepancyId: record.discrepancyId,
      carrierDisputeId,
      status: record.status,
      filedAt: now
    };
  }

  /**
   * Accept discrepancy without dispute (debits merchant account/wallet).
   */
  static async acceptDiscrepancy({ discrepancyId, tenantId, reason = 'Accepted courier physical scan' }) {
    const query = { discrepancyId: discrepancyId.toUpperCase().trim() };
    if (tenantId) query.tenantId = tenantId;

    const record = await WeightDiscrepancy.findOne(query);
    if (!record) {
      throw new Error(`Weight discrepancy not found: ${discrepancyId}`);
    }

    record.status = 'ACCEPTED_BY_MERCHANT';
    record.resolution = {
      resolvedAt: new Date(),
      refundedAmount: 0,
      carrierComments: `Accepted by merchant: ${reason}`
    };

    await record.save();

    return {
      success: true,
      discrepancyId: record.discrepancyId,
      status: record.status
    };
  }

  /**
   * Get Weight Discrepancy Dashboard Metrics.
   */
  static async getDiscrepancyMetrics(tenantId) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 3600000);

    const records = await WeightDiscrepancy.find({ tenantId: tenantObjectId }).lean();

    let activeCount = 0;
    let totalExcessAmount = 0;
    let disputedAmount = 0;
    let savedAmount = 0;
    let urgentCutoffCount = 0;

    for (const r of records) {
      if (r.status === 'NEW' || r.status === 'DISPUTE_FILED') {
        activeCount++;
        totalExcessAmount += r.discrepancy.excessAmount || 0;

        if (r.status === 'DISPUTE_FILED') {
          disputedAmount += r.discrepancy.excessAmount || 0;
        }

        if (r.status === 'NEW' && r.discrepancy?.autoDebitCutoffAt) {
          const cutoff = new Date(r.discrepancy.autoDebitCutoffAt);
          if (cutoff <= next24Hours) {
            urgentCutoffCount++;
          }
        }
      } else if (r.status === 'RESOLVED_IN_FAVOR_OF_MERCHANT') {
        savedAmount += r.resolution?.refundedAmount || r.discrepancy.excessAmount || 0;
      }
    }

    return {
      activeCount,
      totalExcessAmount,
      disputedAmount,
      savedAmount,
      urgentCutoffCount,
      totalEvaluatedCount: records.length
    };
  }

  /**
   * List weight discrepancies with pagination and filters.
   */
  static async listDiscrepancies(tenantId, { status, carrier, page = 1, limit = 50 } = {}) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const query = { tenantId: tenantObjectId };

    if (status) query.status = status.toUpperCase();
    if (carrier) query.carrierName = new RegExp(carrier, 'i');

    const skip = (page - 1) * limit;
    const now = new Date();

    const [records, total] = await Promise.all([
      WeightDiscrepancy.find(query)
        .sort({ 'discrepancy.autoDebitCutoffAt': 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WeightDiscrepancy.countDocuments(query)
    ]);

    const enriched = records.map(r => {
      const cutoff = r.discrepancy?.autoDebitCutoffAt ? new Date(r.discrepancy.autoDebitCutoffAt) : null;
      let hoursRemaining = 120; // 5 days
      let isUrgent = false;

      if (cutoff) {
        hoursRemaining = Math.max(0, Math.round((cutoff.getTime() - now.getTime()) / 3600000));
        isUrgent = hoursRemaining <= 24;
      }

      return {
        ...r,
        hoursRemaining,
        isUrgent
      };
    });

    return {
      discrepancies: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

module.exports = WeightDiscrepancyService;
