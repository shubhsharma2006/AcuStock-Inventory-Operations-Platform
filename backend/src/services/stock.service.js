const mongoose = require('mongoose');

const StockLedger = require('../models/StockLedger');
const SerialAudit = require('../models/SerialAudit');
const Item        = require('../models/Item');
const Warranty    = require('../models/Warranty');

/**
 * STOCK IN (TRANSACTIONAL)
 * Uses withTransaction() for automatic retry on transient errors (e.g. write conflicts)
 */
async function stockIn(data, user) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        productId,
        quantity,
        serialNumbers = [],
        supplier,
        condition,
        transaction
      } = data;

      // 1️⃣ Fetch item inside transaction
      const item = await Item.findOne({
        _id: productId,
        isActive: true
      }).session(session);

      if (!item) {
        throw new Error('Item not found or inactive');
      }

      const policy = item.serialPolicy || {};

      // 2️⃣ Serial policy enforcement (FINAL AUTHORITY)
      if (policy.enableSerial) {
        if (policy.requireSerialOnIN && serialNumbers.length === 0) {
          throw new Error('Serial numbers are required for stock IN');
        }

        if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
          throw new Error('Serial numbers count must match quantity');
        }

        if (serialNumbers.length > 0) {
          const unique = new Set(serialNumbers.map(s => s.trim().toUpperCase()));
          if (unique.size !== serialNumbers.length) {
            throw new Error('Duplicate serial numbers in same entry');
          }

          // Global uniqueness check — serial is "in use" only if its lastAction is 'IN'
          // (allows re-stocking a serial that was previously sold OUT)
          const auditCheck = await SerialAudit.aggregate([
            { $match: { serial: { $in: [...unique] } } },
            { $sort: { createdAt: 1 } },
            { $group: { _id: '$serial', lastAction: { $last: '$action' } } },
            { $match: { lastAction: 'IN' } }
          ]).session(session);

          if (auditCheck.length > 0) {
            throw new Error(
              `Serial(s) already in stock: ${auditCheck.map(e => e._id).join(', ')}`
            );
          }
        }
      } else if (serialNumbers.length > 0) {
        throw new Error('Serial numbers are disabled for this product');
      }

      // 3️⃣ Ledger entry (APPEND ONLY - this is the source of truth for stock)
      await StockLedger.create([{
        productId,
        type: 'IN',
        quantity,
        serialNumbers: serialNumbers.map(s => s.trim().toUpperCase()),
        condition: condition || 'new',
        partyDetails: supplier || {},
        transactionDetails: transaction || {},
        createdBy: user._id,
        role: user.role
      }], { session });

      // 4️⃣ Serial audit
      if (policy.enableSerial && serialNumbers.length > 0) {
        const audits = serialNumbers.map(serial => ({
          productId,
          serial: serial.trim().toUpperCase(),
          action: 'IN',
          performedBy: user._id,
          role: user.role
        }));

        await SerialAudit.insertMany(audits, { session });
      }

      // 5️⃣ Warranty records (purchase warranty from supplier)
      const warrantyPeriod = transaction && transaction.warrantyPeriod;
      const supplierName   = supplier && (supplier.companyName || supplier.customerName || '');
      const purchaseData   = Warranty.buildPurchaseWarranty(warrantyPeriod, new Date(), supplierName);

      if (policy.enableSerial && serialNumbers.length > 0) {
        // Use upsert per serial so re-stocking a returned unit does NOT create
        // a second Warranty document — it leaves the existing one intact.
        for (const serial of serialNumbers) {
          const normalizedSerial = serial.trim().toUpperCase();
          await Warranty.findOneAndUpdate(
            { serialNumber: normalizedSerial, productId },
            { $setOnInsert: {
                productId,
                serialNumber:     normalizedSerial,
                purchaseWarranty: purchaseData,
                sellerWarranty:   { status: 'not-sold' },
                createdBy:        user._id
              }
            },
            { upsert: true, new: false, session }
          );
        }
      } else if (!policy.enableSerial && warrantyPeriod) {
        await Warranty.insertMany([{
          productId,
          serialNumber:     null,
          purchaseWarranty: purchaseData,
          sellerWarranty:   { status: 'not-sold' },
          createdBy:        user._id
        }], { session });
      }
    });

    return { success: true };

  } finally {
    session.endSession();
  }
}

/**
 * STOCK OUT (TRANSACTIONAL)
 * Uses withTransaction() for automatic retry on transient errors (e.g. write conflicts)
 */
async function stockOut(data, user) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        productId,
        quantity,
        serialNumbers = [],
        buyer,
        condition,
        transaction
      } = data;

      // 1️⃣ Fetch item inside transaction
      const item = await Item.findOne({
        _id: productId,
        isActive: true
      }).session(session);

      if (!item) {
        throw new Error('Item not found or inactive');
      }

      const policy = item.serialPolicy || {};

      // 2️⃣ Serial policy enforcement
      if (policy.enableSerial) {
        if (policy.requireSerialOnOUT && serialNumbers.length === 0) {
          throw new Error('Serial numbers are required for stock OUT');
        }

        if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
          throw new Error('Serial numbers count must match quantity');
        }

        const normalized = serialNumbers.map(s => s.trim().toUpperCase());
        if (new Set(normalized).size !== normalized.length) {
          throw new Error('Duplicate serial numbers in same entry');
        }

        if (normalized.length > 0) {
          // Check availability (last action must be IN)
          const audits = await SerialAudit.aggregate([
            { $match: { serial: { $in: normalized }, productId: item._id } },
            { $sort: { createdAt: 1 } },
            { $group: { _id: '$serial', lastAction: { $last: '$action' } } }
          ]).session(session);

          const map = new Map(audits.map(a => [a._id, a.lastAction]));
          const invalid = normalized.filter(s => map.get(s) !== 'IN');

          if (invalid.length > 0) {
            throw new Error(`Serial(s) not available: ${invalid.join(', ')}`);
          }
        }
      } else if (serialNumbers.length > 0) {
        throw new Error('Serial numbers are disabled for this product');
      }

      // 3️⃣ Check current stock from ledger INSIDE transaction (prevents negative stock on concurrent writes)
      const stockResult = await StockLedger.aggregate([
        { $match: { productId: item._id, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', { $multiply: ['$quantity', -1] }]
              }
            }
          }
        }
      ]).session(session);

      const currentStock = stockResult.length > 0 ? stockResult[0].total : 0;

      if (currentStock < quantity) {
        throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`);
      }

      // 4️⃣ Ledger entry (store as positive; type indicates direction)
      await StockLedger.create([{
        productId,
        type: 'OUT',
        quantity,
        serialNumbers: serialNumbers.map(s => s.trim().toUpperCase()),
        condition: condition || 'new',
        partyDetails: buyer || {},
        transactionDetails: transaction || {},
        createdBy: user._id,
        role: user.role
      }], { session });

      // 5️⃣ Serial audit
      if (policy.enableSerial && serialNumbers.length > 0) {
        const audits = serialNumbers.map(serial => ({
          productId,
          serial: serial.trim().toUpperCase(),
          action: 'OUT',
          performedBy: user._id,
          role: user.role
        }));

        await SerialAudit.insertMany(audits, { session });
      }

      // 6️⃣ Attach seller warranty to existing Warranty records
      const sellerWarrantyPeriod = transaction && transaction.sellerWarrantyPeriod;
      if (sellerWarrantyPeriod && policy.enableSerial && serialNumbers.length > 0) {
        const sellerData   = Warranty.buildSellerWarranty(sellerWarrantyPeriod, new Date(), buyer || {});
        const normalized   = serialNumbers.map(s => s.trim().toUpperCase());
        await Warranty.updateMany(
          { serialNumber: { $in: normalized }, productId, 'sellerWarranty.status': 'not-sold' },
          { $set: { sellerWarranty: sellerData } },
          { session }
        );
      }
    });

    return { success: true };

  } finally {
    session.endSession();
  }
}

module.exports = {
  stockIn,
  stockOut
};