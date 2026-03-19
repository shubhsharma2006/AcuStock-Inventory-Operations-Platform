const express = require('express');
const Unit = require('../models/Unit');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// GET /api/units - List all units
// ============================================================
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    
    const query = {};
    
    // Filter by status
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    // Search by name or shortName
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { shortName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [units, total] = await Promise.all([
      Unit.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name')
        .populate('updatedBy', 'name'),
      Unit.countDocuments(query)
    ]);
    
    res.json({
      units,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// GET /api/units/active - Get only active units (for dropdowns)
// ============================================================
router.get('/active', requireAuth, async (req, res) => {
  try {
    const units = await Unit.find({ isActive: true })
      .select('name shortName')
      .sort({ name: 1 });
    
    res.json({ units });
  } catch (error) {
    console.error('Error fetching active units:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// GET /api/units/:id - Get single unit
// ============================================================
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name');
    
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    res.json({ unit });
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// POST /api/units - Create new unit
// ============================================================
router.post('/', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { name, shortName, description } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Unit name is required' });
    }
    
    if (!shortName || !shortName.trim()) {
      return res.status(400).json({ message: 'Short name is required' });
    }
    
    // Check for duplicate name
    const existingUnit = await Unit.findOne({ 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });
    
    if (existingUnit) {
      return res.status(400).json({ message: 'A unit with this name already exists' });
    }
    
    const unit = new Unit({
      name: name.trim(),
      shortName: shortName.trim(),
      description: description?.trim(),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    
    await unit.save();
    
    res.status(201).json({
      message: 'Unit created successfully',
      unit
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A unit with this name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// PUT /api/units/:id - Update unit
// ============================================================
router.put('/:id', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { name, shortName, description } = req.body;
    
    const unit = await Unit.findById(req.params.id);
    
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    // Check for duplicate name (excluding current unit)
    if (name && name.trim() !== unit.name) {
      const existingUnit = await Unit.findOne({ 
        _id: { $ne: req.params.id },
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
      });
      
      if (existingUnit) {
        return res.status(400).json({ message: 'A unit with this name already exists' });
      }
    }
    
    // Update fields
    if (name) unit.name = name.trim();
    if (shortName) unit.shortName = shortName.trim();
    if (description !== undefined) unit.description = description?.trim();
    unit.updatedBy = req.user._id;
    
    await unit.save();
    
    res.json({
      message: 'Unit updated successfully',
      unit
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A unit with this name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// PUT /api/units/:id/status - Toggle unit status
// ============================================================
router.put('/:id/status', requireAuth, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    unit.isActive = !unit.isActive;
    unit.updatedBy = req.user._id;
    
    await unit.save();
    
    res.json({
      message: `Unit ${unit.isActive ? 'activated' : 'deactivated'} successfully`,
      unit
    });
  } catch (error) {
    console.error('Error toggling unit status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================================
// DELETE /api/units/:id - Delete unit (Admin only)
// ============================================================
router.delete('/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    await Unit.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
