/**
 * validateRequest — lightweight request body validation middleware.
 * No external dependencies (avoids adding Zod/Joi to the dependency tree).
 *
 * Usage:
 *   const { validateRequest, schemas } = require('../middleware/validateRequest');
 *   router.post('/in', requireAuth, validateRequest(schemas.stockIn), handler);
 */

const mongoose = require('mongoose');

// ── Helpers ────────────────────────────────────────────────────

function isObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value.trim());
}

function isNonEmptyString(value, maxLen = Infinity) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

function isIntInRange(value, min, max) {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
}

function isStringArray(value, maxItemLen = 100, maxArrayLen = 100_000) {
  if (!Array.isArray(value)) return false;
  if (value.length > maxArrayLen) return false;
  return value.every(item => typeof item === 'string' && item.length <= maxItemLen);
}

// ── Schema Definitions ─────────────────────────────────────────

const schemas = {
  /**
   * Stock IN / OUT body validation
   */
  stockIn: {
    rules: {
      productId: { required: true,  check: isObjectId,       message: 'productId must be a valid 24-char hex string' },
      quantity:  { required: true,  check: v => isIntInRange(v, 1, 100_000), message: 'quantity must be an integer between 1 and 100,000' },
      serialNumbers: { required: false, check: v => isStringArray(v), message: 'serialNumbers must be an array of strings (max 100 chars each)' }
    }
  },

  stockOut: {
    rules: {
      productId: { required: true,  check: isObjectId,       message: 'productId must be a valid 24-char hex string' },
      quantity:  { required: true,  check: v => isIntInRange(v, 1, 100_000), message: 'quantity must be an integer between 1 and 100,000' },
      serialNumbers: { required: false, check: v => isStringArray(v), message: 'serialNumbers must be an array of strings (max 100 chars each)' }
    }
  },

  /**
   * Login body validation
   */
  login: {
    rules: {
      identifier: { required: true, check: v => isNonEmptyString(v, 254), message: 'identifier must be a non-empty string (max 254 chars)' },
      password:   { required: true, check: v => isNonEmptyString(v, 128), message: 'password must be a non-empty string (max 128 chars)' }
    }
  }
};

// ── Middleware Factory ──────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against the given schema.
 *
 * @param {{ rules: Object }} schema — one of the schema objects above
 * @returns {Function} Express middleware (req, res, next)
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [field, rule] of Object.entries(schema.rules)) {
      const value = body[field];

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip optional fields that are absent
      if (value === undefined || value === null) continue;

      // Run the check function
      if (!rule.check(value)) {
        errors.push(rule.message);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
}

module.exports = { validateRequest, schemas };
