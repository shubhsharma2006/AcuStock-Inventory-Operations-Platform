/**
 * End-to-End Serial & Lot Traceability Service
 * ─────────────────────────────────────────────
 * Builds chronological audit history linking:
 * Receiving -> Storage Location -> Transfers -> Sales Orders -> Shipments -> Returns
 */

'use strict';

const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const InventoryLot = require('../models/InventoryLot');
const SerialAudit = require('../models/SerialAudit');
const logger = require('../utils/logger');

class TraceabilityService {
  /**
   * Retrieve complete lifecycle timeline for a specific serial number.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string} serialNumber
   */
  static async getSerialTimeline(tenantId, serialNumber) {
    if (!serialNumber || typeof serialNumber !== 'string') {
      throw new Error('Valid serialNumber is required');
    }

    const cleanSerial = serialNumber.trim().toUpperCase();
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    // 1. Fetch all stock ledger entries referencing this serial
    const ledgerEntries = await StockLedger.find({
      tenantId: tenantObjectId,
      serialNumbers: cleanSerial,
      isDeleted: { $ne: true }
    })
      .populate('warehouseId', 'name code')
      .populate('locationId', 'code label type')
      .populate('productId', 'name sku uom')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: 1 })
      .lean();

    // 2. Map ledger entries into semantic lifecycle events
    const timeline = ledgerEntries.map(entry => {
      let eventType = 'MOVEMENT';
      let description = `Stock ${entry.type} of quantity ${entry.quantity}`;

      switch (entry.type) {
        case 'IN':
          eventType = 'RECEIPT';
          description = `Received into warehouse ${entry.warehouseId?.code || ''}`;
          break;
        case 'OUT':
          eventType = 'DISPATCH';
          description = entry.partyDetails?.customerName
            ? `Dispatched to customer ${entry.partyDetails.customerName}`
            : 'Dispatched / Fulfilled order';
          break;
        case 'TRANSFER_IN':
        case 'TRANSFER_OUT':
          eventType = 'TRANSFER';
          description = `Internal transfer (${entry.type})`;
          break;
        case 'ADJUSTMENT_IN':
        case 'ADJUSTMENT_OUT':
          eventType = 'ADJUSTMENT';
          description = `Adjustment: ${entry.reasonCode || entry.adjustmentReason || 'Operational adjustment'}`;
          break;
      }

      return {
        timestamp: entry.createdAt,
        eventType,
        description,
        type: entry.type,
        warehouse: entry.warehouseId,
        location: entry.locationId,
        product: entry.productId,
        quantity: entry.quantity,
        partyDetails: entry.partyDetails,
        actor: entry.createdBy,
        ledgerId: entry._id
      };
    });

    return {
      serialNumber: cleanSerial,
      totalEvents: timeline.length,
      currentStatus: timeline.length > 0 ? timeline[timeline.length - 1].eventType : 'UNKNOWN',
      timeline
    };
  }

  /**
   * Retrieve complete lifecycle timeline for an Inventory Lot / Batch.
   *
   * @param {string|mongoose.Types.ObjectId} tenantId
   * @param {string} lotIdOrNumber
   */
  static async getLotTimeline(tenantId, lotIdOrNumber) {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    let lotFilter = { tenantId: tenantObjectId };

    if (mongoose.Types.ObjectId.isValid(lotIdOrNumber)) {
      lotFilter._id = new mongoose.Types.ObjectId(lotIdOrNumber);
    } else {
      lotFilter.lotNumber = lotIdOrNumber.trim().toUpperCase();
    }

    const lot = await InventoryLot.findOne(lotFilter)
      .populate('productId', 'name sku uom')
      .populate('supplierId', 'name email')
      .lean();

    if (!lot) {
      throw new Error(`Inventory Lot '${lotIdOrNumber}' not found`);
    }

    const ledgerEntries = await StockLedger.find({
      tenantId: tenantObjectId,
      $or: [
        { 'lotAllocations.lotId': lot._id },
        { 'lotAllocations.lotNumber': lot.lotNumber }
      ],
      isDeleted: { $ne: true }
    })
      .populate('warehouseId', 'name code')
      .populate('locationId', 'code label')
      .populate('createdBy', 'name email')
      .sort({ createdAt: 1 })
      .lean();

    const movements = ledgerEntries.map(entry => {
      const alloc = (entry.lotAllocations || []).find(
        a => (a.lotId && a.lotId.toString() === lot._id.toString()) || a.lotNumber === lot.lotNumber
      );

      return {
        timestamp: entry.createdAt,
        type: entry.type,
        quantityAllocated: alloc ? alloc.quantity : entry.quantity,
        warehouse: entry.warehouseId,
        location: entry.locationId,
        adjustmentReason: entry.adjustmentReason,
        actor: entry.createdBy,
        ledgerId: entry._id
      };
    });

    return {
      lotNumber: lot.lotNumber,
      lotId: lot._id,
      product: lot.productId,
      supplier: lot.supplierId,
      mfgDate: lot.mfgDate,
      expiryDate: lot.expiryDate,
      initialQty: lot.initialQty,
      remainingQty: lot.remainingQty,
      status: lot.status,
      movementsCount: movements.length,
      movements
    };
  }
}

module.exports = TraceabilityService;

