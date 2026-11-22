'use strict';

/**
 * Indian GST E-Way Bill Compliance & Validation Engine
 * Governs Part-A, Part-B, Vehicle validation, Distance-based validity periods, and NIC schema conformance.
 */
class EWayBillEngine {
  static MANDATORY_THRESHOLD = 50000; // Central GST threshold (₹50,000)

  static STATE_CODES = {
    'JAMMU AND KASHMIR': '01',
    'HIMACHAL PRADESH': '02',
    'PUNJAB': '03',
    'CHANDIGARH': '04',
    'UTTARAKHAND': '05',
    'HARYANA': '06',
    'DELHI': '07',
    'RAJASTHAN': '08',
    'UTTAR PRADESH': '09',
    'BIHAR': '10',
    'WEST BENGAL': '19',
    'JHARKHAND': '20',
    'ODISHA': '21',
    'CHHATTISGARH': '22',
    'MADHYA PRADESH': '23',
    'GUJARAT': '24',
    'MAHARASHTRA': '27',
    'ANDHRA PRADESH': '37',
    'KARNATAKA': '29',
    'GOA': '30',
    'KERALA': '32',
    'TAMIL NADU': '33',
    'TELANGANA': '36'
  };

  /**
   * Resolve 2-digit Indian GST state code
   */
  static resolveStateCode(stateName = '') {
    const clean = stateName.toString().trim().toUpperCase();
    return EWayBillEngine.STATE_CODES[clean] || '27'; // Default Maharashtra
  }

  /**
   * Check if E-Way bill is mandatory based on invoice or cargo declared value
   */
  static isEWayBillMandatory(declaredValue = 0, isInterState = true) {
    const val = Number(declaredValue) || 0;
    // Central threshold is ₹50,000. Intra-state threshold in select states is ₹1,00,000.
    const threshold = isInterState ? EWayBillEngine.MANDATORY_THRESHOLD : 100000;
    return val >= threshold;
  }

  /**
   * Validate Indian commercial / transport vehicle registration number
   * Examples: DL-01-AB-1234, MH12DE4321, KA-04-1234, HR26DQ9999
   */
  static validateVehicleNumber(rawVehicleNo = '') {
    if (!rawVehicleNo) {
      return { isValid: false, formatted: '', error: 'Vehicle registration number is required' };
    }

    const cleaned = rawVehicleNo.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Standard pattern: 2 letters (state) + 1-2 digits (RTO) + 0-3 letters (series) + 4 digits
    const match = cleaned.match(/^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{4})$/);

    if (!match) {
      return {
        isValid: false,
        formatted: rawVehicleNo.toUpperCase().trim(),
        error: 'Invalid Indian vehicle registration format (expected e.g. DL-01-AB-1234 or MH12DE4321)'
      };
    }

    // Format with standard hyphenation: XX-00-XX-0000
    const state = match[1];
    const rto = match[2];
    const series = match[3];
    const serial = match[4];

    const formatted = series
      ? `${state}-${rto}-${series}-${serial}`
      : `${state}-${rto}-${serial}`;

    return {
      isValid: true,
      formatted,
      rawCleaned: cleaned
    };
  }

  /**
   * Calculate distance-based validity according to GST E-Way Bill Rule 138(10):
   * - Regular cargo: 1 day for every 200 km (or part thereof)
   * - Over Dimensional Cargo (ODC): 1 day for every 20 km (or part thereof)
   */
  static calculateValidity(distanceKm = 100, isOverDimensional = false, startDate = new Date()) {
    const dist = Math.max(1, Number(distanceKm) || 1);
    const speedRate = isOverDimensional ? 20 : 200; // km per day
    const validityDays = Math.ceil(dist / speedRate);

    const validUpto = new Date(startDate.getTime() + validityDays * 24 * 3600000);
    // Set to 23:59:59 PM of the expiration day per GST standard
    validUpto.setHours(23, 59, 59, 999);

    return {
      distanceKm: dist,
      isOverDimensional,
      validityDays,
      validUpto
    };
  }

  /**
   * Generate official E-Way Bill (Part-A + Part-B) with verification QR data
   */
  static generateEWayBill({
    docNo,
    docDate = new Date(),
    fromGstin = '27AAAAA0000A1Z5',
    fromTrdName = 'Origin Merchant Hub',
    fromAddress,
    fromPincode = '400001',
    fromState = 'Maharashtra',
    toGstin = 'URP',
    toTrdName = 'Destination Consignee',
    toAddress,
    toPincode = '560001',
    toState = 'Karnataka',
    totalValue = 65000,
    hsnCode = '8471',
    distanceKm = 450,
    transporterName = 'V-Trans Logistics',
    transporterId = '27VTRNS0000A1Z1',
    vehicleNumber = 'MH-12-AB-9921',
    isOverDimensional = false
  }) {
    const vehCheck = EWayBillEngine.validateVehicleNumber(vehicleNumber);
    if (!vehCheck.isValid) {
      throw new Error(vehCheck.error);
    }

    const validity = EWayBillEngine.calculateValidity(distanceKm, isOverDimensional, docDate);
    const stateCode = EWayBillEngine.resolveStateCode(fromState);
    const randomSuffix = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const ewbNumber = `${stateCode}${randomSuffix}`; // 12-digit GST E-Way Bill number

    // Verification QR payload
    const qrPayload = {
      ewbNo: ewbNumber,
      genDate: docDate.toISOString(),
      validUpto: validity.validUpto.toISOString(),
      fromGstin,
      toGstin,
      docNo,
      totVal: totalValue,
      vehNo: vehCheck.formatted
    };

    return {
      success: true,
      ewbNumber,
      generatedAt: docDate,
      validUpto: validity.validUpto,
      validityDays: validity.validityDays,
      distanceKm: validity.distanceKm,
      isOverDimensional,
      partA: {
        docNo,
        docDate,
        fromGstin,
        fromTrdName,
        fromAddress: fromAddress || 'Origin Warehouse Center',
        fromPincode,
        fromStateCode: stateCode,
        toGstin,
        toTrdName,
        toAddress: toAddress || 'Destination Consignee Facility',
        toPincode,
        toStateCode: EWayBillEngine.resolveStateCode(toState),
        totalValue,
        hsnCode,
        status: 'COMPLETED'
      },
      partB: {
        transMode: '1', // Road
        transporterName,
        transporterId,
        vehicleNumber: vehCheck.formatted,
        vehicleType: isOverDimensional ? 'O' : 'R',
        enteredDate: docDate,
        status: 'ACTIVE'
      },
      qrCodeData: JSON.stringify(qrPayload)
    };
  }
}

module.exports = EWayBillEngine;
