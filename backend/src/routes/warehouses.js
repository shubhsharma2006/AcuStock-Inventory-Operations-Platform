const express = require('express');
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');

const router = express.Router();
router.use(requireTenantId);

// GET /api/warehouses - List all warehouses
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { isActive: true };
    filter.tenantId = req.tenantId;

    let warehouses = await Warehouse.find(filter)
      .populate('createdBy', 'name email')
      .sort({ isDefault: -1, name: 1 });

    if (warehouses.length === 0 && req.tenantId && req.userId) {
      try {
        const defaultWh = await Warehouse.create({
          name: 'Main Central Hub',
          code: 'WH-MAIN',
          address: {
            street: 'Industrial Area Phase 1',
            city: 'Central Hub',
            state: 'State',
            country: 'India',
            zipCode: '110001'
          },
          contactPerson: 'Warehouse Manager',
          email: 'warehouse@acustock.local',
          phone: '+919876543210',
          isDefault: true,
          isActive: true,
          tenantId: req.tenantId,
          createdBy: req.userId
        });
        warehouses = [defaultWh];
      } catch (seedErr) {
        // In case another concurrent request created it or code exists
        warehouses = await Warehouse.find(filter)
          .populate('createdBy', 'name email')
          .sort({ isDefault: -1, name: 1 });
      }
    }

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
      tenantId:      req.tenantId
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

    const filter = { _id: req.params.id, tenantId: req.tenantId };

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
    const filter = { _id: req.params.id, isActive: true, tenantId: req.tenantId };

    const warehouse = await Warehouse.findOne(filter);
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // Check if warehouse has positive stock
    const stockEntries = await StockLedger.findOne({
      warehouseId: warehouse._id,
      tenantId: req.tenantId,
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

// =========================================================================
// 3D SPATIAL DIGITAL TWIN & PICK-PATH ROUTER ENDPOINTS
// =========================================================================
const WarehouseLocation = require('../models/WarehouseLocation');
const Stock = require('../models/Stock');
const PickingWave = require('../models/PickingWave');
const { optimizePickPath } = require('../utils/pickPathRouter');
const slottingOptimizer = require('../services/slottingOptimizer.service');

// GET /api/warehouses/:id/digital-twin - Retrieve 3D layout, rack bins, and live stock density
router.get('/:id/digital-twin', requireAuth, validateObjectId, async (req, res) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.params.id, tenantId: req.tenantId, isActive: true });
    if (!warehouse) {
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    // 1. Fetch all bins for this warehouse
    let locations = await WarehouseLocation.find({
      warehouseId: warehouse._id,
      tenantId: req.tenantId,
      type: 'BIN',
      isActive: true
    }).lean();

    // If warehouse has no bins yet, generate a realistic default layout
    if (locations.length === 0) {
      const generatedBins = [];
      const aisles = warehouse.dimensions?.numberOfAisles || 4;
      const bays = warehouse.dimensions?.baysPerAisle || 6;
      const shelves = warehouse.dimensions?.shelvesPerBay || 4;
      const binsPerShelf = warehouse.dimensions?.binsPerShelf || 2;

      for (let a = 1; a <= aisles; a++) {
        for (let b = 1; b <= bays; b++) {
          for (let s = 1; s <= shelves; s++) {
            for (let bi = 1; bi <= binsPerShelf; bi++) {
              const code = `A${String(a).padStart(2, '0')}-R${String(b).padStart(2, '0')}-S${String(s).padStart(2, '0')}-B${String(bi).padStart(2, '0')}`;
              // 3D coordinates (meters): Aisle X, Shelf Y, Bay Z
              const x = (a - 1) * 4.2 - ((aisles - 1) * 4.2) / 2;
              const y = (s - 1) * 1.3 + 0.3;
              const z = (b - 1) * 2.8 - ((bays - 1) * 2.8) / 2;

              generatedBins.push({
                warehouseId: warehouse._id,
                tenantId: req.tenantId,
                type: 'BIN',
                code,
                label: `Bin ${code}`,
                capacity: { maxUnits: 100, maxWeight: 500, maxVolume: 1000 },
                gridCoordinates: {
                  aisleNumber: a,
                  bayNumber: b,
                  shelfLevel: s,
                  binIndex: bi,
                  x,
                  y,
                  z
                },
                zoneType: a <= 1 ? 'HIGH_VALUE' : 'AMBIENT',
                velocityClassification: s <= 2 && a <= 2 ? 'FAST_A' : (s <= 3 ? 'MEDIUM_B' : 'SLOW_C'),
                isActive: true
              });
            }
          }
        }
      }

      try {
        locations = await WarehouseLocation.insertMany(generatedBins);
      } catch (err) {
        locations = await WarehouseLocation.find({ warehouseId: warehouse._id, tenantId: req.tenantId, type: 'BIN' }).lean();
      }
    }

    // 2. Fetch live stock for this warehouse
    const liveStock = await Stock.find({
      warehouseId: warehouse._id,
      tenantId: req.tenantId,
      quantity: { $gt: 0 }
    }).populate('itemId', 'name sku barcode category').lean();

    const stockByLocation = {};
    liveStock.forEach(st => {
      if (st.locationId) {
        const locKey = String(st.locationId);
        if (!stockByLocation[locKey]) stockByLocation[locKey] = [];
        stockByLocation[locKey].push({
          stockId: st._id,
          sku: st.itemId?.sku || 'UNKNOWN',
          name: st.itemId?.name || 'Unnamed',
          quantity: st.quantity,
          category: st.itemId?.category
        });
      }
    });

    // 3. Enrich locations with 3D stats and occupancy
    let totalCapacity = 0;
    let totalStockUnits = 0;
    let occupiedBins = 0;

    const enrichedBins = locations.map(loc => {
      const contents = stockByLocation[String(loc._id)] || [];
      const currentUnits = contents.reduce((acc, c) => acc + c.quantity, 0);
      const maxUnits = loc.capacity?.maxUnits || 100;
      const occupancyPercent = Math.min(100, Math.round((currentUnits / maxUnits) * 100));

      totalCapacity += maxUnits;
      totalStockUnits += currentUnits;
      if (currentUnits > 0) occupiedBins++;

      // Compute standard spatial coords if missing
      const aisle = loc.gridCoordinates?.aisleNumber || 1;
      const bay = loc.gridCoordinates?.bayNumber || 1;
      const shelf = loc.gridCoordinates?.shelfLevel || 1;
      const x = loc.gridCoordinates?.x !== undefined ? loc.gridCoordinates.x : (aisle - 1) * 4.2 - 6;
      const y = loc.gridCoordinates?.y !== undefined ? loc.gridCoordinates.y : (shelf - 1) * 1.3 + 0.3;
      const z = loc.gridCoordinates?.z !== undefined ? loc.gridCoordinates.z : (bay - 1) * 2.8 - 8;

      return {
        _id: loc._id,
        code: loc.code,
        label: loc.label,
        type: loc.type,
        zoneType: loc.zoneType || 'AMBIENT',
        velocityClassification: loc.velocityClassification || (shelf <= 2 ? 'FAST_A' : 'SLOW_C'),
        gridCoordinates: {
          aisleNumber: aisle,
          bayNumber: bay,
          shelfLevel: shelf,
          binIndex: loc.gridCoordinates?.binIndex || 1,
          x,
          y,
          z
        },
        capacity: {
          maxUnits,
          currentUnits,
          occupancyPercent
        },
        contents,
        isPickable: loc.isPickable !== false
      };
    });

    res.json({
      warehouse: {
        _id: warehouse._id,
        name: warehouse.name,
        code: warehouse.code,
        dimensions: warehouse.dimensions || {
          lengthMeters: 60,
          widthMeters: 30,
          heightMeters: 10,
          numberOfAisles: 4,
          baysPerAisle: 6,
          shelvesPerBay: 4,
          binsPerShelf: 2
        }
      },
      stats: {
        totalBins: enrichedBins.length,
        occupiedBins,
        vacantBins: enrichedBins.length - occupiedBins,
        utilizationRate: totalCapacity > 0 ? Math.round((totalStockUnits / totalCapacity) * 100) : 0,
        totalStockUnits
      },
      bins: enrichedBins
    });
  } catch (error) {
    console.error('Error fetching digital twin layout:', error);
    res.status(500).json({ message: 'Failed to generate digital twin' });
  }
});

// POST /api/warehouses/:id/optimize-pick-path - Calculate S-Shape & 2-Opt shortest picker path
router.post('/:id/optimize-pick-path', requireAuth, validateObjectId, async (req, res) => {
  try {
    const { binIds, waveId, startPoint, endPoint } = req.body;
    let targetBins = [];

    if (waveId) {
      const wave = await PickingWave.findOne({ _id: waveId, tenantId: req.tenantId });
      if (wave && wave.pickItems) {
        const itemBinCodes = wave.pickItems.map(p => p.binCode).filter(Boolean);
        targetBins = await WarehouseLocation.find({
          warehouseId: req.params.id,
          tenantId: req.tenantId,
          code: { $in: itemBinCodes }
        }).lean();
      }
    } else if (Array.isArray(binIds) && binIds.length > 0) {
      targetBins = await WarehouseLocation.find({
        warehouseId: req.params.id,
        tenantId: req.tenantId,
        _id: { $in: binIds }
      }).lean();
    }

    if (targetBins.length === 0) {
      // Pick 5 random sample bins if none selected to demonstrate visual path
      targetBins = await WarehouseLocation.find({
        warehouseId: req.params.id,
        tenantId: req.tenantId,
        type: 'BIN',
        isActive: true
      }).limit(6).lean();
    }

    // Format stops
    const stops = targetBins.map(bin => ({
      id: bin._id,
      code: bin.code,
      aisleNumber: bin.gridCoordinates?.aisleNumber || 1,
      bayNumber: bin.gridCoordinates?.bayNumber || 1,
      shelfLevel: bin.gridCoordinates?.shelfLevel || 1,
      x: bin.gridCoordinates?.x || 0,
      y: bin.gridCoordinates?.y || 0,
      z: bin.gridCoordinates?.z || 0
    }));

    const result = optimizePickPath(
      stops,
      startPoint || { x: 0, y: 0.1, z: -10 },
      endPoint || { x: 0, y: 0.1, z: -10 },
      { frontCrossAisleZ: -10, backCrossAisleZ: 10 }
    );

    res.json(result);
  } catch (error) {
    console.error('Error optimizing pick path:', error);
    res.status(500).json({ message: 'Failed to optimize pick route' });
  }
});

// GET /api/warehouses/:id/slotting-recommendations - AI Slotting Recommendations
router.get('/:id/slotting-recommendations', requireAuth, validateObjectId, async (req, res) => {
  try {
    const analysis = await slottingOptimizer.generateSlottingRecommendations(req.params.id, req.tenantId);
    res.json(analysis);
  } catch (error) {
    console.error('Error generating slotting recommendations:', error);
    res.status(500).json({ message: 'Failed to analyze slotting' });
  }
});

// POST /api/warehouses/:id/apply-slotting-moves - Apply selected moves
router.post('/:id/apply-slotting-moves', requireAuth, validateObjectId, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { moves } = req.body;
    const result = await slottingOptimizer.applySlottingMoves(moves, req.params.id, req.tenantId, req.userId);
    res.json(result);
  } catch (error) {
    console.error('Error applying slotting moves:', error);
    res.status(500).json({ message: 'Failed to apply slotting moves' });
  }
});

module.exports = router;
