const mongoose = require('mongoose');

/**
 * Report — stores generated scheduled reports for retrieval via API.
 * Each document represents one generated report snapshot.
 */
const reportSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['daily_summary', 'weekly_low_stock', 'monthly_overview'],
    required: true
  },
  period: {
    // ISO date string for the period start (e.g. "2024-01-15" for daily, "2024-W03" for weekly)
    type: String,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  data: {
    // Flexible JSON payload — structure depends on report type
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  recipientRoles: {
    type: [String],
    enum: ['ADMIN', 'MANAGER'],
    default: ['ADMIN']
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  emailError: String,
  generatedBy: {
    type: String,
    enum: ['scheduler', 'manual'],
    default: 'scheduler'
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

// Indexes for efficient list queries (most recent first per tenant)
reportSchema.index({ tenantId: 1, type: 1, generatedAt: -1 });
reportSchema.index({ tenantId: 1, generatedAt: -1 });
reportSchema.index({ type: 1, generatedAt: -1 });
reportSchema.index({ generatedAt: -1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
reportSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Report', reportSchema);
