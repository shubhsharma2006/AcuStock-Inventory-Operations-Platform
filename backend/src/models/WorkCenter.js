/**
 * WorkCenter Model — Shop-Floor Manufacturing Capacity
 * ─────────────────────────────────────────────────────────────
 * Represents manufacturing workstations, assembly lines, and testing cells.
 * Tracks machine/labor hourly costs, daily capacity, and OEE efficiency.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const workCenterSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  hourlyCost: {
    type: Number,
    required: true,
    default: 500,
    min: 0
  },
  capacityHoursPerDay: {
    type: Number,
    required: true,
    default: 16,
    min: 1
  },
  efficiencyPercent: {
    type: Number,
    default: 85,
    min: 1,
    max: 100
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'MAINTENANCE', 'OFFLINE'],
    default: 'ACTIVE',
    index: true
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

workCenterSchema.index({ tenantId: 1, code: 1 }, { unique: true });
workCenterSchema.index({ tenantId: 1, status: 1 });

workCenterSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WorkCenter', workCenterSchema);

