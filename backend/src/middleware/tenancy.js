/**
 * Tenancy Middleware — Enterprise Multi-Tenancy Architecture.
 *
 * Resolves trusted tenant context from authenticated user or header/slug.
 * Disallows client forgery of tenantId.
 */

const Tenant = require('../models/Tenant');
const logger = require('../utils/logger');

const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'admin', 'superadmin', 'billing', 'auth',
  'mail', 'status', 'cdn', 'static', 'assets', 'test', 'demo',
  'dev', 'stage', 'staging', 'prod', 'localhost'
]);

/**
 * Extracts a tenant slug from incoming request Host header or hostname.
 * Examples:
 *   acme.acustock.com        -> acme
 *   acme.localhost:3000      -> acme
 *   acme.acustock.local:5001 -> acme
 *   www.acustock.com         -> null (reserved)
 *   api.acustock.com         -> null (reserved)
 *   localhost:3000           -> null (no subdomain)
 *   127.0.0.1:5001           -> null (IP address)
 *
 * @param {string} hostHeader
 * @returns {string|null}
 */
function extractTenantSlugFromHost(hostHeader) {
  if (!hostHeader || typeof hostHeader !== 'string') return null;

  // 1. Strip port if present
  const hostname = hostHeader.split(':')[0].toLowerCase().trim();

  // 2. Ignore IP addresses and bare localhost
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === 'localhost') {
    return null;
  }

  // 3. Handle *.localhost (e.g. acme.localhost)
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.slice(0, -'.localhost'.length);
    if (!sub || sub.includes('.')) return null;
    return RESERVED_SUBDOMAINS.has(sub) ? null : sub;
  }

  // 4. Handle standard multi-level domains (e.g. acme.acustock.com or acme.acustock.local)
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    const candidate = parts[0];
    if (candidate && !RESERVED_SUBDOMAINS.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Middleware that resolves and attaches tenant context to req.
 * Priority: req.user.tenantId (trusted server identity) > header / subdomain / slug for public endpoints
 */
async function resolveTenant(req, res, next) {
  // Strip any forged tenantId from request body or query to prevent parameter pollution
  if (req.body && req.body.tenantId && (!req.user || req.user.role !== 'SUPER_ADMIN')) {
    delete req.body.tenantId;
  }
  if (req.query && req.query.tenantId && (!req.user || req.user.role !== 'SUPER_ADMIN')) {
    delete req.query.tenantId;
  }

  // Extract subdomain if host header is available
  const hostSubdomain = extractTenantSlugFromHost(req.headers.host || req.hostname);
  if (hostSubdomain) {
    req.subdomainSlug = hostSubdomain;
    req.isWorkspaceSubdomain = true;
  }

  // 1. If already resolved by requireAuth
  if (req.tenantId) {
    try {
      const tenant = await Tenant.findById(req.tenantId);
      if (tenant) {
        if (!tenant.isActive || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELED') {
          return res.status(403).json({
            success: false,
            error: 'Organization account is suspended or inactive. Please contact support.',
            code: 'TENANT_INACTIVE'
          });
        }
        req.tenant = tenant;
      }
    } catch (err) {
      logger.error('Error resolving tenant from req.tenantId:', err.message);
    }
    return next();
  }

  // 2. Fallback for public routes before auth (e.g. workspace discovery, custom subdomain, invite acceptance)
  const tenantIdentifier =
    req.headers['x-tenant-slug'] ||
    req.headers['x-tenant-id'] ||
    hostSubdomain ||
    req.query.tenant ||
    req.subdomains?.[0];

  if (!tenantIdentifier || RESERVED_SUBDOMAINS.has(String(tenantIdentifier).toLowerCase())) {
    req.tenantId = null;
    req.tenant   = null;
    return next();
  }

  try {
    const query = /^[0-9a-fA-F]{24}$/.test(tenantIdentifier)
      ? { _id: tenantIdentifier }
      : { slug: String(tenantIdentifier).toLowerCase() };

    const tenant = await Tenant.findOne({ ...query, isActive: true });

    if (tenant) {
      req.tenantId = tenant._id;
      req.tenant   = tenant;
    } else {
      req.tenantId = null;
      req.tenant   = null;
    }
  } catch (err) {
    logger.error('Tenant resolution error:', err.message);
    req.tenantId = null;
    req.tenant   = null;
  }

  next();
}

/**
 * Strict guard — use on routes that REQUIRE a resolved active tenant.
 * Will reject requests that don't have a valid active tenant.
 */
function requireTenant(req, res, next) {
  if (!req.tenantId || !req.tenant) {
    return res.status(403).json({
      success: false,
      error: 'Tenant context required or organization workspace inactive',
      code: 'TENANT_REQUIRED'
    });
  }
  next();
}

module.exports = {
  resolveTenant,
  requireTenant,
  extractTenantSlugFromHost,
  RESERVED_SUBDOMAINS
};
