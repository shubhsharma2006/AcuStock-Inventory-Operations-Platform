const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  planId: {
    type: String,
    required: true,
    trim: true
  },
  gateway: {
    type: String,
    enum: ['RAZORPAY', 'STRIPE', 'DEMO'],
    required: true
  },
  gatewayOrderId: {
    type: String,
    trim: true,
    index: true
  },
  gatewayPaymentId: {
    type: String,
    trim: true,
    index: true
  },
  amountMinor: {
    type: Number,
    required: true // e.g. 99900 paise, 2900 cents
  },
  currency: {
    type: String,
    uppercase: true,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
    index: true
  },
  webhookEventId: {
    type: String,
    trim: true,
    index: true
  },
  customerEmail: {
    type: String,
    trim: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  errorMessage: {
    type: String
  },
  paidAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound unique indexes for idempotency (partialFilterExpression ensures nulls/undefined don't clash)
paymentTransactionSchema.index(
  { gateway: 1, gatewayPaymentId: 1 },
  { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } }
);

paymentTransactionSchema.index(
  { gateway: 1, webhookEventId: 1 },
  { unique: true, partialFilterExpression: { webhookEventId: { $type: 'string' } } }
);

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
