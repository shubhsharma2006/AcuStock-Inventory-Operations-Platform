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

module.exports = router;
