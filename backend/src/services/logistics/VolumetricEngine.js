'use strict';

/**
 * Volumetric Calculation & Pincode Zone Engine
 * Accurately calculates billable weight and pincode logistics distance zones.
 */

// Standard Indian logistics volumetric divisor (IATA standard: L x W x H in cm / 5000)
const DEFAULT_VOLUMETRIC_DIVISOR = 5000;
const CARGO_VOLUMETRIC_DIVISOR = 4000;

class VolumetricEngine {
  /**
   * Calculates volumetric and billable weight.
   *
   * @param {Object} params
   * @param {number} params.actualWeightKg - Actual scale weight in kg
   * @param {number} [params.lengthCm=10]
   * @param {number} [params.widthCm=10]
   * @param {number} [params.heightCm=10]
   * @param {boolean} [params.isHeavyCargo=false]
   * @returns {{
   *   actualWeightKg: number,
   *   volumetricWeightKg: number,
   *   billableWeightKg: number,
   *   divisor: number,
   *   isVolumetricDominant: boolean
   * }}
   */
  static calculateWeight({
    actualWeightKg = 0.5,
    lengthCm = 10,
    widthCm = 10,
    heightCm = 10,
    isHeavyCargo = false
  } = {}) {
    const actual = Math.max(0.05, Number(actualWeightKg) || 0.05);
    const l = Math.max(1, Number(lengthCm) || 1);
    const w = Math.max(1, Number(widthCm) || 1);
    const h = Math.max(1, Number(heightCm) || 1);
    const divisor = isHeavyCargo ? CARGO_VOLUMETRIC_DIVISOR : DEFAULT_VOLUMETRIC_DIVISOR;

    const rawVolumetric = (l * w * h) / divisor;
    // Round to 2 decimal places
    const volumetricWeightKg = Math.round(rawVolumetric * 100) / 100;
    const billableWeightKg = Math.max(actual, volumetricWeightKg);
    const isVolumetricDominant = volumetricWeightKg > actual;

    return {
      actualWeightKg: Math.round(actual * 100) / 100,
      volumetricWeightKg,
      billableWeightKg: Math.round(billableWeightKg * 100) / 100,
      divisor,
      isVolumetricDominant
    };
  }

  /**
   * Resolves transit zone based on origin and destination pincodes in India.
   * Zone A: Intra-City (Same pincode prefix/cluster)
   * Zone B: Intra-State / Regional
   * Zone C: Metro-to-Metro (Delhi, Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad)
   * Zone D: Rest of India
   * Zone E: Special / North-East / J&K / Islands
   *
   * @param {string|number} fromPin
   * @param {string|number} toPin
   * @returns {'ZONE_A'|'ZONE_B'|'ZONE_C'|'ZONE_D'|'ZONE_E'}
   */
  static resolveZone(fromPin, toPin) {
    const origin = String(fromPin || '').trim();
    const dest = String(toPin || '').trim();

    if (!origin || !dest) return 'ZONE_D';

    // Intra-city
    if (origin.slice(0, 3) === dest.slice(0, 3)) {
      return 'ZONE_A';
    }

    // Special zones (North-East: 78x, 79x; J&K: 18x, 19x; Andaman: 744x)
    const specialPrefixes = ['78', '79', '18', '19', '744'];
    if (specialPrefixes.some(p => dest.startsWith(p) || origin.startsWith(p))) {
      return 'ZONE_E';
    }

    // Major Metros (Delhi: 11, Mumbai: 40, Bengaluru: 56, Kolkata: 70, Chennai: 60, Hyderabad: 50)
    const metroPrefixes = ['11', '40', '56', '70', '60', '50'];
    const originIsMetro = metroPrefixes.some(p => origin.startsWith(p));
    const destIsMetro = metroPrefixes.some(p => dest.startsWith(p));
    if (originIsMetro && destIsMetro && origin.slice(0, 2) !== dest.slice(0, 2)) {
      return 'ZONE_C';
    }

    // Intra-state / Regional Postal Circle
    const isSameState = origin.slice(0, 2) === dest.slice(0, 2) ||
      (origin[0] === '4' && dest[0] === '4' && Number(origin.slice(0, 2)) <= 44 && Number(dest.slice(0, 2)) <= 44) ||
      (origin[0] === '3' && dest[0] === '3' && Number(origin.slice(0, 2)) >= 36 && Number(dest.slice(0, 2)) >= 36) ||
      (origin[0] === '5' && dest[0] === '5' && Number(origin.slice(0, 2)) >= 56 && Number(dest.slice(0, 2)) >= 56);

    if (isSameState) {
      return 'ZONE_B';
    }

    return 'ZONE_D';
  }
}

module.exports = VolumetricEngine;
