/**
 * NoSQL & Operator Injection Sanitizer Middleware
 * ─────────────────────────────────────────────────────────────
 * Recursively strips keys starting with '$' or containing '.' from
 * request bodies, query strings, and route parameters.
 * Neutralizes MongoDB query operator injection attacks (e.g. {"$gt": ""}).
 * Mutates in-place to safely support Express 4/5 read-only req.query getters.
 */

'use strict';

function sanitize(target) {
  if (!target || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map(item => sanitize(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(target)) {
    if (/^\$|\./.test(key)) {
      continue; // Strip malicious/operator key
    }

    if (value && typeof value === 'object') {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }

  return clean;
}

function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'object' && obj[i] !== null) {
        sanitizeInPlace(obj[i]);
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (/^\$|\./.test(key)) {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeInPlace(obj[key]);
    }
  }
}

function noSqlSanitizer(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    sanitizeInPlace(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeInPlace(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeInPlace(req.params);
  }
  next();
}

module.exports = {
  noSqlSanitizer,
  sanitize,
  sanitizeInPlace
};
