/**
 * AcuStock Two-Factor Authentication (2FA / TOTP) Route Handlers
 * ─────────────────────────────────────────────────────────────────
 * Enterprise-grade MFA endpoints with AES-256-GCM secret encryption,
 * rate limiting, audit logging, and single-use recovery code support.
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { requireAuth } = require('../middleware/auth');
const {
  generateTotpSecret,
  generateQrCode,
  verifyTotp,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  decryptSecret
} = require('../services/twoFactorService');
const logger = require('../utils/logger');

const router = express.Router();

// ── Helper to log 2FA security audit events ───────────────────
async function log2faEvent(action, user, req, details = {}) {
  try {
    await AuditLog.logEvent({
      action,
      targetUser:     user._id,
      targetUserName: user.name,
      targetUserRole: user.role,
      ipAddress:      req.ip,
      userAgent:      req.get('User-Agent'),
      details:        details.details || undefined,
      severity:       details.severity || 'INFO',
      tenantId:       user.tenantId || undefined
    });
  } catch (err) {
    logger.warn(`[2FA Audit] Failed to write log for ${action}: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. POST /api/auth/2fa/generate — Start 2FA setup (Auth required)
// ═══════════════════════════════════════════════════════════════
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const emailOrIdentifier = user.email || user.phone || user.name;
    const issuer = 'AcuStock';

    const { secret, encryptedSecret, otpauthUrl } = generateTotpSecret(emailOrIdentifier, issuer);
    const qrCodeDataUrl = await generateQrCode(otpauthUrl);

    // Store as PENDING secret — does not enable 2FA until verified
    await User.findByIdAndUpdate(user._id, {
      $set: { twoFactorPendingSecretEncrypted: encryptedSecret }
    });

    await log2faEvent('2FA_SETUP_STARTED', user, req);

    res.json({
      success: true,
      message: '2FA secret generated. Scan the QR code or enter the manual key in your Authenticator app.',
      qrCodeDataUrl,
      manualKey: secret,
      otpauthUrl
    });
  } catch (err) {
    logger.error('[2FA Generate] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate 2FA setup' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 2. POST /api/auth/2fa/enable — Confirm & Activate 2FA
// ═══════════════════════════════════════════════════════════════
router.post('/enable', requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: '6-digit verification code is required' });
    }

    const user = await User.findById(req.userId).select('+twoFactorPendingSecretEncrypted');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.twoFactorPendingSecretEncrypted) {
      return res.status(400).json({
        success: false,
        error: 'No pending 2FA setup found. Please generate a QR code first.'
      });
    }

    const isValid = verifyTotp(code, user.twoFactorPendingSecretEncrypted);
    if (!isValid) {
      await log2faEvent('2FA_ENABLE_FAILED', user, req, { severity: 'WARNING' });
      return res.status(400).json({
        success: false,
        error: 'Invalid 6-digit verification code. Please check your Authenticator app and try again.'
      });
    }

    // Generate 10 single-use backup recovery codes
    const { plainCodes, recoveryCodes } = generateRecoveryCodes(10);

    // Promote pending secret to active secret and enable 2FA
    await User.findByIdAndUpdate(user._id, {
      $set: {
        twoFactorEnabled:                true,
        twoFactorSecretEncrypted:        user.twoFactorPendingSecretEncrypted,
        twoFactorPendingSecretEncrypted: null,
        twoFactorEnabledAt:              new Date(),
        twoFactorRecoveryCodes:          recoveryCodes
      }
    });

    await log2faEvent('2FA_ENABLED', user, req, { severity: 'INFO' });

    res.json({
      success: true,
      message: 'Two-factor authentication has been enabled successfully.',
      recoveryCodes: plainCodes,
      warning: 'Save these recovery codes in a secure location. They will only be displayed ONCE.'
    });
  } catch (err) {
    logger.error('[2FA Enable] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to enable 2FA' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 3. POST /api/auth/2fa/disable — Disable 2FA (Password + OTP)
// ═══════════════════════════════════════════════════════════════
router.post('/disable', requireAuth, async (req, res) => {
  try {
    const { password, code } = req.body || {};
    if (!password || !code) {
      return res.status(400).json({
        success: false,
        error: 'Both your current password and 6-digit verification code are required to disable 2FA'
      });
    }

    const user = await User.findById(req.userId).select('+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA is not currently enabled on this account' });
    }

    // 1. Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, error: 'Incorrect password' });
    }

    // 2. Verify OTP code
    const isTotpValid = verifyTotp(code, user.twoFactorSecretEncrypted);
    let isRecoveryValid = false;

    if (!isTotpValid) {
      const recoveryCheck = verifyAndConsumeRecoveryCode(code, user.twoFactorRecoveryCodes);
      isRecoveryValid = recoveryCheck.isValid;
    }

    if (!isTotpValid && !isRecoveryValid) {
      return res.status(400).json({ success: false, error: 'Invalid verification code or recovery code' });
    }

    // 3. Disable and wipe secrets
    await User.findByIdAndUpdate(user._id, {
      $set: {
        twoFactorEnabled:                false,
        twoFactorSecretEncrypted:        null,
        twoFactorPendingSecretEncrypted: null,
        twoFactorEnabledAt:              null,
        twoFactorRecoveryCodes:          []
      }
    });

    await log2faEvent('2FA_DISABLED', user, req, { severity: 'WARNING' });

    res.json({
      success: true,
      message: 'Two-factor authentication has been disabled on your account.'
    });
  } catch (err) {
    logger.error('[2FA Disable] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to disable 2FA' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 4. GET /api/auth/2fa/status — Check current 2FA status
// ═══════════════════════════════════════════════════════════════
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorRecoveryCodes');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const unusedRecoveryCodes = (user.twoFactorRecoveryCodes || []).filter(c => !c.used).length;

    res.json({
      success: true,
      enabled: Boolean(user.twoFactorEnabled),
      enabledAt: user.twoFactorEnabledAt || null,
      recoveryCodesRemaining: unusedRecoveryCodes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get 2FA status' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 5. POST /api/auth/2fa/recovery-codes/regenerate
// ═══════════════════════════════════════════════════════════════
router.post('/recovery-codes/regenerate', requireAuth, async (req, res) => {
  try {
    const { password, code } = req.body || {};
    if (!password || !code) {
      return res.status(400).json({
        success: false,
        error: 'Current password and 6-digit OTP code are required to regenerate recovery codes'
      });
    }

    const user = await User.findById(req.userId).select('+password +twoFactorSecretEncrypted');
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled on this account' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, error: 'Incorrect password' });
    }

    const isTotpValid = verifyTotp(code, user.twoFactorSecretEncrypted);
    if (!isTotpValid) {
      return res.status(400).json({ success: false, error: 'Invalid 6-digit verification code' });
    }

    const { plainCodes, recoveryCodes } = generateRecoveryCodes(10);
    await User.findByIdAndUpdate(user._id, {
      $set: { twoFactorRecoveryCodes: recoveryCodes }
    });

    await log2faEvent('RECOVERY_CODES_REGENERATED', user, req, { severity: 'INFO' });

    res.json({
      success: true,
      message: 'New recovery codes generated. Previous recovery codes are now invalid.',
      recoveryCodes: plainCodes
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to regenerate recovery codes' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 6. POST /api/auth/2fa/authenticate — Public 2FA Challenge
// ═══════════════════════════════════════════════════════════════
router.post('/authenticate', async (req, res) => {
  try {
    const { tempToken: bodyTempToken, code } = req.body || {};
    const tempToken = req.cookies?.mfaToken || bodyTempToken;
    if (!tempToken || !code) {
      return res.status(400).json({
        success: false,
        error: 'Both temporary MFA token and verification code are required'
      });
    }

    res.clearCookie('mfaToken', { path: '/api/auth/2fa' });

    // 1. Verify temporary MFA token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        error: 'MFA session has expired or is invalid. Please sign in again.',
        code: 'MFA_CHALLENGE_EXPIRED'
      });
    }

    if (decoded.purpose !== 'MFA_AUTHENTICATION' || decoded.mfaPending !== true) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token purpose for 2FA authentication',
        code: 'INVALID_TOKEN_PURPOSE'
      });
    }

    // 2. Load user with encrypted secret & recovery codes
    const user = await User.findById(decoded.userId).select(
      '+password +twoFactorSecretEncrypted +twoFactorRecoveryCodes +failedLoginAttempts +lockUntil'
    );

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'User account not found or inactive' });
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        error: `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
        code: 'ACCOUNT_LOCKED'
      });
    }

    // 3. Check verification code (TOTP or single-use recovery code)
    const isTotp = verifyTotp(code, user.twoFactorSecretEncrypted);
    let isRecovery = false;

    if (!isTotp && user.twoFactorRecoveryCodes && user.twoFactorRecoveryCodes.length > 0) {
      const recoveryResult = verifyAndConsumeRecoveryCode(code, user.twoFactorRecoveryCodes);
      if (recoveryResult.isValid) {
        isRecovery = true;
        // Save consumed recovery code state
        await user.save();
        await log2faEvent('RECOVERY_CODE_USED', user, req, { severity: 'WARNING' });
      }
    }

    if (!isTotp && !isRecovery) {
      await user.incrementLoginAttempts();
      await log2faEvent('2FA_LOGIN_FAILED', user, req, { severity: 'WARNING' });

      return res.status(401).json({
        success: false,
        error: 'Invalid 6-digit verification code or recovery code',
        code: 'INVALID_2FA_CODE'
      });
    }

    // 4. Success: Reset login attempts and issue final tokens
    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    await user.save();

    await log2faEvent('2FA_LOGIN_SUCCESS', user, req, {
      details: isRecovery ? 'Authenticated via single-use backup recovery code' : 'Authenticated via TOTP Authenticator'
    });

    // Generate authenticated JWTs
    const tokenPayload = {
      _id:          user._id,
      id:           user._id,
      userId:       user._id,
      role:         user.role,
      tenantId:     user.tenantId,
      tokenVersion: user.tokenVersion || 0
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(
      { userId: user._id, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Authentication successful',
      token: accessToken,
      user: {
        id:        user._id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role,
        tenantId:  user.tenantId,
        twoFactorEnabled: true
      }
    });
  } catch (err) {
    logger.error('[2FA Authenticate] Error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

module.exports = router;
