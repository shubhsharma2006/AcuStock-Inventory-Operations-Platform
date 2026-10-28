const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const webhookDeliveryLogSchema = new mongoose.Schema({
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WebhookSubscription',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  event: {
    type: String,
    required: true,
    index: true
  },
  deliveryId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  url: {
    type: String,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  statusCode: {
    type: Number,
    default: null
  },
  responseBody: {
    type: String,
    default: null
  },
  durationMs: {
    type: Number,
    default: null
  },
  success: {
    type: Boolean,
    required: true,
    index: true
  },
  error: {
    type: String,
    default: null
  },
  attempt: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Auto-expire delivery logs after 30 days
webhookDeliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
webhookDeliveryLogSchema.index({ tenantId: 1, subscriptionId: 1, createdAt: -1 });

webhookDeliveryLogSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WebhookDeliveryLog', webhookDeliveryLogSchema);
