/**
 * ASN Model — Advanced Shipping Notice (Supplier Portal)
 * ─────────────────────────────────────────────────────────────
 * Enables suppliers to submit formal shipment notifications prior to gate arrival.
 * Captures carrier logistics, vehicle numbers, dispatch timestamps,
 * and pre-assigned lot numbers to expedite dock receiving.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const asnItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    trim: true,
    default: ''
  },
  quantityShipped: {
    type: Number,
    required: true,
    min: 1
  },
  lotNumber: {
    type: String,
    trim: true,
    default: ''
  }
});

const asnSchema = new mongoose.Schema({
  asnNumber: {
    type: String,
    required: true,
    trim: true
  },
  purchaseOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    index: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  carrierName: {
    type: String,
    trim: true,
    default: ''
  },
  vehicleNumber: {
    type: String,
    trim: true,
    default: ''
  },
  trackingNumber: {
    type: String,
    trim: true,
    default: ''
  },
  dispatchDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expectedArrivalDate: {
    type: Date,
    required: true
  },
  items: [asnItemSchema],
  status: {
    type: String,
    enum: ['DISPATCHED', 'ARRIVED_AT_GATE', 'RECEIVED', 'CANCELLED'],
    default: 'DISPATCHED',
    index: true
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

asnSchema.index({ tenantId: 1, asnNumber: 1 }, { unique: true });
asnSchema.index({ tenantId: 1, supplierId: 1, dispatchDate: -1 });

asnSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('ASN', asnSchema);

