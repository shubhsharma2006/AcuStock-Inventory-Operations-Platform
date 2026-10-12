/**
 * AcuStock AI Copilot Controller
 * 
 * Exposes conversational chat with Server-Sent Events (SSE) streaming
 * and contextual suggestion capabilities.
 */

const agent = require('../core/agent');
const { createSecurityContextFromRequest } = require('../core/context');
const { logAiEvent } = require('../core/audit');
const logger = require('../../utils/logger');

/**
 * POST /api/ai/copilot/chat
 */
async function chat(req, res) {
  try {
    const { prompt, history = [], stream = true } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'A prompt message is required' });
    }

    // Invariant: Security context extracted strictly from authenticated session
    const securityContext = createSecurityContextFromRequest(req, 'web');

    // Audit log initial query
    await logAiEvent({
      action: 'AI_COPILOT_QUERY',
      context: securityContext,
      parameters: { promptLength: prompt.length },
      summary: `User asked: "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"`
    });

    const isSse = stream === true || req.headers.accept === 'text/event-stream';

    if (isSse) {
      // Set SSE streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
      res.flushHeaders?.();

      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent('status', { message: 'Analyzing request...' });

      const onStep = (step) => {
        if (step.type === 'tool_start') {
          sendEvent('tool_start', { tool: step.tool });
        } else if (step.type === 'tool_finish') {
          sendEvent('tool_finish', { tool: step.tool, result: step.result });
        }
      };

      const result = await agent.chat({
        prompt,
        history,
        securityContext,
        onStep
      });

      sendEvent('content', { text: result.text });
      sendEvent('done', {
        executedTools: result.executedTools,
        mode: result.mode
      });

      return res.end();
    } else {
      // Standard JSON response
      const result = await agent.chat({
        prompt,
        history,
        securityContext
      });

      return res.json({
        success: true,
        text: result.text,
        executedTools: result.executedTools,
        mode: result.mode
      });
    }
  } catch (error) {
    logger.error('Copilot Chat Error:', error);

    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      return res.end();
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during AI processing'
    });
  }
}

/**
 * GET /api/ai/copilot/suggestions
 * Returns quick operational prompt prompts tailored to user role
 */
async function getSuggestions(req, res) {
  try {
    const role = req.user?.role || 'USER';

    const baseSuggestions = [
      'Show me products below safety stock',
      'Are there any batches expiring in 30 days?',
      'Check status of Sales Order SO-1001'
    ];

    if (['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role)) {
      baseSuggestions.push(
        'Draft a Purchase Order for critical stock',
        'List all unfulfilled customer backorders',
        'Show top fast-moving items this week'
      );
    }

    return res.json({
      success: true,
      suggestions: baseSuggestions
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  chat,
  getSuggestions
};
