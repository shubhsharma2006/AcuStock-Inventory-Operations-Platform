/**
 * CRM Pipeline & Inventory Fulfillment API Routes
 * ─────────────────────────────────────────────────────────────
 * Quote-to-Cash engine connecting customer leads, quotations,
 * and soft stock reservations directly to WMS Sales Orders.
 */

const express = require('express');
const mongoose = require('mongoose');
const CrmDeal = require('../models/CrmDeal');
const Item = require('../models/Item');
const Company = require('../models/Company');
const SalesOrder = require('../models/SalesOrder');
const StockReservation = require('../models/StockReservation');
const Counter = require('../models/Counter');
const Tenant = require('../models/Tenant');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const { requireModuleAccess } = require('../middleware/requireModuleAccess');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);
router.use(requireAuth);
router.use(requireModuleAccess('crm', 'FULL_ACCESS'));

/**
 * Helper: Computes line totals and total deal value
 */
function calculateDealFinancials(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: [], totalValue: 0 };
  }

  let totalValue = 0;
  const processedItems = items.map(it => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const discount = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
    const taxRate = Math.max(0, Number(it.taxRatePercent) || 0);

    const priceAfterDiscount = price * (1 - discount / 100);
    const taxAmount = priceAfterDiscount * (taxRate / 100);
    const lineTotal = Math.round((priceAfterDiscount + taxAmount) * qty * 100) / 100;

    totalValue += lineTotal;

    return {
      productId: it.productId,
      quantity: qty,
      unitPrice: price,
      discountPercent: discount,
      taxRatePercent: taxRate,
      lineTotal,
      atpAvailable: Number(it.atpAvailable) || 0
    };
  });

  return { items: processedItems, totalValue: Math.round(totalValue * 100) / 100 };
}

/**
 * Helper: Computes state-aware Indian GST breakdown (CGST+SGST vs IGST)
 */
function calculateGstFinancials(items, buyerState = '', tenantState = 'Maharashtra') {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
      grandTotal: 0,
      isInterState: false
    };
  }

  const normBuyerState = String(buyerState || '').trim().toLowerCase();
  const normTenantState = String(tenantState || 'Maharashtra').trim().toLowerCase();
  const isInterState = normBuyerState && normTenantState && normBuyerState !== normTenantState;

  let taxableAmount = 0;
  let totalTax = 0;

  items.forEach(it => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    const discount = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
    const taxRate = Math.max(0, Number(it.taxRatePercent) || 0);

    const priceAfterDiscount = price * (1 - discount / 100);
    const lineTaxable = priceAfterDiscount * qty;
    const lineTax = lineTaxable * (taxRate / 100);

    taxableAmount += lineTaxable;
    totalTax += lineTax;
  });

  taxableAmount = Math.round(taxableAmount * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;
  const grandTotal = Math.round((taxableAmount + totalTax) * 100) / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterState) {
    igst = totalTax;
  } else {
    cgst = Math.round((totalTax / 2) * 100) / 100;
    sgst = Math.round((totalTax - cgst) * 100) / 100;
  }

  return {
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    grandTotal,
    isInterState: Boolean(isInterState)
  };
}

// ── GET /api/crm/kanban — Deals grouped by Stage with metrics ──
router.get('/kanban', async (req, res) => {
  try {
    const deals = await CrmDeal.find({ tenantId: req.tenantId })
      .populate('companyId', 'name email phone address')
      .populate('assignedTo', 'name email')
      .populate('items.productId', 'name sku uom salesPrice')
      .populate('salesOrderId', 'soNumber status fulfillmentStatus')
      .sort({ createdAt: -1 });

    const stages = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
    const kanban = {};
    const stageTotals = {};

    stages.forEach(st => {
      kanban[st] = [];
      stageTotals[st] = 0;
    });

    let totalPipelineValue = 0;
    let wonValue = 0;
    let wonCount = 0;
    let closedCount = 0;

    deals.forEach(deal => {
      const stage = deal.stage || 'LEAD';
      if (kanban[stage]) {
        kanban[stage].push(deal);
        stageTotals[stage] += deal.value || 0;
      }

      if (stage !== 'LOST') {
        totalPipelineValue += deal.value || 0;
      }

      if (stage === 'WON') {
        wonValue += deal.value || 0;
        wonCount += 1;
        closedCount += 1;
      } else if (stage === 'LOST') {
        closedCount += 1;
      }
    });

    const winRatePct = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

    res.json({
      success: true,
      kanban,
      stageTotals,
      metrics: {
        totalPipelineValue: Math.round(totalPipelineValue),
        totalDealsCount: deals.length,
        wonValue: Math.round(wonValue),
        wonCount,
        winRatePct
      }
    });
  } catch (err) {
    logger.error('CRM Kanban error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch CRM Kanban board' });
  }
});

// ── GET /api/crm/deals — Paginated / filtered list ─────────────
router.get('/deals', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { tenantId: req.tenantId };
    if (req.query.stage) filter.stage = req.query.stage;
    if (req.query.companyId) filter.companyId = req.query.companyId;

    if (req.query.search) {
      const s = String(req.query.search).trim();
      filter.$or = [
        { title: { $regex: s, $options: 'i' } },
        { dealNumber: { $regex: s, $options: 'i' } },
        { 'contact.name': { $regex: s, $options: 'i' } },
        { 'contact.email': { $regex: s, $options: 'i' } }
      ];
    }

    const [deals, total] = await Promise.all([
      CrmDeal.find(filter)
        .populate('companyId', 'name email phone address')
        .populate('assignedTo', 'name email')
        .populate('items.productId', 'name sku uom salesPrice')
        .populate('salesOrderId', 'soNumber status fulfillmentStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CrmDeal.countDocuments(filter)
    ]);

    res.json({
      success: true,
      deals,
      page,
      totalPages: Math.ceil(total / limit),
      total
    });
  } catch (err) {
    logger.error('CRM Deals list error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch deals' });
  }
});

// ── GET /api/crm/atp-check/:productId — Real-time ATP check ────
router.get('/atp-check/:productId', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.productId, tenantId: req.tenantId });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const physicalStock = await item.getCurrentStock();
    const atp = await item.getAvailableToPromise();
    const reserved = Math.max(0, physicalStock - atp);

    res.json({
      success: true,
      productId: item._id,
      name: item.name,
      sku: item.sku,
      physicalStock,
      reservedStock: reserved,
      availableToPromise: atp
    });
  } catch (err) {
    logger.error('ATP check error:', err);
    res.status(500).json({ success: false, error: 'Failed to calculate ATP' });
  }
});

// ── POST /api/crm/deals — Create new lead / deal ───────────────
router.post('/deals', async (req, res) => {
  try {
    const { title, companyId, contact, stage = 'LEAD', items = [], expectedCloseDate, notes, assignedTo } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Deal title is required' });
    }
    if (!contact?.name || !contact.name.trim()) {
      return res.status(400).json({ success: false, error: 'Contact name is required' });
    }

    // Sequence generator
    const year = new Date().getFullYear();
    const dealNumber = await Counter.getNextSequence(req.tenantId, 'CRM_DEAL', `DEAL-${year}`, 4);

    // Compute ATP snapshots and financial totals
    const { items: computedItems, totalValue } = calculateDealFinancials(items);

    const deal = new CrmDeal({
      dealNumber,
      title: title.trim(),
      companyId: companyId || null,
      contact: {
        name: contact.name.trim(),
        email: contact.email ? contact.email.trim() : '',
        phone: contact.phone ? contact.phone.trim() : '',
        designation: contact.designation ? contact.designation.trim() : ''
      },
      stage,
      value: totalValue,
      probability: stage === 'WON' ? 100 : stage === 'PROPOSAL' ? 60 : 30,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      assignedTo: assignedTo || req.userId,
      items: computedItems,
      notes: notes ? notes.trim() : '',
      activityLog: [{
        type: 'DEAL_CREATED',
        text: `Lead created: "${title.trim()}" valued at ₹${totalValue.toLocaleString()}`,
        user: req.user?.name || req.user?.email || 'User'
      }],
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await deal.save();

    logBusinessEvent({
      req,
      action: 'CRM_DEAL_CREATED',
      entityType: 'CrmDeal',
      entityId: deal._id,
      changes: {
        after: { dealNumber: deal.dealNumber, title: deal.title, value: deal.value, stage: deal.stage },
        summary: `Created CRM Deal ${deal.dealNumber} - ${deal.title}`
      }
    }).catch(() => {});

    res.status(201).json({ success: true, deal });
  } catch (err) {
    logger.error('Create CRM deal error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /api/crm/deals/:id — Fetch single deal detail ──────────
router.get('/deals/:id', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('assignedTo', 'name email')
      .populate('items.productId', 'name sku uom salesPrice purchasePrice')
      .populate('salesOrderId')
      .populate('softReservationId');

    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    res.json({ success: true, deal });
  } catch (err) {
    logger.error('Fetch CRM deal error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch deal' });
  }
});

// ── PATCH /api/crm/deals/:id — Update deal stage / fields ─────
router.patch('/deals/:id', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    const { stage, title, notes, probability, expectedCloseDate, items, lostReason, assignedTo } = req.body;
    const oldStage = deal.stage;

    if (title) deal.title = title.trim();
    if (notes !== undefined) deal.notes = notes;
    if (probability !== undefined) deal.probability = Math.min(100, Math.max(0, Number(probability)));
    if (expectedCloseDate !== undefined) deal.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
    if (lostReason !== undefined) deal.lostReason = lostReason;
    if (assignedTo !== undefined) deal.assignedTo = assignedTo || null;

    if (items) {
      const { items: computedItems, totalValue } = calculateDealFinancials(items);
      deal.items = computedItems;
      deal.value = totalValue;
    }

    if (stage && stage !== oldStage) {
      deal.stage = stage;
      deal.activityLog.push({
        type: 'STAGE_CHANGE',
        text: `Stage changed from ${oldStage} to ${stage}`,
        user: req.user?.name || req.user?.email || 'User'
      });

      // If lost, release any soft stock reservations
      if (stage === 'LOST' && deal.softReservationId) {
        await StockReservation.updateOne(
          { _id: deal.softReservationId, tenantId: req.tenantId },
          { $set: { status: 'RELEASED', releasedReason: 'Deal marked LOST' } }
        );
        deal.softReservationId = null;
        deal.activityLog.push({
          type: 'NOTE',
          text: 'Soft stock reservation automatically released due to LOST stage',
          user: 'System'
        });
      }
    }

    await deal.save();
    res.json({ success: true, deal });
  } catch (err) {
    logger.error('Update CRM deal error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── POST /api/crm/deals/:id/reserve-stock — 7-day Soft Hold ────
router.post('/deals/:id/reserve-stock', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('items.productId');

    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    if (!deal.items || deal.items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cannot reserve stock for a deal with no line items' });
    }

    // Verify Available-To-Promise stock for all items
    for (const line of deal.items) {
      const item = await Item.findOne({ _id: line.productId._id || line.productId, tenantId: req.tenantId });
      if (item) {
        const atp = await item.getAvailableToPromise();
        if (atp < line.quantity) {
          return res.status(400).json({
            success: false,
            error: `Insufficient available stock for ${item.name} (${item.sku}). Requested: ${line.quantity}, Available: ${atp}`
          });
        }
      }
    }

    const expiryDays = Math.max(1, Math.min(30, parseInt(req.body.days) || 7));
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    // Create reservation for primary item / bulk
    const firstLine = deal.items[0];
    const reservation = new StockReservation({
      reservationCode: `RES-CRM-${deal.dealNumber}`,
      productId: firstLine.productId._id || firstLine.productId,
      reservedQty: firstLine.quantity,
      status: 'ACTIVE',
      expiresAt,
      notes: `Soft reservation for CRM Deal: ${deal.dealNumber} (${deal.title})`,
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await reservation.save();

    deal.softReservationId = reservation._id;
    deal.softReservationExpiresAt = expiresAt;
    deal.activityLog.push({
      type: 'STOCK_RESERVED',
      text: `🔒 Soft-reserved ${firstLine.quantity} units for ${expiryDays} days (expires ${expiresAt.toLocaleDateString()})`,
      user: req.user?.name || req.user?.email || 'User'
    });

    await deal.save();

    res.json({
      success: true,
      reservation,
      expiresAt,
      deal
    });
  } catch (err) {
    logger.error('Reserve stock error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/crm/deals/:id/release-stock — Release Soft Hold ──
router.post('/deals/:id/release-stock', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    if (deal.softReservationId) {
      await StockReservation.updateOne(
        { _id: deal.softReservationId, tenantId: req.tenantId },
        { $set: { status: 'RELEASED', releasedReason: 'Manually released from CRM' } }
      );
      deal.softReservationId = null;
      deal.softReservationExpiresAt = null;
      deal.activityLog.push({
        type: 'NOTE',
        text: 'Stock reservation released back to general warehouse inventory',
        user: req.user?.name || req.user?.email || 'User'
      });
      await deal.save();
    }

    res.json({ success: true, message: 'Stock reservation released successfully', deal });
  } catch (err) {
    logger.error('Release stock error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/crm/deals/:id/convert-to-so — 1-Click Convert to Sales Order ─
router.post('/deals/:id/convert-to-so', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('items.productId');

    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    if (deal.salesOrderId) {
      return res.status(400).json({ success: false, error: 'This deal has already been converted to a Sales Order' });
    }

    if (!deal.items || deal.items.length === 0) {
      return res.status(400).json({ success: false, error: 'Deal must have at least one line item to generate a Sales Order' });
    }

    // Determine buyer details
    let buyerName = deal.contact?.name || 'Customer';
    let buyerEmail = deal.contact?.email || '';
    let buyerPhone = deal.contact?.phone || '';
    let buyerAddress = '';
    let targetCompany = null;

    if (deal.companyId) {
      targetCompany = await Company.findOne({ _id: deal.companyId._id || deal.companyId, tenantId: req.tenantId });
      if (targetCompany) {
        buyerName = targetCompany.name || buyerName;
        buyerEmail = targetCompany.email || buyerEmail;
        buyerPhone = targetCompany.phone || buyerPhone;
        if (targetCompany.address) {
          buyerAddress = Object.values(targetCompany.address).filter(Boolean).join(', ');
        }

        // ── Credit Limit & Block Enforcement ───────────────────────
        const creditLimit = Number(targetCompany.creditLimit) || 0;
        const currentBalance = Number(targetCompany.outstandingBalance) || 0;
        const orderValue = deal.value || 0;
        const projectedBalance = currentBalance + orderValue;

        const isExceeded = creditLimit > 0 && projectedBalance > creditLimit;
        const isBlocked = targetCompany.isCreditBlocked || isExceeded;

        if (isBlocked && req.body.allowCreditOverride !== true) {
          return res.status(403).json({
            success: false,
            error: `Customer credit limit exceeded! Current outstanding: ₹${currentBalance.toLocaleString()} + Order value: ₹${orderValue.toLocaleString()} = ₹${projectedBalance.toLocaleString()} exceeds approved credit limit of ₹${creditLimit.toLocaleString()}. Requires manager authorization.`,
            creditBlocked: true,
            requiresOverride: true,
            currentBalance,
            creditLimit,
            orderValue,
            projectedBalance
          });
        }

        if (isBlocked && req.body.allowCreditOverride === true) {
          deal.activityLog.push({
            type: 'NOTE',
            text: `⚠️ Manager Override applied for Customer Credit Limit (Projected: ₹${projectedBalance.toLocaleString()}, Limit: ₹${creditLimit.toLocaleString()}). Reason: ${req.body.overrideReason || 'Commercial Approval'}`,
            user: req.user?.name || req.user?.email || 'Manager'
          });
        }

        // Update company outstanding balance
        targetCompany.outstandingBalance = projectedBalance;
        await targetCompany.save();
      }
    }

    // Format items for SalesOrder model
    const soItems = deal.items.map(it => ({
      productId: it.productId._id || it.productId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal || (it.quantity * it.unitPrice),
      reservedQty: it.quantity
    }));

    // Generate formal SalesOrder
    const year = new Date().getFullYear();
    const soNumber = await Counter.getNextSequence(req.tenantId, 'SALES_ORDER', `SO-${year}`, 6);

    const salesOrder = new SalesOrder({
      soNumber,
      buyer: {
        name: buyerName,
        email: buyerEmail,
        phone: buyerPhone,
        address: buyerAddress || 'Client Registered Office'
      },
      items: soItems,
      totalValue: deal.value,
      status: 'confirmed',
      notes: `Generated via 1-Click CRM Quote-to-Cash conversion from Deal ${deal.dealNumber}`,
      expectedDeliveryDate: deal.expectedCloseDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: req.userId,
      tenantId: req.tenantId
    });

    await salesOrder.save();

    // Promote soft reservation to hard order reservation if present
    if (deal.softReservationId) {
      await StockReservation.updateOne(
        { _id: deal.softReservationId, tenantId: req.tenantId },
        { 
          $set: { 
            orderId: salesOrder._id,
            status: 'ACTIVE',
            notes: `Converted to hard allocation for Sales Order ${salesOrder.soNumber}`
          } 
        }
      );
    }

    // Update Deal state to WON & link salesOrder
    deal.stage = 'WON';
    deal.probability = 100;
    deal.salesOrderId = salesOrder._id;
    deal.activityLog.push({
      type: 'SO_CONVERTED',
      text: `🎉 Deal Won! Converted to confirmed Sales Order ${salesOrder.soNumber} (Value: ₹${deal.value.toLocaleString()})`,
      user: req.user?.name || req.user?.email || 'User'
    });

    await deal.save();

    // Log business audit event
    logBusinessEvent({
      req,
      action: 'CRM_DEAL_CONVERTED_TO_SO',
      entityType: 'SalesOrder',
      entityId: salesOrder._id,
      changes: {
        after: {
          soNumber: salesOrder.soNumber,
          dealNumber: deal.dealNumber,
          totalValue: salesOrder.totalValue
        },
        summary: `Converted CRM Deal ${deal.dealNumber} to Sales Order ${salesOrder.soNumber}`
      }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Deal successfully converted to confirmed Sales Order and queued for warehouse fulfillment',
      salesOrder,
      deal
    });
  } catch (err) {
    logger.error('Convert deal to SO error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/crm/deals/:id/generate-quote — Formal Quotation Engine ──
router.post('/deals/:id/generate-quote', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('items.productId');

    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
    if (!deal.items || deal.items.length === 0) {
      return res.status(400).json({ success: false, error: 'Deal must have line items to generate a quotation' });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    const tenantState = tenant?.branding?.address?.state || 'Maharashtra';
    const buyerState = deal.companyId?.address?.state || req.body.buyerState || tenantState;

    const validityDays = Math.max(1, Math.min(90, parseInt(req.body.validityDays) || deal.quoteValidityDays || 7));
    const paymentTerms = req.body.paymentTerms || deal.paymentTerms || 'NET_30';

    // Calculate state-aware Indian GST breakdown
    const gstBreakdown = calculateGstFinancials(deal.items, buyerState, tenantState);

    // Generate quotation sequence number: QT-YYYY-XXXX
    const year = new Date().getFullYear();
    const quoteNumber = await Counter.getNextSequence(req.tenantId, 'QUOTATION', `QT-${year}`, 4);
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    deal.quoteNumber = quoteNumber;
    deal.quotationNumber = quoteNumber;
    deal.quoteValidityDays = validityDays;
    deal.quoteExpiresAt = expiresAt;
    deal.quotationSentAt = new Date();
    deal.paymentTerms = paymentTerms;
    deal.taxBreakdown = gstBreakdown;
    deal.value = gstBreakdown.grandTotal;

    if (['LEAD', 'QUALIFIED'].includes(deal.stage)) {
      deal.stage = 'PROPOSAL';
    }

    deal.activityLog.push({
      type: 'QUOTE_SENT',
      text: `Formal quotation ${quoteNumber} generated (Total: ₹${gstBreakdown.grandTotal.toLocaleString()} with ${gstBreakdown.isInterState ? 'IGST' : 'CGST+SGST'}). Valid until ${expiresAt.toLocaleDateString()}.`,
      user: req.user?.name || req.user?.email || 'User'
    });

    // Optional soft stock reservation during quotation
    if (req.body.softReserveDays) {
      const reserveDays = Math.max(1, Math.min(30, parseInt(req.body.softReserveDays) || validityDays));
      const firstLine = deal.items[0];
      const reservation = new StockReservation({
        reservationCode: `RES-QT-${quoteNumber}`,
        productId: firstLine.productId._id || firstLine.productId,
        reservedQty: firstLine.quantity,
        status: 'ACTIVE',
        expiresAt,
        notes: `Soft reservation for Quote ${quoteNumber} (${deal.title})`,
        createdBy: req.userId,
        tenantId: req.tenantId
      });
      await reservation.save();
      deal.softReservationId = reservation._id;
      deal.softReservationExpiresAt = expiresAt;
    }

    await deal.save();

    res.json({
      success: true,
      message: `Quotation ${quoteNumber} successfully generated`,
      deal,
      quote: {
        quoteNumber,
        expiresAt,
        validityDays,
        paymentTerms,
        taxBreakdown: gstBreakdown
      }
    });
  } catch (err) {
    logger.error('Generate quote error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/crm/deals/:id/quote-preview — Complete Quotation Sheet Payload ─
router.get('/deals/:id/quote-preview', async (req, res) => {
  try {
    const deal = await CrmDeal.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('companyId')
      .populate('items.productId')
      .populate('assignedTo', 'name email phone');

    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    const tenant = await Tenant.findById(req.tenantId).lean();
    const tenantState = tenant?.branding?.address?.state || 'Maharashtra';
    const buyerState = deal.companyId?.address?.state || tenantState;

    const gstBreakdown = deal.taxBreakdown?.grandTotal
      ? deal.taxBreakdown
      : calculateGstFinancials(deal.items, buyerState, tenantState);

    const quotePayload = {
      quoteNumber: deal.quoteNumber || deal.quotationNumber || `DRAFT-${deal.dealNumber}`,
      dealNumber: deal.dealNumber,
      title: deal.title,
      date: deal.quotationSentAt || deal.createdAt,
      expiresAt: deal.quoteExpiresAt || new Date(Date.now() + (deal.quoteValidityDays || 7) * 24 * 60 * 60 * 1000),
      paymentTerms: deal.paymentTerms || 'NET_30',
      seller: {
        name: tenant?.branding?.legalName || tenant?.name || 'AcuStock Enterprise Seller',
        taxId: tenant?.branding?.taxId || '27AABCU9603R1ZM',
        address: tenant?.branding?.address || { street: 'Main Corporate Hub', city: 'Mumbai', state: tenantState, zipCode: '400001', country: 'India' },
        email: tenant?.branding?.supportEmail || 'billing@acustock.com',
        phone: tenant?.branding?.phone || '+91 98765 43210'
      },
      buyer: {
        name: deal.companyId?.name || deal.contact?.name || 'Customer',
        taxId: deal.companyId?.taxId || 'UNREGISTERED',
        address: deal.companyId?.address || { street: 'Client Office', city: 'Mumbai', state: buyerState, zipCode: '400001', country: 'India' },
        contactPerson: deal.contact?.name,
        email: deal.contact?.email || deal.companyId?.email,
        phone: deal.contact?.phone || deal.companyId?.phone
      },
      items: (deal.items || []).map(it => {
        const prod = it.productId || {};
        return {
          productId: prod._id,
          name: prod.name || 'Catalog Item',
          sku: prod.sku || 'SKU-000',
          hsn: prod.hsn || '8471',
          uom: prod.uom || 'PCS',
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent || 0,
          taxRatePercent: it.taxRatePercent || 18,
          lineTotal: it.lineTotal
        };
      }),
      taxBreakdown: gstBreakdown,
      softHold: deal.softReservationId ? {
        active: true,
        expiresAt: deal.softReservationExpiresAt
      } : { active: false }
    };

    res.json({ success: true, quotation: quotePayload });
  } catch (err) {
    logger.error('Quote preview error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/crm/companies/:id/customer-360 — Unified Customer Intelligence ─
router.get('/companies/:id/customer-360', async (req, res) => {
  try {
    const company = await Company.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

    // Fetch related deals
    const deals = await CrmDeal.find({ companyId: company._id, tenantId: req.tenantId })
      .populate('salesOrderId', 'soNumber status totalValue')
      .sort({ createdAt: -1 });

    // Calculate metrics
    let lifetimeRevenue = 0;
    let wonDealsCount = 0;
    let activeDealsCount = 0;

    deals.forEach(d => {
      if (d.stage === 'WON') {
        lifetimeRevenue += d.value || 0;
        wonDealsCount++;
      } else if (d.stage !== 'LOST') {
        activeDealsCount++;
      }
    });

    // Associated sales orders
    const salesOrders = await SalesOrder.find({
      $or: [
        { 'buyer.email': company.email },
        { _id: { $in: deals.map(d => d.salesOrderId).filter(Boolean) } }
      ],
      tenantId: req.tenantId
    }).sort({ createdAt: -1 }).limit(20);

    const creditLimit = Number(company.creditLimit) || 0;
    const outstandingBalance = Number(company.outstandingBalance) || 0;
    const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - outstandingBalance) : 0;
    const creditUtilizationPct = creditLimit > 0 ? Math.min(100, Math.round((outstandingBalance / creditLimit) * 100)) : 0;
    const isCreditExceeded = creditLimit > 0 && outstandingBalance > creditLimit;
    const isCreditBlocked = Boolean(company.isCreditBlocked || isCreditExceeded);

    // Build timeline
    const timeline = [];
    deals.forEach(d => {
      timeline.push({
        type: 'DEAL',
        title: `Deal: ${d.title}`,
        stage: d.stage,
        value: d.value,
        date: d.createdAt,
        id: d._id
      });
      if (d.quoteNumber) {
        timeline.push({
          type: 'QUOTE',
          title: `Quotation: ${d.quoteNumber}`,
          value: d.value,
          date: d.quotationSentAt || d.createdAt,
          id: d._id
        });
      }
    });
    salesOrders.forEach(so => {
      timeline.push({
        type: 'SALES_ORDER',
        title: `Sales Order: ${so.soNumber}`,
        status: so.status,
        value: so.totalValue,
        date: so.createdAt,
        id: so._id
      });
    });

    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      customer360: {
        company: {
          _id: company._id,
          name: company.name,
          legalName: company.legalName,
          email: company.email,
          phone: company.phone,
          address: company.address,
          taxId: company.taxId,
          pan: company.pan,
          type: company.type,
          paymentTerms: company.paymentTerms,
          creditLimit,
          creditDays: company.creditDays || 30,
          outstandingBalance,
          isCreditBlocked,
          creditBlockReason: company.creditBlockReason
        },
        metrics: {
          lifetimeRevenue: Math.round(lifetimeRevenue),
          totalDeals: deals.length,
          wonDealsCount,
          activeDealsCount,
          creditLimit,
          outstandingBalance,
          availableCredit,
          creditUtilizationPct,
          isCreditExceeded,
          isCreditBlocked
        },
        deals: deals.slice(0, 10),
        salesOrders: salesOrders.slice(0, 10),
        timeline: timeline.slice(0, 20)
      }
    });
  } catch (err) {
    logger.error('Customer 360 error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/crm/companies/:id/credit-override — Admin/Manager Credit Override ─
router.post('/companies/:id/credit-override', async (req, res) => {
  try {
    const company = await Company.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });

    const { isCreditBlocked, creditLimit, reason } = req.body;
    if (typeof isCreditBlocked === 'boolean') {
      company.isCreditBlocked = isCreditBlocked;
    }
    if (typeof creditLimit === 'number' && creditLimit >= 0) {
      company.creditLimit = creditLimit;
    }
    if (reason) {
      company.creditBlockReason = reason;
    }

    await company.save();

    res.json({ success: true, message: 'Credit settings updated', company });
  } catch (err) {
    logger.error('Credit override error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

