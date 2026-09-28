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
  imageUrl: {
    type: String,
    trim: true
  },
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
  timestamps: true
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
            $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', { $multiply: ['$quantity', -1] }]
          }
        }
      }
    }
  ]);
  return result.length > 0 ? Math.max(0, result[0].total) : 0;
};

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
