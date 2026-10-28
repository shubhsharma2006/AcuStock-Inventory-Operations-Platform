const crypto = require('crypto');
const mongoose = require('mongoose');
const StockReservation = require('../models/StockReservation');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const webhookDispatcher = require('./webhookDispatcher.service');
const logger = require('../utils/logger');

class ReservationService {
  /**
   * Get live physical stock, reserved stock, and available-to-promise for an item
   */
  async getProductStockSummary(productId, tenantId, warehouseId = null) {
    if (!productId || !tenantId) {
      throw new Error('productId and tenantId are required');
    }

    const now = new Date();
    const productOid = new mongoose.Types.ObjectId(productId);
    const tenantOid = new mongoose.Types.ObjectId(tenantId);

    // 1. Calculate physical stock from ledger
    const ledgerMatch = {
      tenantId: tenantOid,
      productId: productOid
    };
    if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
      ledgerMatch.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }

    const ledgerAgg = await StockLedger.aggregate([
      { $match: ledgerMatch },
      {
        $group: {
          _id: null,
          totalIn: {
            $sum: {
              $cond: [{ $in: ['$type', ['IN', 'TRANSFER_IN']] }, '$quantity', 0]
            }
          },
          totalOut: {
            $sum: {
              $cond: [{ $in: ['$type', ['OUT', 'TRANSFER_OUT']] }, '$quantity', 0]
            }
          }
        }
      }
    ]);

    const physicalStock = ledgerAgg.length > 0
      ? Math.max(0, ledgerAgg[0].totalIn - ledgerAgg[0].totalOut)
      : 0;

    // 2. Calculate active unexpired reservations
    const resMatch = {
      tenantId: tenantOid,
      productId: productOid,
      status: 'ACTIVE',
      expiresAt: { $gt: now }
    };
    if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
      resMatch.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }

    const resAgg = await StockReservation.aggregate([
      { $match: resMatch },
      { $group: { _id: null, totalReserved: { $sum: '$reservedQty' } } }
    ]);

    const reservedStock = resAgg.length > 0 ? resAgg[0].totalReserved : 0;
    const availableToPromise = Math.max(0, physicalStock - reservedStock);

    return {
      productId,
      warehouseId: warehouseId || null,
      physicalStock,
      reservedStock,
      availableToPromise
    };
  }

  /**
   * Reserve stock (soft-lock) with TTL
   */
  async reserveStock({
    tenantId,
    productId,
    warehouseId = null,
    reservedQty,
    orderId = null,
    orderLineId = null,
    ttlMinutes = 60,
    notes = null,
    user = null
  }) {
    const qty = parseInt(reservedQty, 10);
    if (isNaN(qty) || qty <= 0) {
      const err = new Error('Reserved quantity must be a positive integer');
      err.status = 400;
      throw err;
    }

    const item = await Item.findOne({ _id: productId, tenantId });
    if (!item) {
      const err = new Error('Product not found in catalog');
      err.status = 404;
      throw err;
    }

    // Check available stock
    const summary = await this.getProductStockSummary(productId, tenantId, warehouseId);
    if (summary.availableToPromise < qty) {
      const err = new Error(
        `Insufficient unreserved stock: requested ${qty}, available ${summary.availableToPromise} (physical: ${summary.physicalStock}, already reserved: ${summary.reservedStock})`
      );
      err.status = 400;
      err.code = 'INSUFFICIENT_UNRESERVED_STOCK';
      err.details = summary;
      throw err;
    }

    const code = `RES-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + Math.max(1, parseInt(ttlMinutes, 10)) * 60 * 1000);

    const reservation = await StockReservation.create({
      reservationCode: code,
      productId: item._id,
      warehouseId: warehouseId ? new mongoose.Types.ObjectId(warehouseId) : null,
      orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
      orderLineId: orderLineId ? new mongoose.Types.ObjectId(orderLineId) : null,
      reservedQty: qty,
      status: 'ACTIVE',
      expiresAt,
      notes,
      createdBy: user?._id || user?.id || null,
      tenantId: new mongoose.Types.ObjectId(tenantId)
    });

    // Dispatch webhook event
    webhookDispatcher.dispatchWebhookEvent(tenantId, 'stock.reserved', {
      reservationId: reservation._id,
      reservationCode: reservation.reservationCode,
      productId: item._id,
      productName: item.name,
      quantity: qty,
      expiresAt: reservation.expiresAt
    }).catch(err => logger.error('Webhook dispatch error (stock.reserved):', err));

    return reservation;
  }

  /**
   * Release an active reservation early
   */
  async releaseReservation(reservationId, { tenantId, reason = 'Manual release', user = null }) {
    const reservation = await StockReservation.findOne({
      _id: reservationId,
      tenantId: new mongoose.Types.ObjectId(tenantId)
    });

    if (!reservation) {
      const err = new Error('Reservation not found');
      err.status = 404;
      throw err;
    }

    if (reservation.status !== 'ACTIVE') {
      const err = new Error(`Cannot release reservation with status: ${reservation.status}`);
      err.status = 400;
      throw err;
    }

    reservation.status = 'RELEASED';
    reservation.releasedAt = new Date();
    reservation.releasedReason = reason;
    await reservation.save();

    // Dispatch webhook event
    webhookDispatcher.dispatchWebhookEvent(tenantId, 'stock.released', {
      reservationId: reservation._id,
      reservationCode: reservation.reservationCode,
      productId: reservation.productId,
      quantity: reservation.reservedQty,
      reason
    }).catch(err => logger.error('Webhook dispatch error (stock.released):', err));

    return reservation;
  }

  /**
   * Fulfill a reservation upon successful stockOut dispatch
   */
  async fulfillReservation(reservationId, { tenantId, session = null }) {
    const opts = session ? { session } : {};
    const reservation = await StockReservation.findOne(
      { _id: reservationId, tenantId: new mongoose.Types.ObjectId(tenantId) },
      null,
      opts
    );

    if (!reservation) {
      return null;
    }

    reservation.status = 'FULFILLED';
    reservation.fulfilledAt = new Date();
    await reservation.save(opts);
    return reservation;
  }

  /**
   * Sweeps and expires all reservations that passed their expiresAt timestamp
   */
  async cleanupExpiredReservations({ tenantId = null } = {}) {
    const now = new Date();
    const filter = {
      status: 'ACTIVE',
      expiresAt: { $lte: now }
    };
    if (tenantId) {
      filter.tenantId = new mongoose.Types.ObjectId(tenantId);
    }

    const result = await StockReservation.updateMany(filter, {
      $set: { status: 'EXPIRED' }
    });

    if (result.modifiedCount > 0) {
      logger.info(`Expired ${result.modifiedCount} overdue stock reservations`);
    }

    return { expiredCount: result.modifiedCount };
  }

  /**
   * List reservations with pagination and filtering
   */
  async listReservations({
    tenantId,
    productId = null,
    warehouseId = null,
    orderId = null,
    status = null,
    page = 1,
    limit = 50
  }) {
    const filter = { tenantId: new mongoose.Types.ObjectId(tenantId) };

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      filter.productId = new mongoose.Types.ObjectId(productId);
    }
    if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
      filter.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    }
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      filter.orderId = new mongoose.Types.ObjectId(orderId);
    }
    if (status) {
      filter.status = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [reservations, total] = await Promise.all([
      StockReservation.find(filter)
        .populate('productId', 'name sku barcode unit')
        .populate('warehouseId', 'name code')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      StockReservation.countDocuments(filter)
    ]);

    return {
      reservations,
      pagination: {
        total,
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    };
  }
}

module.exports = new ReservationService();
