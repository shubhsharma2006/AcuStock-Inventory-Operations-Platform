const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const webhookSubscriptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  url: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        try {
          const parsed = new URL(v);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      message: 'Must be a valid HTTP or HTTPS URL'
    }
  },
  secret: {
    type: String,
    required: true,
    trim: true
  },
  events: [{
    type: String,
    required: true,
    enum: [
      'stock.in',
      'stock.out',
      'stock.low',
      'stock.reserved',
      'stock.released',
      'order.created',
      'order.fulfilled',
      'order.cancelled',
      'shipment.created',
      'shipment.delivered',
      'item.created',
      'item.updated'
    ]
  }],
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  failureCount: {
    type: Number,
    default: 0
  },
  lastTriggeredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

webhookSubscriptionSchema.index({ tenantId: 1, isActive: 1 });
webhookSubscriptionSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WebhookSubscription', webhookSubscriptionSchema);
