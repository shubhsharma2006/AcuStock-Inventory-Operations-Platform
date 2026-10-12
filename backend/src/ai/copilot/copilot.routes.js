/**
 * AcuStock AI Copilot Routes
 */

const express = require('express');
const router = express.Router();
const copilotController = require('./copilot.controller');
const { requireAuth, requireTenantId } = require('../../middleware/auth');
const checkPlanLimits = require('../../middleware/checkPlanLimits');

// Protected routes: require authenticated session with valid tenant and plan limits
router.post('/chat', requireAuth, requireTenantId, checkPlanLimits('maxAiQueries'), copilotController.chat);
router.get('/suggestions', requireAuth, requireTenantId, copilotController.getSuggestions);

module.exports = router;
