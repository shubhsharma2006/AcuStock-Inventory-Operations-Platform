/**
 * Phase 1.8 — Tenant Isolation Attack Test Suite
 *
 * Verifies that:
 *   1. Tenancy middleware strips client-injected tenantId from body/query
 *   2. TenantNotFoundError always maps to 404 (non-enumerating)
 *   3. assertSameTenant throws 404 when cross-tenant reference is attempted
 *   4. tenantIsolationPlugin adds tenantId to schema
 *   5. Fail-closed plugin throws descriptive error when strictmode is on and tenantId is absent
 *   6. Plugin allows skip via skipTenantIsolation flag
 *   7. Plugin prepends $match when aggregate options carry tenantId
 */

'use strict';

const test    = require('node:test');
const assert  = require('node:assert/strict');
const mongoose = require('mongoose');

const { resolveTenant } = require('../src/middleware/tenancy');
const {
  TenantNotFoundError,
  TenantAccessError,
  assertSameTenant
} = require('../src/utils/tenantGuard');
const tenantIsolationPlugin = require('../src/middleware/tenantIsolationPlugin');

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — Tenancy Middleware: parameter stripping
// ═══════════════════════════════════════════════════════════════

test('resolveTenant strips client-provided tenantId from req.body', () => {
  const req = {
    method: 'POST',
    path: '/api/items',
    headers: {},
    query: {},
    body: { tenantId: 'attacker-supplied-tenant', name: 'Widget', price: 100 }
  };
  const res = { status() { return this; }, json() { return this; } };
  let nextCalled = false;

  resolveTenant(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'next() should be called');
  assert.equal(req.body.tenantId, undefined, 'body.tenantId must be stripped');
  assert.equal(req.body.name, 'Widget', 'legitimate body fields must be preserved');
  assert.equal(req.body.price, 100, 'legitimate body fields must be preserved');
});

test('resolveTenant strips client-provided tenantId from req.query', () => {
  const req = {
    method: 'GET',
    path: '/api/items',
    headers: {},
    query: { tenantId: 'attacker-supplied-tenant', search: 'bolt' },
    body: {}
  };
  const res = { status() { return this; }, json() { return this; } };
  let nextCalled = false;

  resolveTenant(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.query.tenantId, undefined, 'query.tenantId must be stripped');
  assert.equal(req.query.search, 'bolt', 'legitimate query params must be preserved');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — Non-Enumerating Error Contracts
// ═══════════════════════════════════════════════════════════════

test('TenantNotFoundError maps to HTTP 404', () => {
  const err = new TenantNotFoundError();
  assert.equal(err.statusCode, 404);
  assert.equal(err.code, 'NOT_FOUND');
  assert.equal(err.message, 'Resource not found');
});

test('TenantNotFoundError with custom entityName returns "<entity> not found"', () => {
  const err = new TenantNotFoundError('Item');
  assert.equal(err.statusCode, 404);
  assert.equal(err.message, 'Item not found');
  // Message must NOT reveal "cross-tenant" or "belongs to another organization"
  assert.ok(!err.message.includes('tenant'), 'Error must not mention tenant to avoid enumeration');
  assert.ok(!err.message.includes('organization'), 'Error must not mention organization');
});

test('TenantAccessError maps to HTTP 403', () => {
  const err = new TenantAccessError();
  assert.equal(err.statusCode, 403);
  assert.equal(err.code, 'TENANT_FORBIDDEN');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — assertSameTenant cross-tenant reference validation
// ═══════════════════════════════════════════════════════════════

test('assertSameTenant passes when both documents share the same tenantId', () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const docA = { _id: new mongoose.Types.ObjectId(), tenantId };
  const docB = { _id: new mongoose.Types.ObjectId(), tenantId };

  assert.doesNotThrow(() => {
    assertSameTenant(docA, docB, 'PurchaseOrder');
  });
});

test('assertSameTenant throws TenantNotFoundError (404) on cross-tenant reference', () => {
  const tenantA = new mongoose.Types.ObjectId().toString();
  const tenantB = new mongoose.Types.ObjectId().toString();
  const docA = { _id: new mongoose.Types.ObjectId(), tenantId: tenantA };
  const docB = { _id: new mongoose.Types.ObjectId(), tenantId: tenantB };

  let thrown = null;
  try {
    assertSameTenant(docA, docB, 'Item');
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'Should have thrown');
  assert.equal(thrown.statusCode, 404, 'Cross-tenant reference must return 404, not 403 or 500');
  assert.ok(thrown instanceof TenantNotFoundError, 'Must be TenantNotFoundError (non-enumerating)');
  assert.ok(!thrown.message.includes('tenant'), 'Error message must not leak tenant info');
});

test('assertSameTenant is a no-op when either document is null/undefined', () => {
  assert.doesNotThrow(() => {
    assertSameTenant(null, { tenantId: 'abc' }, 'Resource');
    assertSameTenant({ tenantId: 'abc' }, null, 'Resource');
    assertSameTenant(null, null, 'Resource');
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — Tenant Isolation Plugin: schema augmentation
// ═══════════════════════════════════════════════════════════════

test('tenantIsolationPlugin adds tenantId field to schema when absent', () => {
  const schema = new mongoose.Schema({ name: String });
  assert.equal(schema.path('tenantId'), undefined, 'Should not have tenantId before plugin');

  tenantIsolationPlugin(schema);

  assert.ok(schema.path('tenantId'), 'Plugin must add tenantId path');
  assert.equal(schema.path('tenantId').instance, 'ObjectId', 'tenantId must be ObjectId type');
});

test('tenantIsolationPlugin does not duplicate tenantId when already defined on schema', () => {
  const schema = new mongoose.Schema({
    name: String,
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }
  });

  // Should not throw or overwrite
  assert.doesNotThrow(() => {
    tenantIsolationPlugin(schema);
  });

  // Still exactly one tenantId path
  assert.ok(schema.path('tenantId'), 'tenantId path must still exist');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — Fail-Closed enforcement (STRICT_TENANT_ENFORCEMENT=true)
// ═══════════════════════════════════════════════════════════════

test('plugin fail-closes with descriptive error when tenantId is absent in strict mode', () => {
  const saved = process.env.STRICT_TENANT_ENFORCEMENT;
  process.env.STRICT_TENANT_ENFORCEMENT = 'true';

  try {
    const schema = new mongoose.Schema({ name: String });
    tenantIsolationPlugin(schema);

    // Retrieve the registered pre-find hook function
    const hooks = schema.s?.hooks?._pres?.get('find');
    assert.ok(hooks && hooks.length > 0, 'pre(find) hook must be registered by plugin');

    const hookFn = hooks[0].fn;

    // Simulate a query context with no tenantId in filter or options
    const fakeQuery = {
      getOptions: () => ({}),       // no skipTenantIsolation, no tenantId option
      getQuery:   () => ({}),       // no tenantId in where clause
      where:      () => {},
      model:      { modelName: 'TestFailClosed' }
    };

    assert.throws(
      () => hookFn.call(fakeQuery),
      (err) => {
        assert.match(err.message, /Fail-Closed/, 'Error must say Fail-Closed');
        assert.match(err.message, /tenantId/, 'Error must mention tenantId');
        return true;
      }
    );
  } finally {
    process.env.STRICT_TENANT_ENFORCEMENT = saved;
    // Clean up any registered model to avoid conflicts
    if (mongoose.models['TestFailClosed']) {
      delete mongoose.models['TestFailClosed'];
    }
  }
});

test('plugin passes when tenantId is present in query filter (strict mode)', () => {
  const saved = process.env.STRICT_TENANT_ENFORCEMENT;
  process.env.STRICT_TENANT_ENFORCEMENT = 'true';

  try {
    const schema = new mongoose.Schema({ name: String });
    tenantIsolationPlugin(schema);

    const hooks = schema.s?.hooks?._pres?.get('find');
    const hookFn = hooks[0].fn;

    const tenantId = new mongoose.Types.ObjectId();
    const fakeQuery = {
      getOptions: () => ({}),
      getQuery:   () => ({ tenantId }),   // tenantId IS present
      where:      () => {},
      model:      { modelName: 'TestStrictPass' }
    };

    assert.doesNotThrow(() => hookFn.call(fakeQuery));
  } finally {
    process.env.STRICT_TENANT_ENFORCEMENT = saved;
    if (mongoose.models['TestStrictPass']) {
      delete mongoose.models['TestStrictPass'];
    }
  }
});

test('plugin allows bypass via skipTenantIsolation option (strict mode)', () => {
  const saved = process.env.STRICT_TENANT_ENFORCEMENT;
  process.env.STRICT_TENANT_ENFORCEMENT = 'true';

  try {
    const schema = new mongoose.Schema({ name: String });
    tenantIsolationPlugin(schema);

    const hooks = schema.s?.hooks?._pres?.get('find');
    const hookFn = hooks[0].fn;

    const fakeQuery = {
      getOptions: () => ({ skipTenantIsolation: true }),  // bypass flag set
      getQuery:   () => ({}),
      where:      () => {},
      model:      { modelName: 'TestBypass' }
    };

    assert.doesNotThrow(() => hookFn.call(fakeQuery), 'skipTenantIsolation must silence strict enforcement');
  } finally {
    process.env.STRICT_TENANT_ENFORCEMENT = saved;
    if (mongoose.models['TestBypass']) {
      delete mongoose.models['TestBypass'];
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — Aggregation pipeline: auto-prepend $match
// ═══════════════════════════════════════════════════════════════

test('plugin prepends tenantId $match when aggregate options carry tenantId and pipeline lacks it', () => {
  const schema = new mongoose.Schema({ name: String });
  tenantIsolationPlugin(schema);

  const hooks = schema.s?.hooks?._pres?.get('aggregate');
  assert.ok(hooks && hooks.length > 0, 'pre(aggregate) hook must be registered by plugin');

  const hookFn = hooks[0].fn;
  const tenantId = new mongoose.Types.ObjectId();
  const pipeline = [{ $group: { _id: '$category', total: { $sum: '$qty' } } }];

  const fakeAgg = {
    options: { tenantId },
    pipeline: () => pipeline
  };

  hookFn.call(fakeAgg);

  assert.equal(pipeline.length, 2, 'Pipeline must have tenantId $match prepended');
  assert.deepEqual(pipeline[0], { $match: { tenantId } }, 'First stage must be { $match: { tenantId } }');
});

test('plugin skips aggregate check when skipTenantIsolation is set on aggregate options', () => {
  const schema = new mongoose.Schema({ name: String });
  tenantIsolationPlugin(schema);

  const hooks = schema.s?.hooks?._pres?.get('aggregate');
  const hookFn = hooks[0].fn;
  const pipeline = [{ $group: { _id: '$x' } }];

  const fakeAgg = {
    options: { skipTenantIsolation: true },
    pipeline: () => pipeline
  };

  hookFn.call(fakeAgg);

  assert.equal(pipeline.length, 1, 'Pipeline must be untouched when bypass is set');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 7 — Plan Limits Middleware
// ═══════════════════════════════════════════════════════════════

const checkPlanLimits = require('../src/middleware/checkPlanLimits');

test('checkPlanLimits passes when tenant has not reached limit', async () => {
  const middleware = checkPlanLimits('maxItems');
  const req = {
    tenantId: new mongoose.Types.ObjectId(),
    tenant: { limits: { maxItems: 100 } }
  };
  let nextCalled = false;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; },
    once() { return this; }
  };

  const Tenant = require('../src/models/Tenant');
  const originalUpdate = Tenant.updateOne;
  Tenant.updateOne = async () => ({ modifiedCount: 1 });

  try {
    await middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'next() should be called when reservation succeeds');
  } finally {
    Tenant.updateOne = originalUpdate;
  }
});

test('checkPlanLimits rejects with 402 PLAN_LIMIT_EXCEEDED when limit is reached', async () => {
  const middleware = checkPlanLimits('maxItems');
  const req = {
    tenantId: new mongoose.Types.ObjectId(),
    tenant: { limits: { maxItems: 100 } }
  };
  let nextCalled = false;
  let responseStatus = null;
  let responseData = null;
  const res = {
    status(code) { responseStatus = code; return this; },
    json(data) { responseData = data; return this; },
    once() { return this; }
  };

  const Tenant = require('../src/models/Tenant');
  const originalUpdate = Tenant.updateOne;
  Tenant.updateOne = async () => ({ modifiedCount: 0 });

  try {
    await middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'next() should not be called when limit reached');
    assert.equal(responseStatus, 402, 'Should respond with 402 Payment Required');
    assert.equal(responseData.code, 'PLAN_LIMIT_EXCEEDED');
    assert.equal(responseData.current, 100);
    assert.equal(responseData.limit, 100);
  } finally {
    Tenant.updateOne = originalUpdate;
  }
});

test('checkPlanLimits bypasses when limit is -1 (unlimited)', async () => {
  const middleware = checkPlanLimits('maxUsers');
  const req = {
    tenantId: new mongoose.Types.ObjectId(),
    tenant: { limits: { maxUsers: -1 } }
  };
  let nextCalled = false;
  const res = { status() { return this; }, json() { return this; } };

  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'next() should be called when limit is -1');
});

test('checkPlanLimits atomically reserves usage for the active tenant', async () => {
  const Tenant = require('../src/models/Tenant');
  const QuotaReservation = require('../src/models/QuotaReservation');
  const originalUpdate = Tenant.updateOne;
  const originalCreate = QuotaReservation.create;
  let captured;
  Tenant.updateOne = async (filter, update) => {
    captured = { filter, update };
    return { modifiedCount: 1 };
  };
  QuotaReservation.create = async () => ({ _id: new mongoose.Types.ObjectId() });
  const handlers = {};
  const req = {
    tenantId: new mongoose.Types.ObjectId(),
    tenant: { limits: { maxItems: 10 }, usage: { items: 4 } }
  };
  const res = {
    status() { return this; },
    json() { return this; },
    once(event, handler) { handlers[event] = handler; return this; },
    statusCode: 201
  };

  try {
    await checkPlanLimits('maxItems')(req, res, () => {});
    assert.equal(captured.filter._id, req.tenantId);
    assert.equal(captured.update.$inc['usage.items'], 1);
    assert.match(JSON.stringify(captured.filter.$expr), /usage.items/);
  } finally {
    Tenant.updateOne = originalUpdate;
    QuotaReservation.create = originalCreate;
  }
});

test('checkPlanLimits rejects missing tenant context', async () => {
  let responseStatus;
  let responseBody;
  await checkPlanLimits('maxItems')(
    { tenantId: null, tenant: null },
    { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } },
    () => { throw new Error('next() must not run without tenant context'); }
  );
  assert.equal(responseStatus, 403);
  assert.equal(responseBody.code, 'TENANT_REQUIRED');
});

test('permission records carry tenant ownership and compound role uniqueness', () => {
  const Permission = require('../src/models/permission');
  assert.ok(Permission.schema.path('tenantId'), 'Permission must have tenantId');
  assert.equal(Permission.schema.path('role').options.unique, undefined);
  assert.ok(Permission.schema.indexes().some(([fields, options]) =>
    fields.tenantId === 1 && fields.role === 1 && options.unique === true
  ));
});

test('scheduled reports reject missing tenant context', async () => {
  const { generateDailySummary, generateWeeklyLowStock } = require('../src/services/reportScheduler');
  await assert.rejects(
    () => generateDailySummary(),
    /Tenant context is required/
  );
  await assert.rejects(
    () => generateWeeklyLowStock(),
    /Tenant context is required/
  );
});

test('requireTenant rejects an unresolved tenant context', () => {
  const { requireTenant } = require('../src/middleware/tenancy');
  let responseStatus;
  let responseBody;
  const res = {
    status(code) { responseStatus = code; return this; },
    json(body) { responseBody = body; return this; }
  };

  requireTenant({ tenantId: null, tenant: null }, res, () => {
    throw new Error('next() must not run without tenant context');
  });

  assert.equal(responseStatus, 403);
  assert.equal(responseBody.code, 'TENANT_REQUIRED');
});

test('requireTenant allows only a resolved tenant context', () => {
  const { requireTenant } = require('../src/middleware/tenancy');
  let nextCalled = false;
  requireTenant({ tenantId: new mongoose.Types.ObjectId(), tenant: { isActive: true } }, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('requireAuth rejects tenantless sessions in production', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const originalFindById = User.findById;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'release-0-test-secret';
  User.findById = () => ({
    select: async () => ({
      _id: new mongoose.Types.ObjectId(),
      role: 'ADMIN',
      isActive: true,
      tokenVersion: 0,
      tenantId: null
    })
  });

  try {
    const { requireAuth } = require('../src/middleware/auth');
    const token = jwt.sign({ _id: new mongoose.Types.ObjectId(), tokenVersion: 0 }, process.env.JWT_SECRET);
    let responseStatus;
    let responseBody;
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` }, cookies: {}, path: '/items' },
      { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } },
      () => { throw new Error('next() must not run for a tenantless production session'); }
    );
    assert.equal(responseStatus, 403);
    assert.equal(responseBody.code, 'TENANT_REQUIRED');
  } finally {
    User.findById = originalFindById;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('requireAuth rejects a JWT tenant claim that differs from membership', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const originalFindById = User.findById;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'release-0-test-secret';
  const memberTenant = new mongoose.Types.ObjectId();
  User.findById = () => ({
    select: async () => ({ _id: new mongoose.Types.ObjectId(), role: 'ADMIN', isActive: true, tokenVersion: 0, tenantId: memberTenant })
  });

  try {
    const { requireAuth } = require('../src/middleware/auth');
    const token = jwt.sign({ _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), tokenVersion: 0 }, process.env.JWT_SECRET);
    let responseStatus;
    let responseBody;
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` }, cookies: {}, path: '/items' },
      { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } },
      () => { throw new Error('next() must not run for a mismatched tenant claim'); }
    );
    assert.equal(responseStatus, 401);
    assert.equal(responseBody.code, 'TENANT_SESSION_MISMATCH');
  } finally {
    User.findById = originalFindById;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('requireAuth blocks business mutations for past-due subscriptions', async () => {
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const Tenant = require('../src/models/Tenant');
  const originalUserFind = User.findById;
  const originalTenantFind = Tenant.findById;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'release-1-past-due-secret';
  const tenantId = new mongoose.Types.ObjectId();
  User.findById = () => ({
    select: async () => ({ _id: new mongoose.Types.ObjectId(), role: 'ADMIN', isActive: true, tokenVersion: 0, tenantId })
  });
  Tenant.findById = async () => ({ _id: tenantId, isActive: true, status: 'PAST_DUE', subscriptionStatus: 'PAST_DUE' });

  try {
    const { requireAuth } = require('../src/middleware/auth');
    const token = jwt.sign({ _id: new mongoose.Types.ObjectId(), tokenVersion: 0 }, process.env.JWT_SECRET);
    let responseStatus;
    let responseBody;
    await requireAuth(
      { method: 'POST', path: '/items', headers: { authorization: `Bearer ${token}` }, cookies: {} },
      { status(code) { responseStatus = code; return this; }, json(body) { responseBody = body; return this; } },
      () => { throw new Error('next() must not run for past-due business mutations'); }
    );
    assert.equal(responseStatus, 402);
    assert.equal(responseBody.code, 'SUBSCRIPTION_PAST_DUE');
  } finally {
    User.findById = originalUserFind;
    Tenant.findById = originalTenantFind;
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('production defaults to fail-closed aggregation isolation', () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedStrict = process.env.STRICT_TENANT_ENFORCEMENT;
  process.env.NODE_ENV = 'production';
  delete process.env.STRICT_TENANT_ENFORCEMENT;

  try {
    const schema = new mongoose.Schema({ name: String });
    tenantIsolationPlugin(schema);
    const hooks = schema.s?.hooks?._pres?.get('aggregate');
    const hookFn = hooks[0].fn;
    const fakeAggregate = {
      options: {},
      pipeline: () => [{ $group: { _id: '$name' } }],
      _model: { modelName: 'TestProductionAggregate' }
    };

    assert.throws(() => hookFn.call(fakeAggregate), /Fail-Closed/);
  } finally {
    process.env.NODE_ENV = savedNodeEnv;
    process.env.STRICT_TENANT_ENFORCEMENT = savedStrict;
  }
});

test('core tenant models expose tenant ownership fields', () => {
  for (const modelName of ['Item', 'Company', 'Warehouse', 'StockLedger', 'Notification', 'Report', 'User']) {
    const model = require(`../src/models/${modelName}`);
    assert.ok(model.schema.path('tenantId'), `${modelName} must define tenantId`);
  }
  const Permission = require('../src/models/permission');
  assert.ok(Permission.schema.path('tenantId'), 'Permission must define tenantId');
});

