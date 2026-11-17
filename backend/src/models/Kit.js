const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const kitComponentSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.001
  },
  isOptional: {
    type: Boolean,
    default: false
  },
  substituteItemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: 200
  },
  scrapFactorPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  leadTimeOffsetDays: {
    type: Number,
    default: 0,
    min: 0
  }
}, { _id: true });

const kitSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  parentItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['STATIC_BUNDLE', 'ASSEMBLY'],
    default: 'STATIC_BUNDLE',
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  components: {
    type: [kitComponentSchema],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Kit/Bundle must have at least one component'
    }
  },
  pricingStrategy: {
    type: String,
    enum: ['SUM_COMPONENTS', 'FIXED', 'DISCOUNT_PERCENT'],
    default: 'SUM_COMPONENTS'
  },
  fixedPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  discountPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  assemblyInstructions: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  estimatedAssemblyMinutes: {
    type: Number,
    min: 0,
    default: 0
  },
  manufacturingLeadTimeDays: {
    type: Number,
    min: 0,
    default: 3
  },
  routingOperations: [{
    sequence: {
      type: Number,
      required: true
    },
    operationName: {
      type: String,
      required: true,
      trim: true
    },
    workCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkCenter'
    },
    setupMinutes: {
      type: Number,
      default: 15,
      min: 0
    },
    runMinutesPerUnit: {
      type: Number,
      default: 5,
      min: 0
    }
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

kitSchema.index({ tenantId: 1, parentItemId: 1 }, { unique: true });
kitSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Kit', kitSchema);

