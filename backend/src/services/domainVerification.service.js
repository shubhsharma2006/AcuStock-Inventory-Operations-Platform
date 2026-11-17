/**
 * Domain Verification Service
 * ─────────────────────────────────────────────────────────────
 * Validates custom enterprise domain ownership via DNS:
 * 1. TXT Record: _acustock-challenge.<domain> matching verification token
 * 2. CNAME Record: <domain> pointing to cname.acustock.com (or server host)
 */

'use strict';

const dns = require('dns').promises;
const crypto = require('crypto');
const logger = require('../utils/logger');

const DEFAULT_CNAME_TARGET = process.env.ACUSTOCK_CNAME_TARGET || 'cname.acustock.com';

/**
 * Generates a random cryptographic verification token
 */
function generateVerificationToken() {
  return 'acustock_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Validates domain format (e.g. inventory.acme.com)
 */
function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const clean = domain.trim().toLowerCase();
  if (clean.length > 253) return false;
  // Disallow bare localhost, IP addresses, or internal domains
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean === 'localhost') return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(clean);
}

/**
 * Verifies DNS TXT and CNAME records for a custom domain
 *
 * @param {string} domain - Domain name e.g. "inventory.acme.com"
 * @param {string} expectedToken - Expected TXT verification token
 * @param {string} expectedCname - Expected CNAME target (defaults to cname.acustock.com)
 * @returns {Promise<{ verified: boolean, txtMatched: boolean, cnameMatched: boolean, details: Object }>}
 */
async function verifyDomainDns(domain, expectedToken, expectedCname = DEFAULT_CNAME_TARGET) {
  const cleanDomain = domain.trim().toLowerCase();
  const challengeHost = `_acustock-challenge.${cleanDomain}`;
  const targetHost = expectedCname.toLowerCase();

  let txtMatched = false;
  let cnameMatched = false;
  let txtRecords = [];
  let cnameRecords = [];
  let error = null;

  // 1. Resolve TXT Record on _acustock-challenge.<domain>
  try {
    const rawTxt = await dns.resolveTxt(challengeHost);
    txtRecords = rawTxt.flat();
    txtMatched = txtRecords.some(r => r === expectedToken || r.includes(expectedToken));
  } catch (err) {
    logger.debug(`[DomainVerify] TXT lookup error for ${challengeHost}: ${err.message}`);
  }

  // 2. Resolve CNAME Record on <domain>
  try {
    cnameRecords = await dns.resolveCname(cleanDomain);
    cnameMatched = cnameRecords.some(r => r.toLowerCase().replace(/\.$/, '') === targetHost);
  } catch (err) {
    logger.debug(`[DomainVerify] CNAME lookup error for ${cleanDomain}: ${err.message}`);
  }

  // A domain is verified if TXT challenge matches OR CNAME points directly to AcuStock
  const verified = txtMatched || cnameMatched;

  return {
    verified,
    txtMatched,
    cnameMatched,
    details: {
      challengeHost,
      expectedToken,
      expectedCname: targetHost,
      foundTxtRecords: txtRecords,
      foundCnameRecords: cnameRecords,
      error
    }
  };
}

module.exports = {
  DEFAULT_CNAME_TARGET,
  generateVerificationToken,
  isValidDomain,
  verifyDomainDns
};

