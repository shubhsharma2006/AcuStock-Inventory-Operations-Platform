const mongoose = require('mongoose');

/**
 * SalesOrder — formal customer order document.
 * Dispatching a SO auto-creates a StockLedger OUT entry (handled in route).
 */
const lineItemSchema = new mongoose.Schema({
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity:   { type: Number, required: true, min: 1, max: 100_000 },
  unitPrice:  { type: Number, required: true, min: 0 },
  lineTotal:  { type: Number }  // computed
}, { _id: false });

const salesOrderSchema = new mongoose.Schema({
  soNumber: {
    type:      String,
    required:  true,
    // Note: uniqueness is enforced per-tenant via the compound index { tenantId: 1, soNumber: 1 }
    trim:      true,
    uppercase: true
  },

  buyer: {
    name:    { type: String, required: true, trim: true },
    email:   { type: String, trim: true },
    phone:   { type: String, trim: true },
    address: { type: String, trim: true }
  },

  items: {
    type:     [lineItemSchema],
    required: true,
    validate: { validator: v => v.length > 0, message: 'SO must have at least one line item' }
  },

  status: {
    type:    String,
    enum:    ['draft', 'confirmed', 'picking', 'dispatched', 'delivered', 'cancelled'],
    default: 'draft'
  },

  totalValue: { type: Number, default: 0 },

  expectedDeliveryDate: Date,

  notes: { type: String, trim: true, maxlength: 1000 },

  // Workflow
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt:  Date,
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: Date,

  // Links to ledger OUT entries created on dispatch
  ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockLedger' }],

  // Multi-tenancy (future-ready)
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true }

}, { timestamps: true });

// Pre-save: compute lineTotals and totalValue
salesOrderSchema.pre('save', function (next) {
  let total = 0;
  for (const item of this.items) {
    item.lineTotal = item.quantity * item.unitPrice;
    total += item.lineTotal;
  }
  this.totalValue = parseFloat(total.toFixed(2));
  next();
});

// Auto-generate SO number
salesOrderSchema.pre('validate', async function (next) {
  if (!this.soNumber) {
    const filter = this.tenantId ? { tenantId: this.tenantId } : {};
    const count = await mongoose.model('SalesOrder').countDocuments(filter);
    this.soNumber = `SO-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

salesOrderSchema.index({ tenantId: 1, soNumber: 1 });
salesOrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
salesOrderSchema.index({ status: 1, createdAt: -1 });
salesOrderSchema.index({ 'buyer.name': 1 });
salesOrderSchema.index({ createdBy: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
salesOrderSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('SalesOrder', salesOrderSchema);
