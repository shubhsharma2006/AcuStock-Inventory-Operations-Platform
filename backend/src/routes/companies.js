const express = require('express');
const Company = require('../models/Company');
const { requireAuth, requireRole, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/companies - Get all companies (Admin, Manager, and User for dropdowns)
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), async (req, res) => {
  try {
    const { search = '', industry = '' } = req.query;
    const { page, limit } = normalizePaginationQuery(req.query);

    const query = { isActive: true };
    if (req.tenantId) query.tenantId = req.tenantId;

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
    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const company = await Company.findOne(filter)
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
    let { name, email, phone, address, industry, website, taxId } = req.body;

    // Gracefully handle string address or partial address
    if (typeof address === 'string') {
      address = {
        street: address.trim() || 'N/A',
        city: 'N/A',
        state: 'N/A',
        zipCode: '00000',
        country: 'India'
      };
    } else if (address && typeof address === 'object') {
      address = {
        street: address.street?.trim() || 'N/A',
        city: address.city?.trim() || 'N/A',
        state: address.state?.trim() || 'N/A',
        zipCode: address.zipCode?.trim() || '00000',
        country: address.country?.trim() || 'India'
      };
    }

    if (!industry) {
      industry = 'Technology';
    }

    // Explicitly check for required fields from the Company model
    if (!name || !email || !phone || !industry || !address || !address.street || !address.city || !address.state || !address.zipCode || !address.country) {
      return res.status(400).json({ message: 'Missing required company information' });
    }

    // Email format validation (optional, as it's in schema, but good for early feedback)
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if company with this email already exists in this tenant
    const existingFilter = { email: email.toLowerCase() };
    if (req.tenantId) existingFilter.tenantId = req.tenantId;

    const existingCompany = await Company.findOne(existingFilter);
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
      createdBy: req.user._id,
      tenantId: req.tenantId || undefined
    });

    await company.save();

    const populatedFilter = { _id: company._id };
    if (req.tenantId) populatedFilter.tenantId = req.tenantId;

    const populatedCompany = await Company.findOne(populatedFilter)
      .populate('createdBy', 'name email');
    
    // Emit real-time update for new company
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('company-update', {
        action: 'created',
        company: populatedCompany,
        tenantId: req.tenantId,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    logBusinessEvent({
      req,
      action: 'COMPANY_CREATED',
      entityType: 'Company',
      entityId: company._id,
      changes: {
        after: {
          name: company.name,
          email: company.email,
          phone: company.phone
        },
        summary: `Created company "${company.name}"`
      }
    }).catch(() => {});

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

    let normalizedAddress = address;
    if (typeof address === 'string') {
      normalizedAddress = {
        street: address.trim() || 'N/A',
        city: 'N/A',
        state: 'N/A',
        zipCode: '00000',
        country: 'India'
      };
    } else if (address && typeof address === 'object') {
      normalizedAddress = {
        street: address.street?.trim() || 'N/A',
        city: address.city?.trim() || 'N/A',
        state: address.state?.trim() || 'N/A',
        zipCode: address.zipCode?.trim() || '00000',
        country: address.country?.trim() || 'India'
      };
    }

    if (industry !== undefined && (!allowedIndustries.includes(industry) || industry.trim() === '')) {
      return res.status(400).json({ message: 'Invalid or empty industry specified' });
    }

    if (website !== undefined && website.trim() === '') return res.status(400).json({ message: 'Website cannot be empty' });
    if (taxId !== undefined && taxId.trim() === '') return res.status(400).json({ message: 'Tax ID cannot be empty' });

    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const company = await Company.findOne(filter);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Check if email is being changed and if it's already taken by another company in this tenant
    if (email && email.toLowerCase() !== company.email) {
      const emailFilter = { email: email.toLowerCase() };
      if (req.tenantId) emailFilter.tenantId = req.tenantId;

      const existingCompany = await Company.findOne(emailFilter);
      if (existingCompany) {
        return res.status(400).json({ message: 'Company with this email already exists' });
      }
    }

    const beforeState = {
      name: company.name,
      email: company.email,
      phone: company.phone,
      isActive: company.isActive
    };

    company.name     = name     !== undefined ? name     : company.name;
    company.email    = email    !== undefined ? email.toLowerCase() : company.email;
    company.phone    = phone    !== undefined ? phone    : company.phone;
    company.address  = normalizedAddress !== undefined ? normalizedAddress : company.address;
    company.industry = industry !== undefined ? industry : company.industry;
    company.website  = website  !== undefined ? website  : company.website;
    company.taxId    = taxId    !== undefined ? taxId    : company.taxId;
    company.isActive = isActive !== undefined ? isActive : company.isActive;

    await company.save();

    const updatedFilter = { _id: company._id };
    if (req.tenantId) updatedFilter.tenantId = req.tenantId;

    const updatedCompany = await Company.findOne(updatedFilter)
      .populate('createdBy', 'name email');

    logBusinessEvent({
      req,
      action: 'COMPANY_UPDATED',
      entityType: 'Company',
      entityId: company._id,
      changes: {
        before: beforeState,
        after: {
          name: company.name,
          email: company.email,
          phone: company.phone,
          isActive: company.isActive
        },
        summary: `Updated company "${company.name}"`
      }
    }).catch(() => {});

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
    const filter = { _id: req.params.id };
    if (req.tenantId) filter.tenantId = req.tenantId;

    const company = await Company.findOne(filter);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    company.isActive = false;
    await company.save();

    logBusinessEvent({
      req,
      action: 'COMPANY_DELETED',
      entityType: 'Company',
      entityId: company._id,
      changes: {
        summary: `Deactivated company "${company.name}"`
      },
      severity: 'WARNING'
    }).catch(() => {});

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    logger.error('Error deleting company:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
