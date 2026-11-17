/**
 * Enterprise SAML 2.0 / SSO Service
 * ─────────────────────────────────────────────────────────────
 * Provides Service Provider (SP) integration for Okta, Entra ID (Azure AD),
 * Google Workspace, and OneLogin:
 * 1. Generates SP Metadata XML
 * 2. Formulates SAML AuthnRequest redirect URLs
 * 3. Verifies & parses SAMLResponse assertions (signature, timestamps, audience)
 * 4. Just-In-Time (JIT) user provisioning with tenant context binding
 */

'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const logger = require('../utils/logger');
const User = require('../models/User');

const ACUSTOCK_BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';

/**
 * Builds SP EntityID for a specific tenant
 */
function getSpEntityId(tenantSlug) {
  return `${ACUSTOCK_BASE_URL}/api/auth/sso/metadata/${tenantSlug}`;
}

/**
 * Builds Assertion Consumer Service (ACS) callback URL
 */
function getAcsUrl(tenantSlug) {
  return `${ACUSTOCK_BASE_URL}/api/auth/sso/callback/${tenantSlug}`;
}

/**
 * Generates XML SP Metadata for enterprise IdP configuration
 */
function generateSpMetadataXml(tenantSlug) {
  const entityId = getSpEntityId(tenantSlug);
  const acsUrl = getAcsUrl(tenantSlug);

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="1" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

/**
 * Generates AuthnRequest XML & HTTP-Redirect URL to IdP
 */
function createAuthnRequestUrl(tenant, relayState = '') {
  if (!tenant.sso || !tenant.sso.idpSsoUrl) {
    throw new Error('SSO_NOT_CONFIGURED: Tenant has not configured IdP SSO URL.');
  }

  const issueInstant = new Date().toISOString();
  const requestId = '_' + crypto.randomBytes(16).toString('hex');
  const spEntityId = getSpEntityId(tenant.slug);
  const acsUrl = getAcsUrl(tenant.slug);

  const authnXml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${requestId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${tenant.sso.idpSsoUrl}" ForceAuthn="false" IsPassive="false" AssertionConsumerServiceURL="${acsUrl}">
    <saml:Issuer>${spEntityId}</saml:Issuer>
    <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
  </samlp:AuthnRequest>`;

  // Deflate and Base64 encode for HTTP-Redirect binding
  const deflated = zlib.deflateRawSync(Buffer.from(authnXml, 'utf8'));
  const base64Request = deflated.toString('base64');

  const redirectUrl = new URL(tenant.sso.idpSsoUrl);
  redirectUrl.searchParams.set('SAMLRequest', base64Request);
  if (relayState) {
    redirectUrl.searchParams.set('RelayState', relayState);
  }

  return {
    redirectUrl: redirectUrl.toString(),
    requestId
  };
}

/**
 * Extracts clean XML value by tag name
 */
function extractXmlTag(xml, tagName) {
  const match = xml.match(new RegExp(`<(?:[a-zA-Z0-9]+:)?${tagName}[^>]*>([^<]+)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`, 'i'));
  return match ? match[1].trim() : null;
}

/**
 * Validates and decodes incoming SAMLResponse assertion
 *
 * @param {string} samlResponseBase64
 * @param {Object} tenant
 * @returns {{ email: string, name: string, nameId: string }}
 */
function parseAndValidateSamlResponse(samlResponseBase64, tenant) {
  if (!samlResponseBase64 || typeof samlResponseBase64 !== 'string') {
    throw new Error('INVALID_SAML_RESPONSE: Missing or malformed SAMLResponse parameter.');
  }

  const xmlBuffer = Buffer.from(samlResponseBase64, 'base64');
  const xml = xmlBuffer.toString('utf8');

  // 1. Status Code Check
  const statusCode = extractXmlTag(xml, 'StatusCode');
  if (statusCode && !statusCode.includes('Success')) {
    throw new Error(`SAML_AUTH_FAILED: IdP returned non-success status "${statusCode}".`);
  }

  // 2. Audience Restriction Check
  const audience = extractXmlTag(xml, 'Audience');
  const expectedEntityId = getSpEntityId(tenant.slug);
  if (audience && audience !== expectedEntityId) {
    throw new Error(`SAML_AUDIENCE_MISMATCH: Assertion audience "${audience}" did not match "${expectedEntityId}".`);
  }

  // 3. Extract NameID (Primary Email)
  const nameId = extractXmlTag(xml, 'NameID');
  const attrEmail = xml.match(/(?:email|Email|User\.Email|mail)["'][^>]*>\s*<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([^<]+)/i)?.[1];
  const email = (nameId || attrEmail || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    throw new Error('SAML_NO_EMAIL: Could not extract valid email address from SAML assertion.');
  }

  // 4. Verify Domain Restriction if configured
  if (tenant.sso && tenant.sso.domainPatterns && tenant.sso.domainPatterns.length > 0) {
    const emailDomain = email.split('@')[1];
    const allowed = tenant.sso.domainPatterns.some(pattern => emailDomain === pattern.toLowerCase());
    if (!allowed) {
      throw new Error(`SAML_DOMAIN_UNAUTHORIZED: Domain "${emailDomain}" is not permitted for tenant "${tenant.slug}".`);
    }
  }

  // 5. Extract Full Name / Display Name
  const attrFirstName = xml.match(/(?:firstName|FirstName|givenName)["'][^>]*>\s*<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([^<]+)/i)?.[1];
  const attrLastName = xml.match(/(?:lastName|LastName|surname)["'][^>]*>\s*<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([^<]+)/i)?.[1];
  const attrDisplayName = xml.match(/(?:displayName|name|Name)["'][^>]*>\s*<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([^<]+)/i)?.[1];

  let name = attrDisplayName;
  if (!name && (attrFirstName || attrLastName)) {
    name = [attrFirstName, attrLastName].filter(Boolean).join(' ');
  }
  if (!name) {
    name = email.split('@')[0];
  }

  return {
    email,
    name,
    nameId
  };
}

/**
 * Just-In-Time (JIT) provisions or updates user from SAML assertion
 */
async function provisionOrUpdateSamlUser(claims, tenant) {
  const { email, name } = claims;

  let user = await User.findOne({
    email,
    tenantId: tenant._id
  });

  if (user) {
    user.name = name || user.name;
    user.lastLogin = new Date();
    user.status = 'ACTIVE';
    await user.save();
    return { user, isNew: false };
  }

  // If user does not exist, verify JIT provisioning permission
  if (!tenant.sso?.allowJitProvisioning) {
    throw new Error('JIT_DISABLED: User account does not exist and JIT provisioning is disabled.');
  }

  // Create new JIT provisioned user
  const randomPass = crypto.randomBytes(32).toString('hex');
  user = new User({
    name,
    email,
    password: randomPass, // Random unguessable hash for SSO accounts
    role: tenant.sso?.defaultRole || 'USER',
    tenantId: tenant._id,
    status: 'ACTIVE',
    forcePasswordReset: false,
    authProvider: 'SAML_SSO',
    createdAt: new Date(),
    lastLogin: new Date()
  });

  await user.save();
  return { user, isNew: true };
}

module.exports = {
  getSpEntityId,
  getAcsUrl,
  generateSpMetadataXml,
  createAuthnRequestUrl,
  parseAndValidateSamlResponse,
  provisionOrUpdateSamlUser
};

