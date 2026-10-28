const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');

// All backup routes require authentication, tenant scoping, and ADMIN/SUPER_ADMIN role
router.use(requireAuth);
router.use(requireTenantId);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// List backups
router.get('/', (req, res) => backupController.listBackups(req, res));

// Prune old backups (must be declared before /:id)
router.post('/prune', (req, res) => backupController.pruneBackups(req, res));

// Create backup
router.post('/', (req, res) => backupController.createBackup(req, res));

// Get backup details
router.get('/:id', (req, res) => backupController.getBackupDetails(req, res));

// Download backup archive
router.get('/:id/download', (req, res) => backupController.downloadBackup(req, res));

// Restore backup
router.post('/:id/restore', (req, res) => backupController.restoreBackup(req, res));

// Delete backup
router.delete('/:id', (req, res) => backupController.deleteBackup(req, res));

module.exports = router;
