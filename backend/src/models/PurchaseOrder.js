const mongoose = require('mongoose');

/**
 * PurchaseOrder — formal procurement document.
 * Receiving a PO auto-creates a StockLedger IN entry (handled in route).
 */
const lineItemSchema = new mongoose.Schema({
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  quantity:   { type: Number, required: true, min: 1, max: 100_000 },
  unitPrice:  { type: Number, required: true, min: 0 },
  lineTotal:  { type: Number }  // computed: quantity * unitPrice
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: {
    type:     String,
    required: true,
    // Note: uniqueness is enforced per-tenant via the compound index { tenantId: 1, poNumber: 1 }
    trim:     true,
    uppercase: true
  },

  supplier: {
    name:    { type: String, required: true, trim: true },
    email:   { type: String, trim: true },
    phone:   { type: String, trim: true },
    address: { type: String, trim: true }
  },

  items: {
    type:     [lineItemSchema],
    required: true,
    validate: { validator: v => v.length > 0, message: 'PO must have at least one line item' }
  },

  status: {
    type:    String,
    enum:    ['draft', 'approved', 'sent', 'partially_received', 'received', 'cancelled'],
    default: 'draft'
  },

  totalValue: { type: Number, default: 0 },   // sum of lineTotals

  expectedDeliveryDate: Date,

  notes: { type: String, trim: true, maxlength: 1000 },

  // Workflow fields
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receivedAt: Date,

  // Links back to the stock ledger entries created on receive
  ledgerEntries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockLedger' }],

  // Multi-tenancy (future-ready)
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true }

}, { timestamps: true });

// Pre-save: compute lineTotals and totalValue
purchaseOrderSchema.pre('save', function (next) {
  let total = 0;
  for (const item of this.items) {
    item.lineTotal = item.quantity * item.unitPrice;
    total += item.lineTotal;
  }
  this.totalValue = parseFloat(total.toFixed(2));
  next();
});

// Auto-generate PO number if not provided
purchaseOrderSchema.pre('validate', async function (next) {
  if (!this.poNumber) {
    const filter = this.tenantId ? { tenantId: this.tenantId } : {};
    const count = await mongoose.model('PurchaseOrder').countDocuments(filter);
    this.poNumber = `PO-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

purchaseOrderSchema.index({ tenantId: 1, poNumber: 1 });
purchaseOrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ 'supplier.name': 1 });
purchaseOrderSchema.index({ createdBy: 1 });

const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');
purchaseOrderSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
