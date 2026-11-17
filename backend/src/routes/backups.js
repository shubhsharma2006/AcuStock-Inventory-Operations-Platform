const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const s3BackupService = require('../services/s3Backup.service');
const { requireAuth, requireRole, requireTenantId } = require('../middleware/auth');

// All backup routes require authentication, tenant scoping, and ADMIN/SUPER_ADMIN role
router.use(requireAuth);
router.use(requireTenantId);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// Cloud backups inspection & sync (declared before /:id)
router.get('/cloud', async (req, res) => {
  const isConfigured = s3BackupService.isConfigured();
  const backups = await s3BackupService.listCloudBackups();
  res.json({
    success: true,
    configured: isConfigured,
    bucket: process.env.S3_BACKUP_BUCKET || process.env.AWS_S3_BUCKET || null,
    backups
  });
});

router.post('/sync-cloud', async (req, res) => {
  try {
    const result = await s3BackupService.syncLatestBackup();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
