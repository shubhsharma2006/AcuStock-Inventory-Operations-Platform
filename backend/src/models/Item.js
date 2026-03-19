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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

itemSchema.methods.getCurrentStock = async function () {
  const result = await mongoose.model('StockLedger').aggregate([
    { $match: { productId: this._id } },
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

itemSchema.index({ name: 1 });
itemSchema.index({ isActive: 1, name: 1 });
itemSchema.index({ shortName: 1 });

module.exports = mongoose.model('Item', itemSchema);
