/**
 * Phase 2 — PDF Document Engine & Tenant-Safe Isolation Test Suite
 * ─────────────────────────────────────────────────────────────────
 * Verifies:
 *   1. Currency formatting across global currencies (INR, USD, EUR, GBP, etc.)
 *   2. Date formatting
 *   3. Sales Order Tax Invoice PDF stream creation
 *   4. Purchase Order PDF stream creation
 *   5. Delivery Challan PDF stream creation
 *   6. Serial numbers breakouts in PDF
 *   7. Large multi-item multi-page documents
 *   8. Atomic per-tenant sequence counter (Counter model)
 *   9. Non-enumerating 404 security on cross-tenant document access
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const stream = require('node:stream');
const mongoose = require('mongoose');

const {
  formatCurrency,
  formatDate,
  generateSalesOrderInvoicePdf,
  generatePurchaseOrderPdf,
  generateShipmentChallanPdf
} = require('../src/services/pdfGenerator');

const Counter = require('../src/models/Counter');
const { TenantNotFoundError, assertSameTenant } = require('../src/utils/tenantGuard');

// Helper to capture a readable/writable PDF stream into a Buffer
function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — Formatting Helpers
// ═══════════════════════════════════════════════════════════════

test('formatCurrency formats amounts correctly for different currencies', () => {
  assert.equal(formatCurrency(1250, 'INR'), '₹1,250.00');
  assert.equal(formatCurrency(99.5, 'USD'), '$99.50');
  assert.equal(formatCurrency(5000, 'EUR'), '€5,000.00');
  assert.equal(formatCurrency(320, 'GBP'), '£320.00');
  assert.equal(formatCurrency(0, 'USD'), '$0.00');
  assert.equal(formatCurrency(null, 'USD'), '$0.00');
});

test('formatDate handles valid and invalid date inputs safely', () => {
  const d = new Date('2026-09-02T12:00:00Z');
  const formatted = formatDate(d);
  assert.ok(formatted.includes('2026'), 'Must include year 2026');
  assert.equal(formatDate(null), 'N/A');
  assert.equal(formatDate('invalid-date'), 'N/A');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — Sales Order Tax Invoice PDF Generation
// ═══════════════════════════════════════════════════════════════

test('generateSalesOrderInvoicePdf produces valid PDF with magic bytes', async () => {
  const tenant = {
    name: 'Acme Technologies Ltd.',
    branding: {
      taxId: '27AABCU9603R1ZM',
      supportEmail: 'billing@acme.com',
      phone: '+91 98765 43210',
      address: { street: '100 Tech Park', city: 'Mumbai', state: 'MH', zipCode: '400001', country: 'India' },
      invoiceTerms: 'Net 30 days.'
    },
    settings: { currency: 'INR' }
  };

  const salesOrder = {
    soNumber: 'SO-000101',
    createdAt: new Date(),
    expectedDeliveryDate: new Date(),
    status: 'confirmed',
    buyer: {
      name: 'Global Enterprises Inc.',
      phone: '+91 99887 76655',
      email: 'buyer@global.com',
      address: 'Plot 45, Sector 5, Pune, MH 411001'
    },
    items: [
      {
        productId: { name: 'Industrial Sensor Pro', shortName: 'ISP-200' },
        quantity: 3,
        unitPrice: 2500,
        lineTotal: 7500,
        serialNumbers: ['SN-1001', 'SN-1002', 'SN-1003']
      },
      {
        productId: { name: 'Mounting Bracket Kit', shortName: 'MBK-10' },
        quantity: 5,
        unitPrice: 200,
        lineTotal: 1000,
        serialNumbers: []
      }
    ]
  };

  const passThrough = new stream.PassThrough();
  const bufferPromise = streamToBuffer(passThrough);

  generateSalesOrderInvoicePdf(salesOrder, tenant, passThrough);

  const pdfBuffer = await bufferPromise;

  assert.ok(pdfBuffer.length > 500, 'PDF buffer must contain substantial content');
  assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF magic header');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — Purchase Order Sheet PDF Generation
// ═══════════════════════════════════════════════════════════════

test('generatePurchaseOrderPdf produces valid PDF', async () => {
  const tenant = {
    name: 'Acme Hardware Corp.',
    settings: { currency: 'USD' }
  };

  const purchaseOrder = {
    poNumber: 'PO-000042',
    createdAt: new Date(),
    expectedDeliveryDate: new Date(),
    status: 'approved',
    supplier: {
      name: 'Shenzhen Micro Parts',
      phone: '+86 755 12345678',
      email: 'sales@microparts.cn',
      address: 'Baoan District, Shenzhen, China'
    },
    items: [
      {
        productId: { name: 'Capacitor 100uF', shortName: 'CAP-100' },
        quantity: 1000,
        unitPrice: 0.15,
        lineTotal: 150
      }
    ]
  };

  const passThrough = new stream.PassThrough();
  const bufferPromise = streamToBuffer(passThrough);

  generatePurchaseOrderPdf(purchaseOrder, tenant, passThrough);

  const pdfBuffer = await bufferPromise;

  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — Delivery Challan / Shipping Waybill PDF
// ═══════════════════════════════════════════════════════════════

test('generateShipmentChallanPdf produces valid PDF with serial breakout', async () => {
  const tenant = {
    name: 'SpeedLogistics Pvt Ltd.',
    settings: { currency: 'INR' }
  };

  const shipment = {
    reference: 'SHP-20260902-00001',
    awb: 'DEL987654321',
    courier: 'Delhivery Express',
    dispatchDate: new Date(),
    dispatchType: 'Express',
    deliveryType: 'Prepaid',
    status: 'DISPATCHED',
    type: 'OUT',
    boxes: 2,
    weight: '4.5 kg',
    productName: 'High-Speed Networking Switch 24-Port',
    quantity: 2,
    condition: 'New',
    customerName: 'TechHub Solutions',
    phone: '+91 91234 56789',
    email: 'receiving@techhub.in',
    address: 'DLF Cyber City, Tower B, Gurugram, HR',
    serialNumbers: ['SW-24-0091', 'SW-24-0092'],
    remarks: 'Fragile equipment. Handle with care.'
  };

  const passThrough = new stream.PassThrough();
  const bufferPromise = streamToBuffer(passThrough);

  generateShipmentChallanPdf(shipment, tenant, passThrough);

  const pdfBuffer = await bufferPromise;

  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — Large Multi-Item Document & Pagination
// ═══════════════════════════════════════════════════════════════

test('generateSalesOrderInvoicePdf handles large 25-item order with pagination', async () => {
  const tenant = { name: 'Mega Store', settings: { currency: 'USD' } };
  
  // Generate 25 line items
  const items = Array.from({ length: 25 }, (_, i) => ({
    productId: { name: `Extremely Detailed Component Description Variant Number ${i + 1}`, shortName: `EDC-${i + 1}` },
    quantity: i + 1,
    unitPrice: 10 * (i + 1),
    lineTotal: (i + 1) * 10 * (i + 1),
    serialNumbers: [`SN-${i}-A`, `SN-${i}-B`]
  }));

  const salesOrder = {
    soNumber: 'SO-LARGE-001',
    createdAt: new Date(),
    status: 'confirmed',
    buyer: { name: 'Heavy Wholesale Buyer' },
    items
  };

  const passThrough = new stream.PassThrough();
  const bufferPromise = streamToBuffer(passThrough);

  generateSalesOrderInvoicePdf(salesOrder, tenant, passThrough);

  const pdfBuffer = await bufferPromise;

  assert.ok(pdfBuffer.length > 2000, 'Large document must generate larger buffer');
  assert.equal(pdfBuffer.slice(0, 4).toString(), '%PDF');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — Atomic Counter Model & Sequence Generation
// ═══════════════════════════════════════════════════════════════

test('Counter model has required schema paths', () => {
  assert.ok(Counter.schema.path('tenantId'), 'Counter must have tenantId path');
  assert.ok(Counter.schema.path('type'), 'Counter must have type path');
  assert.ok(Counter.schema.path('sequence'), 'Counter must have sequence path');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 7 — Cross-Tenant PDF Access Security Guard
// ═══════════════════════════════════════════════════════════════

test('Cross-tenant document access throws non-enumerating 404 TenantNotFoundError', () => {
  const tenantAId = new mongoose.Types.ObjectId().toString();
  const tenantBId = new mongoose.Types.ObjectId().toString();

  const docA = { _id: new mongoose.Types.ObjectId(), tenantId: tenantAId };
  const docB = { _id: new mongoose.Types.ObjectId(), tenantId: tenantBId };

  let error = null;
  try {
    assertSameTenant(docA, docB, 'SalesOrder');
  } catch (err) {
    error = err;
  }

  assert.ok(error, 'Must throw error on cross-tenant document comparison');
  assert.equal(error.statusCode, 404, 'Must return 404, not 403');
  assert.ok(error instanceof TenantNotFoundError, 'Must be TenantNotFoundError');
  assert.ok(!error.message.includes(tenantAId), 'Error must not leak tenant IDs');
  assert.ok(!error.message.includes(tenantBId), 'Error must not leak tenant IDs');
});
