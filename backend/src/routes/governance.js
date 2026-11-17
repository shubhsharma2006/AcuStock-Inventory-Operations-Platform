/**
 * Super Admin Module & Section Governance API
 * ─────────────────────────────────────────────────────────────
 * Endpoints for managing module visibility, persona presets,
 * temporal delegations, and snapshot history.
 *
 * GET    /api/superadmin/governance/matrix            — Get full system governance matrix
 * PATCH  /api/superadmin/governance/role-policy       — Update access level / disabled sections for a role
 * PATCH  /api/superadmin/governance/user-override      — Set user custom override (with expiresAt)
 * POST   /api/superadmin/governance/apply-preset      — Apply 1-click persona preset to role or user
 * POST   /api/superadmin/governance/reset-user/:id    — Reset user overrides back to role default
 * GET    /api/superadmin/governance/snapshots         — List governance revision snapshots
 * POST   /api/superadmin/governance/rollback/:id      — 1-Click rollback to a previous snapshot
 */

const express = require('express');
const Permission = require('../models/permission');
const UserPermission = require('../models/UserPermission');
const User = require('../models/User');
const GovernanceSnapshot = require('../models/GovernanceSnapshot');
const { SYSTEM_SECTIONS, MODULE_REGISTRY, ENTERPRISE_PERSONAS } = require('../config/modules');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);
router.use(requireAuth);

// SuperAdmin guard middleware
const requireSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'Access restricted: Only Super Administrators can configure enterprise module governance.',
    });
  }
  next();
};

router.use(requireSuperAdmin);

/**
 * 1. GET /matrix — Full Governance Master Matrix
 */
router.get('/matrix', async (req, res) => {
  try {
    const [rolePermissions, users, customUserPermissions] = await Promise.all([
      Permission.find({ tenantId: req.tenantId }),
      User.find({ tenantId: req.tenantId }, '_id name email role isActive'),
      UserPermission.find({ tenantId: req.tenantId }),
    ]);

    // Format role policies
    const rolesMap = {
      ADMIN: { moduleAccess: {}, disabledSections: [], maskFinancials: false, disableExport: false },
      MANAGER: { moduleAccess: {}, disabledSections: [], maskFinancials: false, disableExport: false },
      USER: { moduleAccess: {}, disabledSections: [], maskFinancials: false, disableExport: false },
    };

    rolePermissions.forEach((p) => {
      if (rolesMap[p.role]) {
        rolesMap[p.role].moduleAccess = Object.fromEntries(p.moduleAccess || new Map());
        rolesMap[p.role].disabledSections = p.disabledSections || [];
        rolesMap[p.role].maskFinancials = !!p.maskFinancials;
        rolesMap[p.role].disableExport = !!p.disableExport;
      }
    });

    // Format user custom overrides
    const userOverrides = customUserPermissions.map((up) => {
      const u = users.find((user) => String(user._id) === String(up.userId));
      return {
        userId: up.userId,
        userName: u ? u.name : 'Unknown',
        userEmail: u ? u.email : '',
        role: u ? u.role : 'USER',
        appliedPersonaId: up.appliedPersonaId || null,
        moduleOverrides: Object.fromEntries(up.moduleOverrides || new Map()),
        sectionOverrides: Object.fromEntries(up.sectionOverrides || new Map()),
        maskFinancials: up.maskFinancials,
        disableExport: up.disableExport,
      };
    });

    res.json({
      success: true,
      sections: SYSTEM_SECTIONS,
      modules: MODULE_REGISTRY,
      personas: ENTERPRISE_PERSONAS,
      roles: rolesMap,
      userOverrides,
      users,
    });
  } catch (err) {
    logger.error('Governance matrix fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch governance matrix' });
  }
});

/**
 * 2. PATCH /role-policy — Update Role-Level Governance Policy
 */
router.patch('/role-policy', async (req, res) => {
  try {
    const { role, moduleAccess, disabledSections, maskFinancials, disableExport, reason } = req.body;

    if (!['ADMIN', 'MANAGER', 'USER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified' });
    }

    let perm = await Permission.findOne({ tenantId: req.tenantId, role });
    if (!perm) {
      perm = new Permission({ tenantId: req.tenantId, role });
    }

    // Capture state for snapshot before mutating
    const previousState = {
      role,
      moduleAccess: Object.fromEntries(perm.moduleAccess || new Map()),
      disabledSections: perm.disabledSections || [],
      maskFinancials: !!perm.maskFinancials,
      disableExport: !!perm.disableExport,
    };

    if (moduleAccess && typeof moduleAccess === 'object') {
      const currentMap = perm.moduleAccess || new Map();
      for (const [modId, level] of Object.entries(moduleAccess)) {
        if (['HIDDEN', 'READ_ONLY', 'FULL_ACCESS'].includes(level)) {
          currentMap.set(modId, level);
        }
      }
      perm.moduleAccess = currentMap;
    }

    if (Array.isArray(disabledSections)) {
      perm.disabledSections = disabledSections;
    }

    if (typeof maskFinancials === 'boolean') perm.maskFinancials = maskFinancials;
    if (typeof disableExport === 'boolean') perm.disableExport = disableExport;

    perm.updatedBy = req.userId;
    await perm.save();

    // Create immutable Governance Snapshot
    const snapshot = await GovernanceSnapshot.create({
      tenantId: req.tenantId,
      snapshotType: 'ROLE_POLICY_UPDATE',
      targetType: 'ROLE',
      targetIdentifier: role,
      description: `Updated module governance policy for role ${role}`,
      reason: reason || 'SuperAdmin policy adjustment',
      state: { previous: previousState, current: perm.toObject() },
      performedBy: req.userId,
      performedByName: req.user ? req.user.name : 'SuperAdmin',
    });

    await logBusinessEvent({
      tenantId: req.tenantId,
      actor: { id: req.userId, email: req.user?.email || 'admin@acustock.com', role: req.userRole },
      action: 'MODULE_POLICY_UPDATED',
      entity: { type: 'Governance', id: String(snapshot._id), name: `Role Policy ${role}` },
      metadata: { role, reason },
    });

    // Real-Time Socket.IO broadcast to notify active users of that role
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate(
        'governance:revoked',
        {
          tenantId: req.tenantId,
          role,
          message: `Permissions updated for ${role}`,
          timestamp: new Date(),
        },
        role.toLowerCase()
      );
    }

    res.json({
      success: true,
      message: `Governance policy for ${role} updated successfully`,
      rolePolicy: perm,
      snapshotId: snapshot._id,
    });
  } catch (err) {
    logger.error('Update role policy error:', err);
    res.status(500).json({ success: false, error: 'Failed to update role policy' });
  }
});

/**
 * 3. PATCH /user-override — Set Custom Module Override for a Worker
 */
router.patch('/user-override', async (req, res) => {
  try {
    const { userId, moduleId, access, expiresAt, reason, maskFinancials, disableExport } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const user = await User.findOne({ _id: userId, tenantId: req.tenantId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found in this tenant' });
    }

    let userPerm = await UserPermission.findOne({ tenantId: req.tenantId, userId });
    if (!userPerm) {
      userPerm = new UserPermission({ tenantId: req.tenantId, userId });
    }

    const previousState = userPerm.toObject();

    if (moduleId && ['HIDDEN', 'READ_ONLY', 'FULL_ACCESS'].includes(access)) {
      const overrides = userPerm.moduleOverrides || new Map();
      overrides.set(moduleId, {
        access,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        reason: reason || '',
        grantedBy: req.userId,
      });
      userPerm.moduleOverrides = overrides;
    }

    if (typeof maskFinancials === 'boolean') userPerm.maskFinancials = maskFinancials;
    if (typeof disableExport === 'boolean') userPerm.disableExport = disableExport;

    userPerm.updatedBy = req.userId;
    await userPerm.save();

    // Snapshot log
    const snapshot = await GovernanceSnapshot.create({
      tenantId: req.tenantId,
      snapshotType: 'USER_OVERRIDE_UPDATE',
      targetType: 'USER',
      targetIdentifier: String(userId),
      description: `Set override for user ${user.name} (${user.email}) on module ${moduleId} to ${access}`,
      reason: reason || 'SuperAdmin custom override',
      state: { previous: previousState, current: userPerm.toObject() },
      performedBy: req.userId,
      performedByName: req.user ? req.user.name : 'SuperAdmin',
    });

    // Targeted WebSocket notification to the specific user's room
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate(
        'governance:revoked',
        {
          tenantId: req.tenantId,
          userId,
          message: `Your module access has been updated: ${moduleId} is now ${access}`,
          timestamp: new Date(),
        },
        `user-${userId}`
      );
    }

    res.json({
      success: true,
      message: `Override for user ${user.name} saved successfully`,
      userPermission: userPerm,
      snapshotId: snapshot._id,
    });
  } catch (err) {
    logger.error('Update user override error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user override' });
  }
});

/**
 * 4. POST /apply-preset — 1-Click Persona Preset Application
 */
router.post('/apply-preset', async (req, res) => {
  try {
    const { personaId, targetType, targetIdentifier, reason } = req.body;

    const preset = ENTERPRISE_PERSONAS.find((p) => p.id === personaId);
    if (!preset) {
      return res.status(400).json({ success: false, error: 'Invalid persona preset specified' });
    }

    if (targetType === 'ROLE') {
      const role = targetIdentifier;
      if (!['ADMIN', 'MANAGER', 'USER'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Invalid role for preset' });
      }

      let perm = await Permission.findOne({ tenantId: req.tenantId, role });
      if (!perm) perm = new Permission({ tenantId: req.tenantId, role });

      const prev = perm.toObject();

      perm.moduleAccess = new Map(Object.entries(preset.moduleAccess));
      perm.disabledSections = preset.disabledSections || [];
      perm.maskFinancials = !!preset.maskFinancials;
      perm.disableExport = !!preset.disableExport;
      perm.updatedBy = req.userId;
      await perm.save();

      await GovernanceSnapshot.create({
        tenantId: req.tenantId,
        snapshotType: 'PERSONA_PRESET_APPLIED',
        targetType: 'ROLE',
        targetIdentifier: role,
        description: `Applied persona '${preset.name}' to role ${role}`,
        reason: reason || `Applied ${preset.name}`,
        state: { previous: prev, preset },
        performedBy: req.userId,
        performedByName: req.user ? req.user.name : 'SuperAdmin',
      });

      if (global.emitRealTimeUpdate) {
        global.emitRealTimeUpdate(
          'governance:revoked',
          { tenantId: req.tenantId, role, message: `Persona '${preset.name}' applied to ${role}` },
          role.toLowerCase()
        );
      }

      return res.json({
        success: true,
        message: `Persona preset '${preset.name}' successfully applied to all ${role} accounts.`,
      });
    }

    if (targetType === 'USER') {
      const userId = targetIdentifier;
      const user = await User.findOne({ _id: userId, tenantId: req.tenantId });
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      let userPerm = await UserPermission.findOne({ tenantId: req.tenantId, userId });
      if (!userPerm) userPerm = new UserPermission({ tenantId: req.tenantId, userId });

      const prev = userPerm.toObject();

      const newOverrides = new Map();
      for (const [modId, access] of Object.entries(preset.moduleAccess)) {
        newOverrides.set(modId, {
          access,
          expiresAt: null,
          reason: `Applied Persona Preset: ${preset.name}`,
          grantedBy: req.userId,
        });
      }

      const secOverrides = new Map();
      if (preset.disabledSections) {
        preset.disabledSections.forEach((s) => secOverrides.set(s, false));
      }

      userPerm.moduleOverrides = newOverrides;
      userPerm.sectionOverrides = secOverrides;
      userPerm.appliedPersonaId = preset.id;
      userPerm.maskFinancials = !!preset.maskFinancials;
      userPerm.disableExport = !!preset.disableExport;
      userPerm.updatedBy = req.userId;
      await userPerm.save();

      await GovernanceSnapshot.create({
        tenantId: req.tenantId,
        snapshotType: 'PERSONA_PRESET_APPLIED',
        targetType: 'USER',
        targetIdentifier: String(userId),
        description: `Applied persona '${preset.name}' to worker ${user.name}`,
        reason: reason || `Applied ${preset.name}`,
        state: { previous: prev, preset },
        performedBy: req.userId,
        performedByName: req.user ? req.user.name : 'SuperAdmin',
      });

      if (global.emitRealTimeUpdate) {
        global.emitRealTimeUpdate(
          'governance:revoked',
          { tenantId: req.tenantId, userId, message: `Persona '${preset.name}' applied to your profile` },
          `user-${userId}`
        );
      }

      return res.json({
        success: true,
        message: `Persona preset '${preset.name}' applied to worker ${user.name}.`,
      });
    }

    res.status(400).json({ success: false, error: 'Invalid targetType (must be ROLE or USER)' });
  } catch (err) {
    logger.error('Apply preset error:', err);
    res.status(500).json({ success: false, error: 'Failed to apply persona preset' });
  }
});

/**
 * 5. POST /reset-user/:userId — Reset User Overrides to Role Default
 */
router.post('/reset-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userPerm = await UserPermission.findOne({ tenantId: req.tenantId, userId });

    if (userPerm) {
      userPerm.moduleOverrides = new Map();
      userPerm.sectionOverrides = new Map();
      userPerm.appliedPersonaId = null;
      userPerm.maskFinancials = null;
      userPerm.disableExport = null;
      userPerm.updatedBy = req.userId;
      await userPerm.save();
    }

    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate(
        'governance:revoked',
        { tenantId: req.tenantId, userId, message: 'Your permissions were reset to role defaults' },
        `user-${userId}`
      );
    }

    res.json({
      success: true,
      message: 'Worker permissions successfully reset to role defaults.',
    });
  } catch (err) {
    logger.error('Reset user error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset user permissions' });
  }
});

/**
 * 6. GET /snapshots — List Governance Revision Snapshots
 */
router.get('/snapshots', async (req, res) => {
  try {
    const snapshots = await GovernanceSnapshot.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ success: true, snapshots });
  } catch (err) {
    logger.error('Snapshots error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch snapshots' });
  }
});

/**
 * 7. POST /rollback/:snapshotId — 1-Click Rollback to Snapshot
 */
router.post('/rollback/:snapshotId', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const snapshot = await GovernanceSnapshot.findOne({ _id: snapshotId, tenantId: req.tenantId });

    if (!snapshot) {
      return res.status(404).json({ success: false, error: 'Snapshot not found' });
    }

    const { targetType, targetIdentifier, state } = snapshot;
    const targetState = state.previous || state.current;

    if (!targetState) {
      return res.status(400).json({ success: false, error: 'Snapshot state cannot be reconstructed' });
    }

    if (targetType === 'ROLE') {
      let perm = await Permission.findOne({ tenantId: req.tenantId, role: targetIdentifier });
      if (!perm) perm = new Permission({ tenantId: req.tenantId, role: targetIdentifier });

      if (targetState.moduleAccess) perm.moduleAccess = new Map(Object.entries(targetState.moduleAccess));
      if (Array.isArray(targetState.disabledSections)) perm.disabledSections = targetState.disabledSections;
      if (typeof targetState.maskFinancials === 'boolean') perm.maskFinancials = targetState.maskFinancials;
      if (typeof targetState.disableExport === 'boolean') perm.disableExport = targetState.disableExport;

      perm.updatedBy = req.userId;
      await perm.save();
    } else if (targetType === 'USER') {
      let userPerm = await UserPermission.findOne({ tenantId: req.tenantId, userId: targetIdentifier });
      if (userPerm && targetState) {
        if (targetState.moduleOverrides) userPerm.moduleOverrides = new Map(Object.entries(targetState.moduleOverrides));
        if (targetState.sectionOverrides) userPerm.sectionOverrides = new Map(Object.entries(targetState.sectionOverrides));
        userPerm.appliedPersonaId = targetState.appliedPersonaId || null;
        userPerm.maskFinancials = targetState.maskFinancials ?? null;
        userPerm.disableExport = targetState.disableExport ?? null;
        userPerm.updatedBy = req.userId;
        await userPerm.save();
      }
    }

    // Log rollback action
    await GovernanceSnapshot.create({
      tenantId: req.tenantId,
      snapshotType: 'GOVERNANCE_ROLLBACK',
      targetType,
      targetIdentifier,
      description: `Rolled back to revision from ${snapshot.createdAt.toISOString()}`,
      reason: `Rollback to snapshot ${snapshotId}`,
      state: { rolledBackTo: snapshotId },
      performedBy: req.userId,
      performedByName: req.user ? req.user.name : 'SuperAdmin',
    });

    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('governance:revoked', { tenantId: req.tenantId, message: 'Policy rolled back' }, 'all');
    }

    res.json({
      success: true,
      message: `System successfully rolled back to snapshot from ${snapshot.createdAt.toISOString()}`,
    });
  } catch (err) {
    logger.error('Rollback error:', err);
    res.status(500).json({ success: false, error: 'Failed to rollback governance snapshot' });
  }
});

module.exports = router;
