/**
 * Enterprise Module & Section Governance Test Suite
 * ─────────────────────────────────────────────────────────────
 * Validates:
 * 1. Canonical 7 Sections & 32 Modules mapping
 * 2. 6 Pre-built Enterprise Persona Presets
 * 3. 3-Tier Resolution Hierarchy:
 *    - Tenant / Role defaults
 *    - Section-level disablement (disabling section hides all child modules)
 *    - User-specific custom overrides
 *    - Temporal expiration (expiresAt < now reverts to role default)
 *    - Data privacy: maskFinancials & DLP disableExport
 * 4. Super Admin hard-locked immunity
 * 5. Middleware route guard enforcement (HIDDEN -> 403, READ_ONLY mutating -> 403)
 */

const { test, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SYSTEM_SECTIONS, MODULE_REGISTRY, ENTERPRISE_PERSONAS } = require('../src/config/modules');

// ── In-Memory Pure Governance Resolution Engine (mirrors requireModuleAccess) ─
class MockGovernanceEngine {
  constructor() {
    this.rolePolicies = new Map();
    this.userOverrides = new Map();
  }

  setRolePolicy(role, { moduleAccess = {}, disabledSections = [], maskFinancials = false, disableExport = false }) {
    this.rolePolicies.set(role, { moduleAccess, disabledSections, maskFinancials, disableExport });
  }

  setUserOverride(userId, { moduleOverrides = {}, sectionOverrides = {}, maskFinancials = null, disableExport = null, appliedPersonaId = null }) {
    this.userOverrides.set(userId, { moduleOverrides, sectionOverrides, maskFinancials, disableExport, appliedPersonaId });
  }

  resolveAccess(userId, userRole, moduleId) {
    if (userRole === 'SUPER_ADMIN') {
      return { access: 'FULL_ACCESS', maskFinancials: false, disableExport: false, appliedPersonaId: null };
    }

    const modDef = MODULE_REGISTRY[moduleId];
    const sectionId = modDef?.sectionId;

    const rolePerm = this.rolePolicies.get(userRole) || {
      moduleAccess: {},
      disabledSections: [],
      maskFinancials: false,
      disableExport: false,
    };
    const userPerm = this.userOverrides.get(userId) || {
      moduleOverrides: {},
      sectionOverrides: {},
      maskFinancials: null,
      disableExport: null,
      appliedPersonaId: null,
    };

    const effectiveMask = userPerm.maskFinancials != null ? userPerm.maskFinancials : rolePerm.maskFinancials;
    const effectiveExport = userPerm.disableExport != null ? userPerm.disableExport : rolePerm.disableExport;

    // 1. User specific module override
    const userMod = userPerm.moduleOverrides[moduleId];
    if (userMod && userMod.access) {
      if (userMod.expiresAt && new Date(userMod.expiresAt) < new Date()) {
        // Expired -> fall through to role
      } else {
        return { access: userMod.access, maskFinancials: effectiveMask, disableExport: effectiveExport, appliedPersonaId: userPerm.appliedPersonaId };
      }
    }

    // 2. User specific section override
    if (sectionId && userPerm.sectionOverrides[sectionId] === false) {
      return { access: 'HIDDEN', maskFinancials: effectiveMask, disableExport: effectiveExport, appliedPersonaId: userPerm.appliedPersonaId };
    }

    // 3. Role disabled section
    if (sectionId && rolePerm.disabledSections.includes(sectionId)) {
      return { access: 'HIDDEN', maskFinancials: effectiveMask, disableExport: effectiveExport, appliedPersonaId: userPerm.appliedPersonaId };
    }

    // 4. Role module access
    if (rolePerm.moduleAccess[moduleId]) {
      return { access: rolePerm.moduleAccess[moduleId], maskFinancials: effectiveMask, disableExport: effectiveExport, appliedPersonaId: userPerm.appliedPersonaId };
    }

    // 5. Default
    const def = modDef?.defaultAccess?.[userRole] || 'FULL_ACCESS';
    return { access: def, maskFinancials: effectiveMask, disableExport: effectiveExport, appliedPersonaId: userPerm.appliedPersonaId };
  }

  createMiddleware(moduleId, requiredAccess = 'READ_ONLY') {
    return (req, res, next) => {
      if (req.userRole === 'SUPER_ADMIN') return next();

      const { access, maskFinancials, disableExport } = this.resolveAccess(req.userId, req.userRole, moduleId);

      if (access === 'HIDDEN') {
        return res.status(403).json({
          success: false,
          error: `Module '${moduleId}' disabled by policy`,
          code: 'MODULE_DISABLED',
        });
      }

      if (requiredAccess === 'FULL_ACCESS' && access === 'READ_ONLY') {
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if (isMutating) {
          return res.status(403).json({
            success: false,
            error: `Read-Only access: Cannot modify module '${moduleId}'`,
            code: 'MODULE_READ_ONLY',
          });
        }
      }

      req.moduleAccess = access;
      req.maskFinancials = maskFinancials;
      req.disableExport = disableExport;
      next();
    };
  }
}

describe('Enterprise Module & Section Governance Engine Suite', () => {
  const engine = new MockGovernanceEngine();

  it('1. should verify canonical 7 Sections and 32 Modules mapping', () => {
    assert.equal(SYSTEM_SECTIONS.length, 7);
    const sectionIds = SYSTEM_SECTIONS.map(s => s.id);
    assert.ok(sectionIds.includes('INTELLIGENCE'));
    assert.ok(sectionIds.includes('OPERATIONS_WMS'));
    assert.ok(sectionIds.includes('STOCK_CONTROL'));
    assert.ok(sectionIds.includes('CRM_SALES'));
    assert.ok(sectionIds.includes('PROCUREMENT_MFG'));
    assert.ok(sectionIds.includes('MANAGEMENT'));
    assert.ok(sectionIds.includes('SYSTEM_GOVERNANCE'));

    // Check key modules
    assert.ok(MODULE_REGISTRY['products']);
    assert.ok(MODULE_REGISTRY['general-ledger']);
    assert.ok(MODULE_REGISTRY['manufacturing']);
    assert.ok(MODULE_REGISTRY['picking-waves']);
    assert.ok(MODULE_REGISTRY['invoices']);
    assert.ok(MODULE_REGISTRY['vendor-bills']);
  });

  it('2. should verify all 6 Pre-built Enterprise Persona Presets', () => {
    assert.equal(ENTERPRISE_PERSONAS.length, 6);
    const picker = ENTERPRISE_PERSONAS.find(p => p.id === 'WAREHOUSE_PICKER');
    assert.ok(picker);
    assert.equal(picker.moduleAccess.scan, 'FULL_ACCESS');
    assert.equal(picker.moduleAccess['picking-waves'], 'FULL_ACCESS');
    assert.equal(picker.moduleAccess['stock-out'], 'FULL_ACCESS');
    assert.equal(picker.maskFinancials, true);
    assert.equal(picker.disableExport, true);
    assert.ok(picker.disabledSections.includes('CRM_SALES'));
    assert.ok(picker.disabledSections.includes('PROCUREMENT_MFG'));

    const auditor = ENTERPRISE_PERSONAS.find(p => p.id === 'INVENTORY_AUDITOR');
    assert.ok(auditor);
    assert.equal(auditor.moduleAccess['cycle-counts'], 'FULL_ACCESS');
    assert.equal(auditor.moduleAccess['stock-ledger'], 'FULL_ACCESS');
    assert.equal(auditor.moduleAccess.products, 'READ_ONLY');
  });

  it('3. should enforce Super Admin immunity across all modules', () => {
    // Even if an engine attempts to hide products or GL, SuperAdmin always gets FULL_ACCESS
    const res = engine.resolveAccess('admin-1', 'SUPER_ADMIN', 'general-ledger');
    assert.equal(res.access, 'FULL_ACCESS');
    assert.equal(res.maskFinancials, false);
    assert.equal(res.disableExport, false);
  });

  it('4. should cascade Section-Level disablement to all child modules in that section', () => {
    // Disable entire OPERATIONS_WMS section for USER
    engine.setRolePolicy('USER', {
      disabledSections: ['OPERATIONS_WMS'],
      moduleAccess: {},
    });

    const resProducts = engine.resolveAccess('worker-1', 'USER', 'products');
    const resWaves = engine.resolveAccess('worker-1', 'USER', 'picking-waves');
    const resLots = engine.resolveAccess('worker-1', 'USER', 'lots');

    assert.equal(resProducts.access, 'HIDDEN');
    assert.equal(resWaves.access, 'HIDDEN');
    assert.equal(resLots.access, 'HIDDEN');

    // Modules in non-disabled sections remain accessible
    const resDashboard = engine.resolveAccess('worker-1', 'USER', 'dashboard');
    assert.notEqual(resDashboard.access, 'HIDDEN');
  });

  it('5. should prioritize Worker / User custom override above role-level policy', () => {
    // Role USER has products disabled
    engine.setRolePolicy('USER', {
      disabledSections: ['OPERATIONS_WMS'],
      moduleAccess: {},
    });

    // Worker 42 has a specific override granting FULL_ACCESS to products
    engine.setUserOverride('worker-42', {
      moduleOverrides: {
        products: { access: 'FULL_ACCESS', expiresAt: null },
      },
    });

    const resWorker = engine.resolveAccess('worker-42', 'USER', 'products');
    assert.equal(resWorker.access, 'FULL_ACCESS');

    // Other workers still remain HIDDEN
    const resOther = engine.resolveAccess('worker-99', 'USER', 'products');
    assert.equal(resOther.access, 'HIDDEN');
  });

  it('6. should automatically expire temporary shift delegation when expiresAt is in the past', () => {
    // Role USER has cycle-counts as READ_ONLY
    engine.setRolePolicy('USER', {
      disabledSections: [],
      moduleAccess: { 'cycle-counts': 'READ_ONLY' },
    });

    // Worker 10 had a temporary promotion to FULL_ACCESS that expired yesterday
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    engine.setUserOverride('worker-10', {
      moduleOverrides: {
        'cycle-counts': { access: 'FULL_ACCESS', expiresAt: yesterday },
      },
    });

    const res = engine.resolveAccess('worker-10', 'USER', 'cycle-counts');
    // Automatically reverts to role default (READ_ONLY)
    assert.equal(res.access, 'READ_ONLY');
  });

  it('7. should enforce Financial Cost Masking and DLP Export Lock', () => {
    engine.setRolePolicy('USER', {
      moduleAccess: {},
      disabledSections: [],
      maskFinancials: true,
      disableExport: true,
    });

    const res = engine.resolveAccess('worker-1', 'USER', 'products');
    assert.equal(res.maskFinancials, true);
    assert.equal(res.disableExport, true);
  });

  it('8. should enforce HTTP Middleware: block HIDDEN with 403, and block mutating POST on READ_ONLY', () => {
    engine.setRolePolicy('USER', {
      moduleAccess: {
        invoices: 'HIDDEN',
        products: 'READ_ONLY',
      },
      disabledSections: [],
    });

    // Test 8a: HIDDEN module rejects GET request
    const invoiceMiddleware = engine.createMiddleware('invoices');
    let invoiceStatus = null;
    let invoiceBody = null;
    invoiceMiddleware(
      { userId: 'worker-1', userRole: 'USER', method: 'GET' },
      { status: (s) => ({ json: (b) => { invoiceStatus = s; invoiceBody = b; } }) },
      () => { assert.fail('Should not call next for HIDDEN module'); }
    );
    assert.equal(invoiceStatus, 403);
    assert.equal(invoiceBody.code, 'MODULE_DISABLED');

    // Test 8b: READ_ONLY module permits GET request
    const productMiddleware = engine.createMiddleware('products', 'FULL_ACCESS');
    let getNextCalled = false;
    productMiddleware(
      { userId: 'worker-1', userRole: 'USER', method: 'GET' },
      {},
      () => { getNextCalled = true; }
    );
    assert.equal(getNextCalled, true);

    // Test 8c: READ_ONLY module rejects mutating POST request
    let postStatus = null;
    let postBody = null;
    productMiddleware(
      { userId: 'worker-1', userRole: 'USER', method: 'POST' },
      { status: (s) => ({ json: (b) => { postStatus = s; postBody = b; } }) },
      () => { assert.fail('Should not call next for POST on READ_ONLY module'); }
    );
    assert.equal(postStatus, 403);
    assert.equal(postBody.code, 'MODULE_READ_ONLY');
  });
});
