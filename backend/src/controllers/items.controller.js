const mongoose = require('mongoose');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const { logBusinessEvent } = require('../utils/auditHelper');
const { escapeRegex } = require('../utils/regex');
const logger = require('../utils/logger');

class ItemsController {
  /**
   * GET /api/items
   * List items with pagination, filtering, search, and current stock calculation
   */
  async getItems(req, res) {
    try {
      const {
        search,
        category,
        company,
        lowStock,
        page = 1,
        limit = 50,
        sortBy = 'name',
        sortOrder = 'asc'
      } = req.query;

      const filter = {
        tenantId: new mongoose.Types.ObjectId(req.tenantId),
        isDeleted: { $ne: true }
      };

      if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { shortName: { $regex: escaped, $options: 'i' } },
          { sku: { $regex: escaped, $options: 'i' } },
          { barcode: { $regex: escaped, $options: 'i' } }
        ];
      }

      if (category && mongoose.Types.ObjectId.isValid(category)) {
        filter.category = new mongoose.Types.ObjectId(category);
      }

      if (company && mongoose.Types.ObjectId.isValid(company)) {
        filter.company = new mongoose.Types.ObjectId(company);
      }

      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const [items, total] = await Promise.all([
        Item.find(filter)
          .populate('category', 'name')
          .populate('company', 'name')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit, 10))
          .lean(),
        Item.countDocuments(filter)
      ]);

      return res.json({
        success: true,
        data: items,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (error) {
      logger.error('Error in ItemsController.getItems:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * GET /api/items/:id
   * Get item details with current live ledger stock balance
   */
  async getItemById(req, res) {
    try {
      const item = await Item.findOne({
        _id: req.params.id,
        tenantId: req.tenantId,
        isDeleted: { $ne: true }
      })
        .populate('category')
        .populate('company')
        .lean();

      if (!item) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }

      // Compute live balance from stock ledger
      const ledgerBalances = await StockLedger.aggregate([
        {
          $match: {
            productId: item._id,
            tenantId: new mongoose.Types.ObjectId(req.tenantId),
            isDeleted: { $ne: true }
          }
        },
        {
          $group: {
            _id: '$movementType',
            total: { $sum: '$quantity' }
          }
        }
      ]);

      let totalIn = 0;
      let totalOut = 0;
      ledgerBalances.forEach(b => {
        if (b._id === 'IN') totalIn = b.total;
        if (b._id === 'OUT') totalOut = b.total;
      });

      const currentStock = Math.max(0, totalIn - totalOut);

      return res.json({
        success: true,
        data: {
          ...item,
          currentStock,
          totalIn,
          totalOut
        }
      });
    } catch (error) {
      logger.error('Error in ItemsController.getItemById:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  /**
   * POST /api/items
   * Create a new item
   */
  async createItem(req, res) {
    try {
      const payload = {
        ...req.body,
        tenantId: req.tenantId,
        createdBy: req.user._id
      };

      const item = new Item(payload);
      await item.save();

      await logBusinessEvent({
        req,
        action: 'ITEM_CREATED',
        entityType: 'Item',
        entityId: item._id,
        details: { name: item.name, sku: item.sku },
        severity: 'INFO'
      });

      return res.status(201).json({
        success: true,
        message: 'Item created successfully',
        data: item
      });
    } catch (error) {
      logger.error('Error in ItemsController.createItem:', error);
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          error: 'An item with this SKU or barcode already exists in this organization'
        });
      }
      return res.status(400).json({
        success: false,
        error: error.message || 'Validation Error'
      });
    }
  }

  /**
   * PUT /api/items/:id
   * Update item fields
   */
  async updateItem(req, res) {
    try {
      const allowedUpdates = [
        'name', 'shortName', 'description', 'category', 'company',
        'unit', 'sellingPrice', 'costPrice', 'minStockThreshold',
        'barcode', 'dimensions', 'weight', 'tags', 'serialPolicy', 'lotPolicy'
      ];

      const updateData = {};
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      const item = await Item.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!item) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }

      await logBusinessEvent({
        req,
        action: 'ITEM_UPDATED',
        entityType: 'Item',
        entityId: item._id,
        changes: updateData,
        severity: 'INFO'
      });

      return res.json({
        success: true,
        message: 'Item updated successfully',
        data: item
      });
    } catch (error) {
      logger.error('Error in ItemsController.updateItem:', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Validation Error'
      });
    }
  }

  /**
   * DELETE /api/items/:id
   * Soft-delete item
   */
  async deleteItem(req, res) {
    try {
      const item = await Item.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id } },
        { new: true }
      );

      if (!item) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }

      await logBusinessEvent({
        req,
        action: 'ITEM_DELETED',
        entityType: 'Item',
        entityId: item._id,
        details: { name: item.name, sku: item.sku },
        severity: 'WARN'
      });

      return res.json({
        success: true,
        message: 'Item deleted successfully'
      });
    } catch (error) {
      logger.error('Error in ItemsController.deleteItem:', error);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }
}

module.exports = new ItemsController();
