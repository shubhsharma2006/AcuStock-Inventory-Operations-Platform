const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');

// All API key management routes require authenticated ADMIN or SUPER_ADMIN
router.use(requireAuth);
router.use(requireTenantId);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// List API keys
router.get('/', (req, res) => apiKeyController.listApiKeys(req, res));

// Generate new API key
router.post('/', (req, res) => apiKeyController.createApiKey(req, res));

// Revoke API key
router.post('/:id/revoke', (req, res) => apiKeyController.revokeApiKey(req, res));

// Delete API key
router.delete('/:id', (req, res) => apiKeyController.deleteApiKey(req, res));

module.exports = router;
