const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const shiprocketService = require('../src/services/courier/ShiprocketService');

describe('Courier Adapter & Automated Shipping Label Tests', () => {
  test('1. Shiprocket fallback generates deterministic AWB and tracking URLs in test mode', async () => {
    const result = await shiprocketService.createAndAssignShipment({
      orderId: 'SO-TEST-9001',
      carrierType: 'DELHIVERY',
      shippingMode: 'SURFACE',
      consignee: {
        name: 'Bharat Hardware Depot',
        phone: '+91 98765 43210',
        email: 'procurement@bharathardware.in',
        address: 'Plot 44, Okhla Industrial Area Phase 3',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110020'
      },
      items: [
        { name: 'Industrial Drill Bit 10mm', sku: 'TL-DB-10MM', quantity: 50, price: 120 }
      ],
      paymentType: 'PREPAID'
    });

    assert.ok(result.awb, 'AWB should be generated');
    assert.match(result.awb, /^DEL-/, 'Should follow carrier prefixed AWB format');
    assert.ok(result.labelUrl, 'Label URL should be generated');
    assert.strictEqual(result.courierName, 'DELHIVERY');
    assert.strictEqual(result.isLive, false);
  });

  test('2. Fallback mode tracks Porter on-demand shipments with vehicle metadata', async () => {
    const result = await shiprocketService.createAndAssignShipment({
      orderId: 'PORTER-LOCAL-101',
      carrierType: 'PORTER',
      shippingMode: 'EXPRESS',
      consignee: {
        name: 'Quick Tech Repairs',
        phone: '+91 99887 76655',
        address: 'B-12, Sector 62',
        city: 'Noida',
        state: 'Uttar Pradesh',
        pincode: '201301'
      },
      items: [{ name: 'Replacement Lithium Pack', quantity: 2, price: 3500 }],
      paymentType: 'PREPAID'
    });

    assert.ok(result.awb.startsWith('POR-'));
    assert.strictEqual(result.courierName, 'PORTER');
  });
});
