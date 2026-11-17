const crypto = require('crypto');
const { URL } = require('url');
const mongoose = require('mongoose');
const { safeRequest } = require('../utils/safeHttpClient');

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
 * Sends a single HTTP POST request with timeout and SSRF/DNS protection
 */
async function sendHttpPost({ url, payloadString, signature, event, deliveryId, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const startTime = Date.now();
  try {
    const res = await safeRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AcuStock-Event': event,
        'X-AcuStock-Delivery': deliveryId,
        'X-AcuStock-Signature': `sha256=${signature}`
      },
      body: payloadString,
      timeoutMs
    });

    const durationMs = Date.now() - startTime;
    const isSuccess = res.status >= 200 && res.status < 300;
    return {
      success: isSuccess,
      statusCode: res.status,
      responseBody: res.data ? res.data.substring(0, 1024) : null,
      durationMs,
      error: isSuccess ? null : `HTTP status code ${res.status}`
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      statusCode: null,
      responseBody: null,
      durationMs,
      error: err.message
    };
  }
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
