const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  shortName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  hsn: {
    type: String,
    trim: true,
    maxlength: 20
  },
  // Tracking Mode: NONE, SERIAL, or BATCH (mutually exclusive)
  trackingMode: {
    type: String,
    enum: ['NONE', 'SERIAL', 'BATCH'],
    default: 'NONE',
    index: true,
    validate: {
      validator: function(val) {
        if (val === 'BATCH' && this.serialPolicy && this.serialPolicy.enableSerial) {
          return false;
        }
        return true;
      },
      message: 'Mutual exclusivity violation: Cannot enable serial tracking for a batch-tracked item'
    }
  },
  // Enterprise Serial Policy (configured by ADMIN only)
  serialPolicy: {
    enableSerial: {
      type: Boolean,
      default: false
    },
    requireSerialOnIN: {
      type: Boolean,
      default: false
    },
    requireSerialOnOUT: {
      type: Boolean,
      default: false
    }
  },
  // Batch/Lot Policy (for trackingMode === 'BATCH')
  lotPolicy: {
    allocationStrategy: {
      type: String,
      enum: ['FEFO', 'FIFO'],
      default: 'FEFO'
    },
    quarantineDays: {
      type: Number,
      default: 0,
      min: 0
    },
    requireSupplierBatch: {
      type: Boolean,
      default: false
    }
  },

  // Enterprise Master Data & Barcode Extensions
  sku: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  barcode: {
    type: String,
    trim: true,
    maxlength: 100
  },
  barcodeFormat: {
    type: String,
    enum: ['EAN13', 'UPCA', 'CODE128', 'QR', 'CUSTOM'],
    default: 'CODE128'
  },
  uom: {
    type: String,
    enum: ['PCS', 'BOX', 'KG', 'MTR', 'LTR', 'SET', 'UNIT'],
    default: 'PCS'
  },
  taxRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  taxType: {
    type: String,
    enum: ['GST', 'VAT', 'SALES_TAX', 'EXEMPT'],
    default: 'GST'
  },
  category: {
    type: String,
    trim: true,
    maxlength: 60,
    default: 'General'
  },
  brand: {
    type: String,
    trim: true,
    maxlength: 60
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  _imageUrl: {
    type: String,
    trim: true
  },
  gallery: [{
    storageKey: {
      type: String,
      default: ''
    },
    url: {
      type: String,
      required: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    altText: {
      type: String,
      trim: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  salesPrice: {
    type: Number,
    required: true
  },
  purchasePrice: {
    type: Number,
    required: true
  },
  mrp: {
    type: Number
  },
  warranty: {
    type: String,
    trim: true,
    maxlength: 100
  },
  defaultSellerWarranty: {
    type: String,
    trim: true,
    maxlength: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lowStockThreshold: {
    type: Number,
    default: 10,
    min: 0
  },
  reorderQuantity: {
    type: Number,
    default: 20,
    min: 1
  },
  preferredSupplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    default: null
  },
  autoPoEnabled: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual imageUrl getter & setter for backward compatibility
itemSchema.virtual('imageUrl').get(function () {
  if (this.gallery && this.gallery.length > 0) {
    const primary = this.gallery.find((img) => img.isPrimary);
    return primary ? primary.url : this.gallery[0].url;
  }
  return this._imageUrl || null;
}).set(function (val) {
  this._imageUrl = val;
  if (val && (!this.gallery || this.gallery.length === 0)) {
    this.gallery = [{
      storageKey: 'legacy',
      url: val,
      isPrimary: true,
      sortOrder: 0
    }];
  }
});

itemSchema.methods.getCurrentStock = async function () {
  const matchFilter = { productId: this._id };
  if (this.tenantId) {
    matchFilter.tenantId = new mongoose.Types.ObjectId(this.tenantId);
  }
  const result = await mongoose.model('StockLedger').aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] }, '$quantity', { $multiply: ['$quantity', -1] }]
          }
        }
      }
    }
  ]);
  return result.length > 0 ? Math.max(0, result[0].total) : 0;
};

itemSchema.methods.getAvailableToPromise = async function () {
  const currentStock = await this.getCurrentStock();
  const now = new Date();
  const matchFilter = {
    productId: this._id,
    status: 'ACTIVE',
    expiresAt: { $gt: now }
  };
  if (this.tenantId) {
    matchFilter.tenantId = new mongoose.Types.ObjectId(this.tenantId);
  }
  const reservations = await mongoose.model('StockReservation').aggregate([
    { $match: matchFilter },
    { $group: { _id: null, totalReserved: { $sum: '$reservedQty' } } }
  ]);
  const totalReserved = reservations.length > 0 ? reservations[0].totalReserved : 0;
  return Math.max(0, currentStock - totalReserved);
};

// Mutual exclusivity & consistency guard
itemSchema.pre('validate', function () {
  if (this.trackingMode === 'BATCH' && this.serialPolicy && this.serialPolicy.enableSerial) {
    this.invalidate('trackingMode', 'Mutual exclusivity violation: Cannot enable serial tracking for a batch-tracked item');
  }
});

itemSchema.pre('save', function () {
  if (this.trackingMode === 'SERIAL') {
    if (!this.serialPolicy) this.serialPolicy = {};
    this.serialPolicy.enableSerial = true;
  } else if (this.trackingMode === 'BATCH') {
    if (this.serialPolicy && this.serialPolicy.enableSerial) {
      throw new Error('Cannot enable serial tracking for a batch-tracked item');
    }
  } else if (this.trackingMode === 'NONE') {
    if (this.serialPolicy && this.serialPolicy.enableSerial) {
      this.trackingMode = 'SERIAL';
    }
  }
});

itemSchema.index({ tenantId: 1, trackingMode: 1 });
itemSchema.index({ tenantId: 1, name: 1 });
itemSchema.index({ tenantId: 1, shortName: 1 });
itemSchema.index({ tenantId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
itemSchema.index({ tenantId: 1, barcode: 1 }, { sparse: true });
itemSchema.index({ tenantId: 1, category: 1 });
itemSchema.index({ tenantId: 1, isActive: 1, name: 1 });
itemSchema.index({ name: 1 });
itemSchema.index({ shortName: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
itemSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Item', itemSchema);
