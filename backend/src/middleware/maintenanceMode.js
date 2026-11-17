/**
 * Granular Maintenance Mode Middleware (SAP NetWeaver / High-Availability Standard)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Allows administrators to safely place the platform or an individual tenant
 * into a scheduled maintenance window.
 *
 * Behaviors:
 * 1. Exempts health checks, superadmin routes, and system endpoints
 * 2. Allows SUPER_ADMIN sessions to bypass maintenance
 * 3. Returns standard HTTP 503 Service Unavailable with "Retry-After" header
 */

'use strict';

const Tenant = require('../models/Tenant');
const logger = require('../utils/logger');

const EXEMPT_PREFIXES = [
  '/api/health',
  '/api/v1/health',
  '/api/auth/login',
  '/api/superadmin',
  '/api/docs',
  '/api/v1/docs'
];

function maintenanceModeMiddleware() {
  return async (req, res, next) => {
    // 1. Bypass exempt system routes
    const isExempt = EXEMPT_PREFIXES.some(prefix => req.path.startsWith(prefix));
    if (isExempt) {
      return next();
    }

    // 2. Bypass super-admin users
    if (req.user && req.user.isSuperAdmin) {
      return next();
    }

    // 3. Platform-wide maintenance check
    const isGlobalMaintenance = process.env.MAINTENANCE_MODE === 'true';
    if (isGlobalMaintenance) {
      res.setHeader('Retry-After', '1800'); // 30 minutes
      return res.status(503).json({
        success: false,
        code: 'PLATFORM_MAINTENANCE',
        message: 'AcuStock is undergoing scheduled system maintenance. Please check back shortly.',
        estimatedDurationMinutes: 30,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@acustock.com'
      });
    }

    // 4. Tenant-specific maintenance check
    if (req.tenantId) {
      try {
        const tenant = req.tenant || await Tenant.findById(req.tenantId).select('settings name').lean();
        if (tenant?.settings?.maintenanceMode) {
          res.setHeader('Retry-After', '900'); // 15 minutes
          return res.status(503).json({
            success: false,
            code: 'TENANT_MAINTENANCE',
            message: `Workspace "${tenant.name}" is temporarily suspended for maintenance.`,
            retryAfterSeconds: 900
          });
        }
      } catch (err) {
        logger.warn('Maintenance check lookup error:', err.message);
      }
    }

    next();
  };
}

module.exports = maintenanceModeMiddleware;

