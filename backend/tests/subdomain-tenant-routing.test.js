/**
 * Subdomain / Slug-Based Multi-Tenant Workspace Routing Test Suite
 *
 * Verifies:
 *  1. Host header parsing & extraction (acme.acustock.com, acme.localhost:3000, acme.acustock.local:5001)
 *  2. Reserved system subdomains (www, api, admin, billing, auth) are never treated as tenants
 *  3. resolveTenant middleware attaches req.tenant, req.tenantId, and req.subdomainSlug
 *  4. Parameter pollution defense: strips forged tenantId from request body/query
 *  5. Public workspace discovery GET /api/tenants/workspace/:slug returns sanitized branding & 404 on missing
 *  6. Cross-tenant workspace mismatch in requireAuth returns 403 TENANT_WORKSPACE_MISMATCH
 *  7. SUPER_ADMIN bypasses workspace mismatch restrictions
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  extractTenantSlugFromHost,
  RESERVED_SUBDOMAINS,
  resolveTenant
} = require('../src/middleware/tenancy');
const { requireAuth } = require('../src/middleware/auth');
const Tenant = require('../src/models/Tenant');
const User = require('../src/models/User');
const tenantsRouter = require('../src/routes/tenants');
const jwt = require('jsonwebtoken');

// Helper to create mock req, res
function createMocks({ host, headers = {}, body = {}, query = {}, user, path = '/api/items' } = {}) {
  const req = {
    method: 'GET',
    path,
    headers: {
      host: host || 'localhost:5001',
      ...headers
    },
    hostname: (host || 'localhost').split(':')[0],
    body,
    query,
    user
  };
  const res = {
    statusCode: 200,
    responseBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.responseBody = body;
      return this;
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, wasNextCalled: () => nextCalled };
}

// ─────────────────────────────────────────────────────────────
// 1. Host header subdomain extraction
// ─────────────────────────────────────────────────────────────
test('Subdomain 1: extractTenantSlugFromHost extracts valid slugs and ignores ports', () => {
  // Production SaaS subdomains
  assert.equal(extractTenantSlugFromHost('acme.acustock.com'), 'acme');
  assert.equal(extractTenantSlugFromHost('bharat-ent.acustock.com:443'), 'bharat-ent');

  // Local development *.localhost subdomains
  assert.equal(extractTenantSlugFromHost('acme.localhost:3000'), 'acme');
  assert.equal(extractTenantSlugFromHost('tata-motors.localhost:8080'), 'tata-motors');

  // Custom local intranet domains
  assert.equal(extractTenantSlugFromHost('warehouse1.acustock.local:5001'), 'warehouse1');

  // Normalization: uppercased host should normalize to lowercase slug
  assert.equal(extractTenantSlugFromHost('ACME.Acustock.Com:3000'), 'acme');
});

// ─────────────────────────────────────────────────────────────
// 2. Reserved system subdomains & naked domains
// ─────────────────────────────────────────────────────────────
test('Subdomain 2: ignores reserved subdomains, bare localhost, and IP addresses', () => {
  // Bare localhost or naked domains
  assert.equal(extractTenantSlugFromHost('localhost:3000'), null);
  assert.equal(extractTenantSlugFromHost('localhost'), null);
  assert.equal(extractTenantSlugFromHost('127.0.0.1:5001'), null);
  assert.equal(extractTenantSlugFromHost('192.168.1.50'), null);

  // Reserved prefixes
  assert.equal(extractTenantSlugFromHost('www.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('api.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('admin.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('billing.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('auth.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('status.acustock.com'), null);
  assert.equal(extractTenantSlugFromHost('cdn.acustock.com'), null);

  assert.ok(RESERVED_SUBDOMAINS.has('www'));
  assert.ok(RESERVED_SUBDOMAINS.has('api'));
  assert.ok(RESERVED_SUBDOMAINS.has('admin'));
});

// ─────────────────────────────────────────────────────────────
// 3. resolveTenant middleware resolves tenant via Host subdomain
// ─────────────────────────────────────────────────────────────
test('Subdomain 3: resolveTenant resolves tenant and sets req.subdomainSlug from Host header', async () => {
  const tenantDoc = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Acme Corporation',
    slug: 'acme',
    isActive: true,
    status: 'ACTIVE'
  };

  const origFindOne = Tenant.findOne;
  Tenant.findOne = async (query) => {
    if (query.slug === 'acme') return tenantDoc;
    return null;
  };

  try {
    const { req, res, next, wasNextCalled } = createMocks({
      host: 'acme.localhost:3000'
    });

    await resolveTenant(req, res, next);

    assert.equal(wasNextCalled(), true);
    assert.equal(req.subdomainSlug, 'acme');
    assert.equal(req.isWorkspaceSubdomain, true);
    assert.equal(req.tenantId.toString(), tenantDoc._id.toString());
    assert.equal(req.tenant.name, 'Acme Corporation');
  } finally {
    Tenant.findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Parameter pollution protection
// ─────────────────────────────────────────────────────────────
test('Subdomain 4: resolveTenant strips forged tenantId from request body and query', async () => {
  const { req, res, next, wasNextCalled } = createMocks({
    host: 'localhost:5001',
    body: { tenantId: 'malicious-attacker-tenant', name: 'Widget' },
    query: { tenantId: 'malicious-in-query', search: 'bolt' }
  });

  await resolveTenant(req, res, next);

  assert.equal(wasNextCalled(), true);
  assert.equal(req.body.tenantId, undefined, 'body.tenantId must be completely stripped');
  assert.equal(req.query.tenantId, undefined, 'query.tenantId must be completely stripped');
  assert.equal(req.body.name, 'Widget', 'legitimate fields must remain');
  assert.equal(req.query.search, 'bolt', 'legitimate query params must remain');
});

// ─────────────────────────────────────────────────────────────
// 5. Public workspace discovery GET /api/tenants/workspace/:slug
// ─────────────────────────────────────────────────────────────
test('Subdomain 5: GET /workspace/:slug returns sanitized branding and 404 for unknown', async () => {
  const activeTenant = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Stark Industries',
    slug: 'stark-ind',
    plan: 'enterprise',
    status: 'ACTIVE',
    isActive: true,
    stripeCustomerId: 'cus_SECRET_DO_NOT_LEAK',
    ownerId: new mongoose.Types.ObjectId(),
    branding: {
      logoUrl: 'https://cdn.example.com/stark-logo.png',
      supportEmail: 'tony@stark.com',
      taxId: '27STARK9999Z1'
    },
    settings: {
      currency: 'USD',
      timezone: 'America/New_York'
    }
  };

  const origFindOne = Tenant.findOne;
  Tenant.findOne = async ({ slug }) => {
    if (slug === 'stark-ind') return activeTenant;
    return null;
  };

  try {
    const routeLayer = tenantsRouter.stack.find(
      s => s.route && s.route.path === '/workspace/:slug' && s.route.methods.get
    );
    assert.ok(routeLayer, 'GET /workspace/:slug route must exist');
    const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;

    // Case A: Valid workspace slug
    const { req: reqValid, res: resValid } = createMocks({
      params: { slug: 'stark-ind' }
    });
    reqValid.params = { slug: 'stark-ind' };
    await handler(reqValid, resValid);

    assert.equal(resValid.statusCode, 200);
    assert.equal(resValid.responseBody.success, true);
    assert.equal(resValid.responseBody.workspace.name, 'Stark Industries');
    assert.equal(resValid.responseBody.workspace.slug, 'stark-ind');
    assert.equal(resValid.responseBody.workspace.branding.taxId, '27STARK9999Z1');
    assert.equal(resValid.responseBody.workspace.stripeCustomerId, undefined, 'Must not leak Stripe customer secrets');
    assert.equal(resValid.responseBody.workspace.ownerId, undefined, 'Must not leak owner ID');

    // Case B: Non-existent workspace slug
    const { req: reqNotFound, res: resNotFound } = createMocks({
      params: { slug: 'unknown-corp' }
    });
    reqNotFound.params = { slug: 'unknown-corp' };
    await handler(reqNotFound, resNotFound);

    assert.equal(resNotFound.statusCode, 404);
    assert.equal(resNotFound.responseBody.code, 'WORKSPACE_NOT_FOUND');
  } finally {
    Tenant.findOne = origFindOne;
  }
});

// ─────────────────────────────────────────────────────────────
// 6. Cross-tenant workspace boundary mismatch returns 403
// ─────────────────────────────────────────────────────────────
test('Subdomain 6: requireAuth returns 403 TENANT_WORKSPACE_MISMATCH when accessing mismatched workspace', async () => {
  const userTenantId = new mongoose.Types.ObjectId();
  const subdomTenantId = new mongoose.Types.ObjectId(); // Different workspace

  const user = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Alice Employee',
    email: 'alice@company-a.com',
    role: 'USER',
    isActive: true,
    tenantId: userTenantId
  };

  const secret = 'test-jwt-secret-for-subdomain';
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ _id: user._id, tenantId: userTenantId }, secret, { expiresIn: '15m' });

  const origUserFind = User.findById;
  const origTenantFind = Tenant.findById;

  User.findById = () => ({
    select: () => user
  });
  Tenant.findById = async (id) => ({
    _id: id,
    name: 'Org A',
    isActive: true,
    status: 'ACTIVE'
  });

  try {
    // User from company A accesses subdomain of company B
    const { req, res, next, wasNextCalled } = createMocks({
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    req.tenantId = subdomTenantId; // Subdomain resolved company B
    req.path = '/api/items';
    req.method = 'GET';

    await requireAuth(req, res, next);

    assert.equal(res.statusCode, 403, 'Cross-tenant subdomain access must be blocked with 403');
    assert.equal(res.responseBody.code, 'TENANT_WORKSPACE_MISMATCH');
    assert.match(res.responseBody.message, /Access denied: Your account is registered under another workspace/);
    assert.equal(wasNextCalled(), false);
  } finally {
    User.findById = origUserFind;
    Tenant.findById = origTenantFind;
  }
});

// ─────────────────────────────────────────────────────────────
// 7. SUPER_ADMIN bypasses workspace mismatch restrictions
// ─────────────────────────────────────────────────────────────
test('Subdomain 7: requireAuth allows SUPER_ADMIN to access any tenant workspace', async () => {
  const superAdminId = new mongoose.Types.ObjectId();
  const targetTenantId = new mongoose.Types.ObjectId();

  const superAdmin = {
    _id: superAdminId,
    name: 'Platform Super Admin',
    email: 'super@acustock.com',
    role: 'SUPER_ADMIN',
    isActive: true,
    tenantId: null // System superadmin without a specific tenant
  };

  const secret = 'test-jwt-secret-for-subdomain';
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ _id: superAdmin._id }, secret, { expiresIn: '15m' });

  const origUserFind = User.findById;
  const origTenantFind = Tenant.findById;

  User.findById = () => ({
    select: () => superAdmin
  });
  Tenant.findById = async (id) => ({
    _id: id,
    name: 'Target Org',
    isActive: true,
    status: 'ACTIVE'
  });

  try {
    const { req, res, next, wasNextCalled } = createMocks({
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    req.tenant = { _id: targetTenantId, name: 'Target Org', isActive: true, status: 'ACTIVE' };
    req.tenantId = targetTenantId;
    req.path = '/api/items';
    req.method = 'GET';

    await requireAuth(req, res, next);

    assert.equal(wasNextCalled(), true, 'SUPER_ADMIN must be allowed access to target tenant workspace');
    assert.equal(req.user.role, 'SUPER_ADMIN');
  } finally {
    User.findById = origUserFind;
    Tenant.findById = origTenantFind;
  }
});
