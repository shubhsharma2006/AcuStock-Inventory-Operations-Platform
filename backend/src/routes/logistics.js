const logger = require('../utils/logger');
const Shipment = require('../models/Shipment');
const courierService = require('../services/courier/ShiprocketService');
const express = require('express');
const { requireAuth, requireRole, requireTenantId, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const Transporter = require('../models/Transporter');

const router = express.Router();
router.use(requireTenantId);

/**
 * GET /api/logistics
 * Get all transporters (with search and pagination)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, active } = req.query;
    const { page, limit } = normalizePaginationQuery(req.query);
    
    // Build query - Admin and Manager can see all transporters
    const query = { isDeleted: { $ne: true }, tenantId: req.tenantId };
    
    // For regular users, show only their own transporters
    if (req.userRole === 'USER') {
      query.createdBy = req.userId;
    }
    
    // Filter by active status
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    
    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [transporters, total] = await Promise.all([
      Transporter.find(query)
        .populate('createdBy', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Transporter.countDocuments(query)
    ]);
    
    res.json({
      transporters,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching transporters:', err);
    res.status(500).json({ message: 'Failed to fetch transporters' });
  }
});

/**
 * GET /api/logistics/:id
 * Get a single transporter by ID
 */
function dispatchScope(req) {
  const filter = { tenantId: req.tenantId, type: 'OUT', carrierType: 'SHIPROCKET',
    status: { $in: ['PENDING', 'DISPATCHED'] } };
  if (req.user.role === 'MANAGER') filter.createdBy = req.user._id;
  return filter;
}

router.get('/dispatch-warehouses', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const origins = await Shipment.distinct('originWarehouse', dispatchScope(req));
    res.json({ warehouses: origins.filter(name => typeof name === 'string' && name.trim()).sort() });
  } catch {
    res.status(500).json({ message: 'Could not load pickup warehouses.' });
  }
});

router.post('/batch-documents', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const { shipmentIds, warehouse, document } = req.body || {};
  if (!Array.isArray(shipmentIds) || !shipmentIds.length || shipmentIds.length > 50 ||
      !shipmentIds.every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) ||
      new Set(shipmentIds.map(id => id.toLowerCase())).size !== shipmentIds.length ||
      typeof warehouse !== 'string' || !warehouse.trim() || !['labels', 'manifest'].includes(document)) {
    return res.status(400).json({ message: 'Select up to 50 distinct shipments from one warehouse.' });
  }
  try {
    const records = await Shipment.find({ ...dispatchScope(req), originWarehouse: warehouse.trim(),
      _id: { $in: shipmentIds } }).select('awb carrierBooking');
    const stages = document === 'manifest' ? ['COMPLETE'] : ['PICKUP', 'COMPLETE'];
    if (records.length !== shipmentIds.length || records.some(s => !s.awb || !s.carrierBooking?.shipmentId ||
        s.carrierBooking.processing || !stages.includes(s.carrierBooking.stage))) {
      return res.status(409).json({ message: 'Refresh the selection and check each shipment’s booking stage.' });
    }
    const token = await courierService.getAuthToken();
    if (!token) return res.status(503).json({ message: 'Shiprocket authentication is unavailable.' });
    const isManifest = document === 'manifest';
    const result = await courierService.post(isManifest ? '/manifests/generate' : '/courier/generate/label', token,
      { shipment_id: records.map(s => s.carrierBooking.shipmentId) });
    const url = isManifest ? result.manifest_url : result.label_url;
    if (typeof url !== 'string' || new URL(url).protocol !== 'https:') throw new Error('Missing carrier document');
    res.json({ url });
  } catch {
    res.status(502).json({ message: 'The document could not be generated. Refresh and try again.' });
  }
});

router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const filter = {
      _id: req.params.id,
      isDeleted: { $ne: true },
      tenantId: req.tenantId
    };

    const transporter = await Transporter.findOne(filter)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }
    
    // Only regular users are restricted to their own transporters
    if (req.userRole === 'USER' && transporter.createdBy._id.toString() !== req.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(transporter);
  } catch (err) {
    console.error('Error fetching transporter:', err);
    res.status(500).json({ message: 'Failed to fetch transporter' });
  }
});

/**
 * POST /api/logistics
 * Create a new transporter
 */
router.post('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const {
      name,
      contactPerson,
      phone,
      email,
      address,
      gstin,
      panNumber,
      vehicleTypes,
      serviceAreas,
      notes
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Transporter name is required' });
    }
    
    const transporter = new Transporter({
      name,
      contactPerson,
      phone,
      email,
      address,
      gstin,
      panNumber,
      vehicleTypes,
      serviceAreas,
      notes,
      createdBy: req.userId,
      tenantId: req.tenantId
    });
    
    await transporter.save();
    
    // Populate and return
    const populated = await Transporter.findOne({ _id: transporter._id, tenantId: req.tenantId })
      .populate('createdBy', 'name');
    
    res.status(201).json({
      message: 'Transporter created successfully',
      transporter: populated
    });
  } catch (err) {
    console.error('Error creating transporter:', err);
    res.status(500).json({ message: 'Failed to create transporter' });
  }
});

/**
 * PUT /api/logistics/:id
 * Update a transporter
 */
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, isDeleted: { $ne: true }, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter);
    
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }
    
    // Admin and Manager can edit any transporter, Users can only edit their own
    if (req.userRole === 'USER' && transporter.createdBy.toString() !== req.userId) {
      return res.status(403).json({ message: 'You can only edit transporters you created' });
    }
    
    const allowedFields = [
      'name', 'contactPerson', 'phone', 'email', 'address',
      'gstin', 'panNumber', 'vehicleTypes', 'serviceAreas', 'notes', 'isActive'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        transporter[field] = req.body[field];
      }
    });
    
    transporter.updatedBy = req.userId;
    await transporter.save();
    
    const populated = await Transporter.findOne(filter)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    
    res.json({
      message: 'Transporter updated successfully',
      transporter: populated
    });
  } catch (err) {
    console.error('Error updating transporter:', err);
    res.status(500).json({ message: 'Failed to update transporter' });
  }
});

/**
 * DELETE /api/logistics/:id
 * Delete a transporter (Admin only)
 */
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, isDeleted: { $ne: true }, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter);
    
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }

    // Soft delete — preserves audit trail and referential integrity
    transporter.isDeleted  = true;
    transporter.isActive   = false;
    transporter.deletedAt  = new Date();
    transporter.deletedBy  = req.userId;
    transporter.updatedBy  = req.userId;
    await transporter.save();

    res.json({ message: 'Transporter deleted successfully' });
  } catch (err) {
    console.error('Error deleting transporter:', err);
    res.status(500).json({ message: 'Failed to delete transporter' });
  }
});

/**
 * PUT /api/logistics/:id/status
 * Toggle transporter active status
 */
router.put('/:id/status', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { isActive } = req.body;
    const filter = { _id: req.params.id, isDeleted: { $ne: true }, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter);
    
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }
    
    // Admin and Manager can modify any transporter status
    if (req.userRole === 'USER' && transporter.createdBy.toString() !== req.userId) {
      return res.status(403).json({ message: 'You can only modify transporters you created' });
    }
    
    transporter.isActive = isActive;
    transporter.updatedBy = req.userId;
    await transporter.save();
    
    res.json({
      message: `Transporter ${isActive ? 'activated' : 'deactivated'} successfully`,
      transporter
    });
  } catch (err) {
    console.error('Error updating transporter status:', err);
    res.status(500).json({ message: 'Failed to update transporter status' });
  }
});

const allocationEngine = require('../services/logistics/CarrierAllocationEngine');

/**
 * POST /api/logistics/rates
 * Compare live rates across all integrated carriers (Bigship, Shiprocket, etc.)
 */
router.post('/rates', requireAuth, async (req, res) => {
  try {
    const {
      fromPincode,
      toPincode,
      weightKg,
      actualWeightKg,
      lengthCm,
      widthCm,
      heightCm,
      isCod,
      declaredValue,
      policy = 'BALANCED'
    } = req.body || {};

    if (!fromPincode || !toPincode) {
      return res.status(400).json({ message: 'Both fromPincode and toPincode are required.' });
    }

    const ratesData = await allocationEngine.compareAndRank({
      fromPincode,
      toPincode,
      actualWeightKg: actualWeightKg ?? weightKg,
      lengthCm,
      widthCm,
      heightCm,
      isCod,
      declaredValue
    }, policy);

    res.json({
      success: true,
      ...ratesData
    });
  } catch (err) {
    console.error('Error fetching logistics rates:', err);
    res.status(500).json({ message: 'Failed to calculate carrier rates: ' + err.message });
  }
});

/**
 * POST /api/logistics/book
 * Book shipment and generate AWB via the selected carrier provider
 */
router.post('/book', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const { shipmentId, step, provider } = req.body || {};
  if (provider !== 'SHIPROCKET' || !/^[a-f0-9]{24}$/i.test(String(shipmentId)) ||
      !['ORDER', 'AWB', 'LABEL', 'PICKUP'].includes(step)) {
    return res.status(400).json({ message: 'Choose a saved Shiprocket shipment and a valid booking step.' });
  }
  const filter = { ...dispatchScope(req), _id: shipmentId };
  try {
    const token = await courierService.getAuthToken();
    if (!token) return res.status(503).json({ message: 'Shiprocket authentication is unavailable.' });
    const expected = { ...filter, 'carrierBooking.processing': { $ne: true } };
    if (step === 'ORDER') {
      expected['carrierBooking.stage'] = null;
      expected.awb = { $in: [null, ''] };
    } else {
      expected['carrierBooking.stage'] = step;
    }
    const shipment = await Shipment.findOneAndUpdate(expected, {
      $set: { 'carrierBooking.stage': step, 'carrierBooking.processing': true }
    }, { new: true });
    if (!shipment) return res.status(409).json({ message: 'Booking state has changed. Refresh the shipment before continuing.' });
    // An uncertain carrier response must be reconciled before repeating a billable action.
    let order;
    if (step === 'ORDER') {
      try {
        order = courierService.orderPayload(shipment);
      } catch (error) {
        await Shipment.updateOne({ _id: shipmentId, tenantId: req.tenantId, 'carrierBooking.stage': step },
          { $unset: { carrierBooking: 1 } });
        return res.status(400).json({ message: error.message });
      }
    }
    const fields = await courierService.performStep(step, shipment, token, order);
    const next = { ORDER: 'AWB', AWB: 'LABEL', LABEL: 'PICKUP', PICKUP: 'COMPLETE' }[step];
    const saved = await Shipment.updateOne({ _id: shipmentId, tenantId: req.tenantId,
      'carrierBooking.stage': step, 'carrierBooking.processing': true }, {
      $set: { ...fields, 'carrierBooking.stage': next, 'carrierBooking.processing': false }
    });
    if (!saved.modifiedCount) throw new Error('Booking checkpoint unavailable');
    return res.json({ success: true, next });
  } catch (error) {
    logger.warn('Shiprocket booking step could not be confirmed', { shipmentId, step, message: error.message });
    return res.status(502).json({ message: 'Booking could not be confirmed. Check the shipment in Shiprocket before retrying.' });
  }
});

module.exports = router;
