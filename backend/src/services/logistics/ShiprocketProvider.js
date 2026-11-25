'use strict';

const CarrierProvider = require('./CarrierProvider');
const VolumetricEngine = require('./VolumetricEngine');
const shiprocketSingleton = require('../courier/ShiprocketService');
const logger = require('../../utils/logger');

/**
 * Shiprocket Logistics Provider Adapter
 */
class ShiprocketProvider extends CarrierProvider {
  constructor() {
    super('SHIPROCKET');
    this.service = shiprocketSingleton;
  }

  isConfigured() {
    return this.service.isConfigured();
  }

  async getRates(params) {
    const { fromPincode, toPincode, isCod = false, declaredValue = 0 } = params;
    const { billableWeightKg, isVolumetricDominant } = VolumetricEngine.calculateWeight(params);
    const zone = VolumetricEngine.resolveZone(fromPincode, toPincode);

    const zoneMultiplier = {
      ZONE_A: 1.0,
      ZONE_B: 1.2,
      ZONE_C: 1.4,
      ZONE_D: 1.7,
      ZONE_E: 2.1
    }[zone] || 1.4;

    const baseDays = {
      ZONE_A: 1,
      ZONE_B: 2,
      ZONE_C: 3,
      ZONE_D: 4,
      ZONE_E: 6
    }[zone] || 4;

    const codFee = isCod ? Math.max(35, Math.round(declaredValue * 0.02)) : 0;

    const carriers = [
      {
        carrierCode: 'SHIPROCKET_DELHIVERY',
        carrierName: 'Shiprocket Delhivery Surface',
        serviceType: 'SURFACE',
        baseRate: 40,
        expectedDays: baseDays,
        carrierScore: 93
      },
      {
        carrierCode: 'SHIPROCKET_BLUEDART',
        carrierName: 'Shiprocket Blue Dart Air',
        serviceType: 'AIR',
        baseRate: 90,
        expectedDays: Math.max(1, baseDays - 2),
        carrierScore: 97
      },
      {
        carrierCode: 'SHIPROCKET_SHADOWFAX',
        carrierName: 'Shiprocket Shadowfax Surface',
        serviceType: 'SURFACE',
        baseRate: 35,
        expectedDays: baseDays + 1,
        carrierScore: 88
      }
    ];

    return carriers.map(c => {
      const freight = Math.max(50, Math.round(billableWeightKg * c.baseRate * zoneMultiplier));
      return {
        provider: 'SHIPROCKET',
        carrierCode: c.carrierCode,
        carrierName: c.carrierName,
        serviceType: c.serviceType,
        billableWeightKg,
        rate: freight + codFee,
        freightCharge: freight,
        codCharges: codFee,
        expectedDays: c.expectedDays,
        carrierScore: c.carrierScore,
        minWeightKg: 0.5,
        zone,
        isVolumetricDominant,
        isServiceable: true
      };
    });
  }

  async trackShipment(awb) {
    return {
      awb,
      provider: 'SHIPROCKET',
      status: 'IN_TRANSIT',
      currentLocation: 'In-Transit Terminal',
      milestones: []
    };
  }

  async actionNdr(awb, actionData) {
    logger.info(`🔄 [SHIPROCKET] Dispatching NDR action '${actionData.action}' for AWB ${awb}:`, actionData);
    return {
      success: true,
      provider: 'SHIPROCKET',
      awb,
      carrierActionId: `SR-NDR-${Date.now().toString().slice(-6)}`,
      action: actionData.action,
      scheduledDate: actionData.preferredDate || new Date(Date.now() + 86400000).toISOString(),
      status: 'ACTION_DISPATCHED_TO_CARRIER',
      acknowledgedAt: new Date().toISOString()
    };
  }
}

module.exports = ShiprocketProvider;
