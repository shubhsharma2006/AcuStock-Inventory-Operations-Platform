const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const { logBusinessEvent } = require('../utils/auditHelper');

// Helper for cookie options
const getCookieOptions = (remember = false, isRefresh = false) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: isRefresh
      ? (remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)
      : 15 * 60 * 1000
  };
};

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

class AuthController {
  /**
   * GET /api/auth/me
   * Retrieve current authenticated user profile
   */
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id)
        .populate('tenantId', 'name slug status plan settings')
        .populate('assignedWarehouseId', 'name code')
        .lean();

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      delete user.password;
      delete user.twoFactorSecret;
      delete user.backupCodes;

      return res.json({
        success: true,
        user
      });
    } catch (error) {
      logger.error('Error in AuthController.getMe:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * POST /api/auth/logout
   * Secure session termination with Clear-Site-Data
   */
  async logout(req, res) {
    try {
      if (req.user) {
        await logBusinessEvent({
          req,
          action: 'USER_LOGOUT',
          entityType: 'User',
          entityId: req.user._id,
          severity: 'INFO'
        });
      }

      const cookieClearOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
      };

      res.clearCookie('authToken', cookieClearOptions);
      res.clearCookie('refreshToken', cookieClearOptions);
      res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');

      return res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Error in AuthController.logout:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * POST /api/auth/refresh
   * Refresh access token using HTTP-only refresh token cookie or header
   */
  async refreshToken(req, res) {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!token) {
        return res.status(401).json({ success: false, error: 'Refresh token required' });
      }

      const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      }

      const user = await User.findById(decoded._id).select('+tokenVersion');
      if (!user || !user.isActive) {
        return res.status(401).json({ success: false, error: 'User not found or inactive' });
      }

      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({ success: false, error: 'Session has been invalidated. Please log in again.' });
      }

      const newAccessToken = createAccessToken(user._id, user.tokenVersion || 0);
      res.cookie('authToken', newAccessToken, getCookieOptions(false, false));

      return res.json({
        success: true,
        accessToken: newAccessToken
      });
    } catch (error) {
      logger.error('Error in AuthController.refreshToken:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}

module.exports = new AuthController();
