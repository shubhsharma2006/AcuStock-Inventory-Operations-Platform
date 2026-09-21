const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: function() {
      return this.role !== 'USER'; // Email required for Admin and Manager
    },
    unique: true,   // enforced at DB level; sparse allows multiple null/missing values
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: function() {
      // Phone required for local User accounts (Google OAuth users don't have phone initially)
      return this.role === 'USER' && !this.googleId && this.authProvider !== 'google';
    },
    sparse: true,
    trim: true
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Never return password by default
  },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'],
    required: true
  },
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  
  // ============================================================
  // PASSWORD MANAGEMENT FIELDS (Production Ready)
  // ============================================================
  passwordChangedAt: {
    type: Date,
    default: Date.now
  },
  passwordChangedBy: {
    type: String,
    enum: ['SELF', 'ADMIN', 'MANAGER', 'SYSTEM', 'GOOGLE_OAUTH'],
    default: 'SYSTEM'
  },
  forcePasswordReset: {
    type: Boolean,
    default: false
  },
  
  // Password Reset Token (for forgot password flow)
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  // Failed Login Tracking
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  
  // ============================================================
  // END PASSWORD MANAGEMENT FIELDS
  // ============================================================
  
  // ============================================================
  // TWO-FACTOR AUTHENTICATION (2FA / TOTP)
  // ============================================================
  twoFactorEnabled: {
    type: Boolean,
    default: false,
    index: true
  },
  twoFactorSecretEncrypted: {
    type: String,
    select: false,
    default: null
  },
  twoFactorPendingSecretEncrypted: {
    type: String,
    select: false,
    default: null
  },
  twoFactorEnabledAt: {
    type: Date,
    default: null
  },
  twoFactorRecoveryCodes: {
    type: [{
      codeHash: { type: String, required: true },
      used:     { type: Boolean, default: false },
      usedAt:   { type: Date, default: null }
    }],
    select: false,
    default: []
  },
  lastLogin: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    default: null
  },
  customPermissions: {
    type: Map,
    of: Boolean,
    default: {}
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

// Method to increment failed login attempts
// Locks the account after 5 consecutive failures using an env override when provided.
userSchema.methods.incrementLoginAttempts = async function() {
  const newAttempts = (this.failedLoginAttempts || 0) + 1;
  const MAX_ATTEMPTS = 5;
  const configuredMinutes = Number.parseInt(process.env.LOCK_DURATION_MINUTES || '15', 10);
  const lockDurationMinutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
    ? configuredMinutes
    : 15;
  const LOCK_DURATION_MS = lockDurationMinutes * 60 * 1000;

  const update = { $set: { failedLoginAttempts: newAttempts } };

  if (newAttempts >= MAX_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
    update.$set.lockUntil = this.lockUntil;
  } else {
    this.lockUntil = null;
  }

  this.failedLoginAttempts = newAttempts;
  await this.updateOne(update);
};

// Method to reset failed login attempts on successful login
userSchema.methods.resetLoginAttempts = async function() {
  if (this.failedLoginAttempts > 0 || this.lockUntil) {
    await this.updateOne({
      $set: { failedLoginAttempts: 0 },
      $unset: { lockUntil: '' }
    });
  }
};

// Remove sensitive credentials from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  delete userObject.twoFactorSecret;
  delete userObject.twoFactorSecretEncrypted;
  delete userObject.twoFactorPendingSecretEncrypted;
  delete userObject.twoFactorRecoveryCodes;
  return userObject;
};

// Indexes
userSchema.index({ tenantId: 1, email: 1 });
userSchema.index({ tenantId: 1, role: 1, isDeleted: 1 });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
