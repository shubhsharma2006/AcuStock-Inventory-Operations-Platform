const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const Tenant = require('../models/Tenant');
const { requireAuth, requireRole, requireTenantId, validateObjectId, normalizePaginationQuery } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const { validateCsvBuffer } = require('../services/storage.service');
const { logBusinessEvent } = require('../utils/auditHelper');
const logger = require('../utils/logger');

const router = express.Router();
router.use(requireTenantId);

// ============================================================
// MULTER CONFIGURATION FOR COMPANY BULK UPLOAD
// ============================================================
const uploadDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase() || '.csv';
    cb(null, 'companies-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.csv', '.xlsx', '.xls'];
  const allowedMimes = [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ];
  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel (.xlsx, .xls) files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, files: 1 }
});

function getUploadErrorResponse(error) {
  if (!error) return null;
  const message = error.message || 'Upload failed';
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return { statusCode: 413, error: message || 'File too large' };
    case 'LIMIT_UNEXPECTED_FILE':
      return { statusCode: 400, error: message || 'Unexpected file field' };
    case 'LIMIT_FILE_COUNT':
      return { statusCode: 400, error: message || 'Too many files uploaded' };
    default:
      return { statusCode: 400, error: message || 'Invalid upload' };
  }
}

const handleCompanyUpload = (req, res, next) => {
  upload.fields([{ name: 'csvFile', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, (err) => {
    if (err) {
      const uploadError = getUploadErrorResponse(err);
      return res.status(uploadError.statusCode).json({
        success: false,
        error: uploadError.error,
        details: err.code === 'LIMIT_FILE_SIZE' ? `Maximum allowed size is ${(Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024) / (1024 * 1024)} MB` : undefined
      });
    }

    if (req.files) {
      req.file = (req.files['csvFile'] && req.files['csvFile'][0]) || (req.files['file'] && req.files['file'][0]);
    }

    next();
  });
};

function transformCompanyRow(row, userId, rowIndex) {
  const errors = [];
  const name = (row.name || row.companyName || row.CompanyName || row.Name || '').trim();
  if (!name) {
    errors.push(`Row ${rowIndex}: Company name is required`);
  }

  const email = (row.email || row.Email || '').trim().toLowerCase();
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!email) {
    errors.push(`Row ${rowIndex}: Email is required`);
  } else if (!emailRegex.test(email)) {
    errors.push(`Row ${rowIndex}: Invalid email address "${email}"`);
  }

  const phone = (row.phone || row.Phone || row.contactNumber || '').trim();
  const phoneRegex = /^\+?[\d\s\-()]+$/;
  if (!phone) {
    errors.push(`Row ${rowIndex}: Phone number is required`);
  } else if (!phoneRegex.test(phone)) {
    errors.push(`Row ${rowIndex}: Invalid phone number "${phone}"`);
  }

  const validIndustries = ['Manufacturing', 'Retail', 'Healthcare', 'Technology', 'Construction', 'Other'];
  let industry = (row.industry || row.Industry || '').trim();
  if (!industry || !validIndustries.includes(industry)) {
    industry = 'Technology';
  }

  let website = (row.website || row.Website || '').trim();
  if (website && !/^https?:\/\/.*/.test(website)) {
    website = 'https://' + website;
  }

  const street = (row.street || row.Street || row.address || row.Address || 'N/A').trim();
  const city = (row.city || row.City || 'N/A').trim();
  const state = (row.state || row.State || 'N/A').trim();
  const zipCode = (row.zipCode || row.zip || row.ZipCode || row.pincode || '00000').trim();
  const country = (row.country || row.Country || 'India').trim();
  const taxId = (row.taxId || row.TaxId || row.gstin || row.GSTIN || '').trim();

  if (errors.length > 0) {
    return { errors };
  }

  return {
    company: {
      name,
      email,
      phone,
      address: { street, city, state, zipCode, country },
      industry,
      website: website || undefined,
      taxId: taxId || undefined,
      isActive: true,
      createdBy: userId
    },
    errors: []
  };
}

// GET /api/companies - Get all companies (Admin, Manager, and User for dropdowns)
router.get('/', requireAuth, requireRole(['ADMIN', 'MANAGER', 'USER']), async (req, res) => {
  try {
    const { search = '', industry = '' } = req.query;
    const { page, limit } = normalizePaginationQuery(req.query);

    const query = { isActive: true, tenantId: req.tenantId };

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

// GET /api/companies/bulk-upload/template
router.get('/bulk-upload/template', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  const sampleCompanies = [
    {
      companyName: 'Acme Technologies Pvt Ltd',
      email: 'contact@acmetech.com',
      phone: '+919876543210',
      street: '123 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560001',
      country: 'India',
      industry: 'Technology',
      website: 'https://acmetech.com',
      taxId: '29ABCDE1234F1Z5'
    },
    {
      companyName: 'Apex Manufacturing Solutions',
      email: 'info@apexmanufacturing.com',
      phone: '+919123456789',
      street: '45 Industrial Area Phase II',
      city: 'Pune',
      state: 'Maharashtra',
      zipCode: '411018',
      country: 'India',
      industry: 'Manufacturing',
      website: 'https://apexmanufacturing.com',
      taxId: '27AABCA1234A1Z1'
    },
    {
      companyName: 'Metro Healthcare Supply',
      email: 'orders@metrohealthcare.in',
      phone: '+919811223344',
      street: '78 Ring Road',
      city: 'New Delhi',
      state: 'Delhi',
      zipCode: '110025',
      country: 'India',
      industry: 'Healthcare',
      website: 'https://metrohealthcare.in',
      taxId: '07AAAAA0000A1Z5'
    }
  ];

  if (format === 'xlsx' || format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(sampleCompanies);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Companies');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=companies-upload-template.xlsx');
    return res.send(buffer);
  }

  const template = 'companyName,email,phone,street,city,state,zipCode,country,industry,website,taxId\nAcme Technologies Pvt Ltd,contact@acmetech.com,+919876543210,123 MG Road,Bengaluru,Karnataka,560001,India,Technology,https://acmetech.com,29ABCDE1234F1Z5\nApex Manufacturing Solutions,info@apexmanufacturing.com,+919123456789,45 Industrial Area Phase II,Pune,Maharashtra,411018,India,Manufacturing,https://apexmanufacturing.com,27AABCA1234A1Z1\nMetro Healthcare Supply,orders@metrohealthcare.in,+919811223344,78 Ring Road,New Delhi,Delhi,110025,India,Healthcare,https://metrohealthcare.in,07AAAAA0000A1Z5';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=companies-upload-template.csv');
  res.send(template);
});

// POST /api/companies/bulk-upload
router.post('/bulk-upload', requireAuth, requireRole(['ADMIN']), requirePermission('canAddCompany'), handleCompanyUpload, async (req, res) => {
  let filePath = null;
  const isDryRun = req.query.dryRun === 'true' || req.body?.dryRun === 'true' || req.body?.dryRun === true;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No CSV or Excel file uploaded' });
    }

    filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isExcel = ext === '.xlsx' || ext === '.xls';

    let rawRows = [];

    if (isExcel) {
      const workbook = XLSX.readFile(filePath);
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return res.status(400).json({ success: false, error: 'Excel file contains no sheets' });
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const fileBuffer = await fs.promises.readFile(filePath);
      if (!validateCsvBuffer(fileBuffer)) {
        return res.status(400).json({ success: false, error: 'Uploaded file is not a valid text CSV' });
      }

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv({ mapHeaders: ({ header }) => header.trim(), skipEmptyLines: true }))
          .on('data', (row) => rawRows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });
    }

    const companies = [];
    const errors = [];
    let rowIndex = 1;

    for (const row of rawRows) {
      rowIndex++;
      const result = transformCompanyRow(row, req.user._id, rowIndex);
      if (result.errors && result.errors.length > 0) {
        errors.push(...result.errors);
      } else if (result.company) {
        companies.push(result.company);
      }
    }

    if (errors.length > 0 && companies.length === 0) {
      if (!isDryRun) {
        return res.status(400).json({
          success: false,
          error: `${isExcel ? 'Excel' : 'CSV'} validation failed`,
          errors: errors.slice(0, 20),
          totalErrors: errors.length
        });
      }
    }

    if (companies.length === 0 && !isDryRun) {
      return res.status(400).json({ success: false, error: `No valid companies found in ${isExcel ? 'Excel' : 'CSV'} file` });
    }

    // Check for duplicate names and emails within file
    const companyNames = companies.map(c => c.name.toLowerCase());
    const duplicateNameKeys = companyNames.filter((name, idx) => companyNames.indexOf(name) !== idx);

    const companyEmails = companies.map(c => c.email.toLowerCase());
    const duplicateEmailKeys = companyEmails.filter((email, idx) => companyEmails.indexOf(email) !== idx);

    const duplicateCompanies = [...new Set([...duplicateNameKeys, ...duplicateEmailKeys])];

    if (duplicateCompanies.length > 0 && !isDryRun) {
      return res.status(400).json({
        success: false,
        error: `Duplicate company names or emails found in ${isExcel ? 'Excel' : 'CSV'}`,
        duplicates: duplicateCompanies.slice(0, 10)
      });
    }

    // Check for existing companies in DB for this tenant
    let existingCompanies = [];
    if (companies.length > 0) {
      const duplicateFilter = {
        isActive: true,
        tenantId: req.tenantId,
        $or: [
          ...companies.map(c => ({ name: { $regex: new RegExp(`^${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } })),
          ...companies.map(c => ({ email: c.email.toLowerCase() }))
        ]
      };

      existingCompanies = await Company.find(duplicateFilter).select('name email');
    }

    if (existingCompanies.length > 0 && !isDryRun) {
      return res.status(400).json({
        success: false,
        error: 'Some companies already exist in the database (matching name or email)',
        existingCompanies: existingCompanies.map(c => `${c.name} (${c.email})`).slice(0, 10),
        totalExisting: existingCompanies.length
      });
    }

    // Plan limits validation for maxCompanies
    let planLimitRemaining = null;
    if (req.tenantId && req.tenant) {
      const limit = req.tenant.limits?.maxCompanies;
      if (typeof limit === 'number' && limit !== -1) {
        const currentUsage = req.tenant.usage?.companies ?? (await Company.countDocuments({ tenantId: req.tenantId, isActive: true }));
        planLimitRemaining = Math.max(0, limit - currentUsage);
        const projectedUsage = currentUsage + companies.length;

        if (projectedUsage > limit) {
          return res.status(402).json({
            success: false,
            error: 'Plan limit reached',
            code: 'PLAN_LIMIT_EXCEEDED',
            detail: `Your plan allows up to ${limit} companies. You currently have ${currentUsage} and are trying to import ${companies.length} companies (total: ${projectedUsage}). Upgrade your plan to add more.`,
            limitKey: 'maxCompanies',
            current: currentUsage,
            limit,
            attempted: companies.length,
            remaining: planLimitRemaining
          });
        }
      }
    }

    // Dry Run response
    if (isDryRun) {
      return res.json({
        success: true,
        dryRun: true,
        message: `Dry-run completed: ${companies.length} valid, ${errors.length} validation errors found.`,
        totalRows: rawRows.length,
        validCount: companies.length,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
        duplicates: duplicateCompanies.length > 0 ? duplicateCompanies.slice(0, 10) : [],
        existingInDb: existingCompanies.length > 0 ? existingCompanies.map(c => `${c.name} (${c.email})`).slice(0, 10) : [],
        planLimitRemaining,
        sample: companies.slice(0, 5).map(c => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          industry: c.industry,
          city: c.address?.city,
          state: c.address?.state
        }))
      });
    }

    companies.forEach(c => { c.tenantId = req.tenantId; });

    const insertedCompanies = await Company.insertMany(companies, { ordered: false });

    if (req.tenantId) {
      await Tenant.updateOne(
        { _id: req.tenantId },
        { $inc: { 'usage.companies': insertedCompanies.length } }
      ).catch(() => {});
    }

    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('company-update', {
        action: 'bulk-created',
        count: insertedCompanies.length,
        tenantId: req.tenantId,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    logBusinessEvent({
      req,
      action: 'COMPANY_CREATED',
      entityType: 'Company',
      changes: {
        summary: `Bulk imported ${insertedCompanies.length} companies from ${isExcel ? 'Excel' : 'CSV'}`
      },
      details: {
        count: insertedCompanies.length,
        format: isExcel ? 'XLSX' : 'CSV',
        warningsCount: errors.length
      }
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Successfully uploaded ${insertedCompanies.length} companies`,
      count: insertedCompanies.length,
      format: isExcel ? 'XLSX' : 'CSV',
      warnings: errors.length > 0 ? errors.slice(0, 10) : undefined,
      warningCount: errors.length > 0 ? errors.length : undefined
    });

  } catch (error) {
    logger.error('Bulk upload companies error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Duplicate company found.', details: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to process file', details: error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) logger.error('Error deleting uploaded file:', err);
      });
    }
  }
});

// GET /api/companies/:id - Get single company (Admin, Manager, and User for auto-fill)
router.get('/:id', requireAuth, validateObjectId, requireRole(['ADMIN', 'MANAGER', 'USER']), async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };

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
    const existingFilter = { email: email.toLowerCase(), tenantId: req.tenantId };

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
      tenantId: req.tenantId
    });

    await company.save();

    const populatedFilter = { _id: company._id, tenantId: req.tenantId };

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

    const filter = { _id: req.params.id, tenantId: req.tenantId };

    const company = await Company.findOne(filter);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Check if email is being changed and if it's already taken by another company in this tenant
    if (email && email.toLowerCase() !== company.email) {
      const emailFilter = { email: email.toLowerCase(), tenantId: req.tenantId };

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

    const updatedFilter = { _id: company._id, tenantId: req.tenantId };

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
    const filter = { _id: req.params.id, tenantId: req.tenantId };

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
module.exports.transformCompanyRow = transformCompanyRow;
module.exports.getUploadErrorResponse = getUploadErrorResponse;
