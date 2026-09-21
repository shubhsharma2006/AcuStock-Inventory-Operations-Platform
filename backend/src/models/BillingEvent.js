const mongoose = require('mongoose');

const billingEventSchema = new mongoose.Schema({
  stripeEventId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'],
    default: 'PROCESSING',
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  error: {
    type: String,
    maxlength: 1000
  },
  attempts: { type: Number, default: 0, min: 0 },
  nextRetryAt: Date,
  deadLetterAt: Date,
  processedAt: Date
}, { timestamps: true });

billingEventSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('BillingEvent', billingEventSchema);
