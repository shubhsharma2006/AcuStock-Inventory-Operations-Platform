/**
 * Tenants & Public Workspace Discovery Routes
 * ─────────────────────────────────────────────────────────────────
 * Allows frontend clients to resolve workspace branding, verify subdomain
 * existence, and display customized tenant portals safely without leaking secrets.
 */

'use strict';

const express = require('express');
const Tenant = require('../models/Tenant');
const logger = require('../utils/logger');
const { requireAuth, requireTenantId, requireRole } = require('../middleware/auth');
const {
  generateVerificationToken,
  isValidDomain,
  verifyDomainDns,
  DEFAULT_CNAME_TARGET
} = require('../services/domainVerification.service');

const router = express.Router();

/**
 * Filter sensitive fields and return only safe public branding attributes
 */
function sanitizeWorkspace(tenant) {
  if (!tenant) return null;

  return {
    id: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    branding: {
      logoUrl: tenant.branding?.logoUrl || null,
      supportEmail: tenant.branding?.supportEmail || null,
      phone: tenant.branding?.phone || null,
      address: tenant.branding?.address || {},
      taxId: tenant.branding?.taxId || null,
      invoiceTerms: tenant.branding?.invoiceTerms || null
    },
    settings: {
      currency: tenant.settings?.currency || 'USD',
      timezone: tenant.settings?.timezone || 'UTC',
      dateFormat: tenant.settings?.dateFormat || 'YYYY-MM-DD'
    }
  };
}

/**
 * GET /api/tenants/workspace/:slug
 * Public endpoint to fetch active workspace details for dynamic subdomain portals.
 */
router.get('/workspace/:slug', async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();

    if (!slug) {
      return res.status(400).json({ success: false, error: 'Workspace slug is required' });
    }

    const tenant = await Tenant.findOne({ slug, isActive: true });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: `Workspace "${slug}" not found or inactive`,
        code: 'WORKSPACE_NOT_FOUND'
      });
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELED') {
      return res.status(403).json({
        success: false,
        error: `Workspace "${slug}" is currently suspended. Please contact support.`,
        code: 'WORKSPACE_SUSPENDED'
      });
    }

    res.json({
      success: true,
      workspace: sanitizeWorkspace(tenant)
    });
  } catch (err) {
    logger.error('Error fetching workspace by slug:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve workspace details' });
  }
});

/**
 * GET /api/tenants/current
 * Resolves currently active workspace if extracted from Host subdomain or headers.
 */
router.get('/current', async (req, res) => {
  try {
    if (req.tenant) {
      return res.json({
        success: true,
        resolved: true,
        workspace: sanitizeWorkspace(req.tenant)
      });
    }

    res.json({
      success: true,
      resolved: false,
      workspace: null
    });
  } catch (err) {
    logger.error('Error resolving current workspace:', err);
    res.status(500).json({ success: false, error: 'Failed to resolve current workspace' });
  }
});

// ============================================================
// CUSTOM DOMAIN MANAGEMENT (Admin only)
// ============================================================

/**
 * POST /api/tenants/custom-domain
 * Register a custom domain for the tenant and generate TXT verification challenge
 */
router.post('/custom-domain', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { domain } = req.body;
    if (!isValidDomain(domain)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid custom domain. Must be a valid fully-qualified domain name (e.g. inventory.acme.com).'
      });
    }

    const cleanDomain = domain.trim().toLowerCase();

    // Check if domain is already claimed by another tenant
    const existing = await Tenant.findOne({
      'customDomain.domain': cleanDomain,
      _id: { $ne: req.tenantId }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Domain "${cleanDomain}" is already claimed by another organization.`
      });
    }

    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    // Only enterprise / professional plans can use custom domains
    if (!['enterprise', 'professional'].includes(tenant.plan)) {
      return res.status(403).json({
        success: false,
        error: 'Custom domains require an active Enterprise or Professional plan.',
        code: 'PLAN_UPGRADE_REQUIRED'
      });
    }

    const verificationToken = generateVerificationToken();
    tenant.customDomain = {
      domain: cleanDomain,
      verificationToken,
      cnameTarget: DEFAULT_CNAME_TARGET,
      status: 'PENDING_DNS',
      lastCheckedAt: new Date()
    };

    await tenant.save();

    res.json({
      success: true,
      message: 'Custom domain registered. Please configure the required DNS records.',
      customDomain: {
        domain: cleanDomain,
        status: tenant.customDomain.status,
        dnsInstructions: {
          txtRecord: {
            host: `_acustock-challenge.${cleanDomain}`,
            type: 'TXT',
            value: verificationToken
          },
          cnameRecord: {
            host: cleanDomain,
            type: 'CNAME',
            value: DEFAULT_CNAME_TARGET
          }
        }
      }
    });
  } catch (err) {
    logger.error('Register custom domain error:', err);
    res.status(500).json({ success: false, error: 'Failed to register custom domain' });
  }
});

/**
 * POST /api/tenants/custom-domain/verify
 * Performs immediate DNS verification lookup
 */
router.post('/custom-domain/verify', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant || !tenant.customDomain || !tenant.customDomain.domain) {
      return res.status(400).json({ success: false, error: 'No custom domain registered for this tenant.' });
    }

    const { domain, verificationToken, cnameTarget } = tenant.customDomain;
    const result = await verifyDomainDns(domain, verificationToken, cnameTarget);

    tenant.customDomain.lastCheckedAt = new Date();
    if (result.verified) {
      tenant.customDomain.status = 'VERIFIED';
      tenant.customDomain.verifiedAt = new Date();
      tenant.customDomain.sslStatus = 'ACTIVE';
      await tenant.save();

      return res.json({
        success: true,
        status: 'VERIFIED',
        message: `Domain ${domain} is successfully verified!`,
        details: result
      });
    } else {
      tenant.customDomain.status = 'PENDING_DNS';
      await tenant.save();

      return res.status(400).json({
        success: false,
        status: 'PENDING_DNS',
        message: 'DNS records not yet propagated or verification token mismatch.',
        details: result
      });
    }
  } catch (err) {
    logger.error('Verify custom domain error:', err);
    res.status(500).json({ success: false, error: 'Failed to verify custom domain' });
  }
});

/**
 * DELETE /api/tenants/custom-domain
 * Detach custom domain from tenant
 */
router.delete('/custom-domain', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    tenant.customDomain = {
      domain: null,
      verificationToken: null,
      status: 'NONE',
      sslStatus: 'NONE'
    };
    await tenant.save();

    res.json({ success: true, message: 'Custom domain removed successfully.' });
  } catch (err) {
    logger.error('Delete custom domain error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove custom domain' });
  }
});

// ============================================================
// ENTERPRISE SAML 2.0 / SSO CONFIGURATION (Admin only)
// ============================================================

/**
 * GET /api/tenants/sso
 * Retrieve current enterprise SAML SSO configuration for the tenant
 */
router.get('/sso', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('sso slug name').lean();
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    res.json({
      success: true,
      slug: tenant.slug,
      sso: tenant.sso || {
        enabled: false,
        enforced: false,
        domainPatterns: [],
        idpIssuer: '',
        idpSsoUrl: '',
        idpCertificate: '',
        allowJitProvisioning: true,
        defaultRole: 'USER'
      }
    });
  } catch (err) {
    logger.error('Get SSO config error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch SSO configuration' });
  }
});

/**
 * PUT /api/tenants/sso
 * Update enterprise SAML SSO configuration for the tenant
 */
router.put('/sso', requireAuth, requireTenantId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const {
      enabled,
      enforced,
      domainPatterns,
      idpIssuer,
      idpSsoUrl,
      idpCertificate,
      allowJitProvisioning,
      defaultRole
    } = req.body;

    const normalizedDomains = Array.isArray(domainPatterns)
      ? domainPatterns.map((d) => String(d).trim().toLowerCase()).filter(Boolean)
      : [];

    tenant.sso = {
      enabled: Boolean(enabled),
      enforced: Boolean(enforced),
      domainPatterns: normalizedDomains,
      idpIssuer: (idpIssuer || '').trim(),
      idpSsoUrl: (idpSsoUrl || '').trim(),
      idpCertificate: (idpCertificate || '').trim(),
      allowJitProvisioning: allowJitProvisioning !== false,
      defaultRole: ['USER', 'MANAGER'].includes(defaultRole) ? defaultRole : 'USER'
    };

    await tenant.save();

    res.json({
      success: true,
      message: 'Enterprise SSO configuration saved successfully.',
      sso: tenant.sso
    });
  } catch (err) {
    logger.error('Save SSO config error:', err);
    res.status(500).json({ success: false, error: 'Failed to save SSO configuration' });
  }
});

module.exports = router;
