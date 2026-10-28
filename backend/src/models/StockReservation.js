const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const RESERVATION_EXPIRY_HOURS = 72;

const stockReservationSchema = new mongoose.Schema({
  reservationCode: {
    type: String,
    index: true,
    trim: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    default: null,
    index: true
  },
  orderLineId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    default: null,
    index: true
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot',
    default: null
  },
  reservedQty: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    default: () => new Date(Date.now() + RESERVATION_EXPIRY_HOURS * 60 * 60 * 1000)
  },
  fulfilledAt: {
    type: Date,
    default: null
  },
  releasedAt: {
    type: Date,
    default: null
  },
  releasedReason: {
    type: String,
    trim: true,
    default: null
  },
  notes: {
    type: String,
    trim: true,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
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

stockReservationSchema.index({ tenantId: 1, productId: 1, status: 1 });
stockReservationSchema.index({ tenantId: 1, orderId: 1, status: 1 });
stockReservationSchema.index({ tenantId: 1, warehouseId: 1, status: 1 });
stockReservationSchema.index({ expiresAt: 1, status: 1 });

stockReservationSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('StockReservation', stockReservationSchema);
