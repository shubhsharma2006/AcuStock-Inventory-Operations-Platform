/**
 * Vendor Bills & Accounts Payable (AP) Route — 3-Way Matching Engine
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET    /api/vendor-bills              List vendor bills with search & filters
 * - GET    /api/vendor-bills/aging        AP aging schedule (current, 1-30d, 31-60d, etc.)
 * - GET    /api/vendor-bills/:id          Fetch single bill with match verification
 * - POST   /api/vendor-bills              Ingest bill & run automated 3-Way Match
 * - POST   /api/vendor-bills/:id/override Manager override for flagged price/quantity variances
 * - POST   /api/vendor-bills/:id/payments Record outbound payment voucher
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const VendorBill = require('../models/VendorBill');
const VendorPayment = require('../models/VendorPayment');
const PurchaseOrder = require('../models/PurchaseOrder');
const Company = require('../models/Company');
const Counter = require('../models/Counter');
const journalEngine = require('../services/journalEngine.service');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('vendor-bills', 'FULL_ACCESS'));

/**
 * 3-Way Match Comparison Engine
 * Reconciles PO approved rates & received quantities against vendor billed lines.
 */
function runThreeWayMatch(po, billedItems = []) {
  let hasQuantityVariance = false;
  let hasPriceVariance = false;
  let totalQtyVariance = 0;
  let totalPriceVariance = 0;

  billedItems.forEach((bItem) => {
    // Match by productId or itemName
    const poItem = (po.items || []).find(
      (p) => p.productId?.toString() === bItem.productId?.toString() || p.name === bItem.name
    );

    if (poItem) {
      const approvedRate = Number(poItem.unitPrice) || 0;
      const billedRate = Number(bItem.unitPriceBilled) || 0;
      const approvedQty = Number(poItem.quantity) || 0;
      const billedQty = Number(bItem.quantityBilled) || 0;

      // Price Variance check
      if (billedRate > approvedRate) {
        hasPriceVariance = true;
        totalPriceVariance += (billedRate - approvedRate) * billedQty;
      }

      // Quantity Variance check
      if (billedQty > approvedQty) {
        hasQuantityVariance = true;
        totalQtyVariance += billedQty - approvedQty;
      }
    } else {
      // Unlisted product billed
      hasQuantityVariance = true;
      totalQtyVariance += Number(bItem.quantityBilled) || 0;
    }
  });

  let matchStatus = 'PERFECT_MATCH';
  if (hasQuantityVariance && hasPriceVariance) {
    matchStatus = 'OVER_BILLED';
  } else if (hasQuantityVariance) {
    matchStatus = 'QUANTITY_VARIANCE';
  } else if (hasPriceVariance) {
    matchStatus = 'PRICE_VARIANCE';
  }

  const isApproved = matchStatus === 'PERFECT_MATCH';

  return {
    matchStatus,
    quantityVarianceUnits: Math.round(totalQtyVariance * 100) / 100,
    priceVarianceAmount: Math.round(totalPriceVariance * 100) / 100,
    isApproved
  };
}

// ── GET /api/vendor-bills/aging — Accounts Payable (AP) Aging ────
router.get('/aging', async (req, res) => {
  try {
    const now = new Date();

    const openBills = await VendorBill.find({
      tenantId: req.tenantId,
      status: { $in: ['UNDER_REVIEW', 'APPROVED', 'PARTIALLY_PAID', 'DISPUTED'] },
      'financialSummary.amountDue': { $gt: 0 }
    })
      .populate('supplierId', 'name gstin contactPerson phone email')
      .lean();

    const agingSummary = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
      totalPayables: 0
    };

    const supplierBreakdown = {};

    openBills.forEach((bill) => {
      const due = new Date(bill.dueDate);
      const diffTime = now.getTime() - due.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const amount = bill.financialSummary?.amountDue || 0;

      agingSummary.totalPayables += amount;

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

      const suppId = bill.supplierId?._id ? bill.supplierId._id.toString() : 'direct';
      const suppName = bill.supplierId?.name || 'Vendor';

      if (!supplierBreakdown[suppId]) {
        supplierBreakdown[suppId] = {
          supplierId: suppId,
          name: suppName,
          gstin: bill.supplierId?.gstin || '',
          phone: bill.supplierId?.phone || '',
          current: 0,
          days_1_30: 0,
          days_31_60: 0,
          days_61_90: 0,
          days_90_plus: 0,
          total: 0
        };
      }

      supplierBreakdown[suppId][bucket] += amount;
      supplierBreakdown[suppId].total += amount;
    });

    res.json({
      success: true,
      agingSummary: {
        current: Math.round(agingSummary.current * 100) / 100,
        days_1_30: Math.round(agingSummary.days_1_30 * 100) / 100,
        days_31_60: Math.round(agingSummary.days_31_60 * 100) / 100,
        days_61_90: Math.round(agingSummary.days_61_90 * 100) / 100,
        days_90_plus: Math.round(agingSummary.days_90_plus * 100) / 100,
        totalPayables: Math.round(agingSummary.totalPayables * 100) / 100
      },
      supplierBreakdown: Object.values(supplierBreakdown).sort((a, b) => b.total - a.total)
    });
  } catch (err) {
    logger.error('AP aging calculation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/vendor-bills — List bills with pagination & filter ──
router.get('/', async (req, res) => {
  try {
    const { status, matchStatus, search, page = 1, limit = 25 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (matchStatus && matchStatus !== 'ALL') {
      filter['matchingEngine.status'] = matchStatus;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { billNumber: { $regex: q, $options: 'i' } },
        { vendorInvoiceNumber: { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [bills, total] = await Promise.all([
      VendorBill.find(filter)
        .populate('supplierId', 'name gstin phone email')
        .populate('purchaseOrderId', 'poNumber status totalValue')
        .sort({ billDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      VendorBill.countDocuments(filter)
    ]);

    // Summary metrics
    const metricsAggregation = await VendorBill.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(req.tenantId), status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: null,
          totalPayables: { $sum: '$financialSummary.amountDue' },
          totalPaid: { $sum: '$financialSummary.amountPaid' },
          totalBilled: { $sum: '$financialSummary.grandTotal' },
          flaggedCount: {
            $sum: {
              $cond: [
                { $in: ['$matchingEngine.status', ['QUANTITY_VARIANCE', 'PRICE_VARIANCE', 'OVER_BILLED']] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      bills,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      },
      metrics: metricsAggregation[0] || { totalPayables: 0, totalPaid: 0, totalBilled: 0, flaggedCount: 0 }
    });
  } catch (err) {
    logger.error('List Vendor Bills error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/vendor-bills/:id — Fetch single bill ───────────────
router.get('/:id', async (req, res) => {
  try {
    const bill = await VendorBill.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('supplierId', 'name gstin phone email billingAddress bankDetails')
      .populate('purchaseOrderId')
      .populate('payments')
      .populate('matchingEngine.approvedBy', 'name email')
      .lean();

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Vendor Bill not found' });
    }

    res.json({ success: true, bill });
  } catch (err) {
    logger.error('Fetch Vendor Bill details error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/vendor-bills — Ingest bill & run 3-Way Match ──────
router.post('/', async (req, res) => {
  try {
    const {
      vendorInvoiceNumber,
      supplierId,
      purchaseOrderId,
      billDate,
      dueDate,
      paymentTerms = 'NET_30',
      items = [],
      isInterState = false,
      notes = ''
    } = req.body;

    if (!vendorInvoiceNumber || !purchaseOrderId || !supplierId) {
      return res.status(400).json({ success: false, error: 'vendorInvoiceNumber, purchaseOrderId, and supplierId are required' });
    }

    const po = await PurchaseOrder.findOne({ _id: purchaseOrderId, tenantId: req.tenantId });
    if (!po) {
      return res.status(404).json({ success: false, error: 'Referenced Purchase Order not found' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one line item is required' });
    }

    // Run automated 3-Way Match
    const matchResult = runThreeWayMatch(po, items);

    // Calculate line items and taxes
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const billedItems = items.map((it) => {
      const qty = Number(it.quantityBilled) || 1;
      const rate = Number(it.unitPriceBilled) || 0;
      const taxable = Math.round(qty * rate * 100) / 100;
      const gstRate = Number(it.gstRate) || 18;

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isInterState) {
        igst = Math.round(taxable * (gstRate / 100) * 100) / 100;
      } else {
        cgst = Math.round(taxable * ((gstRate / 2) / 100) * 100) / 100;
        sgst = Math.round(taxable * ((gstRate / 2) / 100) * 100) / 100;
      }

      const total = Math.round((taxable + cgst + sgst + igst) * 100) / 100;

      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      return {
        productId: it.productId,
        name: it.name,
        sku: it.sku || '',
        hsnCode: it.hsnCode || '8471',
        quantityBilled: qty,
        unitPriceBilled: rate,
        taxableAmount: taxable,
        gstRate,
        taxAmount: cgst + sgst + igst,
        total
      };
    });

    const totalTax = totalCgst + totalSgst + totalIgst;
    const rawGrand = totalTaxable + totalTax;
    const grandTotal = Math.round(rawGrand);
    const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

    // Generate atomic sequence BILL-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(req.tenantId, 'VENDOR_BILL', `BILL-${currentYear}`, 4);
    const billNumber = `${seq}`;

    const vendorBill = new VendorBill({
      billNumber,
      vendorInvoiceNumber,
      supplierId,
      purchaseOrderId: po._id,
      billDate: billDate ? new Date(billDate) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentTerms,
      items: billedItems,
      financialSummary: {
        taxableAmount: Math.round(totalTaxable * 100) / 100,
        cgst: Math.round(totalCgst * 100) / 100,
        sgst: Math.round(totalSgst * 100) / 100,
        igst: Math.round(totalIgst * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        roundOff,
        grandTotal,
        amountPaid: 0,
        amountDue: grandTotal,
        isInterState
      },
      matchingEngine: {
        status: matchResult.matchStatus,
        quantityVarianceUnits: matchResult.quantityVarianceUnits,
        priceVarianceAmount: matchResult.priceVarianceAmount,
        approvedForPayment: matchResult.isApproved,
        inspectedAt: new Date()
      },
      status: matchResult.isApproved ? 'APPROVED' : 'UNDER_REVIEW',
      notes,
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await vendorBill.save();

    if (matchResult.isApproved) {
      try {
        await journalEngine.postVendorBillApproved(req.tenantId, {
          _id: vendorBill._id,
          billNumber: vendorBill.billNumber,
          billDate: vendorBill.billDate,
          grandTotal: vendorBill.financialSummary.grandTotal,
          taxableAmount: vendorBill.financialSummary.taxableAmount,
          cgstAmount: vendorBill.financialSummary.cgst,
          sgstAmount: vendorBill.financialSummary.sgst,
          igstAmount: vendorBill.financialSummary.igst
        }, req.userId);
      } catch (glErr) {
        logger.warn('GL Auto-post bill error: ' + glErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: matchResult.isApproved
        ? `Vendor Bill ${billNumber} ingested and auto-approved via perfect 3-Way Match`
        : `Vendor Bill ${billNumber} ingested with flagged variance: ${matchResult.matchStatus}`,
      vendorBill
    });
  } catch (err) {
    logger.error('Create Vendor Bill error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/vendor-bills/:id/override — Manager Override ───────
router.post('/:id/override', async (req, res) => {
  try {
    const { approvalNotes = 'Manager verified variance and approved payout' } = req.body;

    const bill = await VendorBill.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Vendor Bill not found' });
    }

    bill.matchingEngine.status = 'OVERRIDDEN';
    bill.matchingEngine.approvedForPayment = true;
    bill.matchingEngine.approvedBy = req.userId;
    bill.matchingEngine.approvalNotes = approvalNotes;
    bill.status = 'APPROVED';

    await bill.save();

    try {
      await journalEngine.postVendorPayment(req.tenantId, {
        _id: payment._id,
        voucherNumber: payment.voucherNumber,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMode
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post vendor payment error: ' + glErr.message);
    }

    try {
      await journalEngine.postVendorBillApproved(req.tenantId, {
        _id: bill._id,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        grandTotal: bill.financialSummary.grandTotal,
        taxableAmount: bill.financialSummary.taxableAmount,
        cgstAmount: bill.financialSummary.cgst,
        sgstAmount: bill.financialSummary.sgst,
        igstAmount: bill.financialSummary.igst
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post override bill error: ' + glErr.message);
    }

    res.json({
      success: true,
      message: `Vendor Bill ${bill.billNumber} approved for payment via manager override`,
      vendorBill: bill
    });
  } catch (err) {
    logger.error('Override Vendor Bill error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/vendor-bills/:id/payments — Outbound Payment Voucher
router.post('/:id/payments', async (req, res) => {
  try {
    const {
      amount,
      paymentMode = 'NEFT_RTGS',
      transactionReference = '',
      bankName = '',
      debitAccount = '',
      paymentDate,
      notes = ''
    } = req.body;

    const bill = await VendorBill.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!bill) {
      return res.status(404).json({ success: false, error: 'Vendor Bill not found' });
    }

    // Gatekeeper: Must be approved for payment by 3-Way match or manager override
    if (!bill.matchingEngine?.approvedForPayment) {
      return res.status(400).json({
        success: false,
        error: `Bill has unapproved variance (${bill.matchingEngine?.status}). A manager must override and approve before disbursing funds.`
      });
    }

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid payment amount is required' });
    }

    if (payAmount > (bill.financialSummary.amountDue || 0)) {
      return res.status(400).json({
        success: false,
        error: `Payment amount (₹${payAmount}) cannot exceed outstanding amount due (₹${bill.financialSummary.amountDue})`
      });
    }

    // Generate atomic sequence VCH-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(req.tenantId, 'PAYMENT_VOUCHER', `VCH-${currentYear}`, 4);
    const voucherNumber = `${seq}`;

    const payment = new VendorPayment({
      voucherNumber,
      vendorBillId: bill._id,
      supplierId: bill.supplierId,
      amount: payAmount,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMode,
      transactionReference,
      bankName,
      debitAccount,
      notes,
      paidBy: req.userId,
      tenantId: req.tenantId
    });

    await payment.save();

    // Reconcile bill balances
    const newPaid = Math.round(((Number(bill.financialSummary.amountPaid) || 0) + payAmount) * 100) / 100;
    const newDue = Math.round(Math.max(0, bill.financialSummary.grandTotal - newPaid) * 100) / 100;

    bill.financialSummary.amountPaid = newPaid;
    bill.financialSummary.amountDue = newDue;
    bill.payments.push(payment._id);

    if (newDue === 0) {
      bill.status = 'PAID';
    } else {
      bill.status = 'PARTIALLY_PAID';
    }

    await bill.save();

    try {
      await journalEngine.postVendorPayment(req.tenantId, {
        _id: payment._id,
        voucherNumber: payment.voucherNumber,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMode
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post vendor payment error: ' + glErr.message);
    }

    try {
      await journalEngine.postVendorBillApproved(req.tenantId, {
        _id: bill._id,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        grandTotal: bill.financialSummary.grandTotal,
        taxableAmount: bill.financialSummary.taxableAmount,
        cgstAmount: bill.financialSummary.cgst,
        sgstAmount: bill.financialSummary.sgst,
        igstAmount: bill.financialSummary.igst
      }, req.userId);
    } catch (glErr) {
      logger.warn('GL Auto-post override bill error: ' + glErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Payment Voucher ${voucherNumber} recorded for ₹${payAmount.toLocaleString()}`,
      payment,
      vendorBill: bill
    });
  } catch (err) {
    logger.error('Record Vendor Payment error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

