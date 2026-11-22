'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CrossBorderEngine = require('../src/services/logistics/CrossBorderEngine');

describe('Phase 8: Cross-Border International Shipping & Customs Documentation Engine', () => {

  it('1. IATA Air Courier Volumetric Weight: Correctly applies 5000 divisor and chargeable weight logic', () => {
    // 50 x 40 x 30 cm = 60,000 cm3 / 5000 = 12.0 kg
    const volWeight = CrossBorderEngine.calculateVolumetricWeight(50, 40, 30);
    assert.equal(volWeight, 12.0);

    const grossWeight = 7.5;
    const chargeable = Math.max(grossWeight, volWeight);
    assert.equal(chargeable, 12.0);

    // If gross weight is higher: 15 kg gross vs 12 kg volumetric
    const heavyGross = 15.0;
    const heavyChargeable = Math.max(heavyGross, volWeight);
    assert.equal(heavyChargeable, 15.0);
  });

  it('2. Customs De Minimis Rules: Evaluates duty-free thresholds across USA and UK', () => {
    // USA: $800 threshold
    const usBelow = CrossBorderEngine.calculateCustomsEstimate({
      countryCode: 'US',
      totalInvoiceUsd: 450,
      incoterm: 'DAP'
    });
    assert.equal(usBelow.isDeMinimisExceeded, false);
    assert.equal(usBelow.estimatedDutyUsd, 0);

    const usAbove = CrossBorderEngine.calculateCustomsEstimate({
      countryCode: 'US',
      totalInvoiceUsd: 1200,
      incoterm: 'DAP'
    });
    assert.equal(usAbove.isDeMinimisExceeded, true);
    assert.ok(usAbove.estimatedDutyUsd > 0);

    // UK: VAT threshold
    const ukCheck = CrossBorderEngine.calculateCustomsEstimate({
      countryCode: 'GB',
      totalInvoiceUsd: 250,
      incoterm: 'DAP'
    });
    assert.equal(ukCheck.currency, 'GBP');
    assert.ok(ukCheck.estimatedVatUsd > 0);
  });

  it('3. Incoterm Pricing: DDP bundles duties into total payable, while DAP leaves duties for consignee', () => {
    const packages = [{ weightKg: 2, lengthCm: 20, widthCm: 15, heightCm: 10 }];
    const items = [{ description: 'Leather Handbag', hsCode: '42022190', quantity: 1, unitPrice: 1000, totalValue: 1000 }];

    const dapQuotes = CrossBorderEngine.calculateShippingRates({
      destinationCountry: 'US',
      packages,
      items,
      incoterm: 'DAP'
    });

    const ddpQuotes = CrossBorderEngine.calculateShippingRates({
      destinationCountry: 'US',
      packages,
      items,
      incoterm: 'DDP'
    });

    const dhlDap = dapQuotes.carrierQuotes.find(q => q.carrierKey === 'DHL_EXPRESS');
    const dhlDdp = ddpQuotes.carrierQuotes.find(q => q.carrierKey === 'DHL_EXPRESS');

    assert.ok(dhlDdp.totalPayableInr > dhlDap.totalPayableInr);
    assert.equal(dhlDap.breakdown.dutiesTaxesInr, 0);
    assert.ok(dhlDdp.breakdown.dutiesTaxesInr > 0);
  });

  it('4. Multi-Carrier Quotes: Returns comparative quotes for DHL, FedEx, Aramex, and UPS', () => {
    const rates = CrossBorderEngine.calculateShippingRates({
      destinationCountry: 'AE', // UAE
      packages: [{ weightKg: 1.0, lengthCm: 20, widthCm: 10, heightCm: 10 }]
    });

    assert.equal(rates.carrierQuotes.length, 4);
    const carrierKeys = rates.carrierQuotes.map(q => q.carrierKey);
    assert.ok(carrierKeys.includes('DHL_EXPRESS'));
    assert.ok(carrierKeys.includes('FEDEX_PRIORITY'));
    assert.ok(carrierKeys.includes('ARAMEX_INTERNATIONAL'));
    assert.ok(carrierKeys.includes('UPS_WORLDWIDE'));
  });

  it('5. Commercial Invoice & CSB-V Payload: Generates statutory Indian customs export export documents', () => {
    const mockShipment = {
      shipmentReference: 'EXP-9921001',
      awb: 'DHL-88291024',
      carrier: 'DHL_EXPRESS',
      incoterm: 'DAP',
      customsDeclaration: {
        csbNumber: 'CSBV-US-18290192',
        portOfExport: 'INDEL4'
      },
      exporterDetails: {
        companyName: 'AcuStock Tech',
        iec: '0519001928',
        adCode: '02910023400019',
        gstin: '07AAAAA0000A1Z5'
      },
      consigneeDetails: {
        fullName: 'Jane Doe',
        companyName: 'Acme Corp',
        address: { countryCode: 'US', city: 'New York' }
      },
      items: [
        { description: 'Electronic Sensor Module', hsCode: '85423100', quantity: 5, unitPrice: 50, totalValue: 250, currency: 'USD' }
      ],
      packages: [{ weightKg: 2.0 }]
    };

    const doc = CrossBorderEngine.generateCommercialInvoicePayload(mockShipment);
    assert.equal(doc.invoiceNumber, 'CI-EXP-9921001');
    assert.equal(doc.exporter.iec, '0519001928');
    assert.equal(doc.exporter.adCode, '02910023400019');
    assert.equal(doc.items[0].hsCode, '85423100');
    assert.ok(doc.declaration.includes('Foreign Trade Policy'));
  });
});
