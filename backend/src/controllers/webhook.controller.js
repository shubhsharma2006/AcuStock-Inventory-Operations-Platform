const crypto = require('crypto');
const WebhookSubscription = require('../models/WebhookSubscription');
const WebhookDeliveryLog = require('../models/WebhookDeliveryLog');
const webhookDispatcher = require('../services/webhookDispatcher.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

class WebhookController {
  /**
   * POST /api/v1/webhooks
   * Register a new webhook subscription
   */
  async createSubscription(req, res) {
    try {
      const { name, url, events = [] } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ success: false, error: 'Webhook name is required' });
      }

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'Valid URL is required' });
      }

      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ success: false, error: 'URL must use http or https' });
        }
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid webhook URL' });
      }

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one event must be selected' });
      }

      // Generate cryptographically secure signing secret
      const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;

      const subscription = await WebhookSubscription.create({
        name: name.trim(),
        url: url.trim(),
        secret,
        events,
        tenantId: req.tenantId,
        createdBy: req.user._id,
        isActive: true
      });

      logBusinessEvent({
        req,
        action: 'WEBHOOK_SUBSCRIPTION_CREATED',
        entityType: 'WebhookSubscription',
        entityId: subscription._id,
        changes: {
          after: {
            name: subscription.name,
            url: subscription.url,
            events: subscription.events
          },
          summary: `Created webhook subscription "${subscription.name}" for events [${subscription.events.join(', ')}]`
        }
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'Webhook subscription created successfully. Use the provided secret to verify X-AcuStock-Signature.',
        subscription: {
          id: subscription._id,
          name: subscription.name,
          url: subscription.url,
          secret: subscription.secret,
          events: subscription.events,
          isActive: subscription.isActive,
          createdAt: subscription.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating webhook subscription:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/v1/webhooks
   * List all webhook subscriptions for tenant
   */
  async listSubscriptions(req, res) {
    try {
      const subscriptions = await WebhookSubscription.find({ tenantId: req.tenantId })
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      return res.json({
        success: true,
        subscriptions: subscriptions.map(s => ({
          id: s._id,
          name: s.name,
          url: s.url,
          events: s.events,
          isActive: s.isActive,
          failureCount: s.failureCount || 0,
          lastTriggeredAt: s.lastTriggeredAt,
          createdBy: s.createdBy,
          createdAt: s.createdAt
        }))
      });
    } catch (error) {
      logger.error('Error listing webhook subscriptions:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * GET /api/v1/webhooks/:id
   * Get subscription details
   */
  async getSubscriptionDetails(req, res) {
    try {
      const { id } = req.params;
      const sub = await WebhookSubscription.findOne({ _id: id, tenantId: req.tenantId })
        .populate('createdBy', 'name email')
        .lean();

      if (!sub) {
        return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
      }

      const recentDeliveries = await WebhookDeliveryLog.find({ subscriptionId: id, tenantId: req.tenantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      return res.json({
        success: true,
        subscription: {
          id: sub._id,
          name: sub.name,
          url: sub.url,
          events: sub.events,
          isActive: sub.isActive,
          failureCount: sub.failureCount || 0,
          lastTriggeredAt: sub.lastTriggeredAt,
          createdBy: sub.createdBy,
          createdAt: sub.createdAt
        },
        recentDeliveries: recentDeliveries.map(d => ({
          id: d._id,
          deliveryId: d.deliveryId,
          event: d.event,
          statusCode: d.statusCode,
          success: d.success,
          durationMs: d.durationMs,
          error: d.error,
          createdAt: d.createdAt
        }))
      });
    } catch (error) {
      logger.error('Error getting webhook details:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * POST /api/v1/webhooks/:id/ping
   * Send test ping to verify endpoint
   */
  async testPing(req, res) {
    try {
      const { id } = req.params;
      const result = await webhookDispatcher.testPingSubscription(id, { tenantId: req.tenantId });

      return res.json({
        success: true,
        message: result.success ? 'Webhook ping delivered successfully' : 'Webhook ping failed to deliver',
        delivery: result
      });
    } catch (error) {
      logger.error('Error in webhook ping:', error);
      return res.status(400).json({ success: false, error: error.message || 'Ping failed' });
    }
  }

  /**
   * GET /api/v1/webhooks/:id/deliveries
   * Get delivery logs for subscription
   */
  async getDeliveryLogs(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const filter = { subscriptionId: id, tenantId: req.tenantId };
      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const [logs, total] = await Promise.all([
        WebhookDeliveryLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit, 10))
          .lean(),
        WebhookDeliveryLog.countDocuments(filter)
      ]);

      return res.json({
        success: true,
        deliveries: logs,
        pagination: {
          total,
          page: parseInt(page, 10),
          pages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (error) {
      logger.error('Error getting delivery logs:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * DELETE /api/v1/webhooks/:id
   * Delete webhook subscription
   */
  async deleteSubscription(req, res) {
    try {
      const { id } = req.params;
      const sub = await WebhookSubscription.findOneAndDelete({ _id: id, tenantId: req.tenantId });

      if (!sub) {
        return res.status(404).json({ success: false, error: 'Webhook subscription not found' });
      }

      // Cleanup associated delivery logs asynchronously
      WebhookDeliveryLog.deleteMany({ subscriptionId: id, tenantId: req.tenantId }).catch(() => {});

      logBusinessEvent({
        req,
        action: 'WEBHOOK_SUBSCRIPTION_DELETED',
        entityType: 'WebhookSubscription',
        entityId: id,
        changes: {
          summary: `Deleted webhook subscription "${sub.name}" (${sub.url})`
        }
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'Webhook subscription deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting webhook subscription:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

module.exports = new WebhookController();
