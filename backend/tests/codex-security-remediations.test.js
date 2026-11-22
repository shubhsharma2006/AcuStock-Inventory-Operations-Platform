'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const samlService = require('../src/services/saml.service');
const GatewayResolver = require('../src/services/payment/GatewayResolver');
const PaymentService = require('../src/services/payment/PaymentService');

// ============================================================
// 1. CRITICAL: SAML Digital Signature & Conditions Verification
// ============================================================
test('Codex Fix 1.1: SAML signature verification accepts valid RSA-SHA256 signature', () => {
  // Generate transient RSA-2048 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const tenant = {
    slug: 'acme-corp',
    sso: {
      enabled: true,
      idpCertificate: publicKey,
      domainPatterns: ['acme.com']
    }
  };

  const spEntityId = samlService.getSpEntityId(tenant.slug);
  const now = new Date();
  const notBefore = new Date(now.getTime() - 60000).toISOString();
  const notOnOrAfter = new Date(now.getTime() + 300000).toISOString();

  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI="#_assertion123"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>abc123digest==</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signedInfoXml, 'utf8');
  const signatureBase64 = signer.sign(privateKey, 'base64');

  const validSamlXml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_resp123">
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_assertion123">
    <saml:Issuer>https://idp.acme.com</saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      ${signedInfoXml}
      <ds:SignatureValue>${signatureBase64}</ds:SignatureValue>
    </ds:Signature>
    <saml:Subject>
      <saml:NameID>alice@acme.com</saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">
      <saml:AudienceRestriction>
        <saml:Audience>${spEntityId}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
</samlp:Response>`;

  const samlBase64 = Buffer.from(validSamlXml, 'utf8').toString('base64');
  const claims = samlService.parseAndValidateSamlResponse(samlBase64, tenant);

  assert.equal(claims.email, 'alice@acme.com');
  assert.equal(claims.nameId, 'alice@acme.com');
});

test('Codex Fix 1.2: SAML signature verification rejects forged or tampered signature', () => {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });

  const tenant = {
    slug: 'acme-corp',
    sso: {
      enabled: true,
      idpCertificate: publicKey,
      domainPatterns: ['acme.com']
    }
  };

  const spEntityId = samlService.getSpEntityId(tenant.slug);
  const signedInfoXml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/></ds:SignedInfo>`;
  const bogusSignature = Buffer.from('forged_invalid_signature_bytes').toString('base64');

  const tamperedSamlXml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      ${signedInfoXml}
      <ds:SignatureValue>${bogusSignature}</ds:SignatureValue>
    </ds:Signature>
    <saml:Subject><saml:NameID>attacker@acme.com</saml:NameID></saml:Subject>
    <saml:Conditions>
      <saml:AudienceRestriction><saml:Audience>${spEntityId}</saml:Audience></saml:AudienceRestriction>
    </saml:Conditions>
  </saml:Assertion>
</samlp:Response>`;

  const samlBase64 = Buffer.from(tamperedSamlXml, 'utf8').toString('base64');

  assert.throws(
    () => samlService.parseAndValidateSamlResponse(samlBase64, tenant),
    /SAML_SIGNATURE_INVALID/
  );
});

test('Codex Fix 1.3: SAML rejects response without digital signature', () => {
  const tenant = {
    slug: 'acme-corp',
    sso: {
      enabled: true,
      idpCertificate: '-----BEGIN CERTIFICATE-----\nMIIB...fake\n-----END CERTIFICATE-----'
    }
  };

  const unsignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
  <samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    <saml:Subject><saml:NameID>user@acme.com</saml:NameID></saml:Subject>
  </saml:Assertion>
</samlp:Response>`;

  const samlBase64 = Buffer.from(unsignedXml, 'utf8').toString('base64');

  assert.throws(
    () => samlService.parseAndValidateSamlResponse(samlBase64, tenant),
    /SAML_SIGNATURE_MISSING/
  );
});

test('Codex Fix 1.4: SAML rejects expired assertion (NotOnOrAfter in past)', () => {
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hr ago
  const expiredXml = `<saml:Conditions NotBefore="2020-01-01T00:00:00Z" NotOnOrAfter="${pastDate}">
  </saml:Conditions>`;

  assert.throws(
    () => samlService.verifySamlConditions(expiredXml),
    /SAML_ASSERTION_EXPIRED/
  );
});

// ============================================================
// 2. HIGH: Preservation of User Suspension on SSO Login
// ============================================================
test('Codex Fix 2.1: SSO login preserves SUSPENDED user status and rejects with 403', async () => {
  const tenant = { _id: 'tenant_123', slug: 'acme-corp', sso: { enabled: true } };
  const claims = { email: 'suspended.worker@acme.com', name: 'Suspended Worker' };

  // Mock User model behavior for unit test
  const User = require('../src/models/User');
  const originalFindOne = User.findOne;

  try {
    const mockSuspendedUser = {
      _id: 'user_999',
      name: 'Suspended Worker',
      email: 'suspended.worker@acme.com',
      status: 'SUSPENDED',
      employmentStatus: 'SUSPENDED',
      isActive: false,
      save: async function() {
        // If save is invoked, status must NOT be ACTIVE
        assert.notEqual(this.status, 'ACTIVE');
      }
    };

    User.findOne = async () => mockSuspendedUser;

    await assert.rejects(
      async () => await samlService.provisionOrUpdateSamlUser(claims, tenant),
      /ACCOUNT_SUSPENDED/
    );

    // Verify status was not reversed
    assert.equal(mockSuspendedUser.status, 'SUSPENDED');
    assert.equal(mockSuspendedUser.isActive, false);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('Codex Fix 2.2: Active user SSO login preserves status and updates lastLogin', async () => {
  const tenant = { _id: 'tenant_123', slug: 'acme-corp', sso: { enabled: true } };
  const claims = { email: 'active.worker@acme.com', name: 'Active Worker' };

  const User = require('../src/models/User');
  const originalFindOne = User.findOne;

  try {
    let saved = false;
    const mockActiveUser = {
      _id: 'user_888',
      name: 'Active Worker',
      email: 'active.worker@acme.com',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      isActive: true,
      lastLogin: null,
      save: async function() {
        saved = true;
      }
    };

    User.findOne = async () => mockActiveUser;

    const result = await samlService.provisionOrUpdateSamlUser(claims, tenant);
    assert.equal(result.isNew, false);
    assert.equal(saved, true);
    assert.ok(mockActiveUser.lastLogin instanceof Date);
    assert.equal(mockActiveUser.status, 'ACTIVE');
  } finally {
    User.findOne = originalFindOne;
  }
});

// ============================================================
// 3. HIGH: Mandatory JWT Secret & Secret Validation in Production
// ============================================================
test('Codex Fix 3.1: docker-compose.production.yml requires mandatory JWT_SECRET without predictable fallback', () => {
  const composePath = path.join(__dirname, '..', '..', 'docker-compose.production.yml');
  const composeContent = fs.readFileSync(composePath, 'utf8');

  // Must NOT contain the vulnerable fallback
  assert.equal(
    composeContent.includes('acustock_production_jwt_secret_key_9999'),
    false,
    'Predictable fallback secret "acustock_production_jwt_secret_key_9999" must not exist in production compose'
  );

  // Must enforce variable presence with :?
  assert.ok(
    composeContent.includes('JWT_SECRET: ${JWT_SECRET:?'),
    'Production compose must use ${JWT_SECRET:? mandatory check'
  );

  assert.ok(
    composeContent.includes('REDIS_URL: redis://:${REDIS_PASSWORD:?'),
    'Production compose must use ${REDIS_PASSWORD:? mandatory check'
  );
});

// ============================================================
// 4. MEDIUM: Reject Demo Gateway in Live Checkout
// ============================================================
test('Codex Fix 4.1: GatewayResolver rejects demo gateway when PAYMENT_MODE is live', () => {
  const oldMode = process.env.PAYMENT_MODE;
  process.env.PAYMENT_MODE = 'live';

  try {
    const resolver = new GatewayResolver();

    // Passing requestedGateway: 'demo' in live mode must throw DEMO_GATEWAY_PROHIBITED
    assert.throws(
      () => resolver.resolve({ requestedGateway: 'demo', currency: 'INR' }),
      /DEMO_GATEWAY_PROHIBITED/
    );

    // Default live resolution with INR -> Razorpay
    const liveGateway = resolver.resolve({ currency: 'INR' });
    assert.equal(liveGateway.name.toUpperCase(), 'RAZORPAY');

    // Default live resolution with USD -> Stripe
    const stripeGateway = resolver.resolve({ currency: 'USD' });
    assert.equal(stripeGateway.name.toUpperCase(), 'STRIPE');
  } finally {
    process.env.PAYMENT_MODE = oldMode;
  }
});

test('Codex Fix 4.2: PaymentService rejects verifying demo transactions when PAYMENT_MODE is live', async () => {
  const oldMode = process.env.PAYMENT_MODE;
  process.env.PAYMENT_MODE = 'live';

  const PaymentTransaction = require('../src/models/PaymentTransaction');
  const originalFindOne = PaymentTransaction.findOne;

  try {
    // Mock an attacker trying to verify a simulated demo transaction in live mode
    PaymentTransaction.findOne = async () => ({
      transactionId: 'tx_demo_exploit',
      gateway: 'demo',
      status: 'PENDING'
    });

    await assert.rejects(
      async () => await PaymentService.verifyClientPayment({ transactionId: 'tx_demo_exploit' }),
      /DEMO_PAYMENT_PROHIBITED/
    );
  } finally {
    PaymentTransaction.findOne = originalFindOne;
    process.env.PAYMENT_MODE = oldMode;
  }
});

test('Codex Fix 4.3: Demo mode allows demo gateway resolution in non-live development mode', () => {
  const oldMode = process.env.PAYMENT_MODE;
  const oldEnv = process.env.NODE_ENV;
  process.env.PAYMENT_MODE = 'demo';
  process.env.NODE_ENV = 'development';

  try {
    const resolver = new GatewayResolver();
    const gw = resolver.resolve({ requestedGateway: 'demo', currency: 'INR' });
    assert.equal(gw.name.toUpperCase(), 'DEMO');
  } finally {
    process.env.PAYMENT_MODE = oldMode;
    process.env.NODE_ENV = oldEnv;
  }
});
