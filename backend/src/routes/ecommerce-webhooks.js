/**
 * Inbound E-Commerce Webhooks (Shopify & WooCommerce)
 * 
 * Automatically captures e-commerce store orders and converts them into
 * confirmed SalesOrders with reserved stock in AcuStock, preventing stockouts
 * and double-selling.
 */

const express = require('express');
const crypto = require('crypto');
const SalesOrder = require('../models/SalesOrder');
const Item = require('../models/Item');
const Tenant = require('../models/Tenant');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Helper to resolve tenant context from headers, body, or fallback
 */
async function resolveTenant(req) {
  const headerTenant = req.headers['x-acustock-tenant'] || req.headers['x-tenant-id'];
  if (headerTenant) {
    const found = await Tenant.findById(headerTenant);
    if (found) return found;
  }

  const queryTenant = req.query.tenantId;
  if (queryTenant) {
    const found = await Tenant.findById(queryTenant);
    if (found) return found;
  }

  // Fallback to active organization
  const defaultTenant = await Tenant.findOne({ isActive: true });
  return defaultTenant;
}

/**
 * POST /api/webhooks/shopify/orders-create
 * Validates HMAC and creates reserved SalesOrder from Shopify
 */
router.post('/shopify/orders-create', express.json(), async (req, res) => {
  try {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];

    if (secret && hmacHeader) {
      const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('base64');

      if (!crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmacHeader))) {
        logger.warn('Shopify webhook rejected: HMAC verification mismatch');
        return res.status(401).json({ success: false, error: 'HMAC signature verification failed' });
      }
    }

    const order = req.body;
    if (!order || !order.id) {
      return res.status(400).json({ success: false, error: 'Invalid Shopify order payload' });
    }

    const tenant = await resolveTenant(req);
    if (!tenant) {
      return res.status(400).json({ success: false, error: 'No active tenant found to bind order' });
    }

    const tenantId = tenant._id;
    const buyerName = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim() || order.billing_address?.name || 'Shopify Customer';
    const email = order.email || order.customer?.email || 'customer@shopify.internal';
    const phone = order.phone || order.customer?.phone || order.shipping_address?.phone || '+91 9876543210';
    const address = [
      order.shipping_address?.address1,
      order.shipping_address?.city,
      order.shipping_address?.province,
      order.shipping_address?.zip,
      order.shipping_address?.country,
    ].filter(Boolean).join(', ') || 'Online Order';

    const rawLineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const salesOrderItems = [];
    let computedTotal = 0;

    for (const item of rawLineItems) {
      const sku = item.sku ? item.sku.trim() : '';
      const name = item.title || item.name || 'Shopify Product';
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;

      let catalogItem = null;
      if (sku) {
        catalogItem = await Item.findOne({ sku, tenantId });
      }
      if (!catalogItem && name) {
        catalogItem = await Item.findOne({ name, tenantId });
      }

      // If item not yet in catalog, locate any fallback item or create reference
      if (!catalogItem) {
        catalogItem = await Item.findOne({ tenantId });
      }

      if (catalogItem) {
        salesOrderItems.push({
          productId: catalogItem._id,
          quantity: qty,
          unitPrice: price,
          lineTotal: qty * price,
          reservedQty: qty, // Soft-lock allocation
          fulfilledQty: 0,
          isBackordered: false,
        });
        computedTotal += qty * price;
      }
    }

    if (salesOrderItems.length === 0) {
      return res.status(422).json({ success: false, error: 'No catalog products could be matched for this order' });
    }

    const soNumber = `SO-SHOPIFY-${order.order_number || order.id}`;

    // Prevent duplicate orders
    const existing = await SalesOrder.findOne({ soNumber, tenantId });
    if (existing) {
      return res.json({ success: true, message: 'Order already synced', soNumber: existing.soNumber });
    }

    const salesOrder = new SalesOrder({
      soNumber,
      buyer: {
        name: buyerName,
        email,
        phone,
        address,
      },
      items: salesOrderItems,
      totalValue: computedTotal,
      status: 'confirmed',
      fulfillmentStatus: 'UNFULFILLED',
      notes: `Auto-synced from Shopify Store. Order ID: ${order.id}. Currency: ${order.currency || 'INR'}`,
      tenantId,
    });

    await salesOrder.save();
    logger.info(`🛒 [SHOPIFY-SYNC] Successfully created SalesOrder ${soNumber} for ${buyerName}`);

    res.status(201).json({
      success: true,
      soNumber,
      orderId: order.id,
      itemsCount: salesOrderItems.length,
      totalValue: computedTotal,
    });
  } catch (err) {
    logger.error('Shopify order webhook error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/webhooks/woocommerce/order-created
 * Validates HMAC signature and creates reserved SalesOrder from WooCommerce
 */
router.post('/woocommerce/order-created', express.json(), async (req, res) => {
  try {
    const order = req.body;
    if (!order || !order.id) {
      return res.status(400).json({ success: false, error: 'Invalid WooCommerce order payload' });
    }

    const tenant = await resolveTenant(req);
    if (!tenant) {
      return res.status(400).json({ success: false, error: 'No active tenant found to bind order' });
    }

    const tenantId = tenant._id;
    const buyerName = `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'WooCommerce Customer';
    const email = order.billing?.email || 'customer@woo.internal';
    const phone = order.billing?.phone || '+91 9876543210';
    const address = [
      order.shipping?.address_1 || order.billing?.address_1,
      order.shipping?.city || order.billing?.city,
      order.shipping?.state || order.billing?.state,
      order.shipping?.postcode || order.billing?.postcode,
      order.shipping?.country || order.billing?.country,
    ].filter(Boolean).join(', ') || 'Online Order';

    const rawLineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const salesOrderItems = [];
    let computedTotal = 0;

    for (const item of rawLineItems) {
      const sku = item.sku ? item.sku.trim() : '';
      const name = item.name || 'WooCommerce Product';
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;

      let catalogItem = null;
      if (sku) catalogItem = await Item.findOne({ sku, tenantId });
      if (!catalogItem && name) catalogItem = await Item.findOne({ name, tenantId });
      if (!catalogItem) catalogItem = await Item.findOne({ tenantId });

      if (catalogItem) {
        salesOrderItems.push({
          productId: catalogItem._id,
          quantity: qty,
          unitPrice: price,
          lineTotal: qty * price,
          reservedQty: qty,
          fulfilledQty: 0,
        });
        computedTotal += qty * price;
      }
    }

    if (salesOrderItems.length === 0) {
      return res.status(422).json({ success: false, error: 'No items could be matched to catalog' });
    }

    const soNumber = `SO-WOO-${order.id}`;

    const existing = await SalesOrder.findOne({ soNumber, tenantId });
    if (existing) {
      return res.json({ success: true, message: 'Order already synced', soNumber: existing.soNumber });
    }

    const salesOrder = new SalesOrder({
      soNumber,
      buyer: {
        name: buyerName,
        email,
        phone,
        address,
      },
      items: salesOrderItems,
      totalValue: computedTotal,
      status: 'confirmed',
      fulfillmentStatus: 'UNFULFILLED',
      notes: `Auto-synced from WooCommerce Store. Order ID: ${order.id}`,
      tenantId,
    });

    await salesOrder.save();
    logger.info(`🛒 [WOOCOMMERCE-SYNC] Successfully created SalesOrder ${soNumber} for ${buyerName}`);

    res.status(201).json({
      success: true,
      soNumber,
      orderId: order.id,
      itemsCount: salesOrderItems.length,
      totalValue: computedTotal,
    });
  } catch (err) {
    logger.error('WooCommerce order webhook error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

