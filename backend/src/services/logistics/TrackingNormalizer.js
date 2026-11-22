'use strict';

/**
 * TrackingNormalizer
 * Normalizes multi-carrier delivery statuses, exceptions, and milestone events
 * across Bigship, Delhivery, Blue Dart, DTDC, Porter, and Shiprocket into canonical statuses.
 */
class TrackingNormalizer {
  static CANONICAL_STATUSES = {
    BOOKED: 'BOOKED',
    PICKED_UP: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    NDR: 'NDR',
    RTO_INITIATED: 'RTO_INITIATED',
    RTO_DELIVERED: 'RTO_DELIVERED',
    CANCELLED: 'CANCELLED'
  };

  /**
   * Map any carrier raw status to canonical status
   *
   * @param {string} rawStatus
   * @param {string} [carrier='']
   * @returns {string} One of CANONICAL_STATUSES
   */
  static normalizeStatus(rawStatus, carrier = '') {
    if (!rawStatus) return TrackingNormalizer.CANONICAL_STATUSES.BOOKED;

    const normalized = rawStatus.toString().trim().toUpperCase().replace(/[\s-_]+/g, '_');

    // 1. Direct canonical matches
    if (TrackingNormalizer.CANONICAL_STATUSES[normalized]) {
      return TrackingNormalizer.CANONICAL_STATUSES[normalized];
    }

    // 2. Delivered variants
    if (['DEL', 'DL', 'DELIVERED', 'COMPLETED', 'SUCCESS', 'CLOSED', 'POD_COLLECTED'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.DELIVERED;
    }

    // 3. Out for delivery
    if (['OFD', 'OUT_FOR_DELIVERY', 'WITH_COURIER', 'RAD', 'RUN_SHEET_PREPARED', 'ON_THE_WAY'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.OUT_FOR_DELIVERY;
    }

    // 4. NDR / Non-Delivery / Exception
    if (['NDR', 'UNDELIVERED', 'FAILED_ATTEMPT', 'UN_DEL', 'UD', 'DELIVERY_FAILED', 'CUSTOMER_UNAVAILABLE', 'RESCHEDULED'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.NDR;
    }

    // 5. RTO variants
    if (['RTO', 'RTO_INITIATED', 'RETURN_TO_ORIGIN', 'RETURN_REQUESTED', 'RETURNING'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.RTO_INITIATED;
    }
    if (['RTO_DELIVERED', 'RETURNED', 'RETURN_DELIVERED', 'RESTOCKED'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.RTO_DELIVERED;
    }

    // 6. In transit
    if (['IN_TRANSIT', 'IT', 'INTRANSIT', 'TRANSIT', 'HUB_RECEIVED', 'LINEHAUL', 'ARRIVED_AT_HUB', 'REACHED_DESTINATION_HUB'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.IN_TRANSIT;
    }

    // 7. Picked up / Dispatched
    if (['PICKED_UP', 'PICKED', 'PU', 'DISPATCHED', 'MANIFESTED', 'SHIPPED', 'BAG_CREATED', 'PARCEL_HANDOVER'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.PICKED_UP;
    }

    // 8. Booked / Registered
    if (['BOOKED', 'PENDING', 'ORDER_CREATED', 'LABEL_GENERATED', 'READY_FOR_PICKUP'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.BOOKED;
    }

    // 9. Cancelled
    if (['CANCELLED', 'CANCELED', 'VOID', 'ABORTED'].includes(normalized)) {
      return TrackingNormalizer.CANONICAL_STATUSES.CANCELLED;
    }

    return TrackingNormalizer.CANONICAL_STATUSES.IN_TRANSIT;
  }

  /**
   * Returns human-readable label and UI icon for canonical status
   */
  static getStatusMeta(status) {
    const metaMap = {
      BOOKED: {
        label: 'Order Booked',
        icon: '📝',
        color: 'text-sky-400',
        badgeBg: 'bg-sky-500/10 border-sky-500/30'
      },
      PICKED_UP: {
        label: 'Picked Up by Courier',
        icon: '📦',
        color: 'text-indigo-400',
        badgeBg: 'bg-indigo-500/10 border-indigo-500/30'
      },
      IN_TRANSIT: {
        label: 'In Transit',
        icon: '🚚',
        color: 'text-amber-400',
        badgeBg: 'bg-amber-500/10 border-amber-500/30'
      },
      OUT_FOR_DELIVERY: {
        label: 'Out for Delivery',
        icon: '🏃',
        color: 'text-orange-400',
        badgeBg: 'bg-orange-500/10 border-orange-500/30'
      },
      DELIVERED: {
        label: 'Delivered Successfully',
        icon: '✅',
        color: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/10 border-emerald-500/30'
      },
      NDR: {
        label: 'Delivery Attempt Failed (NDR)',
        icon: '⚠️',
        color: 'text-rose-400',
        badgeBg: 'bg-rose-500/10 border-rose-500/30'
      },
      RTO_INITIATED: {
        label: 'Return to Origin Initiated',
        icon: '🔄',
        color: 'text-purple-400',
        badgeBg: 'bg-purple-500/10 border-purple-500/30'
      },
      RTO_DELIVERED: {
        label: 'Returned to Seller Hub',
        icon: '↩️',
        color: 'text-zinc-400',
        badgeBg: 'bg-zinc-500/10 border-zinc-500/30'
      },
      CANCELLED: {
        label: 'Shipment Cancelled',
        icon: '❌',
        color: 'text-red-400',
        badgeBg: 'bg-red-500/10 border-red-500/30'
      }
    };

    return metaMap[status] || metaMap.BOOKED;
  }

  /**
   * Synthesizes sequential milestones based on dates and status when granular webhooks are absent.
   */
  static synthesizeMilestones({
    createdAt,
    dispatchDate,
    status,
    originCity = 'Origin Hub',
    destCity = 'Destination Hub',
    carrierName = 'Carrier Logistics'
  }) {
    const canonical = TrackingNormalizer.normalizeStatus(status);
    const milestones = [];

    const baseTime = createdAt ? new Date(createdAt).getTime() : Date.now() - 86400000 * 2;
    const dispatchTime = dispatchDate ? new Date(dispatchDate).getTime() : baseTime + 3600000 * 4;

    // 1. Booked
    milestones.push({
      status: TrackingNormalizer.CANONICAL_STATUSES.BOOKED,
      location: originCity,
      timestamp: new Date(baseTime).toISOString(),
      details: 'Shipping label created & manifestation confirmed'
    });

    if (canonical === TrackingNormalizer.CANONICAL_STATUSES.BOOKED) {
      return milestones;
    }

    // 2. Picked Up
    milestones.push({
      status: TrackingNormalizer.CANONICAL_STATUSES.PICKED_UP,
      location: originCity,
      timestamp: new Date(dispatchTime).toISOString(),
      details: `Consignment picked up and scanned by ${carrierName}`
    });

    if (canonical === TrackingNormalizer.CANONICAL_STATUSES.PICKED_UP) {
      return milestones;
    }

    // 3. In Transit
    const transitTime = dispatchTime + 3600000 * 12;
    milestones.push({
      status: TrackingNormalizer.CANONICAL_STATUSES.IN_TRANSIT,
      location: `${originCity} Sorting Hub`,
      timestamp: new Date(transitTime).toISOString(),
      details: 'Bag processed and forwarded to destination hub'
    });

    if (canonical === TrackingNormalizer.CANONICAL_STATUSES.IN_TRANSIT) {
      return milestones;
    }

    // 4. Out for Delivery or NDR
    const ofdTime = transitTime + 3600000 * 18;
    if (['OUT_FOR_DELIVERY', 'DELIVERED', 'NDR', 'RTO_INITIATED', 'RTO_DELIVERED'].includes(canonical)) {
      milestones.push({
        status: TrackingNormalizer.CANONICAL_STATUSES.OUT_FOR_DELIVERY,
        location: `${destCity} Local Facility`,
        timestamp: new Date(ofdTime).toISOString(),
        details: 'Package assigned to delivery rider for last-mile delivery'
      });
    }

    if (canonical === TrackingNormalizer.CANONICAL_STATUSES.OUT_FOR_DELIVERY) {
      return milestones;
    }

    // 5. Delivered or NDR
    const finalTime = ofdTime + 3600000 * 4;
    if (canonical === TrackingNormalizer.CANONICAL_STATUSES.DELIVERED) {
      milestones.push({
        status: TrackingNormalizer.CANONICAL_STATUSES.DELIVERED,
        location: destCity,
        timestamp: new Date(finalTime).toISOString(),
        details: 'Shipment delivered to recipient'
      });
    } else if (canonical === TrackingNormalizer.CANONICAL_STATUSES.NDR) {
      milestones.push({
        status: TrackingNormalizer.CANONICAL_STATUSES.NDR,
        location: destCity,
        timestamp: new Date(finalTime).toISOString(),
        details: 'Delivery attempt unsuccessful: Recipient unavailable at delivery address'
      });
    } else if (canonical === TrackingNormalizer.CANONICAL_STATUSES.RTO_INITIATED) {
      milestones.push({
        status: TrackingNormalizer.CANONICAL_STATUSES.RTO_INITIATED,
        location: `${destCity} Hub`,
        timestamp: new Date(finalTime).toISOString(),
        details: 'Undelivered parcel marked for Return to Origin'
      });
    } else if (canonical === TrackingNormalizer.CANONICAL_STATUSES.RTO_DELIVERED) {
      milestones.push({
        status: TrackingNormalizer.CANONICAL_STATUSES.RTO_DELIVERED,
        location: originCity,
        timestamp: new Date(finalTime + 86400000).toISOString(),
        details: 'RTO parcel returned and checked in at merchant warehouse'
      });
    }

    return milestones;
  }
}

module.exports = TrackingNormalizer;
