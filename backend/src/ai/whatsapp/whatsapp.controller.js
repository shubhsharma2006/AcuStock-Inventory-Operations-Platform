/**
 * AcuStock WhatsApp Webhook Controller
 * 
 * Handles incoming Meta Cloud API webhooks, verifies tokens,
 * resolves sender tenancy, and dispatches queries to AcuBot.
 */

const aiConfig = require('../config/ai.config');
const phoneResolver = require('./phone-resolver');
const whatsAppClient = require('./whatsapp-client');
const agent = require('../core/agent');
const logger = require('../../utils/logger');

// Cache to deduplicate retried messages within 60 seconds
const processedMessages = new Set();

/**
 * GET /api/ai/whatsapp/webhook - Meta Webhook Verification
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === aiConfig.whatsapp.verifyToken) {
      logger.info('✅ WhatsApp Webhook verified successfully by Meta');
      return res.status(200).send(challenge);
    } else {
      logger.warn('❌ WhatsApp Webhook verification failed: token mismatch');
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
};

/**
 * POST /api/ai/whatsapp/webhook - Incoming WhatsApp Messages
 */
exports.handleWebhook = async (req, res) => {
  // Acknowledge Meta immediately within 20s window
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;

    if (!body || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || !messages.length) {
      return; // Ignore status updates or receipts
    }

    const messageObj = messages[0];
    const messageId = messageObj.id;
    const fromPhone = messageObj.from;
    const messageType = messageObj.type;

    // Deduplication check
    if (messageId && processedMessages.has(messageId)) {
      return;
    }
    if (messageId) {
      processedMessages.add(messageId);
      setTimeout(() => processedMessages.delete(messageId), 60000);
    }

    // Support text messages (transcription for audio will hook here in future)
    let userPrompt = '';
    if (messageType === 'text') {
      userPrompt = messageObj.text?.body?.trim() || '';
    } else {
      await whatsAppClient.sendTextMessage(
        fromPhone,
        '👋 AcuBot received your message. Please send text queries (e.g., "Check stock of item X", "List low stock items").'
      );
      return;
    }

    if (!userPrompt) return;

    logger.info(`📱 Inbound WhatsApp from [${fromPhone}]: "${userPrompt}"`);

    // 1. Resolve security context by phone
    const { authenticated, securityContext, user, error } = await phoneResolver.resolveSecurityContext(fromPhone);

    if (!authenticated || !securityContext) {
      const unauthorizedMsg = 
`🔒 *AcuStock Security Alert*

This phone number (+${fromPhone}) is not registered with an active AcuStock account.

To access your warehouse assistant:
1. Ensure your profile phone number matches this WhatsApp number in AcuStock.
2. Contact your system administrator to enable mobile access.`;

      await whatsAppClient.sendTextMessage(fromPhone, unauthorizedMsg);
      return;
    }

    // 1b. Plan Gating for WhatsApp AI Assistant
    const tenantPlan = (user.tenantId?.plan || 'free').toLowerCase();
    const isPlanAllowed = ['professional', 'enterprise'].includes(tenantPlan) || process.env.NODE_ENV === 'test';
    if (!isPlanAllowed) {
      const upgradeMsg = 
`🔒 *AcuStock Plan Upgrade Required*

WhatsApp AI Assistant is an exclusive feature on the *Professional* plan.
Your organization is currently on the *${tenantPlan.toUpperCase()}* plan.

To enable 24/7 WhatsApp inventory management, please upgrade your subscription in the AcuStock Web Dashboard under *Settings > Billing*.`;

      await whatsAppClient.sendTextMessage(fromPhone, upgradeMsg);
      return;
    }

    // 1c. Quota check for WhatsApp AI Queries
    const maxQueries = user.tenantId?.limits?.maxAiQueries;
    const currentUsage = user.tenantId?.usage?.aiQueries || 0;
    if (typeof maxQueries === 'number' && maxQueries !== -1 && currentUsage >= maxQueries) {
      const quotaMsg = `⚠️ *AcuStock Quota Alert*\n\nYour organization has reached its monthly AI query limit (${currentUsage}/${maxQueries}).\nPlease upgrade your plan or purchase an add-on in the Web Dashboard.`;
      await whatsAppClient.sendTextMessage(fromPhone, quotaMsg);
      return;
    }

    // Atomically increment AI usage for the tenant
    const Tenant = require('../../models/Tenant');
    await Tenant.updateOne({ _id: user.tenantId._id }, { $inc: { 'usage.aiQueries': 1 } });

    // 2. Dispatch to AcuBot Agent with verified security context
    const botResponse = await agent.chat({
      prompt: userPrompt,
      history: [],
      securityContext
    });

    // 3. Format message for WhatsApp
    let replyText = botResponse.text;

    // Add note for draft POs created via WhatsApp
    if (botResponse.executedTools?.some(t => t.name === 'draftPurchaseOrder')) {
      replyText += `\n\n📌 *Next Step:* A DRAFT purchase order has been staged. Review and approve it in the AcuStock Web Dashboard under *Procurement*.`;
    }

    // 4. Send response back to user
    await whatsAppClient.sendTextMessage(fromPhone, replyText);

  } catch (err) {
    logger.error('WhatsApp webhook handler error:', err);
  }
};

const jwt = require('jsonwebtoken');
const User = require('../../models/User');

/**
 * POST /api/ai/whatsapp/simulate - Developer Simulation Endpoint
 * Allows testing full WhatsApp resolution and agent pipeline locally
 */
exports.simulateMessage = async (req, res) => {
  try {
    let { phone, message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required in body'
      });
    }

    let authenticated = false;
    let securityContext = null;
    let resolvedUser = null;
    let error = null;

    if (phone && String(phone).trim()) {
      const resolution = await phoneResolver.resolveSecurityContext(phone);
      authenticated = resolution.authenticated;
      securityContext = resolution.securityContext;
      resolvedUser = resolution.user;
      error = resolution.error;
    } else {
      // Check auth token if phone not supplied in payload
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.authToken;
      const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

      if (token && process.env.JWT_SECRET) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const userId = decoded._id || decoded.id || decoded.userId;
          const userDoc = await User.findById(userId);
          if (userDoc && userDoc.isActive) {
            resolvedUser = userDoc;
            authenticated = true;
            securityContext = {
              tenantId: userDoc.tenantId ? String(userDoc.tenantId) : null,
              userId: userDoc._id,
              userName: userDoc.name,
              role: userDoc.role,
              source: 'whatsapp'
            };
            phone = userDoc.phone || '9999999999';
          }
        } catch {
          // Token verification failed or expired
        }
      }
    }

    if (!authenticated || !securityContext) {
      return res.status(403).json({
        success: false,
        authenticated: false,
        error: error || 'UNREGISTERED_PHONE',
        message: phone
          ? `Phone number ${phone} is not linked to any active AcuStock user account.`
          : 'Please provide a registered phone number or log in to simulate WhatsApp assistant queries.'
      });
    }

    const botResponse = await agent.chat({
      prompt: message,
      history: [],
      securityContext
    });

    res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        id: resolvedUser?._id,
        name: resolvedUser?.name,
        role: resolvedUser?.role,
        tenantId: securityContext.tenantId,
        phone: phone
      },
      input: message,
      output: botResponse.text,
      executedTools: botResponse.executedTools || []
    });
  } catch (err) {
    logger.error('WhatsApp simulation error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

