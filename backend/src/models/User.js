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
      return this.role === 'USER'; // Phone required for User
    },
    sparse: true,
    trim: true
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
    enum: ['SELF', 'ADMIN', 'MANAGER', 'SYSTEM'],
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
  
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  lastLogin: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
// Locks the account for 15 minutes after 5 consecutive failures
userSchema.methods.incrementLoginAttempts = async function() {
  const newAttempts = (this.failedLoginAttempts || 0) + 1;
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 2 * 60 * 1000; // 15 minutes

  const update = { $set: { failedLoginAttempts: newAttempts } };

  if (newAttempts >= MAX_ATTEMPTS) {
    update.$set.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
  }

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

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;
  delete userObject.twoFactorSecret;
  return userObject;
};

// Index for password reset token lookup
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
