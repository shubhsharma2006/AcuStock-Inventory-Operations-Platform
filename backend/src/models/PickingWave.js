/**
 * PickingWave Model — Wave, Batch & Cluster Fulfillment Engine
 * ─────────────────────────────────────────────────────────────
 * Consolidates lines across multiple Sales Orders into high-speed picking batches.
 * Orchestrates S-shape bin traversal and Put-Wall order sorting.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const pickItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  sku: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  barcode: {
    type: String,
    trim: true,
    default: ''
  },
  binLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation'
  },
  binCode: {
    type: String,
    trim: true,
    default: 'A01-R01-S01-B01'
  },
  sequenceOrder: {
    type: Number,
    default: 0
  },
  requiredQty: {
    type: Number,
    required: true,
    min: 1
  },
  pickedQty: {
    type: Number,
    default: 0,
    min: 0
  },
  toteBarcode: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'PICKED', 'SHORT_PICKED'],
    default: 'PENDING'
  },
  shortPickReason: {
    type: String,
    trim: true,
    default: ''
  }
});

const putWallCubbySchema = new mongoose.Schema({
  cubbyNumber: {
    type: Number,
    required: true
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    trim: true
  },
  customerName: {
    type: String,
    trim: true,
    default: ''
  },
  requiredItems: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    sku: String,
    name: String,
    quantity: Number
  }],
  sortedItems: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    sku: String,
    name: String,
    quantity: Number,
    sortedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['ASSIGNED', 'IN_PROGRESS', 'READY_TO_PACK', 'CLOSED'],
    default: 'ASSIGNED'
  }
});

const pickingWaveSchema = new mongoose.Schema({
  waveNumber: {
    type: String,
    required: true,
    trim: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    index: true
  },
  waveType: {
    type: String,
    enum: ['BATCH', 'CLUSTER', 'ZONE'],
    default: 'BATCH'
  },
  status: {
    type: String,
    enum: ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'PICKED', 'SORTING', 'COMPLETED', 'CANCELLED'],
    default: 'PLANNED',
    index: true
  },
  salesOrderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder'
  }],
  pickItems: [pickItemSchema],
  assignedPicker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  putWall: {
    wallId: {
      type: String,
      default: 'PW-01'
    },
    totalCubbies: {
      type: Number,
      default: 24
    },
    cubbies: [putWallCubbySchema]
  },
  metrics: {
    totalLines: {
      type: Number,
      default: 0
    },
    pickedLines: {
      type: Number,
      default: 0
    },
    totalUnits: {
      type: Number,
      default: 0
    },
    pickedUnits: {
      type: Number,
      default: 0
    },
    startedAt: Date,
    completedAt: Date
  },
  notes: {
    type: String,
    trim: true,
    default: ''
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

pickingWaveSchema.index({ tenantId: 1, waveNumber: 1 }, { unique: true });
pickingWaveSchema.index({ tenantId: 1, status: 1 });

pickingWaveSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('PickingWave', pickingWaveSchema);

