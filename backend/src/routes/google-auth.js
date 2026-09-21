/**
 * Google OAuth 2.0 Authentication Routes
 * ─────────────────────────────────────────────────────────────
 * ENV-GATED: Only active when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 * 
 * Flow:
 *   1. Frontend opens /api/auth/google?role=ADMIN (or MANAGER/USER)
 *   2. Backend redirects to Google consent screen
 *   3. Google redirects back to /api/auth/google/callback
 *   4. Backend exchanges code → tokens → user info
 *   5. Finds or creates user, sets JWT cookie, redirects to dashboard
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const User     = require('../models/User');
const logger   = require('../utils/logger');

const router = express.Router();

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5001/api/auth/google/callback';
const FRONTEND_URL         = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
const JWT_SECRET           = process.env.JWT_SECRET;
const JWT_EXPIRE           = process.env.JWT_EXPIRE || '7d';
const IS_PRODUCTION        = process.env.NODE_ENV === 'production';

const oauthStateCookieOptions = {
  httpOnly: true,
  secure:   IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'lax' : 'lax',
  maxAge:   10 * 60 * 1000,
  path:     '/api/auth/google'
};

// Guard: disable all routes if credentials are missing
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  router.get('/google',          (req, res) => res.status(501).json({ message: 'Google OAuth not configured' }));
  router.get('/google/callback', (req, res) => res.status(501).json({ message: 'Google OAuth not configured' }));
  module.exports = router;
  return;
}

// ── Step 1: Redirect to Google consent screen ────────────────────────────────
router.get('/google', (req, res) => {
  // Store role preference in state param so we can use it after callback
  const role = ['USER', 'MANAGER', 'ADMIN'].includes(String(req.query.role).toUpperCase())
    ? String(req.query.role).toUpperCase()
    : 'USER';
  const state = Buffer.from(JSON.stringify({ role, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');

  res.cookie('googleOAuthState', state, oauthStateCookieOptions);

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── Step 2: Handle Google callback ───────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.warn('Google OAuth denied:', oauthError);
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_denied`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/login?error=missing_params`);
    }

    const storedState = req.cookies?.googleOAuthState;
    res.clearCookie('googleOAuthState', oauthStateCookieOptions);
    if (!storedState || storedState.length !== state.length ||
        !crypto.timingSafeEqual(Buffer.from(storedState), Buffer.from(state))) {
      logger.warn('Google OAuth state validation failed');
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
    }

    // Parse state to get role preference
    let preferredRole = 'USER';
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      preferredRole = decoded.role || 'USER';
    } catch { /* ignore malformed state */ }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_CALLBACK_URL,
        grant_type:    'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      logger.error('Google token exchange failed:', errBody);
      return res.redirect(`${FRONTEND_URL}/login?error=token_exchange`);
    }

    const tokens = await tokenResponse.json();

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=userinfo_failed`);
    }

    const googleUser = await userInfoResponse.json();
    // googleUser: { id, email, name, picture, verified_email }

    if (!googleUser.email) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Find or create user
    let user = await User.findOne({ email: googleUser.email.toLowerCase() });

    if (user) {
      // Existing user — update Google profile if needed
      if (!user.googleId) {
        user.googleId = googleUser.id;
      }
      if (!user.profilePicture && googleUser.picture) {
        user.profilePicture = googleUser.picture;
      }
      if (!user.isActive) {
        return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`);
      }
      await user.save({ validateModifiedOnly: true });
    } else {
      // New user via Google OAuth — create Tenant and user
      const safeRole = ['USER', 'MANAGER'].includes(preferredRole) ? preferredRole : 'ADMIN';
      const Tenant = require('../models/Tenant');

      const tenant = await Tenant.create({
        name: `${googleUser.name || googleUser.email.split('@')[0]}'s Organization`,
        slug: `tenant-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        status: 'TRIALING',
        plan: 'free'
      });

      user = await User.create({
        name:             googleUser.name || googleUser.email.split('@')[0],
        email:            googleUser.email.toLowerCase(),
        googleId:         googleUser.id,
        profilePicture:   googleUser.picture || undefined,
        role:             safeRole,
        authProvider:     'google',
        isActive:         true,
        tenantId:         tenant._id,
        password:         crypto.randomBytes(32).toString('hex'), // Random password (user uses OAuth)
        passwordChangedBy: 'GOOGLE_OAUTH',
      });

      tenant.ownerId = user._id;
      await tenant.save();

      logger.info(`✅ New user created via Google OAuth: ${user.email} (${safeRole}) under tenant ${tenant._id}`);
    }

    // Reuse the password-login MFA challenge instead of issuing a session directly.
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        {
          userId:   user._id,
          tenantId: user.tenantId,
          purpose:  'MFA_AUTHENTICATION',
          mfaPending: true
        },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      res.cookie('mfaToken', tempToken, {
        ...oauthStateCookieOptions,
        path: '/api/auth/2fa',
        maxAge: 5 * 60 * 1000
      });
      return res.redirect(`${FRONTEND_URL}/login?mfa=required`);
    }

    // Generate JWTs (both Access token and Refresh token)
    const tokenPayload = {
      _id:          user._id,
      id:           user._id,
      role:         user.role,
      tokenVersion: user.tokenVersion || 0,
      type:         'access'
    };

    const accessToken = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '15m'
    });

    const refreshSecret = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
    const refreshToken = jwt.sign(
      { _id: user._id, id: user._id, tokenVersion: user.tokenVersion || 0, type: 'refresh' },
      refreshSecret,
      { expiresIn: '7d' }
    );

    const cookieOpts = {
      httpOnly: true,
      secure:   IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'strict' : 'lax',
      path:     '/'
    };

    // Set primary authToken cookie and backward-compatible token cookie
    res.cookie('authToken', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.cookie('token', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Generate CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false,
      secure:   IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'strict' : 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
      path:     '/',
    });

    // Redirect to appropriate dashboard
    const roleHome = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'
      ? '/dashboard/admin'
      : user.role === 'MANAGER'
        ? '/dashboard/manager'
        : '/dashboard/user';

    res.redirect(`${FRONTEND_URL}${roleHome}`);

  } catch (err) {
    logger.error('Google OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=server_error`);
  }
});

module.exports = router;
