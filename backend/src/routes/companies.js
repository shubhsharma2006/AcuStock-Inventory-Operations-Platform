const express = require('express');
const Company = require('../models/Company');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/companies - Get all companies (Admin, Manager, and User for dropdowns)
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', industry = '' } = req.query;

    const query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (industry) query.industry = industry;

    const companies = await Company.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Company.countDocuments(query);

    res.json({
      companies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    logger.error('Error fetching companies:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/companies/:id - Get single company (Admin, Manager, and User for auto-fill)
router.get('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER', 'USER']), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json(company);
  } catch (error) {
    logger.error('Error fetching company:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/companies - Create new company (Admin only)
router.post('/', requireAuth, requireRole(['ADMIN']), requirePermission('canAddCompany'), async (req, res) => {
  try {
    const { name, email, phone, address, industry, website, taxId } = req.body;

    // Explicitly check for required fields from the Company model
    if (!name || !email || !phone || !industry || !address || !address.street || !address.city || !address.state || !address.zipCode || !address.country) {
      return res.status(400).json({ message: 'Missing required company information' });
    }

    // Email format validation (optional, as it's in schema, but good for early feedback)
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if company with this email already exists
    const existingCompany = await Company.findOne({ email: email.toLowerCase() });
    if (existingCompany) {
      return res.status(400).json({ message: 'Company with this email already exists' });
    }

    const company = new Company({
      name,
      email: email.toLowerCase(),
      phone,
      address,
      industry,
      website,
      taxId,
      createdBy: req.user._id
    });

    await company.save();

    const populatedCompany = await Company.findById(company._id)
      .populate('createdBy', 'name email');
    
    // Emit real-time update for new company
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('company-update', {
        action: 'created',
        company: populatedCompany,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      message: 'Company created successfully',
      company: populatedCompany
    });
  } catch (error) {
    logger.error('Error creating company:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/companies/:id - Update company (Admin only)
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), requirePermission('canEditCompany'), async (req, res) => {
  try {
    const { name, email, phone, address, industry, website, taxId, isActive } = req.body;
    const { id } = req.params;

    // Validation
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    const allowedIndustries = ['Manufacturing', 'Retail', 'Healthcare', 'Technology', 'Construction', 'Other'];

    if (name !== undefined && name.trim() === '') return res.status(400).json({ message: 'Company name cannot be empty' });

    if (email !== undefined) {
      if (!emailRegex.test(email)) return res.status(400).json({ message: 'Invalid email format' });
    }

    if (phone !== undefined) {
      if (phone.trim() === '') return res.status(400).json({ message: 'Phone number cannot be empty' });
      if (!phoneRegex.test(phone)) return res.status(400).json({ message: 'Invalid phone number format' });
    }

    if (address !== undefined) {
      if (address.street !== undefined && address.street.trim() === '') return res.status(400).json({ message: 'Street cannot be empty' });
      if (address.city !== undefined && address.city.trim() === '') return res.status(400).json({ message: 'City cannot be empty' });
      if (address.state !== undefined && address.state.trim() === '') return res.status(400).json({ message: 'State cannot be empty' });
      if (address.zipCode !== undefined && address.zipCode.trim() === '') return res.status(400).json({ message: 'Zip Code cannot be empty' });
      if (address.country !== undefined && address.country.trim() === '') return res.status(400).json({ message: 'Country cannot be empty' });
    }

    if (industry !== undefined && (!allowedIndustries.includes(industry) || industry.trim() === '')) {
      return res.status(400).json({ message: 'Invalid or empty industry specified' });
    }

    if (website !== undefined && website.trim() === '') return res.status(400).json({ message: 'Website cannot be empty' });
    if (taxId !== undefined && taxId.trim() === '') return res.status(400).json({ message: 'Tax ID cannot be empty' });


    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Check if email is being changed and if it's already taken by another company
    if (email && email.toLowerCase() !== company.email) {
      const existingCompany = await Company.findOne({ email: email.toLowerCase() });
      if (existingCompany) {
        return res.status(400).json({ message: 'Company with this email already exists' });
      }
    }

    company.name     = name     !== undefined ? name     : company.name;
    company.email    = email    !== undefined ? email.toLowerCase() : company.email;
    company.phone    = phone    !== undefined ? phone    : company.phone;
    company.address  = address  !== undefined ? address  : company.address;
    company.industry = industry !== undefined ? industry : company.industry;
    company.website  = website  !== undefined ? website  : company.website;
    company.taxId    = taxId    !== undefined ? taxId    : company.taxId;
    company.isActive = isActive !== undefined ? isActive : company.isActive;

    await company.save();

    const updatedCompany = await Company.findById(company._id)
      .populate('createdBy', 'name email');

    res.json({
      message: 'Company updated successfully',
      company: updatedCompany
    });
  } catch (error) {
    logger.error('Error updating company:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/companies/:id - Soft delete company (Admin only)
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    company.isActive = false;
    await company.save();

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    logger.error('Error deleting company:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
