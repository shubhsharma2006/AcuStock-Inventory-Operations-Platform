const mongoose = require('mongoose');

const quotaReservationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  usageKey: { type: String, enum: ['users', 'items', 'companies'], required: true },
  status: { type: String, enum: ['ACTIVE', 'COMMITTED', 'RELEASED'], default: 'ACTIVE', index: true },
  expiresAt: { type: Date, required: true, index: true },
  releasedAt: Date,
  committedAt: Date
}, { timestamps: true });

quotaReservationSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('QuotaReservation', quotaReservationSchema);
