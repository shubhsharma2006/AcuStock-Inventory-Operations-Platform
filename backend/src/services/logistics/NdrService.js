'use strict';

const mongoose = require('mongoose');
const Shipment = require('../../models/Shipment');
const TrackingEvent = require('../../models/TrackingEvent');
const allocationEngine = require('./CarrierAllocationEngine');
const logger = require('../../utils/logger');

/**
 * Enterprise NDR (Non-Delivery Report) & Customer Re-Attempt Management Service
 */
class NdrService {
  static REASON_CODES = {
    CUSTOMER_UNAVAILABLE: 'CUSTOMER_UNAVAILABLE',
    INCORRECT_ADDRESS: 'INCORRECT_ADDRESS',
    CUSTOMER_REFUSED: 'CUSTOMER_REFUSED',
    COD_NOT_READY: 'COD_NOT_READY',
    PHONE_UNREACHABLE: 'PHONE_UNREACHABLE',
    ENTRY_RESTRICTED: 'ENTRY_RESTRICTED',
    CUSTOMER_RESCHEDULE_REQUESTED: 'CUSTOMER_RESCHEDULE_REQUESTED',
    OTHER: 'OTHER'
  };

  static NDR_STATUSES = {
    ACTION_REQUIRED: 'ACTION_REQUIRED',
    CUSTOMER_RESPONDED: 'CUSTOMER_RESPONDED',
    REATTEMPT_SCHEDULED: 'REATTEMPT_SCHEDULED',
    RTO_REQUESTED: 'RTO_REQUESTED',
    RESOLVED: 'RESOLVED'
  };

  /**
   * Classify raw courier error strings into standard NDR reason codes.
   */
  static classifyReason(rawReason = '') {
    const text = String(rawReason).toUpperCase();

    if (text.includes('NOT AVAILABLE') || text.includes('UNAVAILABLE') || text.includes('DOOR CLOSED') || text.includes('PREMISES CLOSED')) {
      return NdrService.REASON_CODES.CUSTOMER_UNAVAILABLE;
    }
    if (text.includes('ADDRESS') || text.includes('LANDMARK') || text.includes('INCOMPLETE') || text.includes('WRONG LOCATION')) {
      return NdrService.REASON_CODES.INCORRECT_ADDRESS;
    }
    if (text.includes('REFUSE') || text.includes('REJECTED') || text.includes('DID NOT ORDER')) {
      return NdrService.REASON_CODES.CUSTOMER_REFUSED;
    }
    if (text.includes('CASH') || text.includes('COD') || text.includes('PAYMENT NOT READY') || text.includes('MONEY')) {
      return NdrService.REASON_CODES.COD_NOT_READY;
    }
    if (text.includes('PHONE') || text.includes('UNREACHABLE') || text.includes('SWITCHED OFF') || text.includes('NOT ANSWERING')) {
      return NdrService.REASON_CODES.PHONE_UNREACHABLE;
    }
    if (text.includes('GATE') || text.includes('SECURITY') || text.includes('RESTRICTED') || text.includes('ENTRY')) {
      return NdrService.REASON_CODES.ENTRY_RESTRICTED;
    }
    if (text.includes('FUTURE') || text.includes('RESCHEDULE') || text.includes('NEXT DAY') || text.includes('POSTPONE')) {
      return NdrService.REASON_CODES.CUSTOMER_RESCHEDULE_REQUESTED;
    }

    return NdrService.REASON_CODES.OTHER;
  }

  /**
   * Ingest a failed delivery event from carrier webhook or poller.
   */
  static async ingestNdrEvent({
    shipmentId,
    awb,
    carrier = 'BIGSHIP',
    rawReason = 'Customer not available',
    failureLocation = 'Destination Hub',
    cutoffHours = 48
  }) {
    const query = shipmentId ? { _id: shipmentId } : { awb };
    const shipment = await Shipment.findOne(query);

    if (!shipment) {
      throw new Error(`Shipment not found for NDR ingestion: ${shipmentId || awb}`);
    }

    const classified = NdrService.classifyReason(rawReason);
    const now = new Date();
    const rtoCutoffAt = new Date(now.getTime() + cutoffHours * 3600000);
    const attemptCount = (shipment.ndrDetails?.attemptCount || 0) + 1;

    // Preserve previous customer response if customer had already scheduled
    const currentActionStatus = shipment.ndrDetails?.customerComments || shipment.ndrDetails?.preferredDate
      ? NdrService.NDR_STATUSES.CUSTOMER_RESPONDED
      : NdrService.NDR_STATUSES.ACTION_REQUIRED;

    shipment.status = 'NDR';
    shipment.ndrDetails = {
      ...shipment.ndrDetails,
      reason: classified,
      rawReason: String(rawReason),
      attemptCount,
      lastAttemptAt: now,
      rtoCutoffAt,
      failureLocation,
      ndrStatus: currentActionStatus
    };

    shipment.statusHistory.push({
      status: 'NDR',
      timestamp: now,
      notes: `Delivery attempt #${attemptCount} failed: ${rawReason} [${classified}]. RTO Cutoff: ${rtoCutoffAt.toISOString()}`
    });

    await shipment.save();

    // Create Tracking Event
    await TrackingEvent.create({
      shipmentId: shipment._id,
      tenantId: shipment.tenantId,
      carrierType: shipment.carrierType || carrier,
      awb: shipment.awb,
      status: 'NDR',
      location: failureLocation,
      metadata: {
        reason: classified,
        rawReason,
        attemptNumber: attemptCount,
        rtoCutoffAt
      },
      source: 'WEBHOOK'
    });

    // Formulate multi-channel customer alert payload (WhatsApp / SMS)
    const alertPayload = {
      recipientPhone: shipment.phone,
      recipientName: shipment.customerName,
      awb: shipment.awb,
      reference: shipment.reference,
      reason: classified,
      trackingUrl: `/tracking/${encodeURIComponent(shipment.reference)}`,
      rtoCutoffHours: cutoffHours
    };

    logger.info(`🚨 [NDR] Ingested failed delivery attempt for AWB ${shipment.awb} (${classified}). Notification queued for ${shipment.phone}`);

    return {
      success: true,
      shipmentId: shipment._id,
      awb: shipment.awb,
      classifiedReason: classified,
      attemptCount,
      rtoCutoffAt,
      alertPayload
    };
  }

  /**
   * Submit an NDR resolution (from Operations dashboard or Customer self-service).
   */
  static async resolveNdr({
    shipmentId,
    awb,
    action, // 'REATTEMPT' | 'UPDATE_DETAILS' | 'HOLD_HUB' | 'RTO_IMMEDIATE'
    preferredDate,
    preferredTimeSlot,
    alternateAddress,
    alternatePhone,
    remarks = '',
    resolvedBy = 'OPERATIONS'
  }) {
    const validActions = ['REATTEMPT', 'UPDATE_DETAILS', 'HOLD_HUB', 'RTO_IMMEDIATE'];
    if (!validActions.includes(action)) {
      throw new Error(`Invalid NDR action. Must be one of: ${validActions.join(', ')}`);
    }

    const query = shipmentId ? { _id: shipmentId } : { awb };
    const shipment = await Shipment.findOne(query);

    if (!shipment) {
      throw new Error(`Shipment not found: ${shipmentId || awb}`);
    }

    const now = new Date();

    // 1. Dispatch action to Carrier Provider
    const providerName = shipment.carrierType === 'SHIPROCKET' ? 'SHIPROCKET' : 'BIGSHIP';
    const provider = allocationEngine.getProvider(providerName);

    let carrierSyncResult = null;
    if (provider && typeof provider.actionNdr === 'function') {
      try {
        carrierSyncResult = await provider.actionNdr(shipment.awb, {
          action,
          preferredDate,
          preferredTimeSlot,
          alternateAddress,
          alternatePhone,
          remarks
        });
      } catch (err) {
        logger.warn(`Failed to push NDR action to carrier ${providerName}:`, err.message);
      }
    }

    // 2. Update Shipment State
    if (action === 'RTO_IMMEDIATE') {
      shipment.status = 'RTO_INITIATED';
      shipment.ndrDetails = {
        ...shipment.ndrDetails,
        action,
        ndrStatus: NdrService.NDR_STATUSES.RTO_REQUESTED,
        resolvedAt: now,
        resolvedBy,
        remarks
      };
      shipment.statusHistory.push({
        status: 'RTO_INITIATED',
        timestamp: now,
        notes: `RTO initiated by ${resolvedBy}: ${remarks || 'Customer / Operations requested immediate return'}`
      });
    } else {
      shipment.status = 'IN_TRANSIT';
      shipment.ndrDetails = {
        ...shipment.ndrDetails,
        action,
        ndrStatus: NdrService.NDR_STATUSES.REATTEMPT_SCHEDULED,
        preferredDate: preferredDate ? new Date(preferredDate) : undefined,
        preferredTimeSlot: preferredTimeSlot || '',
        alternateAddress: alternateAddress || '',
        alternatePhone: alternatePhone || '',
        resolvedAt: now,
        resolvedBy,
        remarks
      };
      if (alternatePhone) {
        shipment.phone = alternatePhone;
      }
      if (alternateAddress) {
        shipment.address = alternateAddress;
      }
      shipment.statusHistory.push({
        status: 'IN_TRANSIT',
        timestamp: now,
        notes: `NDR Reattempt scheduled by ${resolvedBy} (${action}). Delivery slot: ${preferredDate || 'Next Day'} ${preferredTimeSlot || ''}`
      });
    }

    await shipment.save();

    // 3. Create Tracking Event
    await TrackingEvent.create({
      shipmentId: shipment._id,
      tenantId: shipment.tenantId,
      carrierType: shipment.carrierType,
      awb: shipment.awb,
      status: action === 'RTO_IMMEDIATE' ? 'RTO_INITIATED' : 'IN_TRANSIT',
      location: shipment.city || 'Hub',
      metadata: {
        event: action === 'RTO_IMMEDIATE' ? 'NDR_RTO_DISPATCHED' : 'NDR_REATTEMPT_DISPATCHED',
        action,
        carrierActionId: carrierSyncResult?.carrierActionId || null,
        resolvedBy
      },
      source: 'MANUAL'
    });

    return {
      success: true,
      shipmentId: shipment._id,
      awb: shipment.awb,
      newStatus: shipment.status,
      ndrStatus: shipment.ndrDetails?.ndrStatus,
      carrierSyncResult
    };
  }

  /**
   * Get NDR Dashboard Metrics & KPIs for a tenant.
   */
  static async getNdrMetrics(tenantId) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 3600000);

    const ndrShipments = await Shipment.find({
      tenantId: tenantObjectId,
      status: { $in: ['NDR', 'RTO_INITIATED', 'RETURNED'] }
    }).select('status codAmount deliveryType ndrDetails createdAt').lean();

    let activeNdrsCount = 0;
    let criticalCutoffCount = 0;
    let customerRespondedCount = 0;
    let resolvedCount = 0;
    let rtoInitiatedCount = 0;
    let codAtRiskAmount = 0;

    for (const s of ndrShipments) {
      if (s.status === 'NDR') {
        activeNdrsCount++;
        if (s.deliveryType === 'COD' && s.codAmount) {
          codAtRiskAmount += s.codAmount;
        }

        const cutoff = s.ndrDetails?.rtoCutoffAt ? new Date(s.ndrDetails.rtoCutoffAt) : null;
        if (cutoff && cutoff <= next24Hours) {
          criticalCutoffCount++;
        }

        if (s.ndrDetails?.customerComments || s.ndrDetails?.action) {
          customerRespondedCount++;
        }
      } else if (s.status === 'RTO_INITIATED') {
        rtoInitiatedCount++;
      } else if (s.status === 'RETURNED') {
        resolvedCount++;
      }
    }

    const totalEvaluated = activeNdrsCount + rtoInitiatedCount + resolvedCount;
    const responseRatePercentage = activeNdrsCount > 0
      ? Math.round((customerRespondedCount / activeNdrsCount) * 100)
      : 100;
    const rtoSavedPercentage = totalEvaluated > 0
      ? Math.round(((totalEvaluated - rtoInitiatedCount) / totalEvaluated) * 100)
      : 100;

    return {
      activeNdrsCount,
      criticalCutoffCount,
      customerRespondedCount,
      rtoInitiatedCount,
      codAtRiskAmount,
      responseRatePercentage,
      rtoSavedPercentage
    };
  }

  /**
   * List pending NDR shipments with enriched urgency metrics.
   */
  static async getPendingNdrs(tenantId, { limit = 50, page = 1, carrier, reason } = {}) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const query = {
      tenantId: tenantObjectId,
      status: 'NDR'
    };

    if (carrier) {
      query.carrierType = carrier.toUpperCase();
    }
    if (reason) {
      query['ndrDetails.reason'] = reason.toUpperCase();
    }

    const skip = (page - 1) * limit;
    const now = new Date();

    const [shipments, total] = await Promise.all([
      Shipment.find(query)
        .populate('productId', 'name sku')
        .sort({ 'ndrDetails.rtoCutoffAt': 1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Shipment.countDocuments(query)
    ]);

    const enriched = shipments.map(s => {
      const cutoff = s.ndrDetails?.rtoCutoffAt ? new Date(s.ndrDetails.rtoCutoffAt) : null;
      let hoursRemaining = 48;
      let urgency = 'NORMAL';

      if (cutoff) {
        hoursRemaining = Math.max(0, Math.round((cutoff.getTime() - now.getTime()) / 3600000));
        if (hoursRemaining <= 12) {
          urgency = 'CRITICAL';
        } else if (hoursRemaining <= 24) {
          urgency = 'WARNING';
        }
      }

      return {
        _id: s._id,
        reference: s.reference,
        awb: s.awb,
        customerName: s.customerName,
        phone: s.phone,
        city: s.city,
        carrierType: s.carrierType,
        deliveryType: s.deliveryType,
        codAmount: s.codAmount || 0,
        productName: s.productId?.name || s.productName,
        quantity: s.quantity,
        ndrDetails: {
          ...s.ndrDetails,
          hoursRemaining,
          urgency
        }
      };
    });

    return {
      shipments: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

module.exports = NdrService;
