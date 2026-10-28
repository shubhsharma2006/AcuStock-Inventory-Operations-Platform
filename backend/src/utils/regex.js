/**
 * Safely escape regex special characters to prevent ReDoS attacks.
 * @param {string} str - User provided search input
 * @returns {string} - Escaped string safe for MongoDB $regex
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
