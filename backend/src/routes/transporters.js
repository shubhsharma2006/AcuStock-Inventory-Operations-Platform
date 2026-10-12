const express = require('express');
const mongoose = require('mongoose');
const Transporter = require('../models/Transporter');
const { requireAuth, requireRole, requireTenantId, validateObjectId } = require('../middleware/auth');

const router = express.Router();
router.use(requireTenantId);

// GET /api/transporters - List transporters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { all } = req.query;
    const filter = { tenantId: req.tenantId };
    if (all !== 'true') filter.isActive = true;

    let transporters = await Transporter.find(filter)
      .populate('createdBy', 'name email')
      .sort({ name: 1 });

    // Auto-seed default industry carriers if tenant has none
    if (transporters.length === 0 && req.tenantId && req.user) {
      const DEFAULT_TRANSPORTERS = [
        { name: 'Porter (Hyperlocal Logistics)', code: 'PORTER', trackingUrlPattern: 'https://porter.in/track/{awb}', contactPerson: 'Porter Desk', phone: '08044114411', notes: 'Intra-city on-demand 2-wheelers, 3-wheelers & mini trucks' },
        { name: 'Delhivery', code: 'DELHIVERY', trackingUrlPattern: 'https://www.delhivery.com/track/package/{awb}', contactPerson: 'Delhivery Desk', phone: '01246719500', notes: 'National B2B/B2C Express & Heavy Surface Cargo' },
        { name: 'DTDC Express', code: 'DTDC', trackingUrlPattern: 'https://www.dtdc.in/tracking/shipment-tracking.asp?strCnno={awb}', contactPerson: 'DTDC Desk', phone: '08025365032', notes: 'Domestic Express & Plus Cargo' },
        { name: 'DMRC Transit Cargo', code: 'DMRC', trackingUrlPattern: '', contactPerson: 'Metro Transit Hub', phone: '155370', notes: 'Metro parcel corridor & local transit runners' },
        { name: 'Blue Dart', code: 'BLUEDART', trackingUrlPattern: 'https://www.bluedart.com/tracking?numbers={awb}', contactPerson: 'Blue Dart Support', phone: '18602331234', notes: 'Aviation Air Express & Priority Delivery' },
        { name: 'In-House Company Fleet', code: 'IN_HOUSE', trackingUrlPattern: '', contactPerson: 'Dispatch Manager', phone: '', notes: 'Dedicated company vehicles & local runners' }
      ];

      try {
        await Transporter.insertMany(
          DEFAULT_TRANSPORTERS.map(t => ({
            ...t,
            createdBy: req.user._id,
            tenantId: req.tenantId
          }))
        );
        transporters = await Transporter.find(filter).populate('createdBy', 'name email').sort({ name: 1 });
      } catch (_) {
        // Silently continue if concurrency race
      }
    }

    res.json(transporters);
  } catch (error) {
    console.error('Error fetching transporters:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/transporters/:id - Single transporter
router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter).populate('createdBy', 'name email');
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }

    res.json(transporter);
  } catch (error) {
    console.error('Error fetching transporter:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/transporters - Create transporter
router.post('/', requireAuth, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { name, code, trackingUrlPattern, contactPerson, phone, email, gstin, notes } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Transporter name is required' });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({ message: 'Transporter code is required' });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    // Check duplicate code within tenant
    const duplicateFilter = { code: normalizedCode, isActive: true, tenantId: req.tenantId };
    const existing = await Transporter.findOne(duplicateFilter);
    if (existing) {
      return res.status(400).json({ message: `Transporter code '${normalizedCode}' already exists` });
    }

    const transporter = new Transporter({
      name: String(name).trim().slice(0, 100),
      code: normalizedCode,
      trackingUrlPattern: trackingUrlPattern ? String(trackingUrlPattern).trim() : '',
      contactPerson: contactPerson ? String(contactPerson).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      gstin: gstin ? String(gstin).trim().toUpperCase() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      createdBy: req.user._id,
      tenantId: req.tenantId
    });

    await transporter.save();
    res.status(201).json(transporter);
  } catch (error) {
    console.error('Error creating transporter:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate transporter code' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/transporters/:id - Update transporter
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER']), async (req, res) => {
  try {
    const { name, code, trackingUrlPattern, contactPerson, phone, email, gstin, notes, isActive } = req.body;

    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter);
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }

    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase();
      if (normalizedCode !== transporter.code) {
        const existing = await Transporter.findOne({
          code: normalizedCode,
          _id: { $ne: transporter._id },
          tenantId: transporter.tenantId,
          isActive: true
        });
        if (existing) {
          return res.status(400).json({ message: `Transporter code '${normalizedCode}' is already in use` });
        }
        transporter.code = normalizedCode;
      }
    }

    if (name !== undefined) transporter.name = String(name).trim().slice(0, 100);
    if (trackingUrlPattern !== undefined) transporter.trackingUrlPattern = String(trackingUrlPattern).trim();
    if (contactPerson !== undefined) transporter.contactPerson = String(contactPerson).trim();
    if (phone !== undefined) transporter.phone = String(phone).trim();
    if (email !== undefined) transporter.email = String(email).trim().toLowerCase();
    if (gstin !== undefined) transporter.gstin = String(gstin).trim().toUpperCase();
    if (notes !== undefined) transporter.notes = String(notes).trim();
    if (isActive !== undefined) transporter.isActive = Boolean(isActive);

    await transporter.save();
    res.json({ message: 'Transporter updated successfully', transporter });
  } catch (error) {
    console.error('Error updating transporter:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/transporters/:id - Soft-delete transporter
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const transporter = await Transporter.findOne(filter);
    if (!transporter) {
      return res.status(404).json({ message: 'Transporter not found' });
    }

    transporter.isActive = false;
    await transporter.save();

    res.json({ message: 'Transporter deactivated successfully' });
  } catch (error) {
    console.error('Error deleting transporter:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
