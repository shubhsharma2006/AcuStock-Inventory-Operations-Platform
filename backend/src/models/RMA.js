/**
 * RMA Model — Return Merchandise Authorization & Reverse Logistics
 * ─────────────────────────────────────────────────────────────
 * Manages customer returns, courier Return-to-Origin (RTO),
 * warehouse gate receiving, quality disposition (Restock vs Scrap vs RTV),
 * and automatic statutory GST Credit Note generation.
 */

const mongoose = require('mongoose');
const tenantIsolationPlugin = require('../middleware/tenantIsolationPlugin');

const rmaItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    trim: true,
    default: ''
  },
  hsnCode: {
    type: String,
    trim: true,
    default: '8471'
  },
  quantityRequested: {
    type: Number,
    required: true,
    min: 1
  },
  quantityReceived: {
    type: Number,
    default: 0,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  taxRatePercent: {
    type: Number,
    default: 18,
    min: 0
  },
  disposition: {
    type: String,
    enum: ['PENDING', 'RESTOCK', 'SCRAP', 'RETURN_TO_VENDOR'],
    default: 'PENDING'
  },
  restockedLotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryLot'
  },
  dispositionNotes: {
    type: String,
    trim: true,
    default: ''
  }
});

const rmaSchema = new mongoose.Schema({
  rmaNumber: {
    type: String,
    required: true,
    trim: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true
  },
  salesOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder'
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse'
  },
  status: {
    type: String,
    enum: ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'COMPLETED', 'REJECTED'],
    default: 'REQUESTED',
    index: true
  },
  returnType: {
    type: String,
    enum: ['CUSTOMER_RETURN', 'COURIER_RTO', 'DEFECT_REPLACEMENT'],
    default: 'CUSTOMER_RETURN'
  },
  reason: {
    type: String,
    enum: [
      'DEFECTIVE_PRODUCT',
      'WRONG_ITEM_SHIPPED',
      'TRANSIT_DAMAGE',
      'CUSTOMER_CANCELLATION',
      'NOT_DELIVERED_RTO',
      'EXPIRED_SHELF_LIFE',
      'OTHER'
    ],
    required: true
  },
  reasonDetails: {
    type: String,
    trim: true,
    default: ''
  },
  items: [rmaItemSchema],
  returnLogistics: {
    courierName: { type: String, trim: true, default: '' },
    trackingNumber: { type: String, trim: true, default: '' },
    awbNumber: { type: String, trim: true, default: '' },
    dispatchedDate: { type: Date },
    receivedDate: { type: Date }
  },
  creditNoteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CreditNote'
  },
  inspectionSummary: {
    totalUnitsReceived: { type: Number, default: 0 },
    unitsRestocked: { type: Number, default: 0 },
    unitsScrapped: { type: Number, default: 0 },
    unitsRtv: { type: Number, default: 0 },
    inspectedAt: { type: Date }
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  inspectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

rmaSchema.index({ tenantId: 1, rmaNumber: 1 }, { unique: true });
rmaSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
rmaSchema.index({ tenantId: 1, companyId: 1 });

rmaSchema.plugin(tenantIsolationPlugin);

module.exports = mongoose.model('RMA', rmaSchema);

