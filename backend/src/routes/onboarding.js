/**
 * Onboarding Status API
 * GET /api/onboarding/status — returns whether admin needs to complete onboarding
 * POST /api/onboarding/complete — mark onboarding as done
 */

const express = require('express');
const Item    = require('../models/Item');
const User    = require('../models/User');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();

router.use(requireTenantId);

// GET /api/onboarding/status
router.get('/status', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [itemCount, userCount] = await Promise.all([
      Item.countDocuments({ createdBy: req.userId, tenantId: req.tenantId }),
      User.countDocuments({
        createdBy: req.userId,
        isDeleted: { $ne: true },
        role: { $in: ['MANAGER', 'USER'] },
        tenantId: req.tenantId
      })
    ]);

    // Determine which steps are complete
    const steps = {
      organizationSetup: true,  // always done once logged in
      firstProduct:     itemCount > 0,
      inviteTeam:       userCount > 0,
    };

    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps     = Object.keys(steps).length;
    const isComplete     = completedCount === totalSteps;

    // Onboarding needed if no items AND no team members yet
    const needsOnboarding = itemCount === 0 && userCount === 0;

    res.json({
      success:        true,
      needsOnboarding,
      isComplete,
      progress:       Math.round((completedCount / totalSteps) * 100),
      steps,
      counts: { items: itemCount, teamMembers: userCount }
    });
  } catch (err) {
    logger.error('Onboarding status error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch onboarding status' });
  }
});

module.exports = router;
