'use strict';

const VolumetricEngine = require('./VolumetricEngine');
const EWayBillEngine = require('./EWayBillEngine');

/**
 * Enterprise B2B Heavy Freight & PTL/FTL Cargo Engine
 */
class FreightEngine {
  static VEHICLE_CATALOG = {
    TATA_ACE_750KG: {
      type: 'TATA_ACE_750KG',
      name: 'Tata Ace (Chota Hathi)',
      maxPayloadKg: 750,
      maxPallets: 2,
      baseFare: 1200,
      perKmRate: 24,
      idealFor: 'Intramarket & Intra-city B2B Cartons'
    },
    BOLERO_PICKUP_1500KG: {
      type: 'BOLERO_PICKUP_1500KG',
      name: 'Mahindra Bolero Maxi Pickup',
      maxPayloadKg: 1500,
      maxPallets: 3,
      baseFare: 2000,
      perKmRate: 29,
      idealFor: 'Regional Inter-district Fast Delivery'
    },
    EICHER_14FT_4000KG: {
      type: 'EICHER_14FT_4000KG',
      name: '14ft Eicher / Canter Heavy',
      maxPayloadKg: 4000,
      maxPallets: 6,
      baseFare: 3800,
      perKmRate: 38,
      idealFor: 'Mid-mile Warehouse Distribution'
    },
    TRUCK_19FT_7500KG: {
      type: 'TRUCK_19FT_7500KG',
      name: '19ft / 22ft Closed Container Truck',
      maxPayloadKg: 7500,
      maxPallets: 12,
      baseFare: 6500,
      perKmRate: 52,
      idealFor: 'Interstate Bulk Cargo & Raw Materials'
    },
    TRAILER_32FT_15000KG: {
      type: 'TRAILER_32FT_15000KG',
      name: '32ft Multi-Axle Container Trailer',
      maxPayloadKg: 16000,
      maxPallets: 24,
      baseFare: 14500,
      perKmRate: 85,
      idealFor: 'Pan-India Full Truckload Linehaul'
    }
  };

  /**
   * Estimate road transit distance in KM between Indian pincodes
   */
  static estimateDistanceKm(originPincode = '', destPincode = '') {
    const orig = String(originPincode).trim();
    const dest = String(destPincode).trim();

    if (!orig || !dest || orig === dest) return 30; // Local delivery

    const origRegion = orig[0];
    const destRegion = dest[0];
    const origSub = orig.slice(0, 2);
    const destSub = dest.slice(0, 2);

    // Intra-district
    if (origSub === destSub) return 65;

    // Intra-region (same circle / adjacent state)
    if (origRegion === destRegion) return 280;

    // Cross-country distance heuristic
    const diff = Math.abs(parseInt(origSub, 10) - parseInt(destSub, 10));
    return Math.min(2400, Math.max(350, diff * 35));
  }

  /**
   * Calculate PTL (Part Truck Load) and FTL (Full Truck Load) quotes
   */
  static calculateFreightQuotes({
    originPincode,
    destPincode,
    grossWeightKg = 150,
    dimensions = null, // { length, width, height }
    palletCount = 0,
    boxCount = 1,
    declaredValue = 75000
  }) {
    const distanceKm = FreightEngine.estimateDistanceKm(originPincode, destPincode);
    const weight = Math.max(10, Number(grossWeightKg) || 10);
    const zone = VolumetricEngine.resolveZone(originPincode, destPincode);
    const isEWayBillRequired = EWayBillEngine.isEWayBillMandatory(declaredValue, zone !== 'ZONE_A');

    // 1. Calculate PTL Quotes (Part Truck Load shared freight)
    const ptlMinWeight = 100; // 100 kg minimum billing
    const billableWeight = Math.max(ptlMinWeight, weight);

    let perKgRate = 4.5;
    if (zone === 'ZONE_A') perKgRate = 3.5;
    else if (zone === 'ZONE_B') perKgRate = 5.2;
    else if (zone === 'ZONE_C') perKgRate = 7.8;
    else if (zone === 'ZONE_D') perKgRate = 9.5;
    else perKgRate = 12.0;

    const ptlBaseFreight = Math.round(billableWeight * perKgRate);
    const ptlDocket = 250;
    const ptlLoading = Math.round(billableWeight * 0.4);
    const ptlFuelSurcharge = Math.round(ptlBaseFreight * 0.10);
    const ptlSubtotal = ptlBaseFreight + ptlDocket + ptlLoading + ptlFuelSurcharge;
    const ptlGst = Math.round(ptlSubtotal * 0.05); // 5% GTA GST
    const ptlTotal = ptlSubtotal + ptlGst;

    const ptlCarriers = [
      {
        id: 'VTRANS_PTL',
        carrierName: 'V-Trans Express PTL',
        type: 'PTL',
        billableWeightKg: billableWeight,
        transitDays: zone === 'ZONE_A' ? 1 : zone === 'ZONE_B' ? 2 : 4,
        baseFreight: ptlBaseFreight,
        docketCharge: ptlDocket,
        loadingCharges: ptlLoading,
        fuelSurcharge: ptlFuelSurcharge,
        gstAmount: ptlGst,
        totalAmount: ptlTotal,
        rating: 4.8
      },
      {
        id: 'DELHIVERY_HEAVY_PTL',
        carrierName: 'Delhivery B2B Freight',
        type: 'PTL',
        billableWeightKg: billableWeight,
        transitDays: zone === 'ZONE_A' ? 1 : zone === 'ZONE_B' ? 2 : 3,
        baseFreight: Math.round(ptlBaseFreight * 1.05),
        docketCharge: 220,
        loadingCharges: ptlLoading,
        fuelSurcharge: ptlFuelSurcharge,
        gstAmount: Math.round((ptlBaseFreight * 1.05 + 220 + ptlLoading + ptlFuelSurcharge) * 0.05),
        totalAmount: Math.round((ptlBaseFreight * 1.05 + 220 + ptlLoading + ptlFuelSurcharge) * 1.05),
        rating: 4.6
      },
      {
        id: 'TCI_FREIGHT_PTL',
        carrierName: 'TCI Freight PTL',
        type: 'PTL',
        billableWeightKg: billableWeight,
        transitDays: zone === 'ZONE_A' ? 2 : zone === 'ZONE_B' ? 3 : 5,
        baseFreight: Math.round(ptlBaseFreight * 0.94),
        docketCharge: 280,
        loadingCharges: ptlLoading,
        fuelSurcharge: ptlFuelSurcharge,
        gstAmount: Math.round((ptlBaseFreight * 0.94 + 280 + ptlLoading + ptlFuelSurcharge) * 0.05),
        totalAmount: Math.round((ptlBaseFreight * 0.94 + 280 + ptlLoading + ptlFuelSurcharge) * 1.05),
        rating: 4.5
      }
    ];

    // 2. Calculate FTL Options (Full Dedicated Truck Load)
    const ftlOptions = Object.values(FreightEngine.VEHICLE_CATALOG)
      .filter(v => v.maxPayloadKg >= weight)
      .map(v => {
        const base = v.baseFare;
        const kmCharge = Math.round(distanceKm * v.perKmRate);
        const tollEstimate = Math.round(distanceKm * 2.2);
        const subtotal = base + kmCharge + tollEstimate;
        const gst = Math.round(subtotal * 0.05);
        const total = subtotal + gst;

        return {
          id: `FTL_${v.type}`,
          carrierName: `Dedicated ${v.name}`,
          vehicleType: v.type,
          vehicleName: v.name,
          type: 'FTL',
          maxPayloadKg: v.maxPayloadKg,
          maxPallets: v.maxPallets,
          transitDays: Math.max(1, Math.ceil(distanceKm / 450)),
          baseFreight: base + kmCharge,
          tollCharges: tollEstimate,
          loadingCharges: 0, // Included in dedicated FTL
          gstAmount: gst,
          totalAmount: total,
          idealFor: v.idealFor
        };
      });

    return {
      originPincode,
      destPincode,
      distanceKm,
      transitZone: zone,
      grossWeightKg: weight,
      palletCount,
      boxCount,
      declaredValue,
      isEWayBillRequired,
      ptlQuotes: ptlCarriers,
      ftlOptions
    };
  }
}

module.exports = FreightEngine;
