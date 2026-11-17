/**
 * RMA & Reverse Logistics Express Route
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 * - GET    /api/rma                    List RMAs with search & status filters
 * - GET    /api/rma/metrics            Key RMA & reverse logistics KPIs
 * - GET    /api/rma/:id                Fetch single RMA details
 * - POST   /api/rma                    Create return authorization against an Invoice
 * - PATCH  /api/rma/:id/status         Advance RMA status (Approved, In-Transit, Received, Rejected)
 * - POST   /api/rma/:id/inspect        Dock inspection triage: Restock, Scrap, auto-generate Credit Note
 * - GET    /api/rma/passport/:code     360° Digital Product Passport lookup
 * - POST   /api/rma/disposition        Single serial disposition
 * - POST   /api/rma/bulk-register-serials Bulk serial numbers registration
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const RMA = require('../models/RMA');
const CreditNote = require('../models/CreditNote');
const Invoice = require('../models/Invoice');
const Company = require('../models/Company');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const SerialAudit = require('../models/SerialAudit');
const Warehouse = require('../models/Warehouse');
const Warranty = require('../models/Warranty');
const Counter = require('../models/Counter');

const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const logger = require('../utils/logger');

router.use(requireAuth);
router.use(requireTenantId);
router.use(requireModuleAccess('rma', 'FULL_ACCESS'));

// ── GET /api/rma/metrics — Key reverse logistics KPIs ─────────────
router.get('/metrics', async (req, res) => {
  try {
    const tenantOid = new mongoose.Types.ObjectId(req.tenantId);

    const [statusCounts, creditTotal] = await Promise.all([
      RMA.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      CreditNote.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, totalCredit: { $sum: '$financialSummary.grandTotal' } } }
      ])
    ]);

    const counts = {
      REQUESTED: 0,
      APPROVED: 0,
      IN_TRANSIT: 0,
      RECEIVED: 0,
      INSPECTED: 0,
      COMPLETED: 0,
      REJECTED: 0
    };

    statusCounts.forEach((s) => {
      if (counts[s._id] !== undefined) counts[s._id] = s.count;
    });

    res.json({
      success: true,
      metrics: {
        totalPending: counts.REQUESTED + counts.APPROVED + counts.IN_TRANSIT,
        awaitingInspection: counts.RECEIVED,
        totalCompleted: counts.COMPLETED + counts.INSPECTED,
        totalCreditIssued: creditTotal[0]?.totalCredit || 0,
        breakdown: counts
      }
    });
  } catch (err) {
    logger.error('Fetch RMA metrics error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/rma — List RMAs with pagination and filters ─────────
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
        { rmaNumber: { $regex: q, $options: 'i' } },
        { 'returnLogistics.trackingNumber': { $regex: q, $options: 'i' } },
        { 'returnLogistics.courierName': { $regex: q, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [rmas, total] = await Promise.all([
      RMA.find(filter)
        .populate('companyId', 'name gstin phone email')
        .populate('invoiceId', 'invoiceNumber invoiceDate financialSummary')
        .populate('creditNoteId', 'creditNoteNumber financialSummary status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      RMA.countDocuments(filter)
    ]);

    res.json({
      success: true,
      rmas,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    logger.error('List RMAs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/rma/passport/:code — 360° Product Passport ──────────
router.get('/passport/:code', async (req, res) => {
  try {
    const rawCode = (req.params.code || '').trim();
    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(req.tenantId);
    const codeUpper = rawCode.toUpperCase();

    // 1. Check if code matches a Serial Number in SerialAudit
    const serialAudits = await SerialAudit.find({
      serial: codeUpper,
      tenantId: tenantObjectId
    })
      .sort({ createdAt: 1 })
      .populate('performedBy', 'name username email role')
      .populate('warehouseId', 'name code address')
      .populate('salesOrderId', 'orderNumber customer buyer orderDate')
      .populate('purchaseOrderId', 'orderNumber supplierName orderDate')
      .lean();

    if (serialAudits && serialAudits.length > 0) {
      const lastAudit = serialAudits[serialAudits.length - 1];
      const productId = lastAudit.productId;

      const [product, warranty, warehouses] = await Promise.all([
        Item.findOne({ _id: productId, tenantId: req.tenantId }).lean(),
        Warranty.findOne({
          serialNumber: codeUpper,
          tenantId: req.tenantId,
          isActive: true
        }).lean({ virtuals: true }),
        Warehouse.find({ tenantId: req.tenantId, isActive: true }).select('name code isDefault').lean()
      ]);

      return res.json({
        success: true,
        type: 'SERIAL',
        matchedCode: codeUpper,
        product,
        warranty,
        warehouses,
        history: serialAudits
      });
    }

    return res.status(404).json({ success: false, error: `No product passport found for code: ${codeUpper}` });
  } catch (err) {
    logger.error('Passport lookup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/rma/:id — Fetch single RMA ──────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const rma = await RMA.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId', 'name gstin phone email billingAddress shippingAddress')
      .populate('invoiceId')
      .populate('warehouseId', 'name code address')
      .populate('creditNoteId')
      .populate('requestedBy', 'name email')
      .populate('inspectedBy', 'name email')
      .lean();

    if (!rma) {
      return res.status(404).json({ success: false, error: 'RMA not found' });
    }

    res.json({ success: true, rma });
  } catch (err) {
    logger.error('Fetch RMA details error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/rma — Initiate RMA against Invoice ────────────────
router.post('/', async (req, res) => {
  try {
    const {
      invoiceId,
      warehouseId,
      returnType = 'CUSTOMER_RETURN',
      reason = 'DEFECTIVE_PRODUCT',
      reasonDetails = '',
      items = [],
      returnLogistics = {}
    } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ success: false, error: 'invoiceId is required to issue an RMA' });
    }

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId: req.tenantId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Referenced Invoice not found' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item must be designated for return' });
    }

    // Generate atomic sequence RMA-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const seq = await Counter.getNextSequence(req.tenantId, 'RMA', `RMA-${currentYear}`, 4);
    const rmaNumber = `${seq}`;

    // Map item details from invoice
    const rmaItems = items.map((it) => {
      const invItem = (invoice.items || []).find(
        (orig) => orig.productId?.toString() === it.productId?.toString() || orig.name === it.name
      ) || it;

      return {
        productId: it.productId || invItem.productId,
        name: invItem.name || it.name,
        sku: invItem.sku || it.sku || '',
        hsnCode: invItem.hsnCode || it.hsnCode || '8471',
        quantityRequested: Number(it.quantityRequested) || 1,
        quantityReceived: 0,
        unitPrice: Number(invItem.unitPrice) || Number(it.unitPrice) || 0,
        taxRatePercent: Number(invItem.taxRatePercent) || Number(it.taxRatePercent) || 18,
        disposition: 'PENDING',
        dispositionNotes: ''
      };
    });

    const rma = new RMA({
      rmaNumber,
      invoiceId: invoice._id,
      salesOrderId: invoice.salesOrderId,
      companyId: invoice.companyId,
      warehouseId: warehouseId || undefined,
      status: 'APPROVED', // Auto-approved upon formal authorization
      returnType,
      reason,
      reasonDetails,
      items: rmaItems,
      returnLogistics: {
        courierName: returnLogistics.courierName || '',
        trackingNumber: returnLogistics.trackingNumber || '',
        awbNumber: returnLogistics.awbNumber || '',
        dispatchedDate: returnLogistics.dispatchedDate ? new Date(returnLogistics.dispatchedDate) : new Date()
      },
      requestedBy: req.userId,
      approvedBy: req.userId,
      tenantId: req.tenantId
    });

    await rma.save();

    res.status(201).json({
      success: true,
      message: `Return Merchandise Authorization ${rmaNumber} generated successfully`,
      rma
    });
  } catch (err) {
    logger.error('Create RMA error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PATCH /api/rma/:id/status — Advance RMA status ──────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, courierName, trackingNumber } = req.body;

    const rma = await RMA.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!rma) {
      return res.status(404).json({ success: false, error: 'RMA not found' });
    }

    if (status) rma.status = status;

    if (courierName || trackingNumber) {
      if (!rma.returnLogistics) rma.returnLogistics = {};
      if (courierName) rma.returnLogistics.courierName = courierName;
      if (trackingNumber) rma.returnLogistics.trackingNumber = trackingNumber;
    }

    if (status === 'RECEIVED') {
      rma.returnLogistics.receivedDate = new Date();
    }

    await rma.save();

    res.json({ success: true, message: `RMA status updated to ${rma.status}`, rma });
  } catch (err) {
    logger.error('Update RMA status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/rma/:id/inspect — Dock Disposition & Credit Note ──
router.post('/:id/inspect', async (req, res) => {
  try {
    const { itemDispositions = [] } = req.body;

    const rma = await RMA.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('invoiceId');

    if (!rma) {
      return res.status(404).json({ success: false, error: 'RMA not found' });
    }

    if (rma.status === 'COMPLETED' || rma.creditNoteId) {
      return res.status(400).json({ success: false, error: 'RMA has already been inspected and credited' });
    }

    const invoice = rma.invoiceId;
    let unitsRestocked = 0;
    let unitsScrapped = 0;
    let unitsRtv = 0;
    let totalUnitsReceived = 0;

    const creditItems = [];
    const isInterState = invoice?.financialSummary?.isInterState || false;

    // Process each disposition
    for (const disp of itemDispositions) {
      const rmaItem = rma.items.id(disp.itemId) || rma.items[disp.itemIndex];
      if (!rmaItem) continue;

      const qtyRecv = Number(disp.quantityReceived) || 0;
      rmaItem.quantityReceived = qtyRecv;
      rmaItem.disposition = disp.disposition || 'RESTOCK';
      rmaItem.dispositionNotes = disp.dispositionNotes || '';

      totalUnitsReceived += qtyRecv;

      if (qtyRecv > 0) {
        if (disp.disposition === 'RESTOCK') {
          unitsRestocked += qtyRecv;
          // Increment product inventory
          if (rmaItem.productId) {
            await Item.updateOne(
              { _id: rmaItem.productId, tenantId: req.tenantId },
              { $inc: { currentStock: qtyRecv } }
            );

            // Create Stock Ledger audit trail
            try {
              await StockLedger.create({
                productId: rmaItem.productId,
                quantity: qtyRecv,
                type: 'IN',
                adjustmentReason: `RMA Return Restock: ${rma.rmaNumber}`,
                performedBy: req.userId,
                tenantId: req.tenantId
              });
            } catch (ledgerErr) {
              logger.warn('Stock ledger record warning:', ledgerErr.message);
            }
          }
        } else if (disp.disposition === 'SCRAP') {
          unitsScrapped += qtyRecv;
        } else if (disp.disposition === 'RETURN_TO_VENDOR') {
          unitsRtv += qtyRecv;
        }

        // Calculate credit note item values
        const unitPrice = rmaItem.unitPrice || 0;
        const taxable = Math.round(qtyRecv * unitPrice * 100) / 100;
        const taxRate = rmaItem.taxRatePercent || 18;

        let cgst = 0;
        let sgst = 0;
        let igst = 0;

        if (isInterState) {
          igst = Math.round(taxable * (taxRate / 100) * 100) / 100;
        } else {
          cgst = Math.round(taxable * ((taxRate / 2) / 100) * 100) / 100;
          sgst = Math.round(taxable * ((taxRate / 2) / 100) * 100) / 100;
        }

        const total = Math.round((taxable + cgst + sgst + igst) * 100) / 100;

        creditItems.push({
          productId: rmaItem.productId,
          name: rmaItem.name,
          sku: rmaItem.sku,
          hsnCode: rmaItem.hsnCode,
          quantity: qtyRecv,
          unitPrice,
          taxableAmount: taxable,
          gstRate: taxRate,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: igst,
          total
        });
      }
    }

    // Auto-generate Statutory GST Credit Note if any valid units were received
    let creditNote = null;
    if (creditItems.length > 0) {
      const currentYear = new Date().getFullYear();
      const cnSeq = await Counter.getNextSequence(req.tenantId, 'CREDIT_NOTE', `CRN-${currentYear}`, 4);
      const creditNoteNumber = `${cnSeq}`;

      const totalTaxable = creditItems.reduce((acc, it) => acc + it.taxableAmount, 0);
      const totalCgst = creditItems.reduce((acc, it) => acc + it.cgstAmount, 0);
      const totalSgst = creditItems.reduce((acc, it) => acc + it.sgstAmount, 0);
      const totalIgst = creditItems.reduce((acc, it) => acc + it.igstAmount, 0);
      const totalTax = totalCgst + totalSgst + totalIgst;
      const rawGrand = totalTaxable + totalTax;
      const grandTotal = Math.round(rawGrand);
      const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

      creditNote = new CreditNote({
        creditNoteNumber,
        rmaId: rma._id,
        invoiceId: invoice._id,
        originalInvoiceNumber: invoice.invoiceNumber,
        originalInvoiceDate: invoice.invoiceDate,
        companyId: rma.companyId,
        creditNoteDate: new Date(),
        reason: `01-Sales Return (RMA ${rma.rmaNumber})`,
        billingAddress: invoice.billingAddress || { name: 'Customer' },
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

      // Automatically reconcile Customer AR Balance
      const company = await Company.findOne({ _id: rma.companyId, tenantId: req.tenantId });
      if (company) {
        company.outstandingBalance = Math.max(0, (Number(company.outstandingBalance) || 0) - grandTotal);
        await company.save();
      }

      // Reconcile Invoice Amount Due
      if (invoice) {
        invoice.financialSummary.amountDue = Math.max(0, (Number(invoice.financialSummary.amountDue) || 0) - grandTotal);
        if (invoice.financialSummary.amountDue === 0 && invoice.financialSummary.amountPaid > 0) {
          invoice.status = 'PAID';
        }
        await invoice.save();
      }

      rma.creditNoteId = creditNote._id;
    }

    rma.status = 'COMPLETED';
    rma.inspectedBy = req.userId;
    rma.inspectionSummary = {
      totalUnitsReceived,
      unitsRestocked,
      unitsScrapped,
      unitsRtv,
      inspectedAt: new Date()
    };

    await rma.save();

    res.json({
      success: true,
      message: `RMA ${rma.rmaNumber} inspection completed. ${unitsRestocked} units restocked, ${unitsScrapped} scrapped.`,
      rma,
      creditNote
    });
  } catch (err) {
    logger.error('RMA inspection error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/rma/disposition — Single serial disposition ────────
router.post('/disposition', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { serial, disposition, warehouseId, notes, returnReason } = req.body;

    if (!serial || !disposition) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'Serial number and disposition are required' });
    }

    const serialUpper = serial.trim().toUpperCase();
    const validDispositions = ['RETURN_RESTOCK', 'REPAIR_START', 'REPAIR_DONE', 'SCRAP_WRITEOFF'];
    if (!validDispositions.includes(disposition)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: `Invalid disposition. Must be one of: ${validDispositions.join(', ')}` });
    }

    const lastAudit = await SerialAudit.findOne({
      serial: serialUpper,
      tenantId: req.tenantId
    })
      .sort({ createdAt: -1 })
      .session(session);

    if (!lastAudit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, error: `Serial ${serialUpper} not found in system` });
    }

    const productId = lastAudit.productId;
    const resolvedWarehouseId = warehouseId || lastAudit.warehouseId || null;

    const newAudit = new SerialAudit({
      serial: serialUpper,
      productId,
      action: disposition,
      warehouseId: resolvedWarehouseId,
      dispositionNotes: notes || '',
      returnReason: returnReason || '',
      performedBy: req.user?._id || req.userId,
      role: req.user?.role || 'ADMIN',
      companyId: req.user?.companyId || lastAudit.companyId,
      tenantId: req.tenantId
    });
    await newAudit.save({ session });

    if (disposition === 'RETURN_RESTOCK' || disposition === 'REPAIR_DONE') {
      let whId = resolvedWarehouseId;
      if (!whId) {
        const defaultWh = await Warehouse.findOne({ tenantId: req.tenantId, isActive: true }).session(session);
        if (defaultWh) whId = defaultWh._id;
      }

      const ledgerEntry = new StockLedger({
        productId,
        warehouseId: whId,
        type: 'ADJUSTMENT_IN',
        quantity: 1,
        serialNumbers: [serialUpper],
        adjustmentReason: returnReason ? `RMA_${returnReason}` : (disposition === 'REPAIR_DONE' ? 'REPAIR_COMPLETED_RESTOCK' : 'CUSTOMER_RETURN_RESTOCK'),
        performedBy: req.user?._id || req.userId,
        tenantId: req.tenantId
      });
      await ledgerEntry.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Serial ${serialUpper} successfully processed with disposition: ${disposition}`,
      serial: serialUpper,
      disposition
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('RMA single disposition error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /api/rma/bulk-register-serials ───────────────────────────
router.post('/bulk-register-serials', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, warehouseId, serials } = req.body;

    if (!productId || !Array.isArray(serials) || serials.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'productId and serials array are required' });
    }

    const cleanSerials = [...new Set(serials.map(s => String(s).trim().toUpperCase()))].filter(Boolean);
    if (cleanSerials.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, error: 'No valid serial numbers provided' });
    }

    const existingAudits = await SerialAudit.aggregate([
      { $match: { serial: { $in: cleanSerials }, tenantId: new mongoose.Types.ObjectId(req.tenantId) } },
      { $group: { _id: '$serial' } }
    ]).session(session);

    if (existingAudits.length > 0) {
      const duplicateSerials = existingAudits.map(d => d._id);
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: `The following serial(s) already exist in inventory: ${duplicateSerials.slice(0, 5).join(', ')}`
      });
    }

    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId || !mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
      const defaultWh = await Warehouse.findOne({ tenantId: req.tenantId, isActive: true }).session(session);
      if (defaultWh) targetWarehouseId = defaultWh._id;
    }

    const auditEntries = cleanSerials.map(s => ({
      serial: s,
      productId: new mongoose.Types.ObjectId(productId),
      action: 'IN',
      warehouseId: targetWarehouseId,
      dispositionNotes: 'Bulk Serial Packaging Registration',
      performedBy: req.user?._id || req.userId,
      tenantId: req.tenantId
    }));
    await SerialAudit.insertMany(auditEntries, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      registeredCount: cleanSerials.length,
      message: `Successfully registered ${cleanSerials.length} unit serial numbers into inventory`
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error('Bulk register serials error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
