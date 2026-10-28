const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

class ApiKeyController {
  /**
   * POST /api/v1/api-keys
   * Generates a new developer API key
   */
  async createApiKey(req, res) {
    try {
      const { name, role = 'MANAGER', scopes = [], expiresDays } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Name is required for API key' });
      }

      // Generate cryptographically secure token
      const randomSecret = crypto.randomBytes(24).toString('hex');
      const rawApiKey = `acu_live_${randomSecret}`;
      const keyPrefix = rawApiKey.substring(0, 15) + '...';
      const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');

      let expiresAt = null;
      if (expiresDays && parseInt(expiresDays, 10) > 0) {
        expiresAt = new Date(Date.now() + parseInt(expiresDays, 10) * 24 * 60 * 60 * 1000);
      }

      const apiKey = await ApiKey.create({
        name: name.trim(),
        keyPrefix,
        keyHash,
        tenantId: req.tenantId,
        createdBy: req.user._id,
        role: ['ADMIN', 'MANAGER', 'USER'].includes(role) ? role : 'MANAGER',
        scopes: Array.isArray(scopes) ? scopes : ['read:stock', 'read:items', 'read:orders'],
        expiresAt
      });

      // Audit log
      logBusinessEvent({
        req,
        action: 'API_KEY_CREATED',
        entityType: 'ApiKey',
        entityId: apiKey._id,
        changes: {
          after: {
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            role: apiKey.role,
            scopes: apiKey.scopes
          },
          summary: `Created API key ${apiKey.name} (${apiKey.keyPrefix})`
        }
      }).catch(err => logger.error('Audit log error:', err));

      return res.status(201).json({
        success: true,
        message: 'API key generated successfully. Save this secret key now as you will not be able to view it again!',
        apiKey: rawApiKey,
        keyDetails: {
          id: apiKey._id,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          role: apiKey.role,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating API key:', error);
      return res.status(500).json({ success: false, error: 'Internal server error creating API key' });
    }
  }

  /**
   * GET /api/v1/api-keys
   * Lists all API keys for tenant (masked)
   */
  async listApiKeys(req, res) {
    try {
      const keys = await ApiKey.find({ tenantId: req.tenantId })
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .select('-keyHash')
        .lean();

      return res.json({
        success: true,
        keys: keys.map(k => ({
          id: k._id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          role: k.role,
          scopes: k.scopes,
          expiresAt: k.expiresAt,
          lastUsedAt: k.lastUsedAt,
          lastUsedIp: k.lastUsedIp,
          isActive: k.isActive,
          createdBy: k.createdBy,
          createdAt: k.createdAt
        }))
      });
    } catch (error) {
      logger.error('Error listing API keys:', error);
      return res.status(500).json({ success: false, error: 'Internal server error listing API keys' });
    }
  }

  /**
   * POST /api/v1/api-keys/:id/revoke
   * Revokes an API key
   */
  async revokeApiKey(req, res) {
    try {
      const { id } = req.params;
      const key = await ApiKey.findOne({ _id: id, tenantId: req.tenantId });

      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      key.isActive = false;
      await key.save();

      logBusinessEvent({
        req,
        action: 'API_KEY_REVOKED',
        entityType: 'ApiKey',
        entityId: key._id,
        changes: {
          summary: `Revoked API key ${key.name} (${key.keyPrefix})`
        }
      }).catch(err => logger.error('Audit log error:', err));

      return res.json({
        success: true,
        message: 'API key revoked successfully'
      });
    } catch (error) {
      logger.error('Error revoking API key:', error);
      return res.status(500).json({ success: false, error: 'Internal server error revoking API key' });
    }
  }

  /**
   * DELETE /api/v1/api-keys/:id
   * Hard deletes an API key
   */
  async deleteApiKey(req, res) {
    try {
      const { id } = req.params;
      const key = await ApiKey.findOneAndDelete({ _id: id, tenantId: req.tenantId });

      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      logBusinessEvent({
        req,
        action: 'API_KEY_DELETED',
        entityType: 'ApiKey',
        entityId: id,
        changes: {
          summary: `Deleted API key ${key.name} (${key.keyPrefix})`
        }
      }).catch(err => logger.error('Audit log error:', err));

      return res.json({
        success: true,
        message: 'API key deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting API key:', error);
      return res.status(500).json({ success: false, error: 'Internal server error deleting API key' });
    }
  }
}

module.exports = new ApiKeyController();
