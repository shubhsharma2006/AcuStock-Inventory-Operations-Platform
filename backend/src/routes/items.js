const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Item = require('../models/Item');
const { requireAuth, requireRole, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');

const router = express.Router();

// ============================================================
// MULTER CONFIGURATION FOR CSV UPLOAD
// ============================================================
const uploadDir = path.join(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'products-' + uniqueSuffix + '.csv');
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || 
      file.originalname.toLowerCase().endsWith('.csv') ||
      file.mimetype === 'application/vnd.ms-excel') {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === 'yes' || lower === '1';
  }
  return false;
}

function parseNumber(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

function transformRow(row, userId, rowIndex) {
  const errors = [];
  const productName = row.productName || row.name || row.ProductName || row.Name || '';
  
  if (!productName.trim()) {
    errors.push('Row ' + rowIndex + ': Product name is required');
  }
  
  const salesPrice = parseNumber(row.salesPrice || row.SalesPrice || row.sellingPrice);
  const purchasePrice = parseNumber(row.purchasePrice || row.PurchasePrice || row.costPrice);
  
  if (salesPrice <= 0) {
    errors.push('Row ' + rowIndex + ': Sales price must be greater than 0');
  }
  
  if (purchasePrice <= 0) {
    errors.push('Row ' + rowIndex + ': Purchase price must be greater than 0');
  }
  
  if (errors.length > 0) {
    return { errors };
  }
  
  return {
    product: {
      name: productName.trim(),
      shortName: (row.shortName || row.ShortName || row.sku || row.SKU || '').trim(),
      hsn: (row.hsnCode || row.HSNCode || row.hsn || row.HSN || '').trim(),
      salesPrice,
      purchasePrice,
      mrp: parseNumber(row.mrp || row.MRP || row.maxPrice, salesPrice),
      warranty: (row.warrantyPeriod || row.warranty || row.Warranty || '').trim(),
      serialPolicy: {
        enableSerial: parseBoolean(row.enableSerial || row.EnableSerial),
        requireSerialOnIN: parseBoolean(row.requireSerialOnIN || row.RequireSerialOnIN),
        requireSerialOnOUT: parseBoolean(row.requireSerialOnOUT || row.RequireSerialOnOUT)
      },
      isActive: true,
      createdBy: userId
    },
    errors: []
  };
}

// ============================================================
// ROUTES - Specific routes BEFORE parameterized routes
// ============================================================

// GET /api/items/dropdown
router.get('/dropdown', requireAuth, async (req, res) => {
  try {
    const items = await Item.find({ isActive: true })
      .select('_id name shortName hsn serialPolicy')
      .sort({ name: 1 })
      .lean();
    res.json(items);
  } catch (error) {
    console.error('Error fetching dropdown items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/product-names - Get unique product names for first dropdown
router.get('/product-names', requireAuth, async (req, res) => {
  try {
    const productNames = await Item.distinct('name', { isActive: true });
    res.json(productNames.sort());
  } catch (error) {
    console.error('Error fetching product names:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/models-by-name/:productName - Get all models for a product name
router.get('/models-by-name/:productName', requireAuth, async (req, res) => {
  try {
    const productName = decodeURIComponent(req.params.productName);
    const items = await Item.find({ 
      name: { $regex: new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isActive: true 
    })
      .select('_id name shortName hsn serialPolicy salesPrice purchasePrice')
      .sort({ shortName: 1 })
      .lean();
    
    // Calculate stock for each item from StockLedger (IN - OUT)
    const StockLedger = require('../models/StockLedger');
    const itemsWithStock = await Promise.all(items.map(async (item) => {
      const stockResult = await StockLedger.aggregate([
        { $match: { productId: item._id } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', { $multiply: ['$quantity', -1] }]
              }
            }
          }
        }
      ]);
      return {
        ...item,
        quantity: stockResult.length > 0 ? Math.max(0, stockResult[0].total) : 0
      };
    }));
    
    res.json(itemsWithStock);
  } catch (error) {
    console.error('Error fetching models by name:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/bulk-upload/template
router.get('/bulk-upload/template', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const template = 'productName,shortName,hsnCode,salesPrice,purchasePrice,mrp,warrantyPeriod,enableSerial,requireSerialOnIN,requireSerialOnOUT\nLaptop Dell XPS 15,DXPS15,8471,85000,75000,90000,12 months,true,true,true\nWireless Mouse Logitech,WMOUSE,8471,800,500,999,6 months,false,false,false\nUSB-C Hub 7-in-1,USBHUB,8471,2500,1800,2999,12 months,true,true,false';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=product-upload-template.csv');
  res.send(template);
});

// POST /api/items/bulk-upload
router.post('/bulk-upload', requireAuth, requireRole(['ADMIN']), upload.single('csvFile'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No CSV file uploaded' });
    }
    
    filePath = req.file.path;
    const products = [];
    const errors = [];
    let rowIndex = 1;
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv({ mapHeaders: ({ header }) => header.trim(), skipEmptyLines: true }))
        .on('data', (row) => {
          rowIndex++;
          const result = transformRow(row, req.user._id, rowIndex);
          if (result.errors && result.errors.length > 0) {
            errors.push(...result.errors);
          } else if (result.product) {
            products.push(result.product);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    
    if (errors.length > 0 && products.length === 0) {
      return res.status(400).json({
        message: 'CSV validation failed',
        errors: errors.slice(0, 20),
        totalErrors: errors.length
      });
    }
    
    if (products.length === 0) {
      return res.status(400).json({ message: 'No valid products found in CSV' });
    }
    
    // Check for duplicates within CSV using name + shortName combination
    const productKeys = products.map(p => `${p.name.toLowerCase()}|${(p.shortName || '').toLowerCase()}`);
    const duplicateKeys = productKeys.filter((key, index) => productKeys.indexOf(key) !== index);
    
    if (duplicateKeys.length > 0) {
      const duplicateProducts = [...new Set(duplicateKeys)].map(key => {
        const [name, shortName] = key.split('|');
        return shortName ? `${name} (${shortName})` : name;
      });
      return res.status(400).json({
        message: 'Duplicate product (name + model) combinations found in CSV',
        duplicates: duplicateProducts.slice(0, 10)
      });
    }
    
    // Check for existing products in database using name + shortName combination
    const existingProducts = await Item.find({
      isActive: true,
      $or: products.map(p => ({
        name: { $regex: new RegExp(`^${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        shortName: { $regex: new RegExp(`^${(p.shortName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }))
    }).select('name shortName');
    
    if (existingProducts.length > 0) {
      return res.status(400).json({
        message: 'Some products already exist in the database (same name + model)',
        existingProducts: existingProducts.map(p => p.shortName ? `${p.name} (${p.shortName})` : p.name).slice(0, 10),
        totalExisting: existingProducts.length
      });
    }
    
    const insertedProducts = await Item.insertMany(products, { ordered: false });
    
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('product-update', {
        action: 'bulk-created',
        count: insertedProducts.length,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }
    
    res.status(201).json({
      message: 'Successfully uploaded ' + insertedProducts.length + ' products',
      count: insertedProducts.length,
      warnings: errors.length > 0 ? errors.slice(0, 10) : undefined,
      warningCount: errors.length > 0 ? errors.length : undefined
    });
    
  } catch (error) {
    console.error('Bulk upload error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate product found.', error: error.message });
    }
    res.status(500).json({ message: 'Failed to process CSV file', error: error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });
    }
  }
});

// ============================================================
// STANDARD CRUD ROUTES
// ============================================================

// GET /api/items
router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await Item.find({ isActive: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const itemsWithStock = await Promise.all(items.map(async (item) => {
      const itemObj = item.toObject();
      const stock = await item.getCurrentStock();
      itemObj.quantity = stock;
      itemObj.currentStock = stock;
      return itemObj;
    }));

    res.json(itemsWithStock);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/items/:id
router.get('/:id', requireAuth, validateObjectId, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate('createdBy', 'name email');
    if (!item || !item.isActive) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/items
router.post('/', requireAuth, requireRole(['ADMIN']), requirePermission('canAddProduct'), async (req, res) => {
  try {
    const { name, shortName, hsn, serialPolicy, salesPrice, purchasePrice, mrp, warranty, lowStockThreshold } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    const item = new Item({
      name:              String(name).trim().slice(0, 100),
      shortName:         shortName  ? String(shortName).trim().slice(0, 50)  : undefined,
      hsn:               hsn        ? String(hsn).trim().slice(0, 20)         : undefined,
      warranty:          warranty   ? String(warranty).trim().slice(0, 100)  : undefined,
      serialPolicy,
      salesPrice,
      purchasePrice,
      mrp,
      lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 10,
      createdBy: req.user._id
    });

    await item.save();
    
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('product-update', {
        action: 'created',
        product: item,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }
    
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/items/:id
router.put('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), requirePermission('canEditProduct'), async (req, res) => {
  try {
    const { name, shortName, hsn, serialPolicy, salesPrice, purchasePrice, mrp, warranty, isActive, lowStockThreshold } = req.body;

    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (name !== undefined) item.name       = String(name).trim().slice(0, 100);
    if (shortName !== undefined) item.shortName  = String(shortName).trim().slice(0, 50);
    if (hsn !== undefined) item.hsn        = String(hsn).trim().slice(0, 20);
    if (warranty !== undefined) item.warranty    = String(warranty).trim().slice(0, 100);

    if (serialPolicy) {
      item.serialPolicy.enableSerial = serialPolicy.enableSerial !== undefined
        ? serialPolicy.enableSerial : item.serialPolicy.enableSerial;
      item.serialPolicy.requireSerialOnIN = serialPolicy.requireSerialOnIN !== undefined
        ? serialPolicy.requireSerialOnIN : item.serialPolicy.requireSerialOnIN;
      item.serialPolicy.requireSerialOnOUT = serialPolicy.requireSerialOnOUT !== undefined
        ? serialPolicy.requireSerialOnOUT : item.serialPolicy.requireSerialOnOUT;
    }

    if (salesPrice    !== undefined) item.salesPrice    = Number(salesPrice);
    if (purchasePrice !== undefined) item.purchasePrice = Number(purchasePrice);
    if (mrp           !== undefined) item.mrp           = Number(mrp);
    if (lowStockThreshold !== undefined) item.lowStockThreshold = Math.max(0, Number(lowStockThreshold));
    if (isActive      !== undefined) item.isActive      = isActive;

    await item.save();
    
    if (global.emitRealTimeUpdate) {
      global.emitRealTimeUpdate('product-update', {
        action: 'updated',
        product: item,
        user: req.user.name || req.user.email,
        timestamp: new Date()
      });
    }

    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/items/:id
router.delete('/:id', requireAuth, validateObjectId, requireRole(['ADMIN']), requirePermission('canDeactivateProduct'), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    item.isActive = false;
    await item.save();

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
