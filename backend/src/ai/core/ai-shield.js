/**
 * AcuStock AI Cyber Security Shield
 * ─────────────────────────────────────────────────────────────
 * Multi-tier defense engine protecting against:
 * 1. Prompt Injection & Jailbreak attacks (ingress semantic heuristics & XML sandboxing).
 * 2. Sensitive Data & Secret Exfiltration (egress pattern scrubbing).
 * 3. Denial-of-Wallet (DoW) & Token Exhaustion attacks (prompt size caps & rate limits).
 */

'use strict';

const logger = require('../../utils/logger');

// Maximum characters per user prompt (protects against token wallet-drain attacks)
const MAX_PROMPT_LENGTH = 2500;

// High-confidence prompt injection & jailbreak signatures
const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+|the\s+)?(previous|prior|above|existing)\s+instructions/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above|existing)\s+instructions/i,
  /forget\s+(all\s+|the\s+)?(previous|prior|above|existing)\s+instructions/i,
  /system\s+prompt\s+override/i,
  /you\s+are\s+now\s+(in\s+)?(dan|jailbreak|unrestricted|god)\s+mode/i,
  /act\s+as\s+(an\s+)?(unrestricted|unfiltered|jailbroken|evil)\s+(ai|assistant|model)/i,
  /do\s+anything\s+now/i,
  /developer\s+mode\s+(enabled|activated|on)/i,
  /output\s+(your\s+)?(system\s+instruction|system\s+prompt|developer\s+prompt)/i,
  /reveal\s+(your\s+)?(hidden\s+rules|system\s+instructions)/i,
  /bypass\s+(all\s+)?security\s+(filters|checks|guidelines)/i
];

// Sensitive secret signatures for egress redaction
const SECRET_PATTERNS = [
  // AcuStock Live & Test API Keys
  { pattern: /\bacu_(live|test)_[a-zA-Z0-9]{32,}\b/g, replacement: '[REDACTED_API_KEY]' },
  // OpenAI / Stripe Secret Keys
  { pattern: /\b(sk|rk)_(live|test)_[a-zA-Z0-9]{20,}\b/g, replacement: '[REDACTED_SECRET_KEY]' },
  // Google Cloud / Gemini API Keys
  { pattern: /\bAIzaSy[a-zA-Z0-9_-]{33}\b/g, replacement: '[REDACTED_API_KEY]' },
  // JSON Web Tokens (JWT)
  { pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, replacement: '[REDACTED_JWT_TOKEN]' },
  // Bcrypt Password Hashes
  { pattern: /\$2[abxy]\$\d{2}\$[a-zA-Z0-9./]{53}/g, replacement: '[REDACTED_PASSWORD_HASH]' },
  // Raw Mongo URI credentials (mongodb+srv://user:pass@...)
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/g, replacement: 'mongodb$1://[REDACTED_CREDENTIALS]@' }
];

// In-memory sliding window for AI rate-limiting per tenant (20 calls/min)
const tenantAiCallHistory = new Map();
const AI_RATE_WINDOW_MS = 60 * 1000;
const MAX_AI_CALLS_PER_WINDOW = 20;

/**
 * Validates and sanitizes incoming user prompts before passing to LLM.
 * Throws an Error with code 'PROMPT_INJECTION_DETECTED' if malicious.
 * 
 * @param {string} prompt
 * @param {Object} [context]
 * @returns {string} Sandboxed prompt wrapped in XML tags
 */
function inspectAndSandboxPrompt(prompt, context = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('A valid text prompt is required');
  }

  // 1. Length & Token Exhaustion Check (DoW Defense)
  if (prompt.length > MAX_PROMPT_LENGTH) {
    const err = new Error(`Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters`);
    err.statusCode = 400;
    err.code = 'PROMPT_TOO_LONG';
    throw err;
  }

  const normalized = prompt.trim();

  // 2. Heuristic Jailbreak & Prompt Injection Detection
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(normalized)) {
      logger.warn('[AIShield] Malicious prompt injection pattern blocked:', {
        matchedPattern: pattern.toString(),
        tenantId: context.tenantId,
        userId: context.userId
      });
      const err = new Error('Security Alert: Your request contains patterns that violate the AI security policy.');
      err.statusCode = 400;
      err.code = 'PROMPT_INJECTION_DETECTED';
      throw err;
    }
  }

  // 3. XML Delimiter Sandboxing
  // Prevents model confusion by explicitly demarcating untrusted input
  return `<user_untrusted_input>\n${normalized}\n</user_untrusted_input>`;
}

/**
 * Scrubs outgoing AI responses to prevent credential/PII leakage.
 * 
 * @param {string} responseText
 * @returns {string} Sanitized output
 */
function scrubAiResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return responseText;
  }

  let sanitized = responseText;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Checks sliding-window rate limit for AI operations by tenant.
 * 
 * @param {string} tenantId
 * @returns {boolean} true if allowed, throws 429 if exceeded
 */
function checkAiRateLimit(tenantId) {
  if (!tenantId) return true; // System-level operations bypass

  const now = Date.now();
  const history = tenantAiCallHistory.get(tenantId) || [];
  
  // Filter out expired timestamps
  const recentCalls = history.filter(ts => now - ts < AI_RATE_WINDOW_MS);

  if (recentCalls.length >= MAX_AI_CALLS_PER_WINDOW) {
    logger.warn(`[AIShield] Tenant ${tenantId} exceeded AI request rate limit (${MAX_AI_CALLS_PER_WINDOW} req/min)`);
    const err = new Error(`AI request rate limit exceeded. You can make up to ${MAX_AI_CALLS_PER_WINDOW} AI queries per minute.`);
    err.statusCode = 429;
    err.code = 'AI_RATE_LIMIT_EXCEEDED';
    throw err;
  }

  recentCalls.push(now);
  tenantAiCallHistory.set(tenantId, recentCalls);
  return true;
}

module.exports = {
  inspectAndSandboxPrompt,
  scrubAiResponse,
  checkAiRateLimit,
  MAX_PROMPT_LENGTH,
  JAILBREAK_PATTERNS,
  SECRET_PATTERNS
};

