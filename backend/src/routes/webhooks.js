const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');

// All webhook management routes require ADMIN or SUPER_ADMIN role
router.use(requireAuth);
router.use(requireTenantId);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// List subscriptions
router.get('/', (req, res) => webhookController.listSubscriptions(req, res));

// Register subscription
router.post('/', (req, res) => webhookController.createSubscription(req, res));

// Get subscription details with recent deliveries
router.get('/:id', (req, res) => webhookController.getSubscriptionDetails(req, res));

// Send test ping to verify endpoint
router.post('/:id/ping', (req, res) => webhookController.testPing(req, res));

// Get delivery logs with pagination
router.get('/:id/deliveries', (req, res) => webhookController.getDeliveryLogs(req, res));

// Delete subscription
router.delete('/:id', (req, res) => webhookController.deleteSubscription(req, res));

module.exports = router;
