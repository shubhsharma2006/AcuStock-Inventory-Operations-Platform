/**
 * AcuStock AI Order & Procurement Tools
 * 
 * Invariants:
 * 1. Context is passed by the backend runtime, NEVER supplied by the LLM.
 * 2. All mutations follow the Confirm-Before-Commit pattern:
 *    AI creates a DRAFT state, human reviews and finalizes.
 */

const mongoose = require('mongoose');
const SalesOrder = require('../../models/SalesOrder');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Package = require('../../models/Package');
const Item = require('../../models/Item');
const Company = require('../../models/Company');
const Counter = require('../../models/Counter');
const { logAiEvent } = require('../core/audit');

/**
 * Tool: Look up status, line items, fulfillment, and packages for a Sales Order
 */
async function getOrderStatus(context, { orderNumber }) {
  if (!orderNumber || typeof orderNumber !== 'string') {
    return { error: 'Please provide a valid Sales Order number (e.g., SO-1001).' };
  }

  const cleanNum = orderNumber.trim();
  const searchRegex = new RegExp(`^${cleanNum}$`, 'i');

  const order = await SalesOrder.findOne({
    tenantId: context.tenantId,
    $or: [
      { soNumber: searchRegex },
      ...(mongoose.Types.ObjectId.isValid(cleanNum) ? [{ _id: cleanNum }] : [])
    ]
  })
    .populate('items.productId', 'name sku trackingMode unit')
    .populate('packages');

  if (!order) {
    return {
      found: false,
      message: `Sales Order "${orderNumber}" was not found in your tenant records.`
    };
  }

  const items = order.items.map(item => ({
    sku: item.productId?.sku || 'N/A',
    name: item.productId?.name || 'Unknown Item',
    orderedQty: item.quantity,
    reservedQty: item.reservedQty || 0,
    fulfilledQty: item.fulfilledQty || 0,
    backorderedQty: item.backorderedQty || 0,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal
  }));

  const packages = (order.packages || []).map(pkg => ({
    packageNumber: pkg.packageNumber,
    carrier: pkg.carrier || 'Standard',
    trackingNumber: pkg.trackingNumber || 'Pending',
    status: pkg.status,
    dispatchedAt: pkg.dispatchedAt ? pkg.dispatchedAt.toISOString().split('T')[0] : null
  }));

  return {
    found: true,
    soNumber: order.soNumber,
    buyer: order.buyer?.name || 'Customer',
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    totalValue: order.totalValue,
    expectedDelivery: order.expectedDeliveryDate ? order.expectedDeliveryDate.toISOString().split('T')[0] : 'N/A',
    items,
    packages,
    notes: order.notes || ''
  };
}

/**
 * Tool: List open backorders across all sales orders
 */
async function listBackorders(context, { limit = 10 }) {
  const maxLimit = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));

  const orders = await SalesOrder.find({
    tenantId: context.tenantId,
    $or: [
      { fulfillmentStatus: { $in: ['PARTIALLY_FULFILLED', 'BACKORDERED'] } },
      { 'items.backorderedQty': { $gt: 0 } }
    ]
  })
    .populate('items.productId', 'name sku')
    .sort({ createdAt: -1 })
    .limit(maxLimit);

  if (!orders || orders.length === 0) {
    return {
      count: 0,
      message: 'Great news: You currently have 0 open backorders.'
    };
  }

  const backorderLines = [];
  for (const order of orders) {
    for (const line of order.items) {
      if (line.backorderedQty > 0) {
        backorderLines.push({
          soNumber: order.soNumber,
          buyer: order.buyer?.name,
          sku: line.productId?.sku || 'N/A',
          itemName: line.productId?.name || 'N/A',
          orderedQty: line.quantity,
          backorderedQty: line.backorderedQty,
          fulfillmentStatus: order.fulfillmentStatus
        });
      }
    }
  }

  return {
    count: backorderLines.length,
    backorders: backorderLines
  };
}

/**
 * Tool: Draft a Purchase Order for low stock or backordered items.
 * Enforces Confirm-Before-Commit pattern: generates DRAFT only.
 */
async function draftPurchaseOrder(context, { supplierNameOrId, items }) {
  // 1. RBAC Guard: Only Managers and Admins can draft procurement documents
  if (!context.isAtLeastManager()) {
    return {
      error: 'Permission Denied: Only Managers and Admins can draft Purchase Orders.'
    };
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      error: 'Please specify at least one product and quantity to reorder.'
    };
  }

  // 2. Resolve Supplier within tenant
  let supplierRecord = null;
  if (supplierNameOrId) {
    const isId = mongoose.Types.ObjectId.isValid(supplierNameOrId);
    supplierRecord = await Company.findOne({
      tenantId: context.tenantId,
      type: { $in: ['SUPPLIER', 'BOTH'] },
      ...(isId ? { _id: supplierNameOrId } : { name: new RegExp(supplierNameOrId.trim(), 'i') })
    });
  }

  const supplierData = {
    name: supplierRecord?.name || (typeof supplierNameOrId === 'string' ? supplierNameOrId : 'Primary Vendor'),
    email: supplierRecord?.email || 'vendor@example.com',
    phone: supplierRecord?.phone || '',
    address: supplierRecord?.address || 'Vendor Headquarters'
  };

  // 3. Resolve Items within tenant
  const poLineItems = [];
  let computedTotal = 0;

  for (const requestedItem of items) {
    const query = requestedItem.sku || requestedItem.name || requestedItem.id;
    if (!query) continue;

    let dbItem = null;
    if (requestedItem.id && mongoose.Types.ObjectId.isValid(requestedItem.id)) {
      dbItem = await Item.findOne({ tenantId: context.tenantId, _id: requestedItem.id });
    }

    if (!dbItem && query) {
      dbItem = await Item.findOne({
        tenantId: context.tenantId,
        $or: [
          { sku: new RegExp(`^${query.trim()}$`, 'i') },
          { name: new RegExp(query.trim(), 'i') },
          ...(mongoose.Types.ObjectId.isValid(query) ? [{ _id: query }] : [])
        ]
      });
    }

    if (!dbItem) {
      continue;
    }

    const qty = Math.max(1, parseInt(requestedItem.quantity, 10) || 10);
    const unitPrice = dbItem.purchasePrice || 50;
    const lineTotal = qty * unitPrice;
    computedTotal += lineTotal;

    poLineItems.push({
      productId: dbItem._id,
      sku: dbItem.sku,
      name: dbItem.name,
      quantity: qty,
      unitPrice,
      lineTotal
    });
  }

  if (poLineItems.length === 0) {
    return {
      error: 'Could not resolve any valid items from your inventory for this Purchase Order.'
    };
  }

  // 4. Generate PO Number
  let poNumber = `PO-${Date.now().toString().slice(-6)}`;
  try {
    const counter = await Counter.getNextSequence(context.tenantId, 'PO');
    poNumber = `PO-${String(counter).padStart(4, '0')}`;
  } catch {
    // fallback timestamp
  }

  // 5. Create PO in DRAFT status (Confirm-Before-Commit)
  const newPo = await PurchaseOrder.create({
    poNumber,
    tenantId: context.tenantId,
    supplier: supplierData,
    items: poLineItems.map(l => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal
    })),
    totalValue: computedTotal,
    status: 'draft',
    notes: `Drafted by AcuStock AI Copilot on behalf of ${context.userName}. Awaiting human review and confirmation.`,
    createdBy: context.userId
  });

  // 6. Log AI Audit Event
  await logAiEvent({
    action: 'AI_DRAFT_PO_CREATED',
    context,
    toolName: 'draftPurchaseOrder',
    parameters: { supplier: supplierData.name, itemCount: poLineItems.length, totalValue: computedTotal },
    summary: `Created draft Purchase Order ${poNumber} for ${supplierData.name}`,
    targetId: newPo._id
  });

  return {
    success: true,
    isDraft: true,
    poId: newPo._id.toString(),
    poNumber: newPo.poNumber,
    supplier: supplierData.name,
    totalValue: computedTotal,
    items: poLineItems.map(l => ({
      sku: l.sku,
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal
    })),
    status: 'DRAFT',
    message: `Draft Purchase Order ${newPo.poNumber} has been created with ${poLineItems.length} items (Total: $${computedTotal.toLocaleString()}). Please review and confirm to send to supplier.`
  };
}

module.exports = {
  getOrderStatus,
  listBackorders,
  draftPurchaseOrder
};
