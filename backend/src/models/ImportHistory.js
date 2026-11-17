const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const importErrorSchema = new mongoose.Schema({
  row: Number,
  field: String,
  message: String,
  rawData: mongoose.Schema.Types.Mixed
}, { _id: false });

const importHistorySchema = new mongoose.Schema({
  importNumber: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  entityType: {
    type: String,
    enum: ['PRODUCTS', 'COMPANIES', 'STOCK_IN', 'PURCHASE_ORDERS', 'LOCATIONS'],
    required: true,
    index: true
  },
  originalFileName: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    min: 0,
    default: 0
  },
  mimeType: {
    type: String,
    default: 'text/csv'
  },
  totalRows: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  skippedCount: {
    type: Number,
    default: 0
  },
  errors: [importErrorSchema],
  importedRecordIds: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  isRolledBack: {
    type: Boolean,
    default: false,
    index: true
  },
  rolledBackAt: Date,
  rolledBackBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK'],
    default: 'COMPLETED',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  suppressReservedKeysWarning: true
});

importHistorySchema.index({ tenantId: 1, importNumber: 1 }, { unique: true });
importHistorySchema.index({ tenantId: 1, entityType: 1, createdAt: -1 });

importHistorySchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('ImportHistory', importHistorySchema);
