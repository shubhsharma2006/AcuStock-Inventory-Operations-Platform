const express = require('express');
const User = require('../models/User');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();
router.use(requireTenantId);

/**
 * POST /api/sessions/revoke-all
 * Increments tokenVersion, invalidating ALL existing JWTs for this user.
 */
router.post('/revoke-all', requireAuth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.userId },
      { $inc: { tokenVersion: 1 } }
    );

    await logBusinessEvent({
      action: 'REVOKE_ALL_SESSIONS',
      performedBy: req.userId,
      tenantId: req.tenantId,
      details: { reason: 'User initiated revoke-all-devices' }
    });

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

    res.json({ success: true, message: 'All sessions revoked. Please log in again.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to revoke sessions' });
  }
});

module.exports = router;
