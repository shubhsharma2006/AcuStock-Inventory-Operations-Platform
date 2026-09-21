const express = require('express');
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');

const router = express.Router();

// GET /api/warehouses - List all warehouses
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { isActive: true };
    filter.tenantId = req.tenantId;

    const warehouses = await Warehouse.find(filter)
      .populate('createdBy', 'name email')
      .sort({ isDefault: -1, name: 1 });

    res.json(warehouses);
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/warehouses/:id - Single warehouse details
router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, isActive: true };
    filter.tenantId = req.tenantId;

    const warehouse = await Warehouse.findOne(filter).populate('createdBy', 'name email');
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    res.json(warehouse);
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/warehouses/:id/stock - Get item-level stock at this warehouse
router.get('/:id/stock', requireAuth, validateObjectId, async (req, res) => {
  try {
    const filter = {
      warehouseId: new mongoose.Types.ObjectId(req.params.id),
      isDeleted: false
    };
    filter.tenantId = new mongoose.Types.ObjectId(req.tenantId);

    const stockSummary = await StockLedger.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$productId',
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
      },
      {
        $project: {
          productId: '$_id',
          currentStock: { $subtract: ['$totalIn', '$totalOut'] },
          totalIn: 1,
          totalOut: 1
        }
      },
      { $match: { currentStock: { $gt: 0 } } },
      {
        $lookup: {
          from: 'items',
          let: { productId: '$productId' },
          pipeline: [{ $match: { $expr: { $and: [
            { $eq: ['$_id', '$$productId'] },
            { $eq: ['$tenantId', req.tenantId] }
          ] } } }],
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
    ]);

    res.json(stockSummary);
  } catch (error) {
    console.error('Error fetching warehouse stock:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/warehouses - Create warehouse
router.post('/', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { name, code, address, contactPerson, phone, email, isDefault, capacity, notes } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Warehouse name is required' });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({ message: 'Warehouse code is required' });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    // Check duplicate code within tenant
    const duplicateFilter = { code: normalizedCode, isActive: true };
    duplicateFilter.tenantId = req.tenantId;
    const existing = await Warehouse.findOne(duplicateFilter);
    if (existing) {
      return res.status(400).json({ message: `Warehouse code '${normalizedCode}' already exists` });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await Warehouse.updateMany({ tenantId: req.tenantId, isDefault: true }, { isDefault: false });
    }

    const warehouse = new Warehouse({
      name: String(name).trim().slice(0, 100),
      code: normalizedCode,
      address,
      contactPerson: contactPerson ? String(contactPerson).trim() : undefined,
      phone:         phone ? String(phone).trim() : undefined,
      email:         email ? String(email).trim().toLowerCase() : undefined,
      isDefault:     Boolean(isDefault),
      capacity:      capacity !== undefined ? Number(capacity) : undefined,
      notes:         notes ? String(notes).trim() : undefined,
      createdBy:     req.user._id,
      tenantId:      req.tenantId || undefined
    });

    await warehouse.save();
    res.status(201).json(warehouse);
  } catch (error) {
    console.error('Error creating warehouse:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate warehouse code' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/warehouses/:id - Update warehouse
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const { name, code, address, contactPerson, phone, email, isDefault, capacity, notes, isActive } = req.body;

    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warehouse = await Warehouse.findOne(filter);
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase();
      if (normalizedCode !== warehouse.code) {
        const existing = await Warehouse.findOne({
          code: normalizedCode,
          _id: { $ne: warehouse._id },
          tenantId: warehouse.tenantId,
          isActive: true
        });
        if (existing) {
          return res.status(400).json({ message: `Warehouse code '${normalizedCode}' is already in use` });
        }
        warehouse.code = normalizedCode;
      }
    }

    if (name !== undefined)          warehouse.name = String(name).trim().slice(0, 100);
    if (address !== undefined)       warehouse.address = address;
    if (contactPerson !== undefined) warehouse.contactPerson = String(contactPerson).trim();
    if (phone !== undefined)         warehouse.phone = String(phone).trim();
    if (email !== undefined)         warehouse.email = String(email).trim().toLowerCase();
    if (capacity !== undefined)      warehouse.capacity = Number(capacity);
    if (notes !== undefined)         warehouse.notes = String(notes).trim();
    if (isActive !== undefined)      warehouse.isActive = Boolean(isActive);

    if (isDefault) {
      if (warehouse.tenantId) {
        await Warehouse.updateMany(
          { tenantId: warehouse.tenantId, _id: { $ne: warehouse._id }, isDefault: true },
          { isDefault: false }
        );
      }
      warehouse.isDefault = true;
    } else if (isDefault === false) {
      warehouse.isDefault = false;
    }

    await warehouse.save();
    res.json(warehouse);
  } catch (error) {
    console.error('Error updating warehouse:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/warehouses/:id - Soft delete
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, isActive: true };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const warehouse = await Warehouse.findOne(filter);
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Check if warehouse has positive stock
    const stockEntries = await StockLedger.findOne({
      warehouseId: warehouse._id,
      isDeleted: false
    });
    if (stockEntries) {
      return res.status(400).json({
        message: 'Cannot delete warehouse with recorded stock ledger history. Deactivate it instead.'
      });
    }

    warehouse.isActive = false;
    await warehouse.save();
    res.json({ message: 'Warehouse deleted successfully' });
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
