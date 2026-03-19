

const mongoose = require('mongoose');

/**
 * ProductionPolicy
 * GAP‑1 FIX: Product selection + serial policy must be locked & canonical
 * One policy per productId (NOT editable once used in stock ledger)
 */
const ProductionPolicySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      unique: true,
      index: true
    },

    serialEnabled: {
      type: Boolean,
      default: false
    },

    requireSerialIn: {
      type: Boolean,
      default: false
    },

    requireSerialOut: {
      type: Boolean,
      default: false
    },

    locked: {
      // Once stock movement happens → policy becomes immutable
      type: Boolean,
      default: false
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Note: Lock check moved to route handler to avoid mongoose middleware issues
// The route handler checks policy.locked before allowing updates

module.exports = mongoose.model('ProductionPolicy', ProductionPolicySchema);