const mongoose = require('mongoose');

const StockLedger = require('../models/StockLedger');
const SerialAudit = require('../models/SerialAudit');
const Item        = require('../models/Item');
const Warranty    = require('../models/Warranty');

const MAX_STOCK_QUANTITY = 100_000;

function normalizeSerialNumbers(serialNumbers = []) {
  return serialNumbers
    .filter((serial) => serial !== undefined && serial !== null && String(serial).trim() !== '')
    .map((serial) => String(serial).trim().toUpperCase());
}

function validateStockMovementPayload(payload = {}) {
  const { quantity, serialNumbers = [] } = payload;
  const qtyNum = Number(quantity);

  if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > MAX_STOCK_QUANTITY) {
    throw new Error('Quantity must be an integer between 1 and 100000');
  }

  const normalizedSerials = normalizeSerialNumbers(serialNumbers);

  if (normalizedSerials.length > 0 && normalizedSerials.length !== qtyNum) {
    throw new Error('Serial numbers count must match quantity');
  }

  const uniqueSerials = new Set(normalizedSerials);
  if (uniqueSerials.size !== normalizedSerials.length) {
    throw new Error('Duplicate serial numbers in same entry');
  }

  return {
    ...payload,
    quantity: qtyNum,
    serialNumbers: normalizedSerials
  };
}

/**
 * STOCK IN (TRANSACTIONAL)
 * Uses withTransaction() for automatic retry on transient errors (e.g. write conflicts)
 */
async function stockIn(data, user) {
  const validated = validateStockMovementPayload(data);
  const session = await mongoose.startSession();
  const tenantId = user?.tenantId || data?.tenantId;

  if (!tenantId) {
    throw new Error('Tenant ID is required for stock operations');
  }

  try {
    await session.withTransaction(async () => {
      const {
        productId,
        quantity,
        serialNumbers = [],
        supplier,
        condition,
        transaction
      } = validated;

      // 1️⃣ Fetch item inside transaction (strictly scoped to tenant)
      const item = await Item.findOne({ _id: productId, isActive: true, tenantId }).session(session);

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

          // Uniqueness check strictly scoped to tenant
          const auditCheck = await SerialAudit.aggregate([
            { $match: { serial: { $in: [...unique] }, tenantId: new mongoose.Types.ObjectId(tenantId) } },
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

      // 3️⃣ Ledger entry (APPEND ONLY - source of truth for stock)
      await StockLedger.create([{
        productId,
        warehouseId: data.warehouseId || undefined,
        type: 'IN',
        quantity,
        serialNumbers: serialNumbers.map(s => s.trim().toUpperCase()),
        condition: condition || 'new',
        partyDetails: supplier || {},
        transactionDetails: transaction || {},
        createdBy: user._id,
        role: user.role,
        tenantId
      }], { session });

      // 4️⃣ Serial audit
      if (policy.enableSerial && serialNumbers.length > 0) {
        const audits = serialNumbers.map(serial => ({
          productId,
          serial: serial.trim().toUpperCase(),
          action: 'IN',
          performedBy: user._id,
          role: user.role,
          tenantId
        }));

        await SerialAudit.insertMany(audits, { session });
      }

      // 5️⃣ Warranty records (purchase warranty from supplier)
      const warrantyPeriod = transaction && transaction.warrantyPeriod;
      const supplierName   = supplier && (supplier.companyName || supplier.customerName || '');
      const purchaseData   = Warranty.buildPurchaseWarranty(warrantyPeriod, new Date(), supplierName);

      if (policy.enableSerial && serialNumbers.length > 0) {
        for (const serial of serialNumbers) {
          const normalizedSerial = serial.trim().toUpperCase();
          await Warranty.findOneAndUpdate(
            { serialNumber: normalizedSerial, productId, tenantId },
            { $setOnInsert: {
                productId,
                serialNumber:     normalizedSerial,
                purchaseWarranty: purchaseData,
                sellerWarranty:   { status: 'not-sold' },
                createdBy:        user._id,
                tenantId
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
          createdBy:        user._id,
          tenantId
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
  const validated = validateStockMovementPayload(data);
  const session = await mongoose.startSession();
  const tenantId = user?.tenantId || data?.tenantId;

  if (!tenantId) {
    throw new Error('Tenant ID is required for stock operations');
  }

  try {
    await session.withTransaction(async () => {
      const {
        productId,
        quantity,
        serialNumbers = [],
        buyer,
        condition,
        transaction
      } = validated;

      // 1️⃣ Fetch item inside transaction (strictly scoped to tenant)
      const item = await Item.findOne({ _id: productId, isActive: true, tenantId }).session(session);

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
          const audits = await SerialAudit.aggregate([
            { $match: { serial: { $in: normalized }, productId: item._id, tenantId: new mongoose.Types.ObjectId(tenantId) } },
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
      const stockMatch = { productId: item._id, isDeleted: { $ne: true }, tenantId: new mongoose.Types.ObjectId(tenantId) };

      const stockResult = await StockLedger.aggregate([
        { $match: stockMatch },
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

      // 4️⃣ Ledger entry
      await StockLedger.create([{
        productId,
        warehouseId: data.warehouseId || undefined,
        type: 'OUT',
        quantity,
        serialNumbers: serialNumbers.map(s => s.trim().toUpperCase()),
        condition: condition || 'new',
        partyDetails: buyer || {},
        transactionDetails: transaction || {},
        createdBy: user._id,
        role: user.role,
        tenantId
      }], { session });

      // 4b️⃣ Post-write verification: re-aggregate to catch race-condition negative stock
      const verifyResult = await StockLedger.aggregate([
        { $match: stockMatch },
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

      const finalStock = verifyResult.length > 0 ? verifyResult[0].total : 0;
      if (finalStock < 0) {
        throw new Error('Insufficient stock. Another transaction updated inventory concurrently. Please retry.');
      }

      // 5️⃣ Serial audit
      if (policy.enableSerial && serialNumbers.length > 0) {
        const audits = serialNumbers.map(serial => ({
          productId,
          serial: serial.trim().toUpperCase(),
          action: 'OUT',
          performedBy: user._id,
          role: user.role,
          tenantId
        }));

        await SerialAudit.insertMany(audits, { session });
      }

      // 6️⃣ Attach seller warranty to existing Warranty records
      const sellerWarrantyPeriod = transaction && transaction.sellerWarrantyPeriod;
      if (sellerWarrantyPeriod && policy.enableSerial && serialNumbers.length > 0) {
        const sellerData   = Warranty.buildSellerWarranty(sellerWarrantyPeriod, new Date(), buyer || {});
        const normalized   = serialNumbers.map(s => s.trim().toUpperCase());
        await Warranty.updateMany(
          {
            serialNumber: { $in: normalized },
            productId,
            'sellerWarranty.status': 'not-sold',
            tenantId
          },
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
  MAX_STOCK_QUANTITY,
  normalizeSerialNumbers,
  validateStockMovementPayload,
  stockIn,
  stockOut
};