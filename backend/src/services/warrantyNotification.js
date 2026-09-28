/**
 * Warranty Notification Service
 * Purchase warranty → ADMIN + MANAGER
 * Seller warranty   → ADMIN + MANAGER + USER
 * Deduplicates per warranty × threshold × role × UTC day.
 */

const mongoose     = require('mongoose');
const Warranty     = require('../models/Warranty');
const Notification = require('../models/Notification');
const Tenant       = require('../models/Tenant');
const { sendWarrantyExpiryEmail } = require('./email.service');

const THRESHOLDS = [90, 60, 30, 14, 7, 3, 1];

function todayBounds() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function alreadyNotifiedToday(type, warrantyId, threshold, targetRole, tenantId) {
  const { start, end } = todayBounds();
  const existing = await Notification.findOne({
    type,
    targetRole,
    'metadata.warrantyId':    String(warrantyId),
    'metadata.daysThreshold': threshold,
    createdAt: { $gte: start, $lt: end },
    ...(tenantId ? { tenantId } : {})
  }, null, { skipTenantIsolation: true }).lean();
  return !!existing;
}

function buildPurchaseNotif(warranty, productName, daysLeft, threshold, targetRole) {
  const expired  = daysLeft <= 0;
  const serial   = warranty.serialNumber ? ` (S/N: ${warranty.serialNumber})` : '';
  const supplier = warranty.purchaseWarranty.supplierName || 'supplier';
  return {
    targetRole,
    category: 'WARRANTY',
    priority: expired ? 'HIGH' : (threshold <= 7 ? 'HIGH' : 'MEDIUM'),
    createdByRole: 'SYSTEM',
    tenantId: warranty.tenantId,
    type:  expired ? 'warranty-purchase-expired' : 'warranty-purchase-expiring',
    icon:  expired ? '⚠️' : '🔔',
    title: expired
      ? `Purchase Warranty Expired — ${productName}`
      : `Purchase Warranty Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ${productName}`,
    message: expired
      ? `Purchase warranty for ${productName}${serial} from ${supplier} has expired.`
      : `Purchase warranty for ${productName}${serial} from ${supplier} expires on ${new Date(warranty.purchaseWarranty.expiryDate).toDateString()}.`,
    link: 'warranty-list',
    relatedModel: 'Warranty',
    relatedId: warranty._id,
    metadata: {
      warrantyId:    String(warranty._id),
      serialNumber:  warranty.serialNumber,
      productName,
      productId:     String(warranty.productId),
      daysThreshold: threshold,
      expiryDate:    warranty.purchaseWarranty.expiryDate,
      warrantyType:  'purchase',
      supplierName:  warranty.purchaseWarranty.supplierName
    }
  };
}

function buildSellerNotif(warranty, productName, daysLeft, threshold, targetRole) {
  const expired = daysLeft <= 0;
  const serial  = warranty.serialNumber ? ` (S/N: ${warranty.serialNumber})` : '';
  const buyer   = warranty.sellerWarranty.buyerName || warranty.sellerWarranty.buyerPhone || 'customer';
  return {
    targetRole,
    category: 'WARRANTY',
    priority: expired ? 'HIGH' : (threshold <= 7 ? 'HIGH' : 'MEDIUM'),
    createdByRole: 'SYSTEM',
    tenantId: warranty.tenantId,
    type:  expired ? 'warranty-seller-expired' : 'warranty-seller-expiring',
    icon:  expired ? '⚠️' : '🔔',
    title: expired
      ? `Seller Warranty Expired — ${productName}`
      : `Seller Warranty Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ${productName}`,
    message: expired
      ? `Seller warranty for ${productName}${serial} issued to ${buyer} has expired.`
      : `Seller warranty for ${productName}${serial} issued to ${buyer} expires on ${new Date(warranty.sellerWarranty.expiryDate).toDateString()}.`,
    link: 'warranty-list',
    relatedModel: 'Warranty',
    relatedId: warranty._id,
    metadata: {
      warrantyId:    String(warranty._id),
      serialNumber:  warranty.serialNumber,
      productName,
      productId:     String(warranty.productId),
      daysThreshold: threshold,
      expiryDate:    warranty.sellerWarranty.expiryDate,
      warrantyType:  'seller',
      buyerName:     warranty.sellerWarranty.buyerName,
      buyerPhone:    warranty.sellerWarranty.buyerPhone
    }
  };
}

async function generateWarrantyNotifications() {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const now      = new Date();
    const maxAhead = new Date(now);
    maxAhead.setDate(maxAhead.getDate() + 91);

    const warranties = await Warranty.find({
      isActive: true,
      $or: [
        { 'purchaseWarranty.months': { $gt: 0 }, 'purchaseWarranty.expiryDate': { $lte: maxAhead } },
        {
          'sellerWarranty.months':    { $gt: 0 },
          'sellerWarranty.status':    { $nin: ['not-sold', 'none'] },
          'sellerWarranty.expiryDate': { $lte: maxAhead }
        }
      ]
    }).setOptions({ skipTenantIsolation: true }).populate('productId', 'name').lean();

    const toCreate = [];

    for (const w of warranties) {
      const productName = w.productId?.name || 'Unknown Product';

      // ── Purchase warranty → ADMIN + MANAGER ───────────────
      if (w.purchaseWarranty.months > 0 && w.purchaseWarranty.expiryDate) {
        const daysLeft = Math.ceil((new Date(w.purchaseWarranty.expiryDate) - now) / 86400000);

        if (daysLeft <= 0) {
          for (const role of ['ADMIN', 'MANAGER']) {
            if (!(await alreadyNotifiedToday('warranty-purchase-expired', w._id, 0, role, w.tenantId))) {
              toCreate.push(buildPurchaseNotif(w, productName, 0, 0, role));
            }
          }
        } else {
          for (const t of THRESHOLDS) {
            if (daysLeft <= t) {
              for (const role of ['ADMIN', 'MANAGER']) {
                if (!(await alreadyNotifiedToday('warranty-purchase-expiring', w._id, t, role, w.tenantId))) {
                  toCreate.push(buildPurchaseNotif(w, productName, daysLeft, t, role));
                }
              }
              break;
            }
          }
        }
      }

      // ── Seller warranty → ADMIN + MANAGER + USER ──────────
      const sw = w.sellerWarranty;
      if (sw.months > 0 && sw.expiryDate && sw.status !== 'not-sold' && sw.status !== 'none') {
        const daysLeft = Math.ceil((new Date(sw.expiryDate) - now) / 86400000);

        if (daysLeft <= 0) {
          for (const role of ['ADMIN', 'MANAGER', 'USER']) {
            if (!(await alreadyNotifiedToday('warranty-seller-expired', w._id, 0, role, w.tenantId))) {
              toCreate.push(buildSellerNotif(w, productName, 0, 0, role));
            }
          }
        } else {
          for (const t of THRESHOLDS) {
            if (daysLeft <= t) {
              for (const role of ['ADMIN', 'MANAGER', 'USER']) {
                if (!(await alreadyNotifiedToday('warranty-seller-expiring', w._id, t, role, w.tenantId))) {
                  toCreate.push(buildSellerNotif(w, productName, daysLeft, t, role));
                }
              }
              break;
            }
          }
        }
      }
    }

    if (toCreate.length > 0) {
      const inserted = await Notification.insertMany(toCreate);
      // Emit real-time notification push for the first few (avoid flooding)
      if (global.emitRealTimeUpdate) {
        const sample = inserted.slice(0, 3); // Push at most 3 toasts
        for (const n of sample) {
          const payload = {
            _id:       n._id,
            type:      n.type,
            category:  n.category,
            priority:  n.priority,
            icon:      n.icon,
            title:     n.title,
            message:   n.message,
            link:      n.link,
            createdAt: n.createdAt,
            tenantId:  n.tenantId
          };
          if (n.targetRole === 'ALL') {
            global.emitRealTimeUpdate('notification', payload, 'all');
          } else {
            global.emitRealTimeUpdate('notification', payload, n.targetRole.toLowerCase());
          }
        }
      }
      console.log(`✅ Warranty notifications: ${toCreate.length} created`);

      // Group expiring warranties by tenant to send email digest to tenant owner
      try {
        const tenantMap = new Map();
        for (const n of toCreate) {
          if (!n.tenantId) continue;
          const tid = n.tenantId.toString();
          if (!tenantMap.has(tid)) tenantMap.set(tid, []);
          tenantMap.get(tid).push({
            productName: n.metadata?.productName,
            serialNumber: n.metadata?.serialNumber,
            customerOrSupplier: n.metadata?.supplierName || n.metadata?.buyerName || 'N/A',
            daysRemaining: n.metadata?.daysThreshold ?? 0
          });
        }

        for (const [tid, wList] of tenantMap.entries()) {
          const tenant = await Tenant.findById(tid).populate('ownerId', 'name email');
          if (tenant?.ownerId?.email) {
            sendWarrantyExpiryEmail({
              to: tenant.ownerId.email,
              name: tenant.ownerId.name || 'Admin',
              warranties: wList.slice(0, 10)
            }).catch((e) => console.warn('[Warranty] Email digest failed:', e.message));
          }
        }
      } catch (emailErr) {
        console.warn('[Warranty] Email digest grouping error:', emailErr.message);
      }
    } else {
      console.log('✅ Warranty notifications: none needed');
    }

  } catch (err) {
    console.error('❌ generateWarrantyNotifications error:', err.message);
  }
}

module.exports = { generateWarrantyNotifications };
