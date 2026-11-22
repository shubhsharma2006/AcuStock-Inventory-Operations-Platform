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
 * Normalizes an X.509 certificate string into valid PEM format
 */
function formatPemCertificate(certStr) {
  if (!certStr || typeof certStr !== 'string') return null;
  const clean = certStr
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!clean) return null;
  return `-----BEGIN CERTIFICATE-----\n${clean.match(/.{1,64}/g)?.join('\n') || clean}\n-----END CERTIFICATE-----`;
}

/**
 * Extracts clean XML value by tag name
 */
function extractXmlTag(xml, tagName) {
  const match = xml.match(new RegExp(`<(?:[a-zA-Z0-9]+:)?${tagName}[^>]*>([^<]+)<\\/(?:[a-zA-Z0-9]+:)?${tagName}>`, 'i'));
  return match ? match[1].trim() : null;
}

/**
 * Cryptographically verifies XML Digital Signature in SAMLResponse or Assertion
 * against tenant's configured IdP X.509 certificate.
 *
 * @param {string} xml
 * @param {string} idpCertificate
 */
function verifySamlSignature(xml, idpCertificate) {
  if (!idpCertificate) {
    throw new Error('SAML_IDP_CERTIFICATE_MISSING: Tenant SSO configuration lacks a trusted IdP X.509 certificate.');
  }

  // 1. Locate <ds:Signature> or <Signature> block
  const sigMatch = xml.match(/<(?:\w+:)?Signature[\s>][\s\S]*?<\/(?:\w+:)?Signature>/i);
  if (!sigMatch) {
    throw new Error('SAML_SIGNATURE_MISSING: SAML assertion does not contain a digital signature.');
  }

  const sigBlock = sigMatch[0];

  // 2. Extract SignedInfo block
  const signedInfoMatch = sigBlock.match(/<(?:\w+:)?SignedInfo[\s>][\s\S]*?<\/(?:\w+:)?SignedInfo>/i);
  if (!signedInfoMatch) {
    throw new Error('SAML_SIGNATURE_MALFORMED: Missing SignedInfo in SAML digital signature.');
  }
  const signedInfoXml = signedInfoMatch[0];

  // 3. Extract SignatureValue
  const sigValueMatch = sigBlock.match(/<(?:\w+:)?SignatureValue[^>]*>([\s\S]*?)<\/(?:\w+:)?SignatureValue>/i);
  if (!sigValueMatch) {
    throw new Error('SAML_SIGNATURE_MALFORMED: Missing SignatureValue in SAML digital signature.');
  }
  const signatureValueBase64 = sigValueMatch[1].replace(/\s+/g, '');

  // 4. Resolve signature algorithm (RSA-SHA256, RSA-SHA1, RSA-SHA384, RSA-SHA512)
  const methodMatch = signedInfoXml.match(/<(?:\w+:)?SignatureMethod\s+Algorithm=["']([^"']+)["']/i);
  const methodUri = methodMatch ? methodMatch[1] : '';
  let hashAlg = 'RSA-SHA256';
  if (methodUri.includes('rsa-sha1') || methodUri.endsWith('#rsa-sha1')) {
    hashAlg = 'RSA-SHA1';
  } else if (methodUri.includes('rsa-sha384')) {
    hashAlg = 'RSA-SHA384';
  } else if (methodUri.includes('rsa-sha512')) {
    hashAlg = 'RSA-SHA512';
  }

  const pem = formatPemCertificate(idpCertificate);
  if (!pem) {
    throw new Error('SAML_IDP_CERTIFICATE_INVALID: Malformed IdP certificate.');
  }

  let isValid = false;
  try {
    const verifier = crypto.createVerify(hashAlg);
    verifier.update(signedInfoXml, 'utf8');
    isValid = verifier.verify(pem, Buffer.from(signatureValueBase64, 'base64'));
  } catch (err) {
    // Fallback: Attempt verification with public key PEM if cert parsing throws
    try {
      const cleanKey = idpCertificate
        .replace(/-----BEGIN (CERTIFICATE|PUBLIC KEY)-----/g, '')
        .replace(/-----END (CERTIFICATE|PUBLIC KEY)-----/g, '')
        .replace(/\s+/g, '');
      const pubPem = `-----BEGIN PUBLIC KEY-----\n${cleanKey.match(/.{1,64}/g)?.join('\n') || cleanKey}\n-----END PUBLIC KEY-----`;
      const verifier = crypto.createVerify(hashAlg);
      verifier.update(signedInfoXml, 'utf8');
      isValid = verifier.verify(pubPem, Buffer.from(signatureValueBase64, 'base64'));
    } catch {
      throw new Error(`SAML_SIGNATURE_VERIFICATION_ERROR: ${err.message}`);
    }
  }

  if (!isValid) {
    throw new Error('SAML_SIGNATURE_INVALID: Identity provider digital signature verification failed. The assertion may be forged or tampered.');
  }

  return true;
}

/**
 * Verifies SAML assertion conditions (NotBefore, NotOnOrAfter)
 *
 * @param {string} xml
 */
function verifySamlConditions(xml) {
  const conditionsMatch = xml.match(/<(?:\w+:)?Conditions\s+([^>]+)>/i);
  if (!conditionsMatch) return true;

  const attrs = conditionsMatch[1];
  const notBeforeMatch = attrs.match(/NotBefore=["']([^"']+)["']/i);
  const notOnOrAfterMatch = attrs.match(/NotOnOrAfter=["']([^"']+)["']/i);
  const now = Date.now();
  const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 min clock skew tolerance

  if (notBeforeMatch) {
    const notBefore = Date.parse(notBeforeMatch[1]);
    if (!isNaN(notBefore) && (now + CLOCK_SKEW_MS) < notBefore) {
      throw new Error(`SAML_ASSERTION_NOT_YET_VALID: Assertion is not valid before ${notBeforeMatch[1]}.`);
    }
  }

  if (notOnOrAfterMatch) {
    const notOnOrAfter = Date.parse(notOnOrAfterMatch[1]);
    if (!isNaN(notOnOrAfter) && (now - CLOCK_SKEW_MS) > notOnOrAfter) {
      throw new Error(`SAML_ASSERTION_EXPIRED: Assertion expired at ${notOnOrAfterMatch[1]}.`);
    }
  }

  return true;
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

  if (!tenant || !tenant.sso || !tenant.sso.enabled) {
    throw new Error('SSO_DISABLED: Enterprise SSO is disabled for this tenant.');
  }

  const xmlBuffer = Buffer.from(samlResponseBase64, 'base64');
  const xml = xmlBuffer.toString('utf8');

  // 1. Digital Signature Verification (Critical Security Check)
  verifySamlSignature(xml, tenant.sso.idpCertificate);

  // 2. Assertion Conditions (NotBefore, NotOnOrAfter)
  verifySamlConditions(xml);

  // 3. Status Code Check
  const statusCode = extractXmlTag(xml, 'StatusCode');
  if (statusCode && !statusCode.includes('Success')) {
    throw new Error(`SAML_AUTH_FAILED: IdP returned non-success status "${statusCode}".`);
  }

  // 4. Audience Restriction Check
  const audience = extractXmlTag(xml, 'Audience');
  const expectedEntityId = getSpEntityId(tenant.slug);
  if (audience && audience !== expectedEntityId) {
    throw new Error(`SAML_AUDIENCE_MISMATCH: Assertion audience "${audience}" did not match "${expectedEntityId}".`);
  }

  // 5. Extract NameID (Primary Email)
  const nameId = extractXmlTag(xml, 'NameID');
  const attrEmail = xml.match(/(?:email|Email|User\.Email|mail)["'][^>]*>\s*<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([^<]+)/i)?.[1];
  const email = (nameId || attrEmail || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    throw new Error('SAML_NO_EMAIL: Could not extract valid email address from SAML assertion.');
  }

  // 6. Verify Domain Restriction if configured
  if (tenant.sso && tenant.sso.domainPatterns && tenant.sso.domainPatterns.length > 0) {
    const emailDomain = email.split('@')[1];
    const allowed = tenant.sso.domainPatterns.some(pattern => emailDomain === pattern.toLowerCase());
    if (!allowed) {
      throw new Error(`SAML_DOMAIN_UNAUTHORIZED: Domain "${emailDomain}" is not permitted for tenant "${tenant.slug}".`);
    }
  }

  // 7. Extract Full Name / Display Name
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
    // SECURITY: Preserve local administrative suspension / deactivation.
    // An SSO login must NEVER overturn a suspension or restore an offboarded user.
    if (
      user.status === 'SUSPENDED' ||
      user.employmentStatus === 'SUSPENDED' ||
      user.employmentStatus === 'TERMINATED' ||
      user.isActive === false
    ) {
      throw new Error('ACCOUNT_SUSPENDED: Your account has been suspended or deactivated by an administrator. Please contact your organization administrator.');
    }

    user.name = name || user.name;
    user.lastLogin = new Date();
    // Do NOT overwrite user.status or user.employmentStatus! Keep existing status.
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
    employmentStatus: 'ACTIVE',
    isActive: true,
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
  formatPemCertificate,
  verifySamlSignature,
  verifySamlConditions,
  parseAndValidateSamlResponse,
  provisionOrUpdateSamlUser
};

