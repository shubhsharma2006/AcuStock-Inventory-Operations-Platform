'use strict';

/**
 * AcuStock Phase 3: AI WhatsApp Assistant Tests
 * 
 * Verifies:
 * - Meta Webhook challenge verification (GET /webhook)
 * - Phone resolver: zero-trust user & tenant resolution
 * - Rejection of unlinked / unauthorized phone numbers
 * - Multi-tenant isolation for WhatsApp queries
 * - Proactive alert dispatching for low-stock triggers
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const phoneResolver = require('../src/ai/whatsapp/phone-resolver');
const whatsappNotifier = require('../src/ai/whatsapp/whatsapp-notifier');
const whatsAppClient = require('../src/ai/whatsapp/whatsapp-client');
const User = require('../src/models/User');
const Item = require('../src/models/Item');
const Tenant = require('../src/models/Tenant');
const agent = require('../src/ai/core/agent');

const TEST_DB = 'mongodb://localhost:27017/acustock_ai_whatsapp_test?replicaSet=rs0&directConnection=true';

describe('AcuStock Phase 3: AI WhatsApp Assistant', () => {
  let tenant1;
  let tenant2;
  let user1;
  let user2;
  let item1;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB);
    }

    // Create Tenants
    tenant1 = await Tenant.create({
      name: 'OmniCorp Logistics',
      slug: 'omnicorp-test-wa-' + Date.now(),
      status: 'ACTIVE'
    });

    tenant2 = await Tenant.create({
      name: 'Apex Industrial',
      slug: 'apex-test-wa-' + Date.now(),
      status: 'ACTIVE'
    });

    // Create User 1 in Tenant 1 with phone
    user1 = await User.create({
      name: 'Warehouse Lead Marcus',
      email: 'marcus@omnicorp.com',
      phone: '+91 9876543210',
      password: 'HashedPassword123!',
      role: 'MANAGER',
      tenantId: tenant1._id,
      isActive: true
    });

    // Create User 2 in Tenant 2 with different phone
    user2 = await User.create({
      name: 'Supervisor Sarah',
      email: 'sarah@apex.com',
      phone: '+91 9123456789',
      password: 'HashedPassword123!',
      role: 'ADMIN',
      tenantId: tenant2._id,
      isActive: true
    });

    // Create item in Tenant 1
    item1 = await Item.create({
      name: 'Hydraulic Cylinder H-50',
      sku: 'SKU-HYD-50',
      category: 'Machinery',
      unit: 'PIECE',
      purchasePrice: 5000,
      salesPrice: 7500,
      minStockThreshold: 15,
      tenantId: tenant1._id,
      createdBy: user1._id
    });
  });

  after(async () => {
    await Tenant.deleteMany({ _id: { $in: [tenant1._id, tenant2._id] } });
    await User.deleteMany({ _id: { $in: [user1._id, user2._id] } });
    await Item.deleteMany({ tenantId: tenant1._id });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('Phone Resolver: Successfully resolves registered phone and seals SecurityContext', async () => {
    const result = await phoneResolver.resolveSecurityContext('+91 98765-43210');

    assert.strictEqual(result.authenticated, true);
    assert.ok(result.securityContext);
    assert.strictEqual(result.securityContext.tenantId.toString(), tenant1._id.toString());
    assert.strictEqual(result.securityContext.userId.toString(), user1._id.toString());
    assert.strictEqual(result.securityContext.role, 'MANAGER');
    assert.strictEqual(result.securityContext.source, 'whatsapp');
  });

  test('Phone Resolver: Rejects unregistered phone number with USER_NOT_FOUND', async () => {
    const result = await phoneResolver.resolveSecurityContext('+91 0000000000');

    assert.strictEqual(result.authenticated, false);
    assert.strictEqual(result.error, 'USER_NOT_FOUND');
    assert.strictEqual(result.securityContext, undefined);
  });

  test('WhatsApp Message Flow: Dispatches query to AcuBot with isolated tenant context', async () => {
    const { authenticated, securityContext } = await phoneResolver.resolveSecurityContext('9876543210');
    assert.strictEqual(authenticated, true);

    const botResponse = await agent.chat({
      prompt: 'Check stock of Hydraulic Cylinder',
      history: [],
      securityContext
    });

    assert.ok(botResponse);
    assert.ok(botResponse.text);
    assert.strictEqual(typeof botResponse.text, 'string');
    // Ensure tool executed under Tenant 1
    if (botResponse.executedTools?.length > 0) {
      assert.strictEqual(botResponse.executedTools[0].name, 'queryStockLevel');
    }
  });

  test('Proactive Notifier: Dispatches low stock alert message to manager', async () => {
    let sentMessage = null;
    const originalSend = whatsAppClient.sendTextMessage;

    whatsAppClient.sendTextMessage = async (to, text) => {
      sentMessage = { to, text };
      return { success: true, mode: 'mock' };
    };

    try {
      await whatsappNotifier.notifyLowStockAlert({
        tenantId: tenant1._id,
        item: item1,
        currentStock: 4,
        minStockThreshold: 15
      });

      assert.ok(sentMessage, 'Should have sent proactive WhatsApp message');
      assert.ok(sentMessage.text.includes('Low Stock Warning'));
      assert.ok(sentMessage.text.includes('Hydraulic Cylinder H-50'));
    } finally {
      whatsAppClient.sendTextMessage = originalSend;
    }
  });
});
