'use strict';

const mongoose = require('mongoose');
const CrossBorderShipment = require('../../models/CrossBorderShipment');
const LogisticsWalletService = require('./LogisticsWalletService');
const logger = require('../../utils/logger');

/**
 * Enterprise Cross-Border International Shipping & Customs Documentation Engine
 */
class CrossBorderEngine {
  /**
   * Country Compliance & Customs Matrix
   */
  static COUNTRY_RULES = {
    US: {
      name: 'United States',
      currency: 'USD',
      exchangeRateInr: 86.5,
      deMinimisUsd: 800,
      avgDutyRate: 0.035,
      vatGstRate: 0.0,
      requiresTaxId: false, // Optional unless > $2,500
      transitDays: '3-4 Business Days'
    },
    GB: {
      name: 'United Kingdom',
      currency: 'GBP',
      exchangeRateInr: 109.5,
      deMinimisUsd: 170, // ~135 GBP
      avgDutyRate: 0.04,
      vatGstRate: 0.20, // 20% Standard UK VAT
      requiresTaxId: true, // UK EORI
      transitDays: '3-5 Business Days'
    },
    AE: {
      name: 'United Arab Emirates',
      currency: 'AED',
      exchangeRateInr: 23.5,
      deMinimisUsd: 272, // 1000 AED
      avgDutyRate: 0.05,
      vatGstRate: 0.05, // 5% UAE VAT
      requiresTaxId: false,
      transitDays: '2-3 Business Days'
    },
    DE: {
      name: 'Germany (European Union)',
      currency: 'EUR',
      exchangeRateInr: 91.0,
      deMinimisUsd: 160, // 150 EUR duty free threshold
      avgDutyRate: 0.045,
      vatGstRate: 0.19, // 19% MwSt
      requiresTaxId: true, // EU EORI / VAT
      transitDays: '3-5 Business Days'
    },
    AU: {
      name: 'Australia',
      currency: 'AUD',
      exchangeRateInr: 56.5,
      deMinimisUsd: 650, // 1000 AUD
      avgDutyRate: 0.05,
      vatGstRate: 0.10, // 10% Australian GST
      requiresTaxId: false,
      transitDays: '4-6 Business Days'
    },
    CA: {
      name: 'Canada',
      currency: 'CAD',
      exchangeRateInr: 61.0,
      deMinimisUsd: 30, // 40 CAD Courier De Minimis
      avgDutyRate: 0.065,
      vatGstRate: 0.13, // 13% Average HST/GST
      requiresTaxId: false,
      transitDays: '4-5 Business Days'
    },
    SG: {
      name: 'Singapore',
      currency: 'SGD',
      exchangeRateInr: 64.5,
      deMinimisUsd: 300, // 400 SGD
      avgDutyRate: 0.0,
      vatGstRate: 0.09, // 9% Singapore GST
      requiresTaxId: false,
      transitDays: '2-3 Business Days'
    }
  };

  /**
   * International Carrier Base Air Rates (per 0.5 kg slab from India)
   */
  static CARRIER_RATES = {
    DHL_EXPRESS: {
      name: 'DHL Express Worldwide',
      baseCharge0_5kg: 1850,
      additional0_5kg: 420,
      fuelSurchargePct: 0.18,
      reliabilityScore: 98,
      speedBadge: 'Fastest Transit'
    },
    FEDEX_PRIORITY: {
      name: 'FedEx International Priority',
      baseCharge0_5kg: 1750,
      additional0_5kg: 395,
      fuelSurchargePct: 0.17,
      reliabilityScore: 97,
      speedBadge: 'Premium Reliability'
    },
    ARAMEX_INTERNATIONAL: {
      name: 'Aramex International Courier',
      baseCharge0_5kg: 1350,
      additional0_5kg: 310,
      fuelSurchargePct: 0.15,
      reliabilityScore: 94,
      speedBadge: 'Best for Middle East & GCC'
    },
    UPS_WORLDWIDE: {
      name: 'UPS Worldwide Express',
      baseCharge0_5kg: 1800,
      additional0_5kg: 410,
      fuelSurchargePct: 0.19,
      reliabilityScore: 96,
      speedBadge: 'North America Specialist'
    }
  };

  /**
   * Calculate IATA Air Courier Volumetric Weight (Divisor: 5000)
   */
  static calculateVolumetricWeight(lengthCm, widthCm, heightCm) {
    const l = Math.max(1, Number(lengthCm) || 1);
    const w = Math.max(1, Number(widthCm) || 1);
    const h = Math.max(1, Number(heightCm) || 1);
    const volWeight = (l * w * h) / 5000;
    return Number(volWeight.toFixed(2));
  }

  /**
   * Calculate customs duty, foreign taxes, and de minimis threshold status
   */
  static calculateCustomsEstimate({ countryCode, totalInvoiceUsd, incoterm = 'DAP' }) {
    const country = CrossBorderEngine.COUNTRY_RULES[countryCode.toUpperCase()] || CrossBorderEngine.COUNTRY_RULES.US;
    const invoiceVal = Math.max(0, Number(totalInvoiceUsd) || 0);

    const isDeMinimisExceeded = invoiceVal > country.deMinimisUsd;
    let estimatedDuty = 0;
    let estimatedVat = 0;

    if (isDeMinimisExceeded) {
      estimatedDuty = invoiceVal * country.avgDutyRate;
      // VAT is computed on (Invoice Value + Duty) in most jurisdictions
      estimatedVat = (invoiceVal + estimatedDuty) * country.vatGstRate;
    } else {
      // Below de minimis, typically zero customs duty, but some VAT might still apply in EU/UK
      if (countryCode.toUpperCase() === 'GB' && invoiceVal > 0) {
        estimatedVat = invoiceVal * country.vatGstRate;
      }
    }

    const totalDutiesTaxesUsd = Number((estimatedDuty + estimatedVat).toFixed(2));
    const totalDutiesTaxesInr = Math.round(totalDutiesTaxesUsd * country.exchangeRateInr);

    return {
      country: country.name,
      currency: country.currency,
      invoiceValueUsd: invoiceVal,
      deMinimisThresholdUsd: country.deMinimisUsd,
      isDeMinimisExceeded,
      estimatedDutyUsd: Number(estimatedDuty.toFixed(2)),
      estimatedVatUsd: Number(estimatedVat.toFixed(2)),
      totalDutiesTaxesUsd,
      totalDutiesTaxesInr,
      incoterm,
      dutyPayer: incoterm === 'DDP' ? 'Shipper (Prepaid by Merchant)' : 'Consignee (Collect at Delivery)'
    };
  }

  /**
   * Calculate multi-carrier shipping quotes for an international shipment
   */
  static calculateShippingRates({
    destinationCountry,
    packages = [],
    items = [],
    incoterm = 'DAP'
  }) {
    const countryCode = (destinationCountry || 'US').toUpperCase();
    const country = CrossBorderEngine.COUNTRY_RULES[countryCode] || CrossBorderEngine.COUNTRY_RULES.US;

    // Calculate gross vs volumetric weights
    let totalGrossWeight = 0;
    let totalVolumetricWeight = 0;

    const evaluatedPackages = (packages.length > 0 ? packages : [{ weightKg: 1.5, lengthCm: 25, widthCm: 20, heightCm: 15 }]).map((pkg, idx) => {
      const gross = Number(pkg.weightKg) || 1;
      const vol = CrossBorderEngine.calculateVolumetricWeight(
        pkg.lengthCm || pkg.dimensionsCm?.length || 20,
        pkg.widthCm || pkg.dimensionsCm?.width || 15,
        pkg.heightCm || pkg.dimensionsCm?.height || 10
      );
      totalGrossWeight += gross;
      totalVolumetricWeight += vol;

      return {
        packageNumber: idx + 1,
        weightKg: gross,
        dimensionsCm: {
          length: Number(pkg.lengthCm || pkg.dimensionsCm?.length || 20),
          width: Number(pkg.widthCm || pkg.dimensionsCm?.width || 15),
          height: Number(pkg.heightCm || pkg.dimensionsCm?.height || 10)
        },
        volumetricWeightKg: vol
      };
    });

    const chargeableWeightKg = Math.max(totalGrossWeight, totalVolumetricWeight);
    const roundedSlabs = Math.ceil(chargeableWeightKg / 0.5); // Number of 0.5kg slabs

    // Calculate item total invoice value in USD
    let totalInvoiceUsd = 0;
    for (const itm of items) {
      const val = Number(itm.totalValue) || (Number(itm.quantity || 1) * Number(itm.unitPrice || 0));
      totalInvoiceUsd += val;
    }
    if (totalInvoiceUsd === 0) totalInvoiceUsd = 120; // Default demo

    // Customs estimate
    const customs = CrossBorderEngine.calculateCustomsEstimate({
      countryCode,
      totalInvoiceUsd,
      incoterm
    });

    // Rate quotes per carrier
    const carrierQuotes = Object.entries(CrossBorderEngine.CARRIER_RATES).map(([carrierKey, config]) => {
      // 0.5kg base + (slabs - 1) * additional
      const baseFreight = config.baseCharge0_5kg + Math.max(0, roundedSlabs - 1) * config.additional0_5kg;
      const fuelSurcharge = Math.round(baseFreight * config.fuelSurchargePct);
      const securityAndDocFee = 250;
      const netFreightInr = baseFreight + fuelSurcharge + securityAndDocFee;

      // If DDP, shipper pays estimated duties upfront
      const totalPayableInr = incoterm === 'DDP' ? netFreightInr + customs.totalDutiesTaxesInr : netFreightInr;

      return {
        carrierKey,
        carrierName: config.name,
        chargeableWeightKg: Number(chargeableWeightKg.toFixed(2)),
        grossWeightKg: Number(totalGrossWeight.toFixed(2)),
        volumetricWeightKg: Number(totalVolumetricWeight.toFixed(2)),
        breakdown: {
          baseFreight,
          fuelSurcharge,
          securityAndDocFee,
          netFreightInr,
          dutiesTaxesInr: incoterm === 'DDP' ? customs.totalDutiesTaxesInr : 0
        },
        totalPayableInr,
        transitDays: country.transitDays,
        reliabilityScore: config.reliabilityScore,
        speedBadge: config.speedBadge,
        incoterm
      };
    });

    return {
      destinationCountry: country.name,
      countryCode,
      packages: evaluatedPackages,
      chargeableWeightKg: Number(chargeableWeightKg.toFixed(2)),
      customs,
      carrierQuotes
    };
  }

  /**
   * Book international export shipment, generate CSB-V & Commercial Invoice, and debit freight wallet.
   */
  static async bookExportShipment({
    tenantId,
    carrier = 'DHL_EXPRESS',
    incoterm = 'DAP',
    exportType = 'COMMERCIAL',
    exporterDetails,
    consigneeDetails,
    packages = [],
    items = []
  }) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const countryCode = (consigneeDetails?.address?.countryCode || 'US').toUpperCase();

    // 1. Calculate final pricing
    const rates = CrossBorderEngine.calculateShippingRates({
      destinationCountry: countryCode,
      packages,
      items,
      incoterm
    });

    const chosenQuote = rates.carrierQuotes.find(q => q.carrierKey === carrier) || rates.carrierQuotes[0];
    const totalFreightCharge = chosenQuote.totalPayableInr;

    // 2. Check & Debit Logistics Wallet
    await LogisticsWalletService.debitFreight({
      tenantId: tenantObjectId,
      amount: totalFreightCharge,
      awb: `INT-${carrier.slice(0, 3)}-${Date.now().toString().slice(-6)}`,
      reference: `EXP-${Date.now().toString().slice(-6)}`,
      carrier: chosenQuote.carrierName,
      costCenter: 'Cross-Border International Export',
      description: `Export to ${consigneeDetails?.fullName || 'Customer'} (${countryCode}) via ${chosenQuote.carrierName}`
    });

    // 3. Generate Official CSB-V (Courier Shipping Bill V for Commercial Export) Number
    const csbNumber = `CSBV-${countryCode}-${Date.now().toString().slice(-8)}`;
    const shipmentReference = `EXP-${Date.now().toString().slice(-8)}`;
    const awb = `${carrier.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-8)}`;

    const newShipment = await CrossBorderShipment.create({
      tenantId: tenantObjectId,
      shipmentReference,
      awb,
      carrier,
      incoterm,
      exportType,
      status: 'CUSTOMS_CLEARED',
      exporterDetails: {
        companyName: exporterDetails?.companyName || 'AcuStock Technologies Pvt Ltd',
        iec: exporterDetails?.iec || '0519001928',
        adCode: exporterDetails?.adCode || '02910023400019',
        gstin: exporterDetails?.gstin || '07AAAAA0000A1Z5',
        pan: exporterDetails?.pan || 'AAAAA0000A',
        lutNumber: exporterDetails?.lutNumber || 'AD270425000912K',
        address: exporterDetails?.address || {
          street: 'Plot 42, Okhla Industrial Area Phase 3',
          city: 'New Delhi',
          state: 'Delhi',
          postalCode: '110020',
          country: 'IN'
        }
      },
      consigneeDetails: {
        fullName: consigneeDetails?.fullName || 'John Doe',
        companyName: consigneeDetails?.companyName || 'Global Imports LLC',
        email: consigneeDetails?.email || 'import@globalimports.com',
        phone: consigneeDetails?.phone || '+1 415 555 2671',
        taxId: consigneeDetails?.taxId || (countryCode === 'GB' ? 'GB123456789' : 'EIN-98-1234567'),
        address: consigneeDetails?.address || {
          street: '100 Market Street, Suite 400',
          city: 'San Francisco',
          stateProvince: 'CA',
          postalCode: '94105',
          countryCode
        }
      },
      packages: rates.packages,
      items: items.length > 0 ? items : [
        {
          description: 'Precision Industrial Ball Bearings',
          hsCode: '84821011',
          quantity: 10,
          unitPrice: 15.0,
          currency: 'USD',
          totalValue: 150.0,
          countryOfOrigin: 'IN'
        }
      ],
      customsDeclaration: {
        csbType: 'CSB_V',
        csbNumber,
        portOfExport: 'INDEL4', // Delhi IGI Cargo
        estimatedDutyTax: rates.customs.totalDutiesTaxesInr,
        dutyCurrency: 'INR',
        deMinimisExceeded: rates.customs.isDeMinimisExceeded,
        signedDeclaration: true
      },
      financials: {
        freightCharge: chosenQuote.breakdown.netFreightInr,
        insuranceCharge: 200,
        estimatedDuties: chosenQuote.breakdown.dutiesTaxesInr,
        totalCharges: totalFreightCharge,
        billingCurrency: 'INR'
      },
      dates: {
        bookingDate: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 4 * 86400000),
        clearedAt: new Date()
      }
    });

    logger.info(`🌐 [CROSS-BORDER] Booked international shipment ${shipmentReference} (AWB: ${awb}) via ${carrier} to ${countryCode}`);

    return {
      success: true,
      shipment: newShipment,
      csbNumber,
      awb,
      totalCharges: totalFreightCharge
    };
  }

  /**
   * Generate Printable Commercial Invoice and Exporter Declaration document payload
   */
  static generateCommercialInvoicePayload(shipment) {
    return {
      title: 'COMMERCIAL INVOICE & PACKING LIST (EXPORT)',
      invoiceNumber: `CI-${shipment.shipmentReference}`,
      date: new Date(shipment.createdAt || Date.now()).toLocaleDateString('en-GB'),
      awb: shipment.awb,
      carrier: shipment.carrier,
      incoterm: shipment.incoterm,
      csbNumber: shipment.customsDeclaration?.csbNumber,
      exporter: shipment.exporterDetails,
      consignee: shipment.consigneeDetails,
      items: shipment.items,
      totalQuantity: (shipment.items || []).reduce((acc, i) => acc + (i.quantity || 0), 0),
      totalInvoiceValue: (shipment.items || []).reduce((acc, i) => acc + (i.totalValue || 0), 0),
      currency: shipment.items?.[0]?.currency || 'USD',
      packages: shipment.packages,
      portOfExport: shipment.customsDeclaration?.portOfExport || 'INDEL4',
      declaration: 'We hereby declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Export under Foreign Trade Policy (FTP) rules.'
    };
  }
}

module.exports = CrossBorderEngine;
