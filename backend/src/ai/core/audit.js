/**
 * AcuStock AI Audit Logger
 * 
 * Records all AI agent tool executions, queries, and generated drafts
 * into the immutable AuditLog collection.
 */

const AuditLog = require('../../models/AuditLog');
const logger = require('../../utils/logger');

async function logAiEvent({
  action,
  context,
  toolName = null,
  parameters = {},
  summary = '',
  targetId = null,
  metadata = {}
}) {
  try {
    if (!context || !context.tenantId) {
      return;
    }

    await AuditLog.create({
      action: action || 'AI_TOOL_EXECUTED',
      tenantId: context.tenantId,
      performedBy: context.userId,
      performedByName: context.userName,
      performedByRole: context.role,
      ipAddress: '127.0.0.1', // internal service actor
      details: {
        toolName,
        parameters: sanitizeParams(parameters),
        summary,
        source: context.source || 'web',
        targetId: targetId ? targetId.toString() : null,
        ...metadata
      }
    });
  } catch (err) {
    // Non-blocking: audit failure should be logged but not crash the AI execution
    logger.error('Failed to write AI audit log entry:', err.message);
  }
}

function sanitizeParams(params) {
  if (!params || typeof params !== 'object') return params;
  const sanitized = { ...params };
  // Redact any potential sensitive tokens or passwords
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  return sanitized;
}

module.exports = {
  logAiEvent
};
