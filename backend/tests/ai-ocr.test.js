'use strict';

/**
 * AcuStock Phase 2: AI Invoice & Packing Slip OCR Tests
 * 
 * Verifies:
 * - Structured invoice extraction from buffer/image data
 * - Grounding against tenant catalog (Items and Companies)
 * - Strict tenant isolation (does not cross boundaries)
 * - Serial number and Lot extraction mapping
 * - AI audit logging with AI_OCR_PROCESSED
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { SecurityContext } = require('../src/ai/core/context');
const invoiceExtractor = require('../src/ai/ocr/invoice-extractor');
const Item = require('../src/models/Item');
const Company = require('../src/models/Company');
const AuditLog = require('../src/models/AuditLog');

const TEST_DB = 'mongodb://localhost:27017/acustock_ai_ocr_test?replicaSet=rs0&directConnection=true';

describe('AcuStock Phase 2: Invoice & Packing Slip OCR', () => {
  let tenantA;
  let tenantB;
  let userA;
  let testItemA;
  let testItemB;
  let testCompanyA;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB);
    }

    tenantA = new mongoose.Types.ObjectId();
    tenantB = new mongoose.Types.ObjectId();
    userA = new mongoose.Types.ObjectId();

    // Create item in Tenant A
    testItemA = await Item.create({
      name: 'Industrial Temperature Sensor X2',
      shortName: 'SN-X2',
      sku: 'SKU-TEMP-X2',
      hsn: '902519',
      category: 'Electronics',
      unit: 'PIECE',
      purchasePrice: 2000,
      salesPrice: 2900,
      tenantId: tenantA,
      createdBy: userA,
      trackingMode: 'SERIAL',
      serialPolicy: {
        enableSerial: true,
        requireSerialOnIN: true,
        requireSerialOnOUT: true
      }
    });

    // Create item in Tenant B with similar name
    testItemB = await Item.create({
      name: 'Industrial Temperature Sensor X2 (Tenant B)',
      sku: 'SKU-TEMP-B',
      purchasePrice: 2100,
      salesPrice: 3100,
      tenantId: tenantB,
      createdBy: new mongoose.Types.ObjectId()
    });

    // Create supplier company in Tenant A
    testCompanyA = await Company.create({
      name: 'Apex Industrial Supplies Ltd',
      email: 'sales@apexsupplies.com',
      phone: '+91 9876543210',
      address: {
        street: '12 Factory Lane',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India'
      },
      industry: 'Manufacturing',
      taxId: '27AABCA1234F1Z5',
      tenantId: tenantA,
      createdBy: userA
    });
  });

  after(async () => {
    await Item.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await Company.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await AuditLog.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('Security Invariant: Rejects extraction without valid SecurityContext', async () => {
    const dummyBuffer = Buffer.from('Mock Invoice Binary Data');
    await assert.rejects(
      async () => {
        await invoiceExtractor.extractInvoice({
          fileBuffer: dummyBuffer,
          mimeType: 'image/jpeg',
          securityContext: null
        });
      },
      /Valid SecurityContext with tenantId is required/
    );
  });

  test('Extracts structured data and grounds against Tenant A catalog', async () => {
    const contextA = new SecurityContext({
      tenantId: tenantA.toString(),
      user: {
        _id: userA.toString(),
        role: 'ADMIN',
        name: 'Tenant A Operations Manager'
      }
    });

    const dummyBuffer = Buffer.from('Simulated invoice document content');

    const result = await invoiceExtractor.extractInvoice({
      fileBuffer: dummyBuffer,
      mimeType: 'image/jpeg',
      originalName: 'invoice_temp_sensor.jpg',
      securityContext: contextA
    });

    assert.ok(result);
    assert.ok(result.invoiceNumber, 'Should have invoice number');
    assert.strictEqual(result.supplier.rawName, 'Apex Industrial Supplies Ltd');
    assert.strictEqual(result.supplier.isCatalogMatch, true, 'Supplier should match Company in Tenant A');
    assert.strictEqual(result.supplier.matchedCompanyId, testCompanyA._id.toString());

    // Check line items grounding
    assert.ok(Array.isArray(result.lineItems));
    assert.strictEqual(result.lineItems.length, 1);

    const firstItem = result.lineItems[0];
    assert.strictEqual(firstItem.isCatalogMatch, true, 'Item should match Item in Tenant A');
    assert.strictEqual(firstItem.matchedItem._id, testItemA._id.toString());
    assert.strictEqual(firstItem.matchedItem.requiresSerials, true);
    assert.ok(firstItem.serialNumbers.length > 0, 'Should extract serial numbers');
    assert.strictEqual(firstItem.quantity, 10);
  });

  test('Strict Tenancy: Does not match items belonging to Tenant B', async () => {
    const contextB = new SecurityContext({
      tenantId: tenantB.toString(),
      user: {
        _id: new mongoose.Types.ObjectId().toString(),
        role: 'ADMIN',
        name: 'Tenant B Manager'
      }
    });

    const dummyBuffer = Buffer.from('Simulated invoice document content');

    const result = await invoiceExtractor.extractInvoice({
      fileBuffer: dummyBuffer,
      mimeType: 'image/jpeg',
      originalName: 'invoice_temp_sensor.jpg',
      securityContext: contextB
    });

    // In Tenant B, the supplier does NOT exist
    assert.strictEqual(result.supplier.isCatalogMatch, false, 'Tenant B does not have this supplier');
    assert.strictEqual(result.supplier.matchedCompanyId, null);

    // In Tenant B, lineItem should not match Tenant A's item ID
    const firstItem = result.lineItems[0];
    if (firstItem.matchedItem) {
      assert.notStrictEqual(firstItem.matchedItem._id, testItemA._id.toString());
    }
  });

  test('Writes audit trail entry with AI_OCR_PROCESSED', async () => {
    const logs = await AuditLog.find({
      tenantId: tenantA,
      action: 'AI_OCR_PROCESSED'
    });

    assert.ok(logs.length >= 1, 'Should have recorded at least one AI_OCR_PROCESSED audit entry');
    assert.strictEqual(logs[0].performedBy.toString(), userA.toString());
  });
});
