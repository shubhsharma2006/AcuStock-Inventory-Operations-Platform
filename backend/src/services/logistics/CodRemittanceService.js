'use strict';

const mongoose = require('mongoose');
const CodRemittance = require('../../models/CodRemittance');
const Shipment = require('../../models/Shipment');
const logger = require('../../utils/logger');

/**
 * Enterprise COD Remittance & Automated Reconciliation Engine
 */
class CodRemittanceService {
  static EARLY_COD_FEES = {
    EARLY_T1: 0.015, // 1.5% fee for T+1 next-day payout
    EARLY_T2: 0.010, // 1.0% fee for T+2 payout
    STANDARD_T7: 0.0 // Standard cycle
  };

  /**
   * Parse courier remittance report and reconcile against shipments.
   */
  static async parseRemittanceAdvice({
    tenantId,
    carrierName = 'Delhivery Express',
    utrNumber,
    bankName = 'HDFC Bank',
    accountNumber = 'XXXXXX9821',
    transferDate = new Date(),
    cycle = 'STANDARD_T7',
    rows = []
  }) {
    if (!utrNumber) {
      throw new Error('UTR Number is required for COD remittance advice');
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Remittance advice must contain at least one order record');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const remittanceNumber = `REM-${Date.now().toString().slice(-8)}`;

    let grossCodCollected = 0;
    let totalFreightDeducted = 0;
    let totalEarlyCodFees = 0;
    let netRemittedAmount = 0;
    let discrepancyCount = 0;

    const reconciledOrders = [];

    for (const row of rows) {
      const cleanAwb = String(row.awb || '').toUpperCase().trim();
      const collected = Number(row.collectedAmount) || Number(row.codAmount) || 0;
      const freight = Number(row.freightCharge) || Number(row.deductions) || 0;

      // Find shipment in database
      const shipment = await Shipment.findOne({
        tenantId: tenantObjectId,
        $or: [{ awb: cleanAwb }, { reference: cleanAwb }]
      });

      const declaredCod = shipment ? (shipment.codAmount || shipment.prepaidAmount || collected) : collected;
      const feeRate = CodRemittanceService.EARLY_COD_FEES[cycle] || 0;
      const earlyCodFee = Math.round(collected * feeRate);
      const netRemitted = Math.max(0, collected - freight - earlyCodFee);

      let discrepancyAmount = 0;
      let discrepancyReason = null;

      if (collected < declaredCod) {
        discrepancyAmount = declaredCod - collected;
        discrepancyReason = `Shortage collected by courier (Declared: ₹${declaredCod}, Collected: ₹${collected})`;
        discrepancyCount++;
      }

      grossCodCollected += collected;
      totalFreightDeducted += freight;
      totalEarlyCodFees += earlyCodFee;
      netRemittedAmount += netRemitted;

      reconciledOrders.push({
        shipmentId: shipment ? shipment._id : null,
        awb: cleanAwb,
        reference: shipment ? shipment.reference : row.reference || cleanAwb,
        customerName: shipment ? shipment.customerName : (row.customerName || 'Customer'),
        deliveredAt: shipment?.actualDeliveryDate || new Date(),
        declaredCodAmount: declaredCod,
        collectedCodAmount: collected,
        freightDeductions: freight,
        codHandlingFee: 0,
        earlyCodFee,
        netRemitted,
        discrepancyAmount,
        discrepancyReason
      });

      // Mark shipment as remitted
      if (shipment) {
        shipment.remarks = `${shipment.remarks || ''} [COD Remitted via UTR ${utrNumber}]`.trim();
        await shipment.save();
      }
    }

    const status = discrepancyCount > 0 ? 'DISCREPANCY_FLAGGED' : 'RECONCILED';

    const remittance = await CodRemittance.create({
      remittanceNumber,
      tenantId: tenantObjectId,
      carrierName,
      bankDetails: {
        utrNumber: utrNumber.toUpperCase().trim(),
        bankName,
        accountNumber,
        transferDate: new Date(transferDate)
      },
      cycle,
      orders: reconciledOrders,
      financialSummary: {
        totalOrders: reconciledOrders.length,
        grossCodCollected,
        totalFreightDeducted,
        totalEarlyCodFees,
        netRemittedAmount,
        discrepancyCount
      },
      status,
      remarks: `Remitted ${reconciledOrders.length} COD consignments via ${carrierName} (${cycle})`
    });

    logger.info(`💰 [COD REMITTANCE] Reconciled UTR ${utrNumber} for ₹${netRemittedAmount} across ${reconciledOrders.length} orders. Discrepancies: ${discrepancyCount}`);

    return remittance;
  }

  /**
   * Get delivered COD shipments currently awaiting courier remittance.
   */
  static async getUnremittedShipments(tenantId) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const now = new Date();

    // Query COD shipments that are DELIVERED
    const deliveredShipments = await Shipment.find({
      tenantId: tenantObjectId,
      deliveryType: 'COD',
      status: 'DELIVERED'
    })
      .select('reference awb customerName phone city codAmount actualDeliveryDate createdAt carrierType courier')
      .sort({ actualDeliveryDate: -1, createdAt: -1 })
      .lean();

    // Cross-check against already remitted AWBs
    const remittedAwbs = await CodRemittance.distinct('orders.awb', { tenantId: tenantObjectId });
    const remittedSet = new Set(remittedAwbs.map(a => String(a).toUpperCase()));

    let totalPendingAmount = 0;
    let overdueAmount = 0;

    const unremitted = deliveredShipments
      .filter(s => s.awb && !remittedSet.has(s.awb.toUpperCase()))
      .map(s => {
        const deliveredDate = s.actualDeliveryDate || s.createdAt;
        const daysSinceDelivery = Math.floor((now.getTime() - new Date(deliveredDate).getTime()) / 86400000);
        const codVal = s.codAmount || 0;

        totalPendingAmount += codVal;

        let agingCategory = 'ON_TIME';
        if (daysSinceDelivery >= 7) {
          agingCategory = 'OVERDUE';
          overdueAmount += codVal;
        } else if (daysSinceDelivery >= 4) {
          agingCategory = 'AGING';
        }

        return {
          _id: s._id,
          reference: s.reference,
          awb: s.awb,
          customerName: s.customerName,
          phone: s.phone,
          city: s.city,
          carrierType: s.carrierType || s.courier || 'Delhivery',
          codAmount: codVal,
          deliveredAt: deliveredDate,
          daysSinceDelivery,
          agingCategory
        };
      });

    return {
      unremitted,
      totalUnremittedCount: unremitted.length,
      totalPendingAmount,
      overdueAmount
    };
  }

  /**
   * Request Early COD Payout (T+1) for delivered orders.
   */
  static async requestEarlyCod({ tenantId, shipmentIds = [], cycle = 'EARLY_T1' }) {
    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      throw new Error('At least one shipment ID is required for early COD payout');
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const shipments = await Shipment.find({
      _id: { $in: shipmentIds.map(id => new mongoose.Types.ObjectId(id)) },
      tenantId: tenantObjectId,
      deliveryType: 'COD',
      status: 'DELIVERED'
    }).lean();

    if (shipments.length === 0) {
      throw new Error('No eligible delivered COD shipments found for early payout');
    }

    const rows = shipments.map(s => ({
      awb: s.awb,
      reference: s.reference,
      customerName: s.customerName,
      collectedAmount: s.codAmount || 1500,
      freightCharge: 65
    }));

    const utrNumber = `HDFC-EARLY-${Date.now().toString().slice(-8)}`;

    const remittance = await CodRemittanceService.parseRemittanceAdvice({
      tenantId,
      carrierName: 'AcuStock Early COD Settlement',
      utrNumber,
      bankName: 'HDFC Bank FastPay',
      transferDate: new Date(Date.now() + 86400000), // T+1 Next-day
      cycle,
      rows
    });

    return {
      success: true,
      message: `Early COD settlement approved! ₹${remittance.financialSummary.netRemittedAmount} scheduled for T+1 bank transfer.`,
      remittance
    };
  }

  /**
   * Get COD Dashboard Metrics for operations.
   */
  static async getCodMetrics(tenantId) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const [remittances, unremittedData] = await Promise.all([
      CodRemittance.find({ tenantId: tenantObjectId }).lean(),
      CodRemittanceService.getUnremittedShipments(tenantId)
    ]);

    let totalRemittedAmount = 0;
    let totalEarlyCodFeesPaid = 0;
    let activeDiscrepanciesCount = 0;

    for (const r of remittances) {
      totalRemittedAmount += r.financialSummary.netRemittedAmount || 0;
      totalEarlyCodFeesPaid += r.financialSummary.totalEarlyCodFees || 0;
      if (r.status === 'DISCREPANCY_FLAGGED') {
        activeDiscrepanciesCount += r.financialSummary.discrepancyCount || 1;
      }
    }

    return {
      totalRemittedAmount,
      inTransitCodAmount: unremittedData.totalPendingAmount,
      overdueCodAmount: unremittedData.overdueAmount,
      unremittedCount: unremittedData.totalUnremittedCount,
      totalEarlyCodFeesPaid,
      activeDiscrepanciesCount,
      totalBatchesCount: remittances.length
    };
  }
}

module.exports = CodRemittanceService;
