/**
 * Counter Model — Tenant-Scoped Atomic Sequence Generator
 * ─────────────────────────────────────────────────────────────
 * Generates monotonic, collision-free sequential numbers per tenant.
 *
 * Usage:
 *   const nextNum = await Counter.getNextSequence(tenantId, 'SALES_ORDER', 'SO', 6);
 *   // Result: "SO-000001"
 */

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['SALES_ORDER', 'PURCHASE_ORDER', 'SHIPMENT', 'INVOICE', 'SKU', 'TRANSFER'],
    index: true
  },
  sequence: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Compound unique index ensuring each tenant has exactly one counter per document type
counterSchema.index({ tenantId: 1, type: 1 }, { unique: true });

/**
 * Atomically increments and returns the next formatted sequence number for a tenant.
 *
 * @param {import('mongoose').Types.ObjectId|string} tenantId
 * @param {'SALES_ORDER'|'PURCHASE_ORDER'|'SHIPMENT'|'INVOICE'} type
 * @param {string} prefix - e.g. "SO", "PO", "INV", "SHP"
 * @param {number} padLength - e.g. 6 -> "000001"
 * @param {import('mongoose').ClientSession} [session] - Optional transaction session
 * @returns {Promise<string>} e.g. "SO-000001"
 */
counterSchema.statics.getNextSequence = async function(tenantId, type, prefix = '', padLength = 6, session = null) {
  if (!tenantId) {
    throw new Error('[Counter] tenantId is required to generate sequence');
  }

  const options = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  };
  if (session) {
    options.session = session;
  }

  const counter = await this.findOneAndUpdate(
    { tenantId, type },
    { $inc: { sequence: 1 } },
    options
  );

  const numStr = String(counter.sequence).padStart(padLength, '0');
  return prefix ? `${prefix}-${numStr}` : numStr;
};

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
counterSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Counter', counterSchema);
