const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const warehouseLocationSchema = new mongoose.Schema({
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['ZONE', 'AISLE', 'RACK', 'SHELF', 'BIN'],
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 50
  },
  label: {
    type: String,
    trim: true,
    maxlength: 100
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WarehouseLocation',
    default: null,
    index: true
  },
  path: {
    type: String,
    trim: true,
    index: true
  },
  depth: {
    type: Number,
    min: 0,
    max: 4,
    default: 0
  },
  capacity: {
    maxUnits: { type: Number, min: 0, default: 0 },
    maxWeight: { type: Number, min: 0, default: 0 },
    maxVolume: { type: Number, min: 0, default: 0 }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isPickable: {
    type: Boolean,
    default: true
  },
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, default: 'cm' }
  },
  temperatureZone: {
    type: String,
    enum: ['AMBIENT', 'COLD', 'FROZEN', 'HAZMAT'],
    default: 'AMBIENT'
  },
  gridCoordinates: {
    aisleNumber: { type: Number, default: 1, index: true },
    bayNumber: { type: Number, default: 1 },
    shelfLevel: { type: Number, default: 1 },
    binIndex: { type: Number, default: 1 },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  zoneType: {
    type: String,
    enum: ['AMBIENT', 'COLD_STORAGE', 'HAZMAT', 'HIGH_VALUE', 'STAGING_DOCK', 'PACKING_STATION'],
    default: 'AMBIENT'
  },
  velocityClassification: {
    type: String,
    enum: ['FAST_A', 'MEDIUM_B', 'SLOW_C', 'UNASSIGNED'],
    default: 'UNASSIGNED'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

warehouseLocationSchema.index({ tenantId: 1, warehouseId: 1, code: 1 }, { unique: true });
warehouseLocationSchema.index({ tenantId: 1, warehouseId: 1, isActive: 1 });
warehouseLocationSchema.index({ tenantId: 1, path: 1 });

warehouseLocationSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('WarehouseLocation', warehouseLocationSchema);

