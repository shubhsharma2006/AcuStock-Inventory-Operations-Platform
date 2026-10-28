const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const mongoose = require('mongoose');

const WebhookSubscription = require('../models/WebhookSubscription');
const WebhookDeliveryLog = require('../models/WebhookDeliveryLog');
const logger = require('../utils/logger');

const MAX_FAILURES_BEFORE_SUSPEND = 10;
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Computes HMAC-SHA256 signature for payload
 */
function computeSignature(payloadString, secret) {
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

/**
 * Sends a single HTTP POST request with timeout
 */
function sendHttpPost({ url, payloadString, signature, event, deliveryId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadString),
          'User-Agent': 'AcuStock-WebhookDispatcher/2.0',
          'X-AcuStock-Event': event,
          'X-AcuStock-Delivery': deliveryId,
          'X-AcuStock-Signature': `sha256=${signature}`
        },
        timeout: timeoutMs
      }, (res) => {
        let responseBody = '';
        res.on('data', chunk => {
          if (responseBody.length < 2048) {
            responseBody += chunk;
          }
        });
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
          resolve({
            success: isSuccess,
            statusCode: res.statusCode,
            responseBody: responseBody.substring(0, 1024),
            durationMs,
            error: isSuccess ? null : `HTTP status code ${res.statusCode}`
          });
        });
      });

      req.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          statusCode: null,
          responseBody: null,
          durationMs,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          statusCode: null,
          responseBody: null,
          durationMs,
          error: 'Connection timed out'
        });
      });

      req.write(payloadString);
      req.end();
    } catch (err) {
      resolve({
        success: false,
        statusCode: null,
        responseBody: null,
        durationMs: 0,
        error: err.message
      });
    }
  });
}

/**
 * Dispatches an event to all subscribed endpoints for a tenant
 */
async function dispatchWebhookEvent(tenantId, event, data) {
  if (!tenantId || !event) return [];

  try {
    // If not connected to MongoDB, skip gracefully
    if (mongoose.connection.readyState !== 1) {
      return [];
    }

    const subscriptions = await WebhookSubscription.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      events: event,
      isActive: true
    }).lean();

    if (!subscriptions || subscriptions.length === 0) {
      return [];
    }

    const results = [];

    for (const sub of subscriptions) {
      const deliveryId = `del_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const payload = {
        id: deliveryId,
        event,
        timestamp: new Date().toISOString(),
        tenantId: String(tenantId),
        data
      };

      const payloadString = JSON.stringify(payload);
      const signature = computeSignature(payloadString, sub.secret);

      // Perform delivery attempt
      const result = await sendHttpPost({
        url: sub.url,
        payloadString,
        signature,
        event,
        deliveryId
      });

      // Update subscription failure counters
      if (result.success) {
        WebhookSubscription.updateOne(
          { _id: sub._id },
          { $set: { failureCount: 0, lastTriggeredAt: new Date() } }
        ).catch(() => {});
      } else {
        const newCount = (sub.failureCount || 0) + 1;
        const update = {
          $set: {
            failureCount: newCount,
            lastTriggeredAt: new Date(),
            isActive: newCount < MAX_FAILURES_BEFORE_SUSPEND
          }
        };
        WebhookSubscription.updateOne({ _id: sub._id }, update).catch(() => {});
        if (newCount >= MAX_FAILURES_BEFORE_SUSPEND) {
          logger.warn(`Webhook subscription ${sub._id} disabled after ${newCount} consecutive failures`);
        }
      }

      // Log delivery record
      WebhookDeliveryLog.create({
        subscriptionId: sub._id,
        tenantId: sub.tenantId,
        event,
        deliveryId,
        url: sub.url,
        payload,
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        durationMs: result.durationMs,
        success: result.success,
        error: result.error
      }).catch(err => logger.error('Failed to create WebhookDeliveryLog:', err));

      results.push({
        subscriptionId: sub._id,
        deliveryId,
        success: result.success,
        statusCode: result.statusCode
      });
    }

    return results;
  } catch (error) {
    logger.error(`Error in dispatchWebhookEvent (${event}):`, error);
    return [];
  }
}

/**
 * Sends a ping test payload to a specific webhook subscription
 */
async function testPingSubscription(subscriptionId, { tenantId }) {
  const sub = await WebhookSubscription.findOne({
    _id: subscriptionId,
    tenantId: new mongoose.Types.ObjectId(tenantId)
  });

  if (!sub) {
    throw new Error('Webhook subscription not found');
  }

  const deliveryId = `del_ping_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const payload = {
    id: deliveryId,
    event: 'ping',
    timestamp: new Date().toISOString(),
    tenantId: String(tenantId),
    data: {
      message: 'AcuStock webhook test ping successful!',
      subscriptionId: sub._id,
      name: sub.name
    }
  };

  const payloadString = JSON.stringify(payload);
  const signature = computeSignature(payloadString, sub.secret);

  const result = await sendHttpPost({
    url: sub.url,
    payloadString,
    signature,
    event: 'ping',
    deliveryId
  });

  // Log test delivery
  await WebhookDeliveryLog.create({
    subscriptionId: sub._id,
    tenantId: sub.tenantId,
    event: 'ping',
    deliveryId,
    url: sub.url,
    payload,
    statusCode: result.statusCode,
    responseBody: result.responseBody,
    durationMs: result.durationMs,
    success: result.success,
    error: result.error
  });

  return {
    deliveryId,
    success: result.success,
    statusCode: result.statusCode,
    durationMs: result.durationMs,
    responseBody: result.responseBody,
    error: result.error
  };
}

module.exports = {
  computeSignature,
  sendHttpPost,
  dispatchWebhookEvent,
  testPingSubscription
};
