'use strict';

/**
 * Carrier Provider Base Interface
 * Every logistics provider (Bigship, Shiprocket, Delhivery, Fleet) implements this contract.
 */
class CarrierProvider {
  constructor(name) {
    this.name = name;
  }

  isConfigured() {
    return false;
  }

  /**
   * Calculate live freight quotes for given shipment parameters.
   *
   * @param {Object} params
   * @param {string} params.fromPincode
   * @param {string} params.toPincode
   * @param {number} params.weightKg
   * @param {number} [params.lengthCm]
   * @param {number} [params.widthCm]
   * @param {number} [params.heightCm]
   * @param {boolean} [params.isCod=false]
   * @param {number} [params.declaredValue=0]
   * @returns {Promise<Array<{
   *   provider: string,
   *   carrierCode: string,
   *   carrierName: string,
   *   serviceType: 'AIR'|'SURFACE'|'CARGO',
   *   rate: number,
   *   expectedDays: number,
   *   carrierScore: number,
   *   codCharges: number,
   *   minWeightKg: number,
   *   isServiceable: boolean
   * }>>}
   */
  async getRates(params) {
    throw new Error(`getRates() must be implemented by ${this.name}`);
  }

  /**
   * Book shipment, allocate carrier, and return AWB + label URL.
   */
  async createShipment(orderData) {
    throw new Error(`createShipment() must be implemented by ${this.name}`);
  }

  /**
   * Track shipment milestone history by AWB.
   */
  async trackShipment(awb) {
    throw new Error(`trackShipment() must be implemented by ${this.name}`);
  }
}

module.exports = CarrierProvider;
