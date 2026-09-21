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

module.exports = router;
