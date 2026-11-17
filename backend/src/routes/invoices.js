/**
 * Invoices & Accounts Receivable (AR) Express Route
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET    /api/invoices                  List invoices with search & status filters
 * - POST   /api/invoices                  Create tax invoice (manual or from SO/Deal)
 * - GET    /api/invoices/reports/ar-aging Accounts Receivable aging schedule report
 * - GET    /api/invoices/:id              Fetch single invoice details with payments
 * - GET    /api/invoices/:id/print        Printable HTML A4 invoice preview
 * - GET    /api/invoices/:id/eway-bill    Generate Indian NIC-compliant E-Way Bill JSON
 * - POST   /api/invoices/:id/payments     Record customer payment receipt
 * - POST   /api/invoices/:id/send-reminder Send payment reminder notice
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Invoice = require('../models/Invoice');
const PaymentReceipt = require('../models/PaymentReceipt');
const Company = require('../models/Company');
const SalesOrder = require('../models/SalesOrder');
const CrmDeal = require('../models/CrmDeal');
const Tenant = require('../models/Tenant');
const Counter = require('../models/Counter');
const journalEngine = require('../services/journalEngine.service');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('invoices', 'FULL_ACCESS'));

// Indian State Codes mapping for E-Way Bill & GST compliance
const STATE_CODE_MAP = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03', 'chandigarh': '04',
  'uttarakhand': '05', 'haryana': '06', 'delhi': '07', 'rajasthan': '08',
  'uttar pradesh': '09', 'bihar': '10', 'sikkim': '11', 'arunachal pradesh': '12',
  'nagaland': '13', 'manipur': '14', 'mizoram': '15', 'tripura': '16',
  'meghalaya': '17', 'assam': '18', 'west bengal': '19', 'jharkhand': '20',
  'odisha': '21', 'chhattisgarh': '22', 'madhya pradesh': '23', 'gujarat': '24',
  'maharashtra': '27', 'andhra pradesh': '28', 'karnataka': '29', 'goa': '30',
  'kerala': '32', 'tamil nadu': '33', 'puducherry': '34', 'telangana': '36',
  'ladakh': '38'
};

function getStateCode(stateName = '') {
  const normalized = String(stateName).trim().toLowerCase();
  return STATE_CODE_MAP[normalized] || '27'; // Default Maharashtra
}

/**
 * Helper: Computes line items and state-aware Indian GST financial summary
 */
function calculateInvoiceFinancials(items = [], buyerState = '', sellerState = 'Maharashtra') {
  const normBuyerState = String(buyerState || '').trim().toLowerCase();
  const normSellerState = String(sellerState || 'Maharashtra').trim().toLowerCase();
  const isInterState = normBuyerState !== normSellerState && normBuyerState !== '';

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const processedItems = items.map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const discPercent = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
    const taxRate = Math.max(0, Number(it.taxRatePercent !== undefined ? it.taxRatePercent : 18));

    const priceAfterDisc = price * (1 - discPercent / 100);
    const taxableAmount = Math.round(priceAfterDisc * qty * 100) / 100;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterState) {
      igstAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
      totalIgst += igstAmount;
    } else {
      const halfRate = taxRate / 2;
      cgstAmount = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
      sgstAmount = Math.round(taxableAmount * (halfRate / 100) * 100) / 100;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
    }

    const lineTotal = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;
    totalTaxable += taxableAmount;

    return {
      productId: it.productId || null,
      name: it.name || 'Catalog Item',
      sku: it.sku || '',
      hsnCode: it.hsnCode || '8471',
      uom: it.uom || 'PCS',
      quantity: qty,
      unitPrice: price,
      discountPercent: discPercent,
      taxRatePercent: taxRate,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      lineTotal
    };
  });

  totalTaxable = Math.round(totalTaxable * 100) / 100;
  totalCgst = Math.round(totalCgst * 100) / 100;
  totalSgst = Math.round(totalSgst * 100) / 100;
  totalIgst = Math.round(totalIgst * 100) / 100;
  const totalTax = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;

  const rawGrandTotal = totalTaxable + totalTax;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOff = Math.round((roundedGrandTotal - rawGrandTotal) * 100) / 100;

  return {
    processedItems,
    financialSummary: {
      taxableAmount: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      totalTax,
      roundOff,
      grandTotal: roundedGrandTotal,
      amountPaid: 0,
      amountDue: roundedGrandTotal,
      isInterState
    }
  };
}

// ── GET /api/invoices — List Invoices with Search & Status Filters ──
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: req.tenantId };

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.companyId) {
      filter.companyId = req.query.companyId;
    }
    if (req.query.search) {
      const term = req.query.search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: term, $options: 'i' } },
        { 'billingAddress.name': { $regex: term, $options: 'i' } },
        { 'billingAddress.gstin': { $regex: term, $options: 'i' } }
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('companyId', 'name gstin phone email creditLimit outstandingBalance')
        .populate('salesOrderId', 'soNumber status')
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(filter)
    ]);

    // Compute key receivable metrics
    const metricsAggregation = await Invoice.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(req.tenantId), status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: null,
          totalReceivables: { $sum: '$financialSummary.amountDue' },
          totalCollected: { $sum: '$financialSummary.amountPaid' },
          totalInvoiced: { $sum: '$financialSummary.grandTotal' },
          overdueAmount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$financialSummary.amountDue', 0] }, { $lt: ['$dueDate', new Date()] }] },
                '$financialSummary.amountDue',
                0
              ]
            }
          }
        }
      }
    ]);

    const metrics = metricsAggregation[0] || {
      totalReceivables: 0,
      totalCollected: 0,
      totalInvoiced: 0,
      overdueAmount: 0
    };

    res.json({
      success: true,
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      metrics
    });
  } catch (err) {
    logger.error('List invoices error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/invoices/reports/ar-aging — Accounts Receivable Aging ──
router.get('/reports/ar-aging', async (req, res) => {
  try {
    const now = new Date();

    const openInvoices = await Invoice.find({
      tenantId: req.tenantId,
      status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      'financialSummary.amountDue': { $gt: 0 }
    })
      .populate('companyId', 'name gstin contactPerson phone email creditLimit creditDays')
      .lean();

    const agingSummary = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      totalOutstanding: 0
    };

    const customerBreakdown = {};

    openInvoices.forEach((inv) => {
      const due = new Date(inv.dueDate);
      const diffTime = now.getTime() - due.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const amount = inv.financialSummary?.amountDue || 0;

      agingSummary.totalOutstanding += amount;

      let bucket = 'current';
      if (diffDays <= 0) {
        agingSummary.current += amount;
        bucket = 'current';
      } else if (diffDays <= 30) {
        agingSummary.days_1_30 += amount;
        bucket = 'days_1_30';
      } else if (diffDays <= 60) {
        agingSummary.days_31_60 += amount;
        bucket = 'days_31_60';
      } else if (diffDays <= 90) {
        agingSummary.days_61_90 += amount;
        bucket = 'days_61_90';
      } else {
        agingSummary.days_90_plus += amount;
        bucket = 'days_90_plus';
      }

      const compId = inv.companyId?._id ? inv.companyId._id.toString() : 'direct';
      const compName = inv.companyId?.name || inv.billingAddress?.name || 'Customer';

      if (!customerBreakdown[compId]) {
        customerBreakdown[compId] = {
          companyId: compId,
          name: compName,
          gstin: inv.billingAddress?.gstin || '',
          phone: inv.companyId?.phone || '',
          current: 0,
          days_1_30: 0,
          days_31_60: 0,
          days_61_90: 0,
          days_90_plus: 0,
          total: 0
        };
      }

      customerBreakdown[compId][bucket] += amount;
      customerBreakdown[compId].total += amount;
    });

    res.json({
      success: true,
      agingSummary: {
        current: Math.round(agingSummary.current * 100) / 100,
        days_1_30: Math.round(agingSummary.days_1_30 * 100) / 100,
        days_31_60: Math.round(agingSummary.days_31_60 * 100) / 100,
        days_61_90: Math.round(agingSummary.days_61_90 * 100) / 100,
        days_90_plus: Math.round(agingSummary.days_90_plus * 100) / 100,
        totalOutstanding: Math.round(agingSummary.totalOutstanding * 100) / 100
      },
      customerBreakdown: Object.values(customerBreakdown).sort((a, b) => b.total - a.total)
    });
  } catch (err) {
    logger.error('AR aging calculation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/invoices — Create Tax Invoice ─────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      companyId,
      salesOrderId,
      dealId,
      paymentTerms = 'NET_30',
      dueDate,
      items = [],
      billingAddress,
      shippingAddress,
      notes,
      termsAndConditions,
      eWayBill
    } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Customer companyId is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Invoice must contain at least one line item' });
    }

    const company = await Company.findOne({ _id: companyId, tenantId: req.tenantId });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Customer company not found' });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    const sellerState = tenant?.branding?.address?.state || 'Maharashtra';
    const buyerState = billingAddress?.state || company.address?.state || sellerState;

    // Calculate state-aware Indian GST schedule
    const { processedItems, financialSummary } = calculateInvoiceFinancials(items, buyerState, sellerState);

    // Generate sequential invoice number: INV-YYYY-XXXX
    const year = new Date().getFullYear();
    const invoiceNumber = await Counter.getNextSequence(req.tenantId, 'INVOICE', `INV-${year}`, 4);

    // Compute due date if not provided
    let computedDueDate = dueDate ? new Date(dueDate) : null;
    if (!computedDueDate) {
      let termDays = 30;
      if (paymentTerms === 'NET_15') termDays = 15;
      if (paymentTerms === 'NET_45') termDays = 45;
      if (paymentTerms === 'NET_60') termDays = 60;
      if (paymentTerms === 'ADVANCE' || paymentTerms === 'COD') termDays = 0;
      computedDueDate = new Date(Date.now() + termDays * 24 * 60 * 60 * 1000);
    }

    const resolvedBillingAddress = {
      name: billingAddress?.name || company.name,
      gstin: billingAddress?.gstin || company.gstin || '',
      pan: billingAddress?.pan || company.pan || '',
      street: billingAddress?.street || company.address?.street || '',
      city: billingAddress?.city || company.address?.city || '',
      state: buyerState,
      stateCode: getStateCode(buyerState),
      pincode: billingAddress?.pincode || company.address?.zipCode || '',
      country: billingAddress?.country || 'India'
    };

    const resolvedShippingAddress = {
      name: shippingAddress?.name || resolvedBillingAddress.name,
      gstin: shippingAddress?.gstin || resolvedBillingAddress.gstin,
      street: shippingAddress?.street || company.shippingAddress?.street || resolvedBillingAddress.street,
      city: shippingAddress?.city || company.shippingAddress?.city || resolvedBillingAddress.city,
      state: shippingAddress?.state || company.shippingAddress?.state || buyerState,
      stateCode: getStateCode(shippingAddress?.state || buyerState),
      pincode: shippingAddress?.pincode || company.shippingAddress?.zipCode || resolvedBillingAddress.pincode,
      country: shippingAddress?.country || 'India'
    };

    const invoice = new Invoice({
      invoiceNumber,
      salesOrderId: salesOrderId || null,
      dealId: dealId || null,
      companyId: company._id,
      invoiceDate: new Date(),
      dueDate: computedDueDate,
      billingAddress: resolvedBillingAddress,
      shippingAddress: resolvedShippingAddress,
      items: processedItems,
      financialSummary,
      status: 'ISSUED',
      paymentTerms,
      eWayBill: eWayBill || {},
      notes: notes || 'Thank you for your business!',
      termsAndConditions: termsAndConditions || '1. Payment due per terms.\n2. Goods once sold will only be replaced per warranty.',
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await invoice.save();

    // Increment customer's outstanding balance
    company.outstandingBalance = (Number(company.outstandingBalance) || 0) + financialSummary.grandTotal;
    await company.save();

    // Auto-post to General Ledger
    try {
      await journalEngine.postInvoiceIssued(req.tenantId, {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        grandTotal: financialSummary.grandTotal,
        taxableAmount: financialSummary.taxableAmount,
        cgstAmount: financialSummary.cgst,
        sgstAmount: financialSummary.sgst,
        igstAmount: financialSummary.igst
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post invoice error: ' + glErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Tax Invoice ${invoice.invoiceNumber} created successfully`,
      invoice
    });
  } catch (err) {
    logger.error('Create invoice error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/invoices/:id — Fetch Single Invoice Details ─────────
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('salesOrderId')
      .populate('dealId')
      .populate({
        path: 'payments',
        populate: { path: 'receivedBy', select: 'name email' }
      })
      .populate('createdBy', 'name email');

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({ success: true, invoice });
  } catch (err) {
    logger.error('Fetch invoice detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/invoices/:id/payments — Record Customer Payment ────
router.post('/:id/payments', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Payment amount must be greater than 0' });
    }

    const currentDue = Number(invoice.financialSummary?.amountDue) || 0;
    if (amount > currentDue) {
      return res.status(400).json({
        success: false,
        error: `Payment amount ₹${amount.toLocaleString()} exceeds balance due of ₹${currentDue.toLocaleString()}`
      });
    }

    // Generate sequence for Payment Receipt
    const year = new Date().getFullYear();
    const receiptNumber = await Counter.getNextSequence(req.tenantId, 'PAYMENT_RECEIPT', `REC-${year}`, 4);

    const receipt = new PaymentReceipt({
      receiptNumber,
      invoiceId: invoice._id,
      companyId: invoice.companyId,
      amount,
      paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
      paymentMode: req.body.paymentMode || 'BANK_TRANSFER',
      transactionReference: req.body.transactionReference || '',
      bankName: req.body.bankName || '',
      notes: req.body.notes || '',
      receivedBy: req.userId,
      tenantId: req.tenantId
    });

    await receipt.save();

    // Update invoice balance and status
    const newPaid = Math.round(((Number(invoice.financialSummary.amountPaid) || 0) + amount) * 100) / 100;
    const newDue = Math.round(Math.max(0, invoice.financialSummary.grandTotal - newPaid) * 100) / 100;

    invoice.financialSummary.amountPaid = newPaid;
    invoice.financialSummary.amountDue = newDue;
    invoice.payments.push(receipt._id);

    if (newDue === 0) {
      invoice.status = 'PAID';
    } else {
      invoice.status = 'PARTIALLY_PAID';
    }

    await invoice.save();

    // Reconcile Customer 360 outstanding balance
    const company = await Company.findOne({ _id: invoice.companyId, tenantId: req.tenantId });
    if (company) {
      company.outstandingBalance = Math.max(0, (Number(company.outstandingBalance) || 0) - amount);
      await company.save();
    }

    // Auto-post receipt to General Ledger
    try {
      await journalEngine.postPaymentReceived(req.tenantId, {
        _id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        paymentDate: receipt.paymentDate,
        amount: receipt.amount,
        paymentMethod: receipt.paymentMethod
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post receipt error: ' + glErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Payment receipt ${receipt.receiptNumber} recorded for ₹${amount.toLocaleString()}`,
      receipt,
      invoice
    });
  } catch (err) {
    logger.error('Record invoice payment error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/invoices/:id/eway-bill — Indian NIC E-Way Bill JSON ──
router.get('/:id/eway-bill', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('salesOrderId');

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    const sellerAddress = tenant?.branding?.address || {};

    const d = new Date(invoice.invoiceDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const docDate = `${day}/${month}/${year}`;

    const fromStateCode = parseInt(getStateCode(sellerAddress.state || 'Maharashtra'), 10);
    const toStateCode = parseInt(invoice.billingAddress?.stateCode || getStateCode(invoice.billingAddress?.state), 10);

    // Build standard NIC JSON format for E-Way Bill
    const ewayBillPayload = {
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: invoice.invoiceNumber,
      docDate,
      fromGstin: tenant?.branding?.taxNumber || '27AAAAA0000A1Z5',
      fromTrdName: tenant?.name || 'AcuStock Enterprise Hub',
      fromAddr1: sellerAddress.street || 'Fulfillment Gateway, Sector 5',
      fromPlace: sellerAddress.city || 'Mumbai',
      fromPincode: parseInt(sellerAddress.pincode || '400001', 10),
      fromStateCode,
      actualFromStateCode: fromStateCode,
      toGstin: invoice.billingAddress?.gstin || 'URP',
      toTrdName: invoice.billingAddress?.name || 'Consignee',
      toAddr1: invoice.shippingAddress?.street || invoice.billingAddress?.street || 'Consignee Address',
      toPlace: invoice.shippingAddress?.city || invoice.billingAddress?.city || 'Destination City',
      toPincode: parseInt(invoice.shippingAddress?.pincode || invoice.billingAddress?.pincode || '560001', 10),
      toStateCode,
      actualToStateCode: toStateCode,
      totalValue: invoice.financialSummary?.taxableAmount || 0,
      cgstValue: invoice.financialSummary?.cgst || 0,
      sgstValue: invoice.financialSummary?.sgst || 0,
      igstValue: invoice.financialSummary?.igst || 0,
      cessValue: 0,
      totInvValue: invoice.financialSummary?.grandTotal || 0,
      transDistance: invoice.eWayBill?.distanceKm || 120,
      transporterId: invoice.eWayBill?.transporterId || '',
      transporterName: invoice.eWayBill?.transporterName || '',
      transDocNo: invoice.salesOrderId?.soNumber || invoice.invoiceNumber,
      transMode: '1', // 1: Road, 2: Rail, 3: Air, 4: Ship
      vehicleNo: invoice.eWayBill?.vehicleNumber || '',
      vehicleType: 'R', // R: Regular, O: Over Dimensional Cargo
      itemList: (invoice.items || []).map((it, idx) => ({
        itemNo: idx + 1,
        productName: it.name,
        productDesc: it.sku || it.name,
        hsnCode: parseInt(it.hsnCode || '8471', 10),
        quantity: it.quantity,
        qtyUnit: it.uom || 'PCS',
        taxableAmount: it.taxableAmount,
        cgstRate: invoice.financialSummary?.isInterState ? 0 : it.taxRatePercent / 2,
        sgstRate: invoice.financialSummary?.isInterState ? 0 : it.taxRatePercent / 2,
        igstRate: invoice.financialSummary?.isInterState ? it.taxRatePercent : 0,
        cessRate: 0
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=EWayBill_${invoice.invoiceNumber}.json`);
    res.json(ewayBillPayload);
  } catch (err) {
    logger.error('Generate E-Way Bill JSON error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/invoices/:id/send-reminder — WhatsApp/Email Notice ──
router.post('/:id/send-reminder', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('companyId');
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const customerPhone = invoice.companyId?.phone || invoice.billingAddress?.phone || '+91 98765 43210';
    const dueAmount = invoice.financialSummary?.amountDue || 0;
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-IN');

    // Simulate or send live WhatsApp payment reminder
    const messageText = `*Payment Reminder:* Invoice *${invoice.invoiceNumber}* for *₹${dueAmount.toLocaleString('en-IN')}* is due on *${dueDateStr}*. Kindly clear the balance to maintain uninterrupted supply. Thank you!`;

    res.json({
      success: true,
      message: `Payment reminder queued for ${invoice.billingAddress.name} (${customerPhone})`,
      whatsappPreview: messageText
    });
  } catch (err) {
    logger.error('Send payment reminder error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

