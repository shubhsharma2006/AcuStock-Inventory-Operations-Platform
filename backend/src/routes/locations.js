const express = require('express');
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const WarehouseLocation = require('../models/WarehouseLocation');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

const DEPTH_MAP = {
  ZONE: 0,
  AISLE: 1,
  RACK: 2,
  SHELF: 3,
  BIN: 4
};

/**
 * GET /api/locations/:warehouseId
 * List all locations for a warehouse with optional query filters (type, isActive, parentId)
 */
router.get('/:warehouseId', requireAuth, validateObjectId('warehouseId'), async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const { type, isActive, parentId } = req.query;

    const filter = {
      tenantId: req.tenantId,
      warehouseId
    };

    if (type) filter.type = type.toUpperCase();
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (parentId !== undefined) {
      filter.parentId = parentId === 'null' || !parentId ? null : parentId;
    }

    const locations = await WarehouseLocation.find(filter)
      .sort({ depth: 1, code: 1 })
      .lean();

    res.json({ success: true, count: locations.length, data: locations });
  } catch (error) {
    logger.error('Error fetching warehouse locations', { error: error.message, warehouseId: req.params.warehouseId });
    res.status(500).json({ success: false, message: 'Server error retrieving locations' });
  }
});

/**
 * GET /api/locations/:warehouseId/tree
 * Build hierarchical nested tree of locations (Zone -> Aisle -> Rack -> Shelf -> Bin)
 */
router.get('/:warehouseId/tree', requireAuth, validateObjectId('warehouseId'), async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const locations = await WarehouseLocation.find({
      tenantId: req.tenantId,
      warehouseId,
      isActive: true
    }).sort({ depth: 1, code: 1 }).lean();

    const locationMap = {};
    const rootNodes = [];

    locations.forEach(loc => {
      locationMap[loc._id.toString()] = { ...loc, children: [] };
    });

    locations.forEach(loc => {
      if (loc.parentId && locationMap[loc.parentId.toString()]) {
        locationMap[loc.parentId.toString()].children.push(locationMap[loc._id.toString()]);
      } else {
        rootNodes.push(locationMap[loc._id.toString()]);
      }
    });

    res.json({ success: true, warehouseId, tree: rootNodes });
  } catch (error) {
    logger.error('Error generating location tree', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to build location hierarchy tree' });
  }
});

/**
 * POST /api/locations/:warehouseId
 * Create a single location in the warehouse
 */
router.post('/:warehouseId', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('warehouseId'), async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const {
      type,
      code,
      label,
      parentId,
      capacity,
      isPickable,
      dimensions,
      temperatureZone
    } = req.body;

    if (!type || !code) {
      return res.status(400).json({ success: false, message: 'Type and code are required.' });
    }

    const normalizedType = type.toUpperCase();
    if (!['ZONE', 'AISLE', 'RACK', 'SHELF', 'BIN'].includes(normalizedType)) {
      return res.status(400).json({ success: false, message: 'Invalid location type.' });
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, tenantId: req.tenantId });
    if (!warehouse) {
      return res.status(404).json({ success: false, message: 'Warehouse not found' });
    }

    let parentPath = '';
    let depth = DEPTH_MAP[normalizedType];

    if (parentId) {
      const parent = await WarehouseLocation.findOne({ _id: parentId, tenantId: req.tenantId, warehouseId });
      if (!parent) {
        return res.status(400).json({ success: false, message: 'Specified parent location not found in this warehouse.' });
      }
      parentPath = parent.path || `/${parent.code.toLowerCase()}`;
      if (depth <= parent.depth) {
        return res.status(400).json({ success: false, message: `Child type (${normalizedType}) must be at a deeper hierarchy level than parent (${parent.type}).` });
      }
    } else if (normalizedType !== 'ZONE') {
      // Allowed if standalone, but default depth is from DEPTH_MAP
    }

    const normalizedCode = code.trim().toUpperCase();
    const selfSlug = normalizedCode.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const path = parentPath ? `${parentPath}/${selfSlug}` : `/${selfSlug}`;

    const location = await WarehouseLocation.create({
      warehouseId,
      tenantId: req.tenantId,
      type: normalizedType,
      code: normalizedCode,
      label: label ? label.trim() : `${normalizedType} ${normalizedCode}`,
      parentId: parentId || null,
      path,
      depth,
      capacity: capacity || { maxUnits: 0, maxWeight: 0, maxVolume: 0 },
      isPickable: isPickable !== undefined ? isPickable : (normalizedType === 'BIN'),
      dimensions: dimensions || {},
      temperatureZone: temperatureZone || 'AMBIENT',
      createdBy: req.userId
    });

    res.status(201).json({ success: true, location });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Location code already exists in this warehouse.' });
    }
    logger.error('Error creating location', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/locations/:warehouseId/bulk
 * Bulk generate standard hierarchy
 * e.g. zones: 1..2, aislesPerZone: 2, racksPerAisle: 2, shelvesPerRack: 2, binsPerShelf: 2
 */
router.post('/:warehouseId/bulk', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('warehouseId'), async (req, res) => {
  try {
    const { warehouseId } = req.params;
    const {
      zoneCount = 1,
      aislesPerZone = 2,
      racksPerAisle = 2,
      shelvesPerRack = 2,
      binsPerShelf = 2,
      prefix = 'W1'
    } = req.body;

    // Safety guard on total combinations
    const totalCount = zoneCount * aislesPerZone * racksPerAisle * shelvesPerRack * binsPerShelf;
    if (totalCount > 1500) {
      return res.status(400).json({ success: false, message: 'Bulk creation exceeds maximum limit of 1500 locations per operation.' });
    }

    const created = [];

    for (let z = 1; z <= zoneCount; z++) {
      const zPad = String(z).padStart(2, '0');
      const zCode = `${prefix}-Z${zPad}`;
      const zone = await WarehouseLocation.findOneAndUpdate(
        { tenantId: req.tenantId, warehouseId, code: zCode },
        {
          $setOnInsert: {
            tenantId: req.tenantId,
            warehouseId,
            type: 'ZONE',
            code: zCode,
            label: `Zone ${zPad}`,
            path: `/${zCode.toLowerCase()}`,
            depth: 0,
            isPickable: false,
            createdBy: req.userId
          }
        },
        { upsert: true, new: true }
      );
      created.push(zone);

      for (let a = 1; a <= aislesPerZone; a++) {
        const aPad = String(a).padStart(2, '0');
        const aCode = `${zCode}-A${aPad}`;
        const aisle = await WarehouseLocation.findOneAndUpdate(
          { tenantId: req.tenantId, warehouseId, code: aCode },
          {
            $setOnInsert: {
              tenantId: req.tenantId,
              warehouseId,
              type: 'AISLE',
              code: aCode,
              label: `Aisle ${aPad}`,
              parentId: zone._id,
              path: `${zone.path}/${aCode.toLowerCase()}`,
              depth: 1,
              isPickable: false,
              createdBy: req.userId
            }
          },
          { upsert: true, new: true }
        );
        created.push(aisle);

        for (let r = 1; r <= racksPerAisle; r++) {
          const rPad = String(r).padStart(2, '0');
          const rCode = `${aCode}-R${rPad}`;
          const rack = await WarehouseLocation.findOneAndUpdate(
            { tenantId: req.tenantId, warehouseId, code: rCode },
            {
              $setOnInsert: {
                tenantId: req.tenantId,
                warehouseId,
                type: 'RACK',
                code: rCode,
                label: `Rack ${rPad}`,
                parentId: aisle._id,
                path: `${aisle.path}/${rCode.toLowerCase()}`,
                depth: 2,
                isPickable: false,
                createdBy: req.userId
              }
            },
            { upsert: true, new: true }
          );
          created.push(rack);

          for (let s = 1; s <= shelvesPerRack; s++) {
            const sPad = String(s).padStart(2, '0');
            const sCode = `${rCode}-S${sPad}`;
            const shelf = await WarehouseLocation.findOneAndUpdate(
              { tenantId: req.tenantId, warehouseId, code: sCode },
              {
                $setOnInsert: {
                  tenantId: req.tenantId,
                  warehouseId,
                  type: 'SHELF',
                  code: sCode,
                  label: `Shelf ${sPad}`,
                  parentId: rack._id,
                  path: `${rack.path}/${sCode.toLowerCase()}`,
                  depth: 3,
                  isPickable: false,
                  createdBy: req.userId
                }
              },
              { upsert: true, new: true }
            );
            created.push(shelf);

            for (let b = 1; b <= binsPerShelf; b++) {
              const bPad = String(b).padStart(2, '0');
              const bCode = `${sCode}-B${bPad}`;
              const bin = await WarehouseLocation.findOneAndUpdate(
                { tenantId: req.tenantId, warehouseId, code: bCode },
                {
                  $setOnInsert: {
                    tenantId: req.tenantId,
                    warehouseId,
                    type: 'BIN',
                    code: bCode,
                    label: `Bin ${bPad}`,
                    parentId: shelf._id,
                    path: `${shelf.path}/${bCode.toLowerCase()}`,
                    depth: 4,
                    isPickable: true,
                    createdBy: req.userId
                  }
                },
                { upsert: true, new: true }
              );
              created.push(bin);
            }
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Generated hierarchy of ${created.length} locations`,
      count: created.length
    });
  } catch (error) {
    logger.error('Bulk generate locations error', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/locations/detail/:id
 * Get single location with current stock aggregate
 */
router.get('/detail/:id', requireAuth, validateObjectId('id'), async (req, res) => {
  try {
    const location = await WarehouseLocation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('parentId', 'code type label').populate('warehouseId', 'name code');

    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    // Aggregate inventory in this location from StockLedger
    const stockBalance = await StockLedger.aggregate([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(req.tenantId),
          locationId: new mongoose.Types.ObjectId(location._id),
          isDeleted: { $ne: true }
        }
      },
      {
        $group: {
          _id: '$productId',
          totalUnits: {
            $sum: {
              $cond: [
                { $in: ['$type', ['IN', 'TRANSFER_IN', 'ADJUSTMENT_IN']] },
                '$quantity',
                { $multiply: ['$quantity', -1] }
              ]
            }
          }
        }
      },
      { $match: { totalUnits: { $gt: 0 } } },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          productId: '$_id',
          sku: '$product.sku',
          name: '$product.name',
          uom: '$product.uom',
          totalUnits: 1
        }
      }
    ]);

    res.json({
      success: true,
      location,
      inventory: stockBalance
    });
  } catch (error) {
    logger.error('Error fetching location detail', { error: error.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * PUT /api/locations/:id
 * Update location
 */
router.put('/:id', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), validateObjectId('id'), async (req, res) => {
  try {
    const { label, capacity, isActive, isPickable, dimensions, temperatureZone } = req.body;

    const updated = await WarehouseLocation.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        $set: {
          ...(label !== undefined && { label: label.trim() }),
          ...(capacity !== undefined && { capacity }),
          ...(isActive !== undefined && { isActive }),
          ...(isPickable !== undefined && { isPickable }),
          ...(dimensions !== undefined && { dimensions }),
          ...(temperatureZone !== undefined && { temperatureZone })
        }
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    res.json({ success: true, location: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/locations/:id
 * Soft deactivate or delete location if empty
 */
router.delete('/:id', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN']), validateObjectId('id'), async (req, res) => {
  try {
    const location = await WarehouseLocation.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    // Check if children exist
    const childCount = await WarehouseLocation.countDocuments({
      tenantId: req.tenantId,
      parentId: location._id,
      isActive: true
    });
    if (childCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete location that has ${childCount} active sub-locations.` });
    }

    // Deactivate
    location.isActive = false;
    await location.save();

    res.json({ success: true, message: 'Location deactivated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

