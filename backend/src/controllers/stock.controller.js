const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const SerialAudit = require('../models/SerialAudit');
const stockService = require('../services/stock.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const { escapeRegex } = require('../utils/regex');
const logger = require('../utils/logger');

class StockController {
  /**
   * GET /api/stock/summary
   * Aggregates real-time stock balances across products
   */
  async getSummary(req, res) {
    try {
      const { search, warehouseId } = req.query;
      const escapedSearch = search ? escapeRegex(search) : undefined;

      let effectiveWarehouseId = null;
      if (req.user.assignedWarehouseId) {
        effectiveWarehouseId = req.user.assignedWarehouseId;
      } else if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
        effectiveWarehouseId = warehouseId;
      }

      let productMatch = {};
      if (escapedSearch) {
        productMatch = {
          $or: [
            { 'productInfo.name': { $regex: escapedSearch, $options: 'i' } },
            { 'productInfo.shortName': { $regex: escapedSearch, $options: 'i' } }
          ]
        };
      }

      const matchStage = { tenantId: new mongoose.Types.ObjectId(req.tenantId), isDeleted: { $ne: true } };
      if (effectiveWarehouseId) {
        matchStage.warehouseId = new mongoose.Types.ObjectId(effectiveWarehouseId);
      }

      const pipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { productId: '$productId', type: '$type' },
            total: { $sum: '$quantity' }
          }
        },
        {
          $group: {
            _id: '$_id.productId',
            totals: {
              $push: {
                type: '$_id.type',
                total: '$total'
              }
            }
          }
        },
        {
          $lookup: {
            from: 'items',
            let: { productId: '$_id' },
            pipeline: [{
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$productId'] },
                    { $eq: ['$tenantId', new mongoose.Types.ObjectId(req.tenantId)] }
                  ]
                }
              }
            }],
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        { $match: { 'productInfo.isActive': { $ne: false } } },
        ...(escapedSearch ? [{ $match: productMatch }] : []),
        {
          $project: {
            _id: 0,
            productId: '$_id',
            name: '$productInfo.name',
            shortName: '$productInfo.shortName',
            lowStockThreshold: { $ifNull: ['$productInfo.lowStockThreshold', 10] },
            totalIn: {
              $reduce: {
                input: '$totals',
                initialValue: 0,
                in: {
                  $cond: [
                    { $in: ['$$this.type', ['IN', 'TRANSFER_IN']] },
                    { $add: ['$$value', '$$this.total'] },
                    '$$value'
                  ]
                }
              }
            },
            totalOut: {
              $reduce: {
                input: '$totals',
                initialValue: 0,
                in: {
                  $cond: [
                    { $in: ['$$this.type', ['OUT', 'TRANSFER_OUT']] },
                    { $add: ['$$value', '$$this.total'] },
                    '$$value'
                  ]
                }
              }
            }
          }
        },
        { $sort: { name: 1 } }
      ];

      const stockSummary = await StockLedger.aggregate(pipeline);
      const productsWithStock = stockSummary.map(s => s.productId.toString());

      const allProdFilter = { isActive: { $ne: false }, tenantId: req.tenantId };
      if (escapedSearch) {
        allProdFilter.$or = [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { shortName: { $regex: escapedSearch, $options: 'i' } }
        ];
      }

      const allProducts = await Item.find(allProdFilter).select('_id name shortName lowStockThreshold');
      const productsWithoutStock = allProducts
        .filter(p => !productsWithStock.includes(p._id.toString()))
        .map(p => ({
          productId: p._id,
          name: p.name,
          shortName: p.shortName,
          lowStockThreshold: p.lowStockThreshold ?? 10,
          totalIn: 0,
          totalOut: 0
        }));

      const items = [...stockSummary, ...productsWithoutStock].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      return res.json({ items });
    } catch (error) {
      logger.error('Error fetching stock summary:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * POST /api/stock/in
   * Executes transactional stock intake with serial and lot support
   */
  async stockIn(req, res) {
    try {
      const result = await stockService.stockIn(req.body, req.user);

      await logBusinessEvent({
        req,
        action: 'STOCK_IN',
        entityType: 'StockLedger',
        entityId: result.ledgerId || req.body.productId,
        details: {
          productId: req.body.productId,
          quantity: req.body.quantity,
          warehouseId: req.body.warehouseId
        },
        severity: 'INFO'
      });

      return res.status(201).json({
        success: true,
        message: 'Stock IN recorded successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in Stock IN controller:', error);
      const isClientError = error.message.includes('Quantity must be') ||
                            error.message.includes('Serial numbers count') ||
                            error.message.includes('Duplicate serial numbers') ||
                            error.message.includes('not found') ||
                            error.message.includes('already registered') ||
                            error.message.includes('required');
      return res.status(isClientError ? 400 : 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/stock/out
   * Executes transactional stock dispatch with verification
   */
  async stockOut(req, res) {
    try {
      const result = await stockService.stockOut(req.body, req.user);

      await logBusinessEvent({
        req,
        action: 'STOCK_OUT',
        entityType: 'StockLedger',
        entityId: req.body.productId,
        details: {
          productId: req.body.productId,
          quantity: req.body.quantity,
          warehouseId: req.body.warehouseId
        },
        severity: 'INFO'
      });

      return res.status(200).json({
        success: true,
        message: 'Stock OUT recorded successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in Stock OUT controller:', error);
      const isClientError = error.message.includes('Quantity must be') ||
                            error.message.includes('Insufficient stock') ||
                            error.message.includes('not found') ||
                            error.message.includes('required');
      return res.status(isClientError ? 400 : 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/stock/history
   * Paginated ledger audit history
   */
  async getHistory(req, res) {
    try {
      const { productId, warehouseId, movementType, page = 1, limit = 50 } = req.query;
      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const filter = {
        tenantId: new mongoose.Types.ObjectId(req.tenantId),
        isDeleted: { $ne: true }
      };

      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        filter.productId = new mongoose.Types.ObjectId(productId);
      }
      if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
        filter.warehouseId = new mongoose.Types.ObjectId(warehouseId);
      }
      if (movementType) {
        filter.movementType = movementType.toUpperCase();
      }

      const [entries, total] = await Promise.all([
        StockLedger.find(filter)
          .populate('productId', 'name shortName sku unit')
          .populate('warehouseId', 'name code')
          .populate('createdBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit, 10))
          .lean(),
        StockLedger.countDocuments(filter)
      ]);

      return res.json({
        success: true,
        data: entries,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (error) {
      logger.error('Error fetching stock history:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/stock/serials
   * Fetch serial number audit states
   */
  async getSerials(req, res) {
    try {
      const { serialNumber, status, productId, page = 1, limit = 50 } = req.query;
      const filter = { tenantId: new mongoose.Types.ObjectId(req.tenantId) };

      if (serialNumber) {
        filter.serialNumber = { $regex: escapeRegex(serialNumber), $options: 'i' };
      }
      if (status) {
        filter.currentStatus = status.toUpperCase();
      }
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        filter.productId = new mongoose.Types.ObjectId(productId);
      }

      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const [serials, total] = await Promise.all([
        SerialAudit.find(filter)
          .populate('productId', 'name sku')
          .populate('warehouseId', 'name')
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(parseInt(limit, 10))
          .lean(),
        SerialAudit.countDocuments(filter)
      ]);

      return res.json({
        success: true,
        data: serials,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (error) {
      logger.error('Error fetching serial audits:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}

module.exports = new StockController();
