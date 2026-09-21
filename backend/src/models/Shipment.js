const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema({
  // Reference number (auto-generated)
  reference: {
    type: String,
    required: true,
    // Uniqueness enforced per-tenant via compound index { tenantId: 1, reference: 1 }
    uppercase: true
  },
  
  // Product Details
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  model: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  serialNumbers: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  condition: {
    type: String,
    enum: ['New', 'Repair', 'Demo'],
    default: 'New'
  },

  // Customer Details
  companyName: {
    type: String,
    trim: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },

  // Courier Details
  courier: {
    type: String,
    trim: true
  },
  awb: {
    type: String,
    trim: true,
    uppercase: true
  },
  dispatchDate: {
    type: Date
  },
  deliveryType: {
    type: String,
    enum: ['Prepaid', 'COD'],
    required: true
  },
  codAmount: {
    type: Number,
    min: 0
  },
  prepaidAmount: {
    type: Number,
    min: 0
  },
  courierCharges: {
    type: Number,
    min: 0
  },
  soldBy: {
    type: String,
    trim: true
  },

  // Additional Details
  dispatchType: {
    type: String,
    enum: ['Standard', 'Express', 'Same Day'],
    default: 'Standard'
  },
  boxes: {
    type: Number,
    min: 1,
    default: 1
  },
  weight: {
    type: String,
    trim: true
  },
  dimensions: {
    type: String,
    trim: true
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 1000
  },

  // Delivery Status Tracking
  status: {
    type: String,
    enum: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED'],
    default: 'PENDING'
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  
  expectedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  deliveryProof: {
    type: String // URL or file path
  },
  receivedBy: {
    type: String,
    trim: true
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['OUT', 'IN'], // OUT = Shipping to customer, IN = Supply received
    default: 'OUT'
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

// Indexes
shipmentSchema.index({ tenantId: 1, reference: 1 });
shipmentSchema.index({ tenantId: 1, status: 1, dispatchDate: -1 });
shipmentSchema.index({ tenantId: 1, awb: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ createdBy: 1 });
shipmentSchema.index({ dispatchDate: -1 });
shipmentSchema.index({ customerName: 'text', companyName: 'text', awb: 'text' });

// Auto-generate reference number
shipmentSchema.pre('save', async function(next) {
  if (this.isNew && !this.reference) {
    const prefix = this.type === 'OUT' ? 'SHP' : 'SUP';
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const countFilter = this.tenantId ? { tenantId: this.tenantId } : {};
    const count = await mongoose.model('Shipment').countDocuments(countFilter);
    this.reference = `${prefix}-${dateStr}-${String(count + 1).padStart(5, '0')}`;
  }
  
  // Add initial status to history
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [{
      status: this.status,
      timestamp: new Date(),
      updatedBy: this.createdBy
    }];
  }
  
  next();
});

// Method to update status
shipmentSchema.methods.updateStatus = async function(newStatus, userId, notes = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    updatedBy: userId,
    notes
  });
  
  if (newStatus === 'DELIVERED') {
    this.actualDeliveryDate = new Date();
  }
  
  return this.save();
};

// Static: Get pending deliveries count
shipmentSchema.statics.getPendingCount = async function(userId, tenantId) {
  const query = {
    status: { $in: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
    type: 'OUT'
  };
  if (tenantId) {
    query.tenantId = tenantId;
  }
  if (userId) {
    query.createdBy = userId;
  }
  return this.countDocuments(query);
};

// Static: Get pending deliveries
shipmentSchema.statics.getPendingDeliveries = async function(userId, limit = 50, tenantId) {
  const query = {
    status: { $in: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] },
    type: 'OUT'
  };
  if (tenantId) {
    query.tenantId = tenantId;
  }
  if (userId) {
    query.createdBy = userId;
  }
  return this.find(query)
    .populate('productId', 'name shortName')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);
};

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
shipmentSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('Shipment', shipmentSchema);
