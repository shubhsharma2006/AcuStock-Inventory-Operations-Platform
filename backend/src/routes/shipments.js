const express = require('express');
const mongoose = require('mongoose');
const Shipment = require('../models/Shipment');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const SerialAudit = require('../models/SerialAudit');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/shipments - Get all shipments (with filters)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20, search } = req.query;
    const query = {};
    
    // Role-based filtering:
    // USER → only their own shipments
    // MANAGER → only shipments they created
    // ADMIN / SUPER_ADMIN → all shipments
    if (req.user.role === 'USER' || req.user.role === 'MANAGER') {
      query.createdBy = req.user._id;
    }
    
    if (status) {
      if (status === 'pending') {
        query.status = { $in: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] };
      } else {
        query.status = status.toUpperCase();
      }
    }
    
    if (type) {
      query.type = type.toUpperCase();
    }
    
    if (search) {
      query.$or = [
        { reference: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { awb: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [shipments, total] = await Promise.all([
      Shipment.find(query)
        .populate('productId', 'name shortName')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Shipment.countDocuments(query)
    ]);
    
    res.json({
      shipments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get shipments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shipments/pending - Get pending deliveries
router.get('/pending', requireAuth, async (req, res) => {
  try {
    // USER and MANAGER see only their own; ADMIN/SUPER_ADMIN see all
    const userId = (req.user.role === 'USER' || req.user.role === 'MANAGER')
      ? req.user._id
      : null;
    const shipments = await Shipment.getPendingDeliveries(userId);
    const count = await Shipment.getPendingCount(userId);

    res.json({ shipments, count });
  } catch (error) {
    console.error('Get pending deliveries error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shipments/stats - Get shipment statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const query = {};
    if (req.user.role === 'USER' || req.user.role === 'MANAGER') {
      query.createdBy = req.user._id;
    }
    
    const [
      totalShipments,
      totalSupplies,
      pendingDeliveries,
      deliveredCount
    ] = await Promise.all([
      Shipment.countDocuments({ ...query, type: 'OUT' }),
      Shipment.countDocuments({ ...query, type: 'IN' }),
      Shipment.countDocuments({ 
        ...query, 
        type: 'OUT',
        status: { $in: ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] }
      }),
      Shipment.countDocuments({ ...query, type: 'OUT', status: 'DELIVERED' })
    ]);
    
    res.json({
      totalShipments,
      totalSupplies,
      pendingDeliveries,
      deliveredCount
    });
  } catch (error) {
    console.error('Get shipment stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shipments/:id - Get single shipment
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate('productId', 'name shortName hsnCode')
      .populate('createdBy', 'name email')
      .populate('statusHistory.updatedBy', 'name');
    
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    
    // Users can only view their own shipments
    if (req.user.role === 'USER' && !shipment.createdBy._id.equals(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(shipment);
  } catch (error) {
    console.error('Get shipment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/shipments - Create new shipment (OUT) or supply (IN)
router.post('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      productId,
      model,
      quantity,
      serialNumbers = [],
      condition,
      companyName,
      customerName,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      courier,
      awb,
      dispatchDate,
      deliveryType,
      codAmount,
      prepaidAmount,
      courierCharges,
      soldBy,
      dispatchType,
      boxes,
      weight,
      dimensions,
      remarks,
      type = 'OUT'
    } = req.body;
    
    // Validate required fields
    if (!productId || !quantity || !customerName || !phone || !deliveryType) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Get product
    const item = await Item.findById(productId).session(session);
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // For OUT shipments, check stock availability
    if (type === 'OUT') {
      const currentStock = await item.getCurrentStock();
      if (currentStock < quantity) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Insufficient stock. Available: ${currentStock}` });
      }
      
      // Serial number validation for OUT
      const policy = item.serialPolicy || {};
      if (policy.enableSerial && policy.requireSerialOnOUT && serialNumbers.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Serial numbers are required for this product' });
      }
      
      if (serialNumbers.length > 0 && serialNumbers.length !== quantity) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Serial numbers count must match quantity' });
      }
      
      // Validate serials are in stock
      if (serialNumbers.length > 0) {
        const existingAudits = await SerialAudit.aggregate([
          { $match: { serial: { $in: serialNumbers } } },
          { $sort: { createdAt: 1 } },
          { $group: { _id: '$serial', lastAction: { $last: '$action' } } }
        ]).session(session);
        
        const availableMap = new Map(existingAudits.map(a => [a._id, a.lastAction]));
        const notAvailable = serialNumbers.filter(s => availableMap.get(s) !== 'IN');
        
        if (notAvailable.length > 0) {
          await session.abortTransaction();
          return res.status(400).json({
            message: 'Some serial numbers are not in stock',
            serials: notAvailable
          });
        }
      }
    }
    
    // Create shipment
    const shipment = new Shipment({
      productId,
      productName: item.name,
      model,
      quantity,
      serialNumbers,
      condition,
      companyName,
      customerName,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      courier,
      awb,
      dispatchDate: dispatchDate ? new Date(dispatchDate) : null,
      deliveryType,
      codAmount: deliveryType === 'COD' ? codAmount : null,
      prepaidAmount: deliveryType === 'Prepaid' ? prepaidAmount : null,
      courierCharges,
      soldBy,
      dispatchType,
      boxes,
      weight,
      dimensions,
      remarks,
      type,
      status: dispatchDate ? 'DISPATCHED' : 'PENDING',
      createdBy: req.user._id
    });
    
    await shipment.save({ session });
    
    // Create stock ledger entry for OUT
    if (type === 'OUT') {
      const ledgerEntry = new StockLedger({
        productId,
        type: 'OUT',
        quantity: quantity,
        serialNumbers,
        createdBy: req.user._id,
        role: req.user.role
      });
      await ledgerEntry.save({ session });
      
      // Create serial audit entries
      if (serialNumbers.length > 0) {
        const auditEntries = serialNumbers.map(serial => ({
          serial,
          productId,
          action: 'OUT',
          performedBy: req.user._id,
          role: req.user.role
        }));
        await SerialAudit.insertMany(auditEntries, { session });
      }
    }
    
    // Create stock ledger entry for IN (supply)
    if (type === 'IN') {
      const ledgerEntry = new StockLedger({
        productId,
        type: 'IN',
        quantity,
        serialNumbers,
        createdBy: req.user._id,
        role: req.user.role
      });
      await ledgerEntry.save({ session });
      
      // Create serial audit entries
      if (serialNumbers.length > 0) {
        const auditEntries = serialNumbers.map(serial => ({
          serial,
          productId,
          action: 'IN',
          performedBy: req.user._id,
          role: req.user.role
        }));
        await SerialAudit.insertMany(auditEntries, { session });
      }
    }
    
    await session.commitTransaction();
    
    res.status(201).json({
      message: type === 'OUT' ? 'Shipment created successfully' : 'Supply recorded successfully',
      shipment
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Create shipment error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// PATCH /api/shipments/:id/status - Update shipment status
router.patch('/:id/status', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { status, notes, receivedBy } = req.body;
    
    const validStatuses = ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    
    // Non-admin roles can only update their own shipments
    if ((req.user.role === 'USER' || req.user.role === 'MANAGER') && !shipment.createdBy.equals(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Update status
    shipment.status = status;
    shipment.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: req.user._id,
      notes
    });
    
    if (status === 'DELIVERED') {
      shipment.actualDeliveryDate = new Date();
      if (receivedBy) {
        shipment.receivedBy = receivedBy;
      }
    }
    
    await shipment.save();
    
    res.json({
      message: 'Status updated successfully',
      shipment
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/shipments/:id - Update shipment details
router.put('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    
    // Users can only update their own shipments
    if (req.user.role === 'USER' && !shipment.createdBy.equals(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Can't update delivered/cancelled shipments
    if (['DELIVERED', 'CANCELLED'].includes(shipment.status)) {
      return res.status(400).json({ message: 'Cannot update completed shipments' });
    }
    
    const allowedUpdates = [
      'courier', 'awb', 'dispatchDate', 'courierCharges', 'boxes',
      'weight', 'dimensions', 'remarks', 'expectedDeliveryDate'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        shipment[field] = req.body[field];
      }
    });
    
    await shipment.save();
    
    res.json({
      message: 'Shipment updated successfully',
      shipment
    });
  } catch (error) {
    console.error('Update shipment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/shipments/:id - Cancel/Delete shipment (Admin only)
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    
    // Only pending shipments can be deleted
    if (shipment.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only pending shipments can be deleted' });
    }
    
    await Shipment.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Shipment deleted successfully' });
  } catch (error) {
    console.error('Delete shipment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
