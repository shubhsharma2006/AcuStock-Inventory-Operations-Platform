/**
 * AcuStock — Invite Routes
 *
 * POST   /api/invites           — Send an invite (ADMIN/SUPER_ADMIN only)
 * GET    /api/invites           — List all pending invites (ADMIN/SUPER_ADMIN)
 * GET    /api/invites/verify/:token — Verify token (public, used by accept page)
 * POST   /api/invites/accept    — Accept invite + create account (public)
 * DELETE /api/invites/:id       — Revoke a pending invite (ADMIN/SUPER_ADMIN)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const Invite  = require('../models/Invite');
const User    = require('../models/User');
const AuditLog = require('../models/AuditLog');
const bcrypt  = require('bcryptjs');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const { sendInviteEmail }          = require('../services/email.service');
const logger  = require('../utils/logger');
const checkPlanLimits = require('../middleware/checkPlanLimits');
const { validatePasswordStrength } = require('../utils/passwordValidator');

// Helper: Token generation & cookies for instant onboarding sign-in
const createAccessToken = (_id, tokenVersion = 0) => {
  return jwt.sign({ _id, tokenVersion, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m'
  });
};

const createRefreshToken = (_id, tokenVersion = 0, remember = false) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign({ _id, tokenVersion, type: 'refresh' }, secret, {
    expiresIn: remember ? '30d' : '7d'
  });
};

const getCookieOptions = (remember = false, isRefresh = false) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: isRefresh
      ? (remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
      : (15 * 60 * 1000),
    path: '/'
  };
};

// ─────────────────────────────────────────────────────────────
// Helper: build the full invite URL targeting the Next.js app
// ─────────────────────────────────────────────────────────────
function buildInviteUrl(req, rawToken) {
  const envBase = (process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
  return `${envBase}/accept-invite/${rawToken}`;
}

// ─────────────────────────────────────────────────────────────
// POST /api/invites — Send invite
// Only SUPER_ADMIN or ADMIN can send invites.
// ADMIN cannot invite another ADMIN (only SUPER_ADMIN can).
// ─────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireTenantId, requireRole(['SUPER_ADMIN', 'ADMIN']), checkPlanLimits('maxUsers'), async (req, res) => {
  try {
    const { email, role } = req.body;
    const senderRole = req.userRole;

    // Validate inputs
    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required' });
    }

    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    const allowedRoles = ['ADMIN', 'MANAGER', 'USER'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be ADMIN, MANAGER, or USER' });
    }

    // ADMIN can only invite MANAGER or USER — not another ADMIN
    if (senderRole === 'ADMIN' && role === 'ADMIN') {
      return res.status(403).json({ message: 'Admins cannot invite other Admins. Only the Super Admin can do that.' });
    }

    // Check if a user with this email already exists in this tenant
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(), 
      isDeleted: { $ne: true },
      tenantId: req.tenantId
    });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists in the system.' });
    }

    // Check if there's already a pending invite for this email in this tenant
    const existingInvite = await Invite.findOne({ 
      email: email.toLowerCase(), 
      status: 'pending',
      tenantId: req.tenantId
    });
    if (existingInvite) {
      return res.status(409).json({ message: 'A pending invite already exists for this email. Revoke it first to resend.' });
    }

    // Generate secure token
    const { rawToken, tokenHash } = Invite.generateToken();

    // Create invite record
    const invite = await Invite.create({
      email:     email.toLowerCase(),
      role,
      tokenHash,
      invitedBy: req.userId,
      tenantId:  req.tenantId
    });

    // Build invite URL and send email
    const inviteUrl = buildInviteUrl(req, rawToken);
    const sender    = await User.findOne({ _id: req.userId, tenantId: req.tenantId }).select('name');
    const senderName = sender ? sender.name : 'AcuStock Admin';

    const emailResult = await sendInviteEmail({
      to:        email,
      invitedBy: senderName,
      role,
      inviteUrl
    });

    logger.info(`Invite sent to ${email} (role: ${role}) by ${senderName} [${req.userId}]`);

    res.status(201).json({
      success:       true,
      message:       emailResult.success
        ? `Invite sent to ${email}`
        : `Invite created but email delivery failed. Share the link manually.`,
      inviteId:      invite._id,
      emailDelivered: emailResult.success,
      // Expose link if delivery failed or in dev mode for easy sharing / tests
      inviteUrl:     (!emailResult.success || process.env.NODE_ENV !== 'production') ? inviteUrl : undefined,
      expiresAt:     invite.expiresAt
    });
  } catch (err) {
    logger.error('Error sending invite:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/invites — List pending invites
// ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireTenantId, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const invites = await Invite.find({ 
      status: 'pending',
      tenantId: req.tenantId
    })
      .populate('invitedBy', 'name email role')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      invites
    });
  } catch (err) {
    logger.error('Error fetching invites:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/invites/verify/:token — Verify token (PUBLIC)
// Called by the accept-invite page on load to show name/role.
// ─────────────────────────────────────────────────────────────
router.get('/verify/:token', async (req, res) => {
  try {
    const tokenHash = Invite.hashToken(req.params.token);
    const invite    = await Invite.findOne({ tokenHash }).select('+tokenHash').populate('invitedBy', 'name email');

    if (!invite) {
      return res.status(404).json({ valid: false, message: 'This invite link is invalid or has already been used.' });
    }

    if (invite.status !== 'pending') {
      return res.status(410).json({ valid: false, message: `This invite has already been ${invite.status}.` });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ valid: false, message: 'This invite link has expired. Ask your administrator for a new one.' });
    }

    res.json({
      valid:     true,
      email:     invite.email,
      role:      invite.role,
      invitedBy: invite.invitedBy ? invite.invitedBy.name : 'AcuStock Admin',
      expiresAt: invite.expiresAt,
      tenantId:  invite.tenantId
    });
  } catch (err) {
    logger.error('Error verifying invite:', err);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/invites/accept — Accept invite + create account (PUBLIC)
// ─────────────────────────────────────────────────────────────
router.post('/accept', async (req, res) => {
  try {
    const { token, name, phone, password, confirmPassword } = req.body;

    if (!token || !name || !password) {
      return res.status(400).json({ message: 'Token, name, and password are required.' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters.' });
    }

    const trimmedPhone = phone ? phone.trim() : undefined;

    // Enterprise Password Strength Validation
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      return res.status(400).json({ message: strengthError });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    // Find invite by token hash
    const tokenHash = Invite.hashToken(token);
    const invite    = await Invite.findOne({ tokenHash }).select('+tokenHash');

    if (!invite) {
      return res.status(404).json({ message: 'This invite link is invalid or has already been used.' });
    }

    if (invite.status !== 'pending') {
      return res.status(410).json({ message: `This invite has already been ${invite.status}.` });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This invite link has expired. Ask your administrator for a new one.' });
    }

    // Role-specific operational requirement: Phone is mandatory for USER roles
    if (invite.role === 'USER' && !trimmedPhone) {
      return res.status(400).json({ message: 'Phone number is required for User accounts.' });
    }

    // Double-check no user with that email was created in the meantime
    const existing = await User.findOne({ 
      email: invite.email, 
      isDeleted: { $ne: true },
      tenantId: invite.tenantId
    });
    if (existing) {
      await Invite.findByIdAndUpdate(invite._id, { status: 'accepted' });
      return res.status(409).json({ message: 'An account with this email already exists. Please log in.' });
    }

    // Hash password with bcrypt salt 12
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the user inheriting invite.tenantId
    const user = await User.create({
      name:               trimmedName,
      email:              invite.email,
      phone:              trimmedPhone,
      password:           hashedPassword,
      role:               invite.role,
      isSuperAdmin:       false,
      isActive:           true,
      isEmailVerified:    true,
      createdBy:          invite.invitedBy,
      tenantId:           invite.tenantId,
      forcePasswordReset: false,
      tokenVersion:       0
    });

    // Mark invite as accepted
    await Invite.findByIdAndUpdate(invite._id, { status: 'accepted' });

    // Generate authenticated session (JWT Access + Refresh tokens)
    const accessToken = createAccessToken(user._id, user.tokenVersion || 0);
    const refreshToken = createRefreshToken(user._id, user.tokenVersion || 0, false);

    res.cookie('authToken', accessToken, getCookieOptions(false, false));
    res.cookie('refreshToken', refreshToken, getCookieOptions(false, true));

    // Audit Log
    await AuditLog.logEvent({
      action: 'ACCOUNT_CREATED',
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      tenantId: user.tenantId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'INFO',
      metadata: { method: 'INVITATION_ACCEPTANCE', inviteId: invite._id }
    });

    logger.info(`Invite accepted: ${invite.email} created as ${invite.role} [${user._id}]`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to AcuStock.',
      token: accessToken,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
        role:  user.role,
        tenantId: user.tenantId
      }
    });
  } catch (err) {
    logger.error('Error accepting invite:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/invites/:id — Revoke a pending invite
// ─────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireTenantId, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const invite = await Invite.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found.' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ message: `Cannot revoke an invite that is already ${invite.status}.` });
    }

    // ADMIN can only revoke invites they sent
    if (req.userRole === 'ADMIN' && invite.invitedBy?.toString() !== req.userId?.toString()) {
      return res.status(403).json({ message: 'You can only revoke invites you sent.' });
    }

    await Invite.findByIdAndUpdate(invite._id, { status: 'revoked' });

    logger.info(`Invite ${invite._id} to ${invite.email} revoked by ${req.userId}`);

    res.json({ message: 'Invite revoked successfully.' });
  } catch (err) {
    logger.error('Error revoking invite:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/invites/:id/resend — Resend a pending invite email
// ─────────────────────────────────────────────────────────────
router.post('/:id/resend', requireAuth, requireTenantId, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const invite = await Invite.findOne({ 
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('invitedBy', 'name');

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found.' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ message: `Cannot resend an invite that is ${invite.status}.` });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This invite has expired. Delete it and send a new one.' });
    }

    // Generate a fresh token (more secure than reusing old one)
    const { rawToken, tokenHash } = Invite.generateToken();
    const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await Invite.findByIdAndUpdate(invite._id, { tokenHash, expiresAt: newExpiry });

    const inviteUrl  = buildInviteUrl(req, rawToken);
    const senderName = invite.invitedBy ? invite.invitedBy.name : 'AcuStock Admin';

    const emailResult = await sendInviteEmail({
      to:        invite.email,
      invitedBy: senderName,
      role:      invite.role,
      inviteUrl
    });

    res.json({
      message:        emailResult.success ? 'Invite resent successfully.' : 'Could not deliver email. Share the link manually.',
      emailDelivered: emailResult.success,
      inviteUrl:      emailResult.success ? undefined : inviteUrl,
      expiresAt:      newExpiry
    });
  } catch (err) {
    logger.error('Error resending invite:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
