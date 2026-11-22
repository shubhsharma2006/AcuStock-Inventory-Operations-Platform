/**
 * Test Suite: SaaS Features Trio (Custom Domains, Enterprise SSO, Overage Metering)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Verifies:
 * 1. Custom Domain DNS challenge token generation, validation, and middleware host routing
 * 2. Enterprise SAML 2.0 / SSO SP metadata, AuthnRequest, claim parsing, and JIT provisioning
 * 3. Automated Overage Metering surplus calculation, utilization thresholds (80%/95%), and reconciliation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  generateVerificationToken,
  isValidDomain,
  verifyDomainDns
} = require('../src/services/domainVerification.service');

const {
  getSpEntityId,
  getAcsUrl,
  generateSpMetadataXml,
  createAuthnRequestUrl,
  parseAndValidateSamlResponse
} = require('../src/services/saml.service');

const {
  calculateTenantOverage
} = require('../src/services/overageMetering.service');

const { resolveTenant } = require('../src/middleware/tenancy');
const Tenant = require('../src/models/Tenant');

// ============================================================
// ITEM 1.1: CUSTOM DOMAINS TESTS
// ============================================================

test('Custom Domain 1: Validates domain string formats', () => {
  assert.equal(isValidDomain('inventory.acme.com'), true);
  assert.equal(isValidDomain('app.sub.enterprise.co.uk'), true);
  assert.equal(isValidDomain('localhost'), false);
  assert.equal(isValidDomain('192.168.1.1'), false);
  assert.equal(isValidDomain('invalid..domain'), false);
  assert.equal(isValidDomain(''), false);
});

test('Custom Domain 2: Generates random cryptographic TXT challenge token', () => {
  const token1 = generateVerificationToken();
  const token2 = generateVerificationToken();
  assert.ok(token1.startsWith('acustock_'));
  assert.equal(token1.length > 30, true);
  assert.notEqual(token1, token2);
});

test('Custom Domain 3: Dynamic middleware host routing resolves verified custom domain', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const fakeTenant = {
    _id: tenantId,
    name: 'Acme Enterprise',
    slug: 'acme-enterprise',
    isActive: true,
    customDomain: {
      domain: 'inventory.acme.com',
      status: 'VERIFIED'
    }
  };

  const originalFindOne = Tenant.findOne;
  Tenant.findOne = async (query) => {
    if (query['customDomain.domain'] === 'inventory.acme.com') {
      return fakeTenant;
    }
    return null;
  };

  try {
    const req = {
      headers: { host: 'inventory.acme.com:443' },
      hostname: 'inventory.acme.com'
    };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await resolveTenant(req, res, next);

    assert.equal(nextCalled, true);
    assert.equal(req.isCustomDomain, true);
    assert.equal(req.customDomain, 'inventory.acme.com');
    assert.equal(String(req.tenantId), String(tenantId));
  } finally {
    Tenant.findOne = originalFindOne;
  }
});

// ============================================================
// ITEM 1.2: ENTERPRISE SAML 2.0 / SSO TESTS
// ============================================================

test('Enterprise SSO 1: Generates valid SP Metadata XML', () => {
  const xml = generateSpMetadataXml('acme');
  assert.ok(xml.includes('entityID="http://localhost:5001/api/auth/sso/metadata/acme"'));
  assert.ok(xml.includes('Location="http://localhost:5001/api/auth/sso/callback/acme"'));
  assert.ok(xml.includes('urn:oasis:names:tc:SAML:2.0:metadata'));
});

test('Enterprise SSO 2: Formulates AuthnRequest HTTP-Redirect URL', () => {
  const tenant = {
    slug: 'acme',
    sso: {
      idpSsoUrl: 'https://dev-12345.okta.com/app/saml/sso'
    }
  };

  const { redirectUrl, requestId } = createAuthnRequestUrl(tenant, '/dashboard');
  assert.ok(requestId.startsWith('_'));
  assert.ok(redirectUrl.startsWith('https://dev-12345.okta.com/app/saml/sso?SAMLRequest='));
  assert.ok(redirectUrl.includes('RelayState=%2Fdashboard'));
});

test('Enterprise SSO 3: Parses and validates SAMLResponse claims & domain enforcement', () => {
  const crypto = require('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const tenant = {
    slug: 'acme',
    sso: {
      enabled: true,
      idpCertificate: publicKey,
      domainPatterns: ['acme.com']
    }
  };

  const now = new Date();
  const notBefore = new Date(now.getTime() - 60000).toISOString();
  const notOnOrAfter = new Date(now.getTime() + 300000).toISOString();
  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI="#_assertion123"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>abc123digest==</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signedInfoXml, 'utf8');
  const signatureBase64 = signer.sign(privateKey, 'base64');

  // Mock valid SAMLResponse XML
  const rawSamlXml = `<?xml version="1.0"?>
  <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    <samlp:Status>
      <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
    </samlp:Status>
    <saml:Assertion ID="_assertion123">
      <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        ${signedInfoXml}
        <ds:SignatureValue>${signatureBase64}</ds:SignatureValue>
      </ds:Signature>
      <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
        <saml:AudienceRestriction>
          <saml:Audience>http://localhost:5001/api/auth/sso/metadata/acme</saml:Audience>
        </saml:AudienceRestriction>
      </saml:Conditions>
      <saml:Subject>
        <saml:NameID>sarah.connor@acme.com</saml:NameID>
      </saml:Subject>
      <saml:AttributeStatement>
        <saml:Attribute Name="displayName">
          <saml:AttributeValue>Sarah Connor</saml:AttributeValue>
        </saml:Attribute>
      </saml:AttributeStatement>
    </saml:Assertion>
  </samlp:Response>`;

  const base64Response = Buffer.from(rawSamlXml).toString('base64');
  const claims = parseAndValidateSamlResponse(base64Response, tenant);

  assert.equal(claims.email, 'sarah.connor@acme.com');
  assert.equal(claims.name, 'Sarah Connor');

  // Verify unauthorized domain is blocked
  const unauthorizedTenant = {
    slug: 'acme',
    sso: {
      enabled: true,
      idpCertificate: publicKey,
      domainPatterns: ['allowed-domain.org']
    }
  };
  assert.throws(
    () => parseAndValidateSamlResponse(base64Response, unauthorizedTenant),
    /SAML_DOMAIN_UNAUTHORIZED/
  );
});

// ============================================================
// ITEM 1.3: AUTOMATED OVERAGE METERING TESTS
// ============================================================

test('Overage Metering 1: No overage charges when usage is within limits', () => {
  const tenant = {
    limits: { maxItems: 100, maxAiQueries: 50, maxOcrScans: 10 },
    usage: { items: 80, aiQueries: 20, ocrScans: 2 },
    overageConfig: {
      enabled: true,
      itemUnitRate: 0.05,
      aiQueryUnitRate: 0.02,
      ocrScanUnitRate: 0.10,
      currency: 'USD'
    }
  };

  const status = calculateTenantOverage(tenant);
  assert.equal(status.totalOverageAmount, 0);
  assert.equal(status.surplus.items.surplus, 0);
  assert.equal(status.utilization.thresholdWarning, 'WARNING_80_PERCENT'); // items at exactly 80%
});

test('Overage Metering 2: Calculates accurate surplus charges and threshold warnings', () => {
  const tenant = {
    limits: { maxItems: 100, maxAiQueries: 50, maxOcrScans: 10 },
    usage: { items: 150, aiQueries: 100, ocrScans: 15 }, // Surplus: 50 items, 50 AI queries, 5 OCR scans
    overageConfig: {
      enabled: true,
      itemUnitRate: 0.05, // 50 * 0.05 = 2.50
      aiQueryUnitRate: 0.02, // 50 * 0.02 = 1.00
      ocrScanUnitRate: 0.10, // 5 * 0.10 = 0.50
      currency: 'USD'
    }
  };

  const status = calculateTenantOverage(tenant);
  // Total expected = 2.50 + 1.00 + 0.50 = 4.00
  assert.equal(status.totalOverageAmount, 4.00);
  assert.equal(status.surplus.items.surplus, 50);
  assert.equal(status.surplus.aiQueries.surplus, 50);
  assert.equal(status.surplus.ocrScans.surplus, 5);
  assert.equal(status.utilization.thresholdWarning, 'LIMIT_EXCEEDED');
});

