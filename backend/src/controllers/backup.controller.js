const fs = require('fs');
const backupService = require('../services/backup.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

/**
 * Controller for Enterprise Backup & Disaster Recovery
 */
class BackupController {
  /**
   * POST /api/backups
   * Create a new backup archive
   */
  async createBackup(req, res) {
    try {
      const { type = 'TENANT', description } = req.body;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

      if (type === 'FULL' && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: 'System-wide FULL backups require SUPER_ADMIN privileges'
        });
      }

      const backup = await backupService.createBackup({
        tenantId: req.tenantId,
        initiatedBy: req.user,
        type: isSuperAdmin ? type : 'TENANT',
        description: description || 'Manual backup'
      });

      await logBusinessEvent({
        req,
        action: 'BACKUP_CREATED',
        entityType: 'Backup',
        entityId: backup.id,
        details: {
          type: backup.type,
          fileSize: backup.fileSize,
          totalRecords: backup.totalRecords,
          checksum: backup.checksum
        },
        severity: 'INFO'
      });

      return res.status(201).json({
        success: true,
        message: 'Backup created successfully',
        backup
      });
    } catch (err) {
      logger.error('Error creating backup:', err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Failed to create backup'
      });
    }
  }

  /**
   * GET /api/backups
   * List all available backups for the tenant (or all for SUPER_ADMIN)
   */
  async listBackups(req, res) {
    try {
      const backups = backupService.listBackups({
        tenantId: req.tenantId,
        userRole: req.user?.role
      });

      return res.status(200).json({
        success: true,
        count: backups.length,
        backups
      });
    } catch (err) {
      logger.error('Error listing backups:', err);
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve backups catalog'
      });
    }
  }

  /**
   * GET /api/backups/:id
   * Get metadata details for a specific backup
   */
  async getBackupDetails(req, res) {
    try {
      const backup = backupService.getBackupById(req.params.id, {
        tenantId: req.tenantId,
        userRole: req.user?.role
      });

      return res.status(200).json({
        success: true,
        backup
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Failed to retrieve backup details'
      });
    }
  }

  /**
   * GET /api/backups/:id/download
   * Secure streaming download of backup archive
   */
  async downloadBackup(req, res) {
    try {
      const { fullPath, entry } = backupService.getBackupFilePath(req.params.id, {
        tenantId: req.tenantId,
        userRole: req.user?.role
      });

      await logBusinessEvent({
        req,
        action: 'BACKUP_DOWNLOADED',
        entityType: 'Backup',
        entityId: entry.id,
        details: { filename: entry.filename, size: entry.fileSize },
        severity: 'WARN'
      });

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
      res.setHeader('Content-Length', entry.fileSize);

      const fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(res);
    } catch (err) {
      logger.error('Error downloading backup:', err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Failed to stream backup archive'
      });
    }
  }

  /**
   * POST /api/backups/:id/restore
   * Restore database from backup archive
   */
  async restoreBackup(req, res) {
    try {
      const { dropExisting = false, targetTenantId } = req.body;
      const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

      // Tenant isolation: regular admins can ONLY restore to their own tenant
      const effectiveTenantId = isSuperAdmin && targetTenantId ? targetTenantId : req.tenantId;

      const result = await backupService.restoreBackup(req.params.id, {
        targetTenantId: effectiveTenantId,
        dropExisting: Boolean(dropExisting),
        user: req.user
      });

      await logBusinessEvent({
        req,
        action: 'BACKUP_RESTORED',
        entityType: 'Backup',
        entityId: req.params.id,
        details: {
          targetTenantId: effectiveTenantId,
          totalRestored: result.totalRestored,
          dropExisting
        },
        severity: 'CRITICAL'
      });

      return res.status(200).json({
        success: true,
        message: 'Backup restored successfully',
        result
      });
    } catch (err) {
      logger.error('Error restoring backup:', err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Failed to restore backup archive'
      });
    }
  }

  /**
   * DELETE /api/backups/:id
   * Delete a backup archive and catalog record
   */
  async deleteBackup(req, res) {
    try {
      const result = backupService.deleteBackup(req.params.id, {
        tenantId: req.tenantId,
        userRole: req.user?.role
      });

      await logBusinessEvent({
        req,
        action: 'BACKUP_DELETED',
        entityType: 'Backup',
        entityId: req.params.id,
        severity: 'WARN'
      });

      return res.status(200).json({
        success: true,
        message: 'Backup deleted successfully',
        result
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Failed to delete backup'
      });
    }
  }

  /**
   * POST /api/backups/prune
   * Prune aged backups based on retention policy
   */
  async pruneBackups(req, res) {
    try {
      const { retentionDays = 30 } = req.body;
      const days = Math.max(1, parseInt(retentionDays, 10) || 30);

      const result = backupService.pruneBackups({
        retentionDays: days,
        tenantId: req.user?.role === 'SUPER_ADMIN' ? null : req.tenantId
      });

      await logBusinessEvent({
        req,
        action: 'BACKUP_PRUNED',
        entityType: 'Backup',
        details: { retentionDays: days, prunedCount: result.prunedCount },
        severity: 'INFO'
      });

      return res.status(200).json({
        success: true,
        message: `Pruning completed. Removed ${result.prunedCount} backups.`,
        result
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to prune backups'
      });
    }
  }
}

module.exports = new BackupController();
