const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole, requireTenantId, checkForcePasswordReset } = require('../middleware/auth');
const { validateRequest, schemas } = require('../middleware/validateRequest');
const { sendPasswordResetEmail } = require('../services/email.service');
const { notify } = require('../services/notificationHelper');
const logger = require('../utils/logger');

const router = express.Router();

const AUTH_IDENTIFIER_MAX_LENGTH = 254;

function normalizeAuthPayload(payload = {}) {
  const { identifier, password, role, email, phone, token } = payload;

  const normalized = {
    identifier: typeof identifier === 'string' ? identifier.trim() : identifier,
    password: typeof password === 'string' ? password.trim() : password,
    role: typeof role === 'string' ? role.trim() : role,
    email: typeof email === 'string' ? email.trim().toLowerCase() : email,
    phone: typeof phone === 'string' ? phone.trim() : phone,
    token: typeof token === 'string' ? token.trim() : token
  };

  if (normalized.identifier !== undefined && typeof normalized.identifier !== 'string') {
    throw new Error('Identifier must be a string');
  }

  if (normalized.password !== undefined && typeof normalized.password !== 'string') {
    throw new Error('Password must be a string');
  }

  if (normalized.role !== undefined && typeof normalized.role !== 'string') {
    throw new Error('Role must be a string');
  }

  if (normalized.identifier && normalized.identifier.length > AUTH_IDENTIFIER_MAX_LENGTH) {
    throw new Error('Identifier is too long');
  }

  return normalized;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Helper to create user registration notification
async function notifyUserRegistered(user) {
  try {
    await notify({
      type:       'user_registered',
      title:      'New User Registered',
      message:    `${user.name} joined as ${user.role}`,
      targetRole: 'ADMIN',
      priority:   'LOW',
      link:       'users',
      relatedModel: 'User',
      relatedId:    user._id,
      tenantId:     user.tenantId || undefined,
      metadata: {
        userId:   user._id,
        userName: user.name,
        userRole: user.role
      }
    });
  } catch (error) {
    console.error('Error creating registration notification:', error);
  }
}

// Helper to notify admin of password changes
async function notifyPasswordChange(targetUser, changedBy, changedByUser) {
  try {
    let message = '';
    let title = '';
    let type = 'password_changed';
    
    if (changedBy === 'SELF') {
      title = 'Password Changed';
      message = `${targetUser.name} (${targetUser.role}) changed their own password`;
      type = 'password_changed';
    } else if (changedBy === 'ADMIN' || changedBy === 'MANAGER') {
      title = 'Password Reset by Admin';
      message = `${changedByUser?.name || changedBy} reset password for ${targetUser.name}`;
      type = 'password_reset';
    }
    
    await notify({
      type,
      title,
      message,
      targetRole: 'ADMIN',
      priority:   'MEDIUM',
      link:       'users',
      relatedModel: 'User',
      relatedId:    targetUser._id,
      createdBy:     changedByUser?._id || null,
      createdByRole: changedBy === 'SELF' ? targetUser.role : changedBy,
      tenantId:     targetUser.tenantId || undefined,
      metadata: {
        userId:         targetUser._id,
        userName:       targetUser.name,
        changedBy,
        changedByUserId: changedByUser?._id
      }
    });
  } catch (error) {
    console.error('Error creating password notification:', error);
  }
}

// Function to generate Access JWT (short-lived)
const createAccessToken = (_id, tokenVersion = 0) => {
  return jwt.sign({ _id, tokenVersion, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m'
  });
};

// Function to generate Refresh JWT (long-lived)
const createRefreshToken = (_id, tokenVersion = 0, remember = false) => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  return jwt.sign({ _id, tokenVersion, type: 'refresh' }, secret, {
    expiresIn: remember ? '30d' : '7d'
  });
};

// Legacy compatibility
const createToken = createAccessToken;

// Cookie options for production security
const getCookieOptions = (remember = false, isRefresh = false) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,                          // Prevents XSS - JS cannot access
    secure: isProduction,                    // HTTPS only in production
    sameSite: isProduction ? 'strict' : 'lax', // CSRF protection
    maxAge: isRefresh
      ? (remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
      : (15 * 60 * 1000), // 15 minutes for access token
    path: '/'
  };
};

// Generate secure random token for password reset
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash reset token for storage
const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ============================================================
// LOGIN ROUTE (Production Ready with Security)
// ============================================================

// POST /api/auth/login - User Login
router.post('/login', validateRequest(schemas.login), async (req, res) => {
  try {
    const { identifier, password, role } = normalizeAuthPayload(req.body);

    if (!identifier || !password || !role) {
      return res.status(400).json({ message: 'Identifier, password, and role are required' });
    }

  // Basic email regex for ADMIN/MANAGER, phone regex for USER
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Basic phone regex (digits only, 10-15 characters)
  const phoneRegex = /^\d{10,15}$/;

  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER') {
    if (!emailRegex.test(identifier)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
  } else if (role === 'USER') {
    const isEmail = emailRegex.test(identifier);
    const isPhone = phoneRegex.test(identifier);
    if (!isEmail && !isPhone) {
      return res.status(400).json({ message: 'Identifier must be a valid email or 10-15 digit phone number' });
    }
  } else {
    return res.status(400).json({ message: 'Invalid role specified' });
  }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    let user;
    if (role === 'USER') {
      const isEmail = emailRegex.test(identifier);
      const userQuery = isEmail
        ? { email: identifier.toLowerCase(), role: 'USER' }
        : { phone: identifier, role: 'USER' };
      user = await User.findOne(userQuery).select('+password +failedLoginAttempts +lockUntil');
    } else if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER') {
      user = await User.findOne({ email: identifier.toLowerCase(), role }).select('+password +failedLoginAttempts +lockUntil');
    } else {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    if (!user) {
      await AuditLog.logFailedLogin(identifier, role, 'User not found', req);
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if account is inactive
    if (!user.isActive) {
      await AuditLog.logEvent({
        action: 'LOGIN_BLOCKED_INACTIVE',
        targetUser: user._id,
        targetUserName: user.name,
        targetUserRole: user.role,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'WARNING'
      });
      return res.status(403).json({ 
        message: 'Account is inactive. Please contact your administrator.',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Check if account is temporarily locked due to too many failed login attempts
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      await AuditLog.logEvent({
        action: 'LOGIN_BLOCKED_LOCKED',
        targetUser: user._id,
        targetUserName: user.name,
        targetUserRole: user.role,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'WARNING'
      });
      return res.status(423).json({
        message: `Account is temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        code: 'ACCOUNT_LOCKED',
        minutesLeft
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      await AuditLog.logFailedLogin(identifier, role, 'Invalid password', req);

      // Warn user how many attempts remain before lockout
      const attemptsAfter = (user.failedLoginAttempts || 0) + 1;
      const remaining = Math.max(0, 5 - attemptsAfter);
      const willLock = attemptsAfter >= 5;

      // Notify admin on account lockout (5th failed attempt)
      if (willLock) {
        notify({
          type:       'account_locked',
          title:      'Account Locked',
          message:    `${user.name} (${user.role}) locked after 5 failed login attempts from IP ${req.ip}`,
          targetRole: 'ADMIN',
          priority:   'HIGH',
          link:       'users',
          relatedModel: 'User',
          relatedId:    user._id,
          metadata: { userId: user._id, userName: user.name, ip: req.ip }
        }).catch(() => {});
      }

      return res.status(400).json({ 
        message: willLock
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`,
        code: willLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
        attemptsRemaining: remaining
      });
    }

    // Successful login - reset failed attempts
    await user.resetLoginAttempts();

    // Check if password reset is required
    if (user.forcePasswordReset) {
      await AuditLog.logEvent({
        action: 'LOGIN_BLOCKED_FORCE_RESET',
        targetUser: user._id,
        targetUserName: user.name,
        targetUserRole: user.role,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        severity: 'INFO'
      });
      
      // Generate temporary token for password reset only
      const tempToken = createToken(user._id, user.tokenVersion);
      res.cookie('authToken', tempToken, getCookieOptions(false));
      
      return res.status(200).json({
        message: 'Password reset required. Please change your password.',
        code: 'FORCE_PASSWORD_RESET',
        forcePasswordReset: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        }
      });
    }

    // Check if Two-Factor Authentication (2FA) is enabled
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        {
          userId:     user._id,
          tenantId:   user.tenantId,
          purpose:    'MFA_AUTHENTICATION',
          mfaPending: true
        },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      return res.status(200).json({
        success: true,
        mfaRequired: true,
        tempToken,
        message: 'Two-factor authentication code required',
        user: {
          id:       user._id,
          name:     user.name,
          email:    user.email,
          phone:    user.phone,
          role:     user.role,
          tenantId: user.tenantId
        }
      });
    }

    // Set HTTP-only cookies for production security (Access + Refresh tokens)
    const remember = req.body.remember || false;
    const accessToken = createAccessToken(user._id, user.tokenVersion || 0);
    const refreshToken = createRefreshToken(user._id, user.tokenVersion || 0, remember);

    // Update lastLogin timestamp
    user.lastLogin = Date.now();
    await user.save();

    // Log successful login
    await AuditLog.logSuccessfulLogin(user, req);

    res.cookie('authToken', accessToken, getCookieOptions(remember, false));
    res.cookie('refreshToken', refreshToken, getCookieOptions(remember, true));

    res.json({
      message: 'Login successful',
      token: accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        passwordChangedAt: user.passwordChangedAt
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    const message = error.message || 'Server error';
    const statusCode = message.includes('must be') || message.includes('too long') || message.includes('required') || message.includes('format') ? 400 : 500;
    res.status(statusCode).json({ message });
  }
});

// POST /api/auth/refresh - Refresh access token using refresh token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token missing', code: 'NO_REFRESH_TOKEN' });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    const user = await User.findById(decoded._id || decoded.id).select('_id name email phone role isActive tokenVersion');
    if (!user) {
      return res.status(401).json({ message: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
    }

    if (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ message: 'Session invalidated. Please log in again.', code: 'TOKEN_INVALIDATED' });
    }

    // Issue new access token + rotated refresh token
    const newAccessToken = createAccessToken(user._id, user.tokenVersion || 0);
    const newRefreshToken = createRefreshToken(user._id, user.tokenVersion || 0);

    res.cookie('authToken', newAccessToken, getCookieOptions(false, false));
    res.cookie('refreshToken', newRefreshToken, getCookieOptions(false, true));

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newAccessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ message: 'Server error during token refresh' });
  }
});

// GET /api/auth/me - Get current authenticated user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      lastLogin: user.lastLogin
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/logout - Clear all auth cookies
router.post('/logout', (req, res) => {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/'
  };
  res.clearCookie('authToken', cookieOpts);
  res.clearCookie('token', cookieOpts);
  res.clearCookie('refreshToken', cookieOpts);
  res.clearCookie('csrfToken', cookieOpts);
  // Instruct the browser to clear all site data on logout (cache, cookies, storage)
  res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/register-manager - Admin creates a Manager
router.post('/register-manager', requireAuth, requireTenantId, requireRole(['ADMIN']), async (req, res) => {
  const { name, email, password, forcePasswordReset = true, assignedWarehouseId } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  try {
    const existingUser = await User.findOne({ 
      email: email.toLowerCase(),
      tenantId: req.tenantId
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Manager with this email already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const manager = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'MANAGER',
      assignedWarehouseId: assignedWarehouseId || null,
      createdBy: req.user._id,
      passwordChangedAt: new Date(),
      passwordChangedBy: 'ADMIN',
      forcePasswordReset: forcePasswordReset, // Force password change on first login
      tenantId: req.tenantId
    });

    await manager.save();
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'ACCOUNT_CREATED',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      targetUser: manager._id,
      targetUserName: manager.name,
      targetUserRole: manager.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      tenantId: req.tenantId,
      severity: 'INFO'
    });
    
    // Send notification to admin
    await notifyUserRegistered(manager);

    res.status(201).json({
      message: 'Manager created successfully',
      user: {
        id: manager._id,
        name: manager.name,
        email: manager.email,
        role: manager.role,
      },
    });
  } catch (error) {
    logger.error('Register manager error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/register-user - Admin/Manager creates a User
// Users CANNOT self-register. Only Admin/Manager can create user accounts.
router.post('/register-user', requireAuth, requireTenantId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const { name, phone, email, password, forcePasswordReset = true, assignedWarehouseId } = req.body;

  if (!name || !phone || !password) {
    return res.status(400).json({ message: 'Name, phone, and password are required' });
  }

  const phoneRegex = /^\d{10,15}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ message: 'Invalid phone number format (10-15 digits)' });
  }

  // Validate email if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  try {
    const existingUser = await User.findOne({ 
      phone,
      tenantId: req.tenantId
    });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this phone number already exists' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      phone,
      email: email ? email.toLowerCase() : undefined,
      password: hashedPassword,
      role: 'USER',
      assignedWarehouseId: assignedWarehouseId || null,
      createdBy: req.user._id, // Track who created this user
      passwordChangedAt: new Date(),
      passwordChangedBy: req.user.role, // 'ADMIN' or 'MANAGER'
      forcePasswordReset: forcePasswordReset, // Force password change on first login
      tenantId: req.tenantId
    });

    await user.save();
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'ACCOUNT_CREATED',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      tenantId: req.tenantId,
      severity: 'INFO'
    });
    
    // Send notification to admin
    await notifyUserRegistered(user);
    
    // Emit real-time update for new user
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('user-update', {
        action: 'created',
        userId: user._id,
        userName: user.name,
        userRole: user.role,
        tenantId: req.tenantId,
        createdBy: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error('Register user error:', error);
    res.status(500).json({ message: "Server error" });
  }
});


// POST /api/auth/register - DISABLED (legacy open-registration endpoint)
// Admin accounts are created exclusively via /api/setup (first-run wizard) or by SUPER_ADMIN.
// Leaving this endpoint open allows any unauthenticated caller to create an admin account.
router.post('/register', (req, res) => {
  return res.status(410).json({
    message: 'This endpoint has been disabled. Use the setup wizard (/api/setup) for first-run admin creation, or contact your SUPER_ADMIN.'
  });
});

// GET /api/auth/admin-exists - DISABLED (leaked system state to unauthenticated callers)
// Use GET /api/setup/status instead to check first-run state.
router.get('/admin-exists', (req, res) => {
  return res.status(410).json({
    message: 'This endpoint has been removed. Use /api/setup/status to check setup state.'
  });
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone, department } = req.body;
    const userId = req.user._id;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (department !== undefined) updateData.department = department.trim();

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        department: user.department,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// POST /api/auth/change-password - Change password (SELF)
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // Fetch user with password and forcePasswordReset field
    const user = await User.findById(userId).select('+password +forcePasswordReset');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If forcePasswordReset is true, skip current password verification
    // (admin-created accounts where user doesn't know the initial password)
    const isForceReset = user.forcePasswordReset === true;

    if (!isForceReset) {
      // Normal password change - require current password
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new passwords are required' });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    } else {
      // Force reset - only require new password
      if (!newPassword) {
        return res.status(400).json({ message: 'New password is required' });
      }
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password with audit trail
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    user.passwordChangedBy = 'SELF';
    user.forcePasswordReset = false; // Clear force reset flag
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all sessions
    await user.save();

    // Log audit event
    await AuditLog.logPasswordChange(user, user, 'SELF', req);

    // Notify admin
    await notifyPasswordChange(user, 'SELF', null);

    // Clear cookie to force re-login
    res.clearCookie('authToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });

    res.json({ 
      message: 'Password changed successfully. Please login again.',
      sessionInvalidated: true
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// ============================================================
// FORGOT PASSWORD FLOW
// ============================================================

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier, role } = req.body;
    
    if (!identifier || !role) {
      return res.status(400).json({ message: 'Identifier and role are required' });
    }
    
    let user;
    if (role === 'USER') {
      user = await User.findOne({ phone: identifier, role: 'USER' });
    } else {
      user = await User.findOne({ email: identifier.toLowerCase(), role });
    }
    
    // Always return success to prevent user enumeration
    if (!user) {
      return res.json({ 
        message: 'If an account exists with this identifier, you will receive reset instructions.' 
      });
    }
    
    if (!user.isActive) {
      return res.json({ 
        message: 'If an account exists with this identifier, you will receive reset instructions.' 
      });
    }
    
    // Generate reset token (15 min expiry)
    const resetToken = generateResetToken();
    const hashedToken = hashResetToken(resetToken);
    
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save({ validateModifiedOnly: true });
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'PASSWORD_RESET_REQUESTED',
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'WARNING'
    });
    
    // Notify admin
    await Notification.create({
      type: 'system',
      icon: '🔐',
      title: 'Password Reset Requested',
      message: `${user.name} (${user.role}) requested a password reset`,
      targetRole: 'ADMIN',
      metadata: {
        userId: user._id,
        userName: user.name,
        userRole: user.role
      }
    });
    
    // In production, send email/SMS with reset link
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Password reset token for ${user.email || user.phone}: ${resetToken}`);
      console.log(`[DEV] Reset URL: ${resetUrl}`);
    }

    // Send email for ADMIN / MANAGER (they have email addresses)
    if (user.email && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'MANAGER')) {
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        expiresMinutes: 15
      });
      if (!emailResult.success) {
        logger.warn(`[ForgotPassword] Email delivery failed for ${user.email}: ${emailResult.error}`);
      }
    }
    // For USER role (phone-based): in production you would send an SMS here.
    // Currently: token is visible in DEV logs; add SMS provider integration post-deployment.

    res.json({
      message: 'If an account exists with this identifier, you will receive reset instructions.',
      // DEV ONLY - never expose token in production
      ...(process.env.NODE_ENV !== 'production' && { resetToken, resetUrl })
    });
    
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password/:token - Reset password with token
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { newPassword } = req.body;
    const { token } = req.params;
    
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    // Hash the token to compare with stored hash
    const hashedToken = hashResetToken(token);
    
    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password');
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordChangedAt = new Date();
    user.passwordChangedBy = 'SELF';
    user.forcePasswordReset = false;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all sessions
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    
    // Log audit event
    await AuditLog.logEvent({
      action: 'PASSWORD_RESET_COMPLETED',
      targetUser: user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'INFO'
    });
    
    // Notify admin
    await notifyPasswordChange(user, 'SELF', null);
    
    res.json({ 
      message: 'Password reset successful. Please login with your new password.' 
    });
    
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// POST /api/auth/verify-reset-token - Verify if reset token is valid
router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, message: 'Token is required' });
    }
    
    const hashedToken = hashResetToken(token);
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.json({ valid: false, message: 'Invalid or expired token' });
    }
    
    res.json({ 
      valid: true, 
      userName: user.name,
      userRole: user.role
    });
    
  } catch (error) {
    logger.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, message: 'Failed to verify token' });
  }
});

// ============================================================
// AUDIT LOG ROUTES (Admin only)
// ============================================================

// GET /api/auth/audit-logs - Get password-related audit logs
router.get('/audit-logs', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { action, userId, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    // Filter by specific action types
    if (action) {
      query.action = action;
    } else {
      // Default: show password-related logs
      query.action = { 
        $in: [
          'PASSWORD_CHANGED',
          'PASSWORD_RESET_BY_ADMIN',
          'PASSWORD_RESET_BY_MANAGER',
          'PASSWORD_RESET_REQUESTED',
          'PASSWORD_RESET_COMPLETED',
          'LOGIN_FAILED',
          'LOGIN_BLOCKED_LOCKED',
          'ACCOUNT_LOCKED'
        ]
      };
    }
    
    if (userId) {
      query.targetUser = userId;
    }
    
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();
    
    const total = await AuditLog.countDocuments(query);
    
    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Fetch audit logs error:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

// GET /api/auth/audit-logs/user/:userId - Get audit logs for specific user
router.get('/audit-logs/user/:userId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const logs = await AuditLog.find({ 
      targetUser: req.params.userId 
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    res.json(logs);
    
  } catch (error) {
    logger.error('Fetch user audit logs error:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

module.exports = router;