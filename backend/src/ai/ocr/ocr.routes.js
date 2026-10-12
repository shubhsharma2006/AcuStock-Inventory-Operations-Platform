/**
 * AcuStock AI OCR Routes
 * 
 * Endpoints for invoice extraction, packing slip processing,
 * and automated catalog grounding.
 */

const express = require('express');
const multer = require('multer');
const { requireAuth, requireTenantId } = require('../../middleware/auth');
const checkPlanLimits = require('../../middleware/checkPlanLimits');
const ocrController = require('./ocr.controller');

const router = express.Router();

// Memory storage for immediate streaming to Gemini API
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Please upload PNG, JPG, WEBP, or PDF.'));
    }
  }
});

// POST /api/ai/ocr/invoice-to-stock-in - Upload invoice / packing slip and extract data
router.post(
  '/invoice-to-stock-in',
  requireAuth,
  requireTenantId,
  checkPlanLimits('maxOcrScans'),
  upload.single('invoiceFile'),
  ocrController.extractInvoice
);

module.exports = router;
