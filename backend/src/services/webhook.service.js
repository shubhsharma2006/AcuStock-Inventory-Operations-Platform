/**
 * AcuStock Real-Time Webhook Alert Service
 * Sends instant notifications to Slack, Microsoft Teams, and Custom Webhooks
 * for low-stock alerts, serial dispatches, and security events.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Dispatch HTTP POST payload to webhook URL
 */

function postWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl) return resolve({ skipped: true });

    try {
      const parsedUrl = new URL(webhookUrl);
      const data = JSON.stringify(payload);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'AcuStock-WebhookSender/1.0',
        },
        timeout: 5000,
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode, body });
          } else {
            resolve({ success: false, statusCode: res.statusCode, body });
          }
        });
      });

      req.on('error', (err) => {
        console.error('[Webhook] Failed to send to', webhookUrl, ':', err.message);
        resolve({ success: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.write(data);
      req.end();
    } catch (err) {
      console.error('[Webhook] Invalid URL:', webhookUrl, err.message);
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Send Low Stock Alert to Slack / Teams
 */
async function triggerLowStockWebhook({ productName, currentStock, minThreshold, webhookUrl }) {
  const targetUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL;
  if (!targetUrl) return;

  const payload = {
    text: `⚠️ *AcuStock Low Stock Alert*: Product *${productName}* is down to *${currentStock} units* (Threshold: ${minThreshold}).`,
    attachments: [
      {
        color: '#f59e0b',
        fields: [
          { title: 'Product', value: productName, short: true },
          { title: 'Current Stock', value: String(currentStock), short: true },
          { title: 'Min Threshold', value: String(minThreshold), short: true },
          { title: 'Action Required', value: 'Restock via Purchase Order', short: true },
        ],
        footer: 'AcuStock Automated Inventory Engine',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  return postWebhook(targetUrl, payload);
}

/**
 * Send Serial Dispatch Notification to Slack / Teams
 */
async function triggerSerialDispatchWebhook({ productName, serialNumbers, customerName, webhookUrl }) {
  const targetUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL;
  if (!targetUrl) return;

  const payload = {
    text: `📦 *Serial Dispatch Recorded*: *${serialNumbers.length} unit(s)* of *${productName}* dispatched to *${customerName || 'Customer'}*.`,
    attachments: [
      {
        color: '#3b82f6',
        fields: [
          { title: 'Product', value: productName, short: true },
          { title: 'Serials', value: serialNumbers.join(', '), short: false },
          { title: 'Recipient', value: customerName || 'N/A', short: true },
        ],
        footer: 'AcuStock Serial Tracking',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  return postWebhook(targetUrl, payload);
}

module.exports = {
  postWebhook,
  triggerLowStockWebhook,
  triggerSerialDispatchWebhook,
};
