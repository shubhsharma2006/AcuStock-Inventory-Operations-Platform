/**
 * B2B Self-Service Portal Express Route
 * ─────────────────────────────────────────────────────────────
 * Provides role-gated access for external B2B Customers and Suppliers:
 *
 * Customer Portal:
 * - GET  /api/portal/customer/catalog      Wholesale catalog with tier pricing
 * - GET  /api/portal/customer/statement    Credit limit, balance & transaction history
 * - POST /api/portal/customer/orders       Self-service order placement
 * - GET  /api/portal/customer/invoices     Downloadable tax invoices
 * - GET  /api/portal/customer/shipments    Live dispatch tracking
 *
 * Supplier Portal:
 * - GET  /api/portal/supplier/orders       Open Purchase Orders
 * - POST /api/portal/supplier/orders/:id/ack Acknowledge delivery date
 * - POST /api/portal/supplier/asn          Submit Advanced Shipping Notice
 * - GET  /api/portal/supplier/bills        Submitted bills & payment vouchers
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Item = require('../models/Item');
const Company = require('../models/Company');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const Invoice = require('../models/Invoice');
const PaymentReceipt = require('../models/PaymentReceipt');
const Shipment = require('../models/Shipment');
const ASN = require('../models/ASN');
const VendorBill = require('../models/VendorBill');
const Counter = require('../models/Counter');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);

// Helper to resolve company for external portal user or query param fallback
async function resolvePortalCompany(req, type = 'CUSTOMER') {
  if (req.user?.companyId) {
    return req.user.companyId;
  }
  // If internal staff/admin is viewing portal preview for a specific company
  if (req.query.companyId && mongoose.Types.ObjectId.isValid(req.query.companyId)) {
    return req.query.companyId;
  }
  // Fallback: pick the first company of this type in the tenant
  const comp = await Company.findOne({
    tenantId: req.tenantId,
    type: { $in: [type, 'BOTH'] }
  }).select('_id');
  return comp?._id || null;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CUSTOMER B2B PORTAL
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/portal/customer/catalog — Wholesale Products ─────────
router.get('/customer/catalog', async (req, res) => {
  try {
    const items = await Item.find({
      tenantId: req.tenantId,
      isActive: { $ne: false }
    })
      .select('name sku barcode currentStock price unit category')
      .lean();

    res.json({
      success: true,
      catalog: items.map((it) => ({
        ...it,
        inStock: (it.currentStock || 0) > 0,
        availableUnits: it.currentStock || 0,
        unitPrice: it.price || 0
      }))
    });
  } catch (err) {
    logger.error('Portal catalog error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/portal/customer/statement — Live Credit & Ledger ────
router.get('/customer/statement', async (req, res) => {
  try {
    const companyId = await resolvePortalCompany(req, 'CUSTOMER');
    if (!companyId) {
      return res.status(404).json({ success: false, error: 'Customer company profile not found' });
    }

    const company = await Company.findOne({ _id: companyId, tenantId: req.tenantId })
      .select('name gstin creditLimit creditDays outstandingBalance billingAddress')
      .lean();

    if (!company) {
      return res.status(404).json({ success: false, error: 'Customer company profile not found' });
    }

    const limit = Number(company.creditLimit) || 0;
    const balance = Number(company.outstandingBalance) || 0;
    const availableCredit = Math.max(0, limit - balance);

    const [recentInvoices, recentPayments] = await Promise.all([
      Invoice.find({ companyId, tenantId: req.tenantId })
        .sort({ invoiceDate: -1 })
        .limit(10)
        .select('invoiceNumber invoiceDate dueDate status financialSummary')
        .lean(),
      PaymentReceipt.find({ companyId, tenantId: req.tenantId })
        .sort({ paymentDate: -1 })
        .limit(10)
        .lean()
    ]);

    res.json({
      success: true,
      statement: {
        company,
        creditLimit: limit,
        outstandingBalance: balance,
        availableCredit,
        creditDays: company.creditDays || 30,
        recentInvoices,
        recentPayments
      }
    });
  } catch (err) {
    logger.error('Portal statement error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/portal/customer/orders — Place Wholesale Order ─────
router.post('/customer/orders', async (req, res) => {
  try {
    const companyId = await resolvePortalCompany(req, 'CUSTOMER');
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Customer company profile not found' });
    }

    const company = await Company.findOne({ _id: companyId, tenantId: req.tenantId });
    const { items = [], shippingAddress, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item is required' });
    }

    // Atomic order number
    const nextNum = await Counter.getNextSequence(req.tenantId, 'SALES_ORDER', 'SO', 6);
    const soNumber = `${nextNum}`;

    let totalValue = 0;
    const orderItems = items.map((it) => {
      const lineTotal = (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0);
      totalValue += lineTotal;
      return {
        productId: it.productId,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        lineTotal
      };
    });

    const salesOrder = new SalesOrder({
      orderNumber: soNumber,
      customer: {
        name: company.name,
        companyId: company._id,
        phone: company.phone || '',
        address: company.billingAddress?.street || ''
      },
      items: orderItems,
      totalValue,
      status: 'draft',
      notes: notes || 'Submitted via B2B Customer Portal',
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await salesOrder.save();

    res.status(201).json({
      success: true,
      message: `B2B Order ${soNumber} submitted successfully`,
      salesOrder
    });
  } catch (err) {
    logger.error('Portal place order error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/portal/customer/invoices — Own Tax Invoices ──────────
router.get('/customer/invoices', async (req, res) => {
  try {
    const companyId = await resolvePortalCompany(req, 'CUSTOMER');
    const invoices = await Invoice.find({ companyId, tenantId: req.tenantId })
      .sort({ invoiceDate: -1 })
      .lean();

    res.json({ success: true, invoices });
  } catch (err) {
    logger.error('Portal invoices error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/portal/customer/shipments — Live Tracking ────────────
router.get('/customer/shipments', async (req, res) => {
  try {
    const companyId = await resolvePortalCompany(req, 'CUSTOMER');
    const shipments = await Shipment.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, shipments });
  } catch (err) {
    logger.error('Portal shipments error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. SUPPLIER B2B PORTAL
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/portal/supplier/orders — Open Purchase Orders ────────
router.get('/supplier/orders', async (req, res) => {
  try {
    const supplierId = await resolvePortalCompany(req, 'SUPPLIER');
    const orders = await PurchaseOrder.find({
      tenantId: req.tenantId,
      status: { $in: ['sent', 'approved', 'partially_received'] }
    })
      .sort({ createdAt: -1 })
      .populate('items.productId', 'name sku barcode')
      .lean();

    res.json({ success: true, purchaseOrders: orders });
  } catch (err) {
    logger.error('Portal supplier orders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/portal/supplier/orders/:id/ack — Acknowledge PO ────
router.post('/supplier/orders/:id/ack', async (req, res) => {
  try {
    const { expectedDeliveryDate, supplierNotes } = req.body;
    const po = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });

    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase Order not found' });
    }

    if (expectedDeliveryDate) {
      po.expectedDeliveryDate = new Date(expectedDeliveryDate);
    }
    if (supplierNotes) {
      po.notes = po.notes ? `${po.notes}\n[Supplier Ack]: ${supplierNotes}` : `[Supplier Ack]: ${supplierNotes}`;
    }

    po.status = 'approved';
    await po.save();

    res.json({
      success: true,
      message: `Purchase Order ${po.poNumber || po.orderNumber} acknowledged with delivery date ${po.expectedDeliveryDate?.toLocaleDateString()}`,
      purchaseOrder: po
    });
  } catch (err) {
    logger.error('Portal PO acknowledge error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/portal/supplier/asn — Submit Advanced Shipping Notice
router.post('/supplier/asn', async (req, res) => {
  try {
    const supplierId = await resolvePortalCompany(req, 'SUPPLIER');
    const {
      purchaseOrderId,
      carrierName = '',
      vehicleNumber = '',
      trackingNumber = '',
      expectedArrivalDate,
      items = [],
      notes = ''
    } = req.body;

    if (!purchaseOrderId || !expectedArrivalDate) {
      return res.status(400).json({ success: false, error: 'purchaseOrderId and expectedArrivalDate are required' });
    }

    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(req.tenantId, 'ASN', `ASN-${currentYear}`, 4);
    const asnNumber = `${seq}`;

    const asn = new ASN({
      asnNumber,
      purchaseOrderId,
      supplierId: supplierId || new mongoose.Types.ObjectId(),
      carrierName,
      vehicleNumber,
      trackingNumber,
      expectedArrivalDate: new Date(expectedArrivalDate),
      items,
      notes,
      submittedBy: req.userId,
      tenantId: req.tenantId
    });

    await asn.save();

    res.status(201).json({
      success: true,
      message: `Advanced Shipping Notice ${asnNumber} lodged successfully`,
      asn
    });
  } catch (err) {
    logger.error('Portal ASN error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/portal/supplier/asns — List Lodged ASNs ─────────────
router.get('/supplier/asns', async (req, res) => {
  try {
    const supplierId = await resolvePortalCompany(req, 'SUPPLIER');
    const asns = await ASN.find({
      tenantId: req.tenantId
    })
      .sort({ createdAt: -1 })
      .populate('purchaseOrderId', 'orderNumber poNumber totalAmount status')
      .lean();

    res.json({ success: true, asns });
  } catch (err) {
    logger.error('Portal get ASNs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/portal/supplier/bills — Submitted Bills & Remittances
router.get('/supplier/bills', async (req, res) => {
  try {
    const supplierId = await resolvePortalCompany(req, 'SUPPLIER');
    const bills = await VendorBill.find({
      tenantId: req.tenantId
    })
      .sort({ billDate: -1 })
      .populate('payments')
      .lean();

    res.json({ success: true, bills });
  } catch (err) {
    logger.error('Portal supplier bills error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
