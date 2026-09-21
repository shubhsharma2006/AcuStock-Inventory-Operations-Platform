/**
 * Self-Service Tenant Registration
 * ─────────────────────────────────────────────────────────────────
 * POST /api/auth/register-tenant
 *
 * Public endpoint for new business customers to provision their own
 * isolated workspace (tenant) in one atomic operation.
 *
 * What it does:
 *   1. Validates all input fields
 *   2. Checks for existing tenant slug and admin email conflicts
 *   3. Creates the Tenant document (status: TRIALING, 14-day trial)
 *   4. Creates the workspace Admin user, linked to the new tenant
 *   5. Seeds default ADMIN permissions for the tenant
 *   6. Returns a JWT token so the user is immediately logged in
 *
 * No authentication required (public endpoint).
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');
const User     = require('../models/User');
const Tenant   = require('../models/Tenant');
const Permission = require('../models/permission');
const logger   = require('../utils/logger');

const router = express.Router();

// ── Free plan limits (starter trial) ──────────────────────────
const TRIAL_PLAN_LIMITS = {
  maxUsers:   15,
  maxItems:   500,
  maxStorage: 1024  // MB
};

// Default ADMIN permissions (mirrored from seedPermissions.js)
const DEFAULT_ADMIN_PERMISSIONS = {
  canManageManagers:              true,
  canManageUsers:                 true,
  canActivateDeactivateManagers:  true,
  canActivateDeactivateUsers:     true,
  canViewProducts:                true,
  canAddProduct:                  true,
  canEditProduct:                 true,
  canDeleteProduct:               true,
  canChangeSerialPolicy:          true,
  canViewCompanies:               true,
  canAddCompany:                  true,
  canEditCompany:                 true,
  canDeleteCompany:               true,
  canViewUnits:                   true,
  canManageUnits:                 true,
  canStockIn:                     true,
  canStockOut:                    true,
  canViewStockLedger:             true,
  canEditStock:                   false,
  canDeleteStock:                 false,
  canViewAllReports:              true,
  canViewOwnReports:              true,
  canAccessSettings:              true,
  canViewAuditLogs:               true,
  canManageManagers:              true,
};

/**
 * Generates a URL-safe slug from a company name.
 * e.g. "Acme Corp!" → "acme-corp"
 */
function generateSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63); // MongoDB slug max length
}

/**
 * POST /api/auth/register-tenant
 * Body: { workspaceName, adminName, email, password, industry?, timezone?, currency? }
 */
router.post('/register-tenant', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {

      // ── 1. Input Extraction & Validation ───────────────────
      const {
        workspaceName,
        adminName,
        email,
        password,
        industry   = 'Other',
        timezone   = 'Asia/Kolkata',
        currency   = 'INR'
      } = req.body || {};

      const errors = [];

      if (!workspaceName || typeof workspaceName !== 'string' || workspaceName.trim().length < 2) {
        errors.push('workspaceName must be at least 2 characters');
      }
      if (!adminName || typeof adminName !== 'string' || adminName.trim().length < 2) {
        errors.push('adminName must be at least 2 characters');
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('A valid email address is required');
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        errors.push('password must be at least 8 characters');
      }

      if (errors.length > 0) {
        const err = new Error(errors.join('; '));
        err.statusCode = 400;
        throw err;
      }

      const normalizedEmail    = email.trim().toLowerCase();
      const normalizedName     = workspaceName.trim();
      const normalizedAdmin    = adminName.trim();

      // ── 2. Conflict Checks ─────────────────────────────────
      // Check admin email uniqueness
      const existingUser = await User.findOne(
        { email: normalizedEmail },
        null,
        { session, skipTenantIsolation: true }
      );
      if (existingUser) {
        const err = new Error('An account with this email already exists');
        err.statusCode = 409;
        throw err;
      }

      // Derive and check slug uniqueness
      const baseSlug = generateSlug(normalizedName);
      if (!baseSlug) {
        const err = new Error('Workspace name must contain at least one alphanumeric character');
        err.statusCode = 400;
        throw err;
      }

      // If slug is taken, append a short random suffix
      let slug = baseSlug;
      const existingTenant = await Tenant.findOne({ slug }, null, { session });
      if (existingTenant) {
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      // ── 3. Create Tenant ────────────────────────────────────
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 14); // 14-day trial

      const [tenant] = await Tenant.create([{
        name:          normalizedName,
        slug,
        plan:          'starter',
        status:        'TRIALING',
        isActive:      true,
        planExpiresAt: trialExpiresAt,
        limits:        TRIAL_PLAN_LIMITS,
        settings: {
          timezone,
          currency,
          dateFormat: 'YYYY-MM-DD'
        }
      }], { session });

      // ── 4. Create Workspace Admin ───────────────────────────
      const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const hashedPassword = await bcrypt.hash(password, bcryptRounds);

      const [adminUser] = await User.create([{
        name:          normalizedAdmin,
        email:         normalizedEmail,
        password:      hashedPassword,
        role:          'ADMIN',
        isSuperAdmin:  false,
        isActive:      true,
        tenantId:      tenant._id,
        authProvider:  'local',
        passwordChangedBy: 'SYSTEM'
      }], { session });

      // Update tenant to link ownerId
      await Tenant.findOneAndUpdate(
        { _id: tenant._id },
        { $set: { ownerId: adminUser._id } },
        { session }
      );

      // ── 5. Seed Default ADMIN Permissions ──────────────────
      const existingPerms = await Permission.findOne(
        { role: 'ADMIN', tenantId: tenant._id },
        null,
        { session, skipTenantIsolation: true }
      );

      if (!existingPerms) {
        // Check if Permission model has tenantId; seed globally if not
        try {
          await Permission.create([{
            role: 'ADMIN',
            tenantId: tenant._id,
            ...DEFAULT_ADMIN_PERMISSIONS
          }], { session });
        } catch (permErr) {
          // Permission seeding failure is non-fatal — log and continue
          logger.warn(`[register-tenant] Permission seeding failed for tenant ${tenant._id}: ${permErr.message}`);
        }
      }

      // ── 6. Issue JWT Token ──────────────────────────────────
      const tokenPayload = {
        userId:       adminUser._id,
        role:         adminUser.role,
        tenantId:     tenant._id,
        tokenVersion: adminUser.tokenVersion || 0
      };

      const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign(
        { userId: adminUser._id, tokenVersion: adminUser.tokenVersion || 0 },
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      result = {
        tenant: {
          id:            tenant._id,
          name:          tenant.name,
          slug:          tenant.slug,
          plan:          tenant.plan,
          status:        tenant.status,
          trialExpiresAt: trialExpiresAt
        },
        admin: {
          id:    adminUser._id,
          name:  adminUser.name,
          email: adminUser.email,
          role:  adminUser.role
        },
        accessToken,
        refreshToken
      };
    });

    logger.info(`[register-tenant] New workspace created: "${result.tenant.name}" (${result.tenant.slug}), admin: ${result.admin.email}`);

    const isProduction = process.env.NODE_ENV === 'production';
    const sameSite = isProduction ? 'strict' : 'lax';

    // Set authToken and refreshToken in httpOnly cookies for immediate browser session
    res.cookie('authToken', result.accessToken, {
      httpOnly: true,
      secure:   isProduction,
      sameSite,
      maxAge:   15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure:   isProduction,
      sameSite,
      maxAge:   7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      success: true,
      message: `Workspace "${result.tenant.name}" created. Your 14-day trial has started.`,
      tenant:      result.tenant,
      admin:       result.admin,
      accessToken: result.accessToken
    });

  } catch (err) {
    const statusCode = err.statusCode || 500;
    logger.error('[register-tenant] Error:', err.message);

    // Avoid leaking internal errors
    const clientMessage = statusCode < 500
      ? err.message
      : 'An unexpected error occurred during workspace registration. Please try again.';

    return res.status(statusCode).json({
      success: false,
      error:   clientMessage,
      code:    statusCode === 409 ? 'EMAIL_CONFLICT'
             : statusCode === 400 ? 'VALIDATION_ERROR'
             : 'INTERNAL_ERROR'
    });
  } finally {
    session.endSession();
  }
});

module.exports = router;
