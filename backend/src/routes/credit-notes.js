/**
 * Credit Notes Express Route — Statutory GST Section 34 Compliance
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET    /api/credit-notes          List credit notes with search & status filters
 * - GET    /api/credit-notes/:id      Fetch single credit note with invoice reference
 * - POST   /api/credit-notes          Create statutory credit note (manual or adjustment)
 * - POST   /api/credit-notes/:id/apply Apply credit note against another open customer invoice
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const CreditNote = require('../models/CreditNote');
const Invoice = require('../models/Invoice');
const Company = require('../models/Company');
const Counter = require('../models/Counter');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

router.use(requireTenantId);
router.use(requireAuth);

// ── GET /api/credit-notes — List credit notes ───────────────────
router.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { creditNoteNumber: { $regex: q, $options: 'i' } },
        { originalInvoiceNumber: { $regex: q, $options: 'i' } },
        { 'billingAddress.name': { $regex: q, $options: 'i' } },
        { 'billingAddress.gstin': { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [creditNotes, total] = await Promise.all([
      CreditNote.find(filter)
        .populate('companyId', 'name gstin phone email')
        .populate('invoiceId', 'invoiceNumber invoiceDate')
        .populate('rmaId', 'rmaNumber returnType reason')
        .sort({ creditNoteDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      CreditNote.countDocuments(filter)
    ]);

    // Summary metrics
    const metricsAggregation = await CreditNote.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(req.tenantId), status: { $ne: 'VOID' } } },
      {
        $group: {
          _id: null,
          totalCreditIssued: { $sum: '$financialSummary.grandTotal' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      creditNotes,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      },
      metrics: metricsAggregation[0] || { totalCreditIssued: 0, count: 0 }
    });
  } catch (err) {
    logger.error('List Credit Notes error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/credit-notes/:id — Fetch single credit note ────────
router.get('/:id', async (req, res) => {
  try {
    const creditNote = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId', 'name gstin phone email billingAddress shippingAddress')
      .populate('invoiceId')
      .populate('rmaId')
      .populate('issuedBy', 'name email')
      .lean();

    if (!creditNote) {
      return res.status(404).json({ success: false, error: 'Credit Note not found' });
    }

    res.json({ success: true, creditNote });
  } catch (err) {
    logger.error('Fetch Credit Note details error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/credit-notes — Create Credit Note ─────────────────
router.post('/', async (req, res) => {
  try {
    const {
      invoiceId,
      reason = '01-Sales Return',
      items = [],
      creditNoteDate
    } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ success: false, error: 'invoiceId is required' });
    }

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId: req.tenantId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Original Invoice not found' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one line item is required' });
    }

    const isInterState = invoice.financialSummary?.isInterState || false;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const creditItems = items.map((it) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.unitPrice) || 0;
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
        quantity: qty,
        unitPrice: rate,
        taxableAmount: taxable,
        gstRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        total
      };
    });

    const totalTax = totalCgst + totalSgst + totalIgst;
    const rawGrand = totalTaxable + totalTax;
    const grandTotal = Math.round(rawGrand);
    const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

    const currentYear = new Date().getFullYear();
    const cnSeq = await Counter.getNextSequence(req.tenantId, 'CREDIT_NOTE', `CRN-${currentYear}`, 4);
    const creditNoteNumber = `${cnSeq}`;

    const creditNote = new CreditNote({
      creditNoteNumber,
      invoiceId: invoice._id,
      originalInvoiceNumber: invoice.invoiceNumber,
      originalInvoiceDate: invoice.invoiceDate,
      companyId: invoice.companyId,
      creditNoteDate: creditNoteDate ? new Date(creditNoteDate) : new Date(),
      reason,
      billingAddress: invoice.billingAddress,
      items: creditItems,
      financialSummary: {
        taxableAmount: Math.round(totalTaxable * 100) / 100,
        cgst: Math.round(totalCgst * 100) / 100,
        sgst: Math.round(totalSgst * 100) / 100,
        igst: Math.round(totalIgst * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        roundOff,
        grandTotal,
        isInterState
      },
      status: 'ISSUED',
      issuedBy: req.userId,
      tenantId: req.tenantId
    });

    await creditNote.save();

    // Reconcile Customer 360 outstanding balance
    const company = await Company.findOne({ _id: invoice.companyId, tenantId: req.tenantId });
    if (company) {
      company.outstandingBalance = Math.max(0, (Number(company.outstandingBalance) || 0) - grandTotal);
      await company.save();
    }

    // Reconcile original invoice balance
    invoice.financialSummary.amountDue = Math.max(0, (Number(invoice.financialSummary.amountDue) || 0) - grandTotal);
    if (invoice.financialSummary.amountDue === 0 && invoice.financialSummary.amountPaid > 0) {
      invoice.status = 'PAID';
    }
    await invoice.save();

    res.status(201).json({
      success: true,
      message: `Statutory GST Credit Note ${creditNoteNumber} issued for ₹${grandTotal.toLocaleString()}`,
      creditNote
    });
  } catch (err) {
    logger.error('Create Credit Note error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/credit-notes/:id/apply — Apply to another invoice ──
router.post('/:id/apply', async (req, res) => {
  try {
    const { targetInvoiceId } = req.body;

    const creditNote = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!creditNote) {
      return res.status(404).json({ success: false, error: 'Credit Note not found' });
    }

    if (creditNote.status === 'ALLOCATED') {
      return res.status(400).json({ success: false, error: 'Credit Note is already fully allocated' });
    }

    const targetInvoice = await Invoice.findOne({ _id: targetInvoiceId, tenantId: req.tenantId });
    if (!targetInvoice) {
      return res.status(404).json({ success: false, error: 'Target Invoice not found' });
    }

    const creditAmount = creditNote.financialSummary.grandTotal;
    const currentDue = targetInvoice.financialSummary.amountDue || 0;

    targetInvoice.financialSummary.amountDue = Math.max(0, currentDue - creditAmount);
    if (targetInvoice.financialSummary.amountDue === 0) {
      targetInvoice.status = 'PAID';
    } else {
      targetInvoice.status = 'PARTIALLY_PAID';
    }
    await targetInvoice.save();

    creditNote.status = 'ALLOCATED';
    creditNote.allocatedToInvoiceId = targetInvoice._id;
    await creditNote.save();

    res.json({
      success: true,
      message: `Credit Note ${creditNote.creditNoteNumber} applied against Invoice ${targetInvoice.invoiceNumber}`,
      creditNote,
      targetInvoice
    });
  } catch (err) {
    logger.error('Apply Credit Note error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

