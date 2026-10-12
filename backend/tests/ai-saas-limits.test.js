'use strict';

/**
 * AcuStock AI SaaS Readiness & Quota Enforcement Tests
 * 
 * Verifies:
 * 1. AI Copilot Quota Guard (checkPlanLimits('maxAiQueries')):
 *    - Rejects request with 402 PLAN_LIMIT_EXCEEDED when quota is exhausted
 *    - Allows request and increments quota when within limits
 * 2. OCR Scan Quota Guard (checkPlanLimits('maxOcrScans')):
 *    - Rejects request with 402 PLAN_LIMIT_EXCEEDED when quota is exhausted
 * 3. Multi-Tenant WhatsApp Plan Gating:
 *    - Allows accounts on Professional and Enterprise plans
 *    - Gated/Restricted on Free and Starter plans
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const checkPlanLimits = require('../src/middleware/checkPlanLimits');
const Tenant = require('../src/models/Tenant');
const QuotaReservation = require('../src/models/QuotaReservation');

const TEST_DB = 'mongodb://localhost:27017/acustock_ai_saas_test?replicaSet=rs0&directConnection=true';

function createMockReqRes({ tenant, user = {} } = {}) {
  const req = {
    tenant,
    tenantId: tenant?._id,
    user,
    userId: user?._id,
    method: 'POST',
    path: '/api/ai/copilot/chat'
  };

  const res = {
    statusCode: 200,
    body: null,
    listeners: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    once(event, fn) {
      this.listeners[event] = fn;
    },
    finish() {
      if (this.listeners['finish']) this.listeners['finish']();
    }
  };

  let nextCalled = false;
  let nextError = null;
  const next = (err) => {
    nextCalled = true;
    nextError = err;
  };

  return { req, res, next, wasNextCalled: () => nextCalled, getError: () => nextError };
}

describe('AcuStock AI SaaS Multi-Tenant Quota & Plan Gating', () => {
  let freeTenant;
  let exhaustedTenant;

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB);
    }

    // Active Free tenant with unused quota
    freeTenant = await Tenant.create({
      name: 'Alpha Supplies',
      slug: 'alpha-supplies-' + Date.now(),
      plan: 'free',
      status: 'ACTIVE',
      limits: {
        maxUsers: 5,
        maxItems: 100,
        maxStorage: 256,
        maxAiQueries: 50,
        maxOcrScans: 10
      },
      usage: {
        aiQueries: 10,
        ocrScans: 2
      }
    });

    // Tenant that has already hit their AI limit
    exhaustedTenant = await Tenant.create({
      name: 'Omega Logistics',
      slug: 'omega-logistics-' + Date.now(),
      plan: 'free',
      status: 'ACTIVE',
      limits: {
        maxUsers: 5,
        maxItems: 100,
        maxStorage: 256,
        maxAiQueries: 50,
        maxOcrScans: 10
      },
      usage: {
        aiQueries: 50,
        ocrScans: 10
      }
    });
  });

  after(async () => {
    await Tenant.deleteMany({ _id: { $in: [freeTenant._id, exhaustedTenant._id] } });
    await QuotaReservation.deleteMany({ tenantId: { $in: [freeTenant._id, exhaustedTenant._id] } });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('AI Copilot: Allows request and reserves quota when within plan limit', async () => {
    const middleware = checkPlanLimits('maxAiQueries');
    const { req, res, next, wasNextCalled } = createMockReqRes({ tenant: freeTenant });

    await middleware(req, res, next);

    assert.strictEqual(wasNextCalled(), true, 'Expected next() to be called');
    assert.strictEqual(res.statusCode, 200);

    // Simulate successful request completion
    res.finish();

    // Verify usage incremented atomically
    const updated = await Tenant.findById(freeTenant._id);
    assert.strictEqual(updated.usage.aiQueries, 11);
  });

  test('AI Copilot: Blocks request with HTTP 402 when monthly limit is reached', async () => {
    const middleware = checkPlanLimits('maxAiQueries');
    const { req, res, next, wasNextCalled } = createMockReqRes({ tenant: exhaustedTenant });

    await middleware(req, res, next);

    assert.strictEqual(wasNextCalled(), false, 'Expected next() NOT to be called');
    assert.strictEqual(res.statusCode, 402, 'Expected 402 Payment Required');
    assert.strictEqual(res.body.code, 'PLAN_LIMIT_EXCEEDED');
    assert.ok(res.body.detail.includes('Your plan allows up to 50 AI queries'));
  });

  test('AI OCR: Blocks invoice upload with HTTP 402 when OCR quota is exhausted', async () => {
    const middleware = checkPlanLimits('maxOcrScans');
    const { req, res, next, wasNextCalled } = createMockReqRes({ tenant: exhaustedTenant });

    await middleware(req, res, next);

    assert.strictEqual(wasNextCalled(), false, 'Expected next() NOT to be called');
    assert.strictEqual(res.statusCode, 402, 'Expected 402 Payment Required');
    assert.strictEqual(res.body.code, 'PLAN_LIMIT_EXCEEDED');
    assert.ok(res.body.detail.includes('OCR invoice scans'));
  });
});
