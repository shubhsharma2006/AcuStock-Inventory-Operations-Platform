/**
 * Universal HTML / XSS Input Sanitization Middleware
 * ─────────────────────────────────────────────────────────────
 * Recursively scans req.body, req.query, and req.params to sanitize
 * potentially malicious HTML and script injections (e.g. <script>,
 * <iframe>, <object>, <embed>, inline JavaScript event handlers,
 * and javascript: pseudo-protocols).
 *
 * Preserves safe plain-text, numbers, booleans, and legitimate punctuation.
 */

// Regex patterns for dangerous HTML and script constructs
const SCRIPT_BLOCK_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const STYLE_BLOCK_REGEX = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
const DANGEROUS_TAGS_REGEX = /<\s*\/?\s*(script|iframe|object|embed|applet|meta|link|style)[^>]*>/gi;
const INLINE_EVENT_HANDLERS_REGEX = /\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;
const JAVASCRIPT_PROTOCOL_REGEX = /javascript\s*:\s*[^\s'"]*/gi;
const VBSCRIPT_PROTOCOL_REGEX = /vbscript\s*:\s*[^\s'"]*/gi;

/**
 * Sanitizes a single string value
 * @param {string} str 
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  return str
    .replace(SCRIPT_BLOCK_REGEX, '')
    .replace(STYLE_BLOCK_REGEX, '')
    .replace(DANGEROUS_TAGS_REGEX, '')
    .replace(INLINE_EVENT_HANDLERS_REGEX, '')
    .replace(JAVASCRIPT_PROTOCOL_REGEX, '')
    .replace(VBSCRIPT_PROTOCOL_REGEX, '');
}

/**
 * Recursively sanitizes any object or array
 * @param {any} target 
 * @returns {any}
 */
function sanitizeValue(target) {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    return sanitizeString(target);
  }

  if (Array.isArray(target)) {
    return target.map(item => sanitizeValue(item));
  }

  if (typeof target === 'object' && target.constructor === Object) {
    const cleaned = {};
    for (const [key, value] of Object.entries(target)) {
      // Clean both key and value
      const cleanKey = sanitizeString(key);
      cleaned[cleanKey] = sanitizeValue(value);
    }
    return cleaned;
  }

  return target;
}

/**
 * Express middleware
 */
function xssSanitizer(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }

  // Mutate query parameters if writeable
  if (req.query && typeof req.query === 'object') {
    try {
      req.query = sanitizeValue(req.query);
    } catch {
      // In Express 5, req.query is a getter; handle gracefully
    }
  }

  next();
}

module.exports = {
  xssSanitizer,
  sanitizeString,
  sanitizeValue
};
