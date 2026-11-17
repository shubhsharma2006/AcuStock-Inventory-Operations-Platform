/**
 * Safely escape regex special characters to prevent ReDoS attacks.
 * @param {string} str - User provided search input
 * @returns {string} - Escaped string safe for MongoDB $regex
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  // Strip control characters, cap at 100 chars, and escape all regex metacharacters
  return str
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 100)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates whether an arbitrary regex pattern is vulnerable to catastrophic backtracking (ReDoS).
 * Detects nested quantifiers such as (a+)+, (a*)*, ([a-z]+)+, or overlapping repetitions.
 * @param {string} pattern
 * @returns {boolean}
 */
function isSafeRegexPattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return false;
  if (pattern.length > 250) return false;
  
  // Detect parenthesized group containing repetitive quantifiers (+, *, {n,}) followed by an outer quantifier
  const nestedQuantifierRegex = /\([^)]*(\+|\*|\{[^}]*\})[^)]*\)[+*?{]/;
  if (nestedQuantifierRegex.test(pattern)) {
    return false;
  }

  // Detect overlapping wildcards like .*.* or .+.+
  if (/(\.\*|\.\+){2,}/.test(pattern)) {
    return false;
  }

  return true;
}

module.exports = {
  escapeRegex,
  isSafeRegexPattern
};
