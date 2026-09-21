const mongoose = require('mongoose');
const crypto   = require('crypto');

/**
 * Invite model
 * One document per pending invite.
 * Deleted automatically 48 h after creation via TTL index (MongoDB handles cleanup).
 */
const inviteSchema = new mongoose.Schema({
  // Who will receive the invite
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },

  // Role the invited person will have upon accepting
  role: {
    type: String,
    enum: ['ADMIN', 'MANAGER', 'USER'],
    required: true
  },

  // Secure random token (stored as SHA-256 hash for safety)
  tokenHash: {
    type: String,
    required: true,
    select: false   // unique enforced via schema.index() below
  },

  // Who sent the invite
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Which company this invite belongs to (for multi-company support)
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'revoked'],
    default: 'pending'
  },

  // Expire after 48 hours — MongoDB TTL index auto-deletes the document
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// TTL index: MongoDB automatically deletes expired documents
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for fast token lookup
inviteSchema.index({ tokenHash: 1 });

// Index for checking duplicate pending invites per email per tenant
inviteSchema.index({ tenantId: 1, email: 1, status: 1 });
inviteSchema.index({ tenantId: 1, status: 1 });
inviteSchema.index({ email: 1, status: 1 });

/**
 * Generate a cryptographically secure invite token.
 * Returns { rawToken, tokenHash }
 * Store only tokenHash in DB. Send rawToken in the invite URL.
 */
inviteSchema.statics.generateToken = function () {
  const rawToken  = crypto.randomBytes(32).toString('hex'); // 64-char hex
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
};

/**
 * Hash a raw token for DB lookup.
 */
inviteSchema.statics.hashToken = function (rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
inviteSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Invite', inviteSchema);
