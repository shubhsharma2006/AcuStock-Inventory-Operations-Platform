const mongoose = require('mongoose');

/**
 * Tenant — SaaS multi-tenancy foundation.
 * Currently future-ready: tenantId fields are added to models
 * but isolation is not enforced until multi-tenancy is enabled.
 */
const tenantSchema = new mongoose.Schema({
  name: {
    type:     String,
    required: true,
    trim:     true
  },
  slug: {
    // URL-safe identifier, e.g. "acme-corp"
    type:      String,
    required:  true,
    unique:    true,
    lowercase: true,
    trim:      true,
    match:     /^[a-z0-9-]+$/
  },
  plan: {
    type:    String,
    enum:    ['free', 'starter', 'professional', 'enterprise'],
    default: 'free'
  },
  status: {
    type:    String,
    enum:    ['ACTIVE', 'TRIALING', 'PAST_DUE', 'SUSPENDED', 'CANCELED'],
    default: 'ACTIVE'
  },
  subscriptionStatus: {
    type: String,
    enum: ['INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED'],
    default: 'TRIALING',
    index: true
  },
  isActive: {
    type:    Boolean,
    default: true
  },
  // Stripe billing (future-ready)
  stripeCustomerId:     { type: String, select: false },
  stripeSubscriptionId: { type: String, select: false },
  planExpiresAt:        Date,
  gracePeriodEndsAt:    Date,
  billingUpdatedAt:     Date,
  // Limits per plan
  limits: {
    maxUsers:     { type: Number, default: 5 },
    maxItems:     { type: Number, default: 100 },
    maxStorage:   { type: Number, default: 1024 }, // MB
    maxAiQueries: { type: Number, default: 50 },
    maxOcrScans:  { type: Number, default: 10 }
  },
  usage: {
    users:      { type: Number, default: 0, min: 0 },
    items:      { type: Number, default: 0, min: 0 },
    companies:  { type: Number, default: 0, min: 0 },
    aiQueries:  { type: Number, default: 0, min: 0 },
    ocrScans:   { type: Number, default: 0, min: 0 }
  },
  settings: {
    timezone:   { type: String, default: 'Asia/Kolkata' },
    currency:   { type: String, default: 'INR' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    valuationMethod: { type: String, enum: ['FIFO', 'WEIGHTED_AVG'], default: 'FIFO' },
    negativeStockAllowed: { type: Boolean, default: false },
    lowStockAlertThreshold: { type: Number, default: 10 },
    invoicePrefix: { type: String, default: 'INV-2026-' },
    poPrefix: { type: String, default: 'PO-2026-' },
    transferPrefix: { type: String, default: 'TRF-' },
    grnPrefix: { type: String, default: 'GRN-' },
    defaultWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
    whatsappAlertsEnabled: { type: Boolean, default: false },
    lowStockEmailAlerts: { type: Boolean, default: true },
    dailyDigestEnabled: { type: Boolean, default: false },
    // Delivery Tracking Feature Flags & Configuration
    trackingModuleEnabled: { type: Boolean, default: true },
    trackingEnabled:       { type: Boolean, default: true },
    trackingCarriers:      { type: [String], default: ['PORTER', 'DELHIVERY', 'DTDC', 'BLUEDART'] },
    trackingPollInterval:  { type: Number, default: 15 }
  },
  branding: {
    legalName:    { type: String, trim: true },
    taxId:        { type: String, trim: true },
    supportEmail: { type: String, trim: true },
    phone:        { type: String, trim: true },
    website:      { type: String, trim: true },
    address: {
      street:  { type: String, trim: true },
      city:    { type: String, trim: true },
      state:   { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' }
    },
    logoUrl:      { type: String, trim: true },
    invoiceTerms: { type: String, trim: true, default: 'Payment is due within 30 days of invoice date. Thank you for your business!' }
  },
  // ── Custom Domain Configuration (Item 1.1) ──────────────────────────
  customDomain: {
    domain:             { type: String, trim: true, lowercase: true, index: true },
    verificationToken:  { type: String }, // Random challenge token for TXT record
    cnameTarget:        { type: String, default: 'cname.acustock.com' },
    status:             { type: String, enum: ['NONE', 'PENDING_DNS', 'VERIFIED', 'FAILED'], default: 'NONE' },
    verifiedAt:         Date,
    lastCheckedAt:      Date,
    sslStatus:          { type: String, enum: ['NONE', 'ACTIVE', 'PROVISIONING'], default: 'NONE' }
  },

  // ── Enterprise SAML 2.0 / SSO Configuration (Item 1.2) ──────────────
  sso: {
    enabled:             { type: Boolean, default: false },
    enforced:            { type: Boolean, default: false }, // Enforce SSO-only login for matching email domains
    domainPatterns:      [{ type: String, lowercase: true, trim: true }], // e.g. ['acme.com', 'acme.org']
    idpIssuer:           { type: String, trim: true },
    idpSsoUrl:           { type: String, trim: true }, // IdP Single Sign-On HTTP-Redirect URL
    idpCertificate:      { type: String, trim: true }, // PEM X.509 Certificate string
    allowJitProvisioning:{ type: Boolean, default: true }, // Just-In-Time user creation
    defaultRole:         { type: String, enum: ['USER', 'MANAGER'], default: 'USER' }
  },

  // ── Automated Overage Metering Configuration (Item 1.3) ──────────────
  overageConfig: {
    enabled:          { type: Boolean, default: false },
    itemUnitRate:     { type: Number, default: 0.05 }, // Currency rate per extra inventory item
    aiQueryUnitRate:  { type: Number, default: 0.02 }, // Rate per extra AI query
    ocrScanUnitRate:   { type: Number, default: 0.10 }, // Rate per extra OCR scan
    currency:         { type: String, default: 'USD' }
  },

  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Tenant', tenantSchema);
