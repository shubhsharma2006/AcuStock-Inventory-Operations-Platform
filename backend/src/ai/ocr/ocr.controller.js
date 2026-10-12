/**
 * AcuStock AI OCR Controller
 * 
 * Handles invoice and packing slip uploads, performs multimodal OCR,
 * and grounds entities against the authenticated tenant's catalog.
 */

const invoiceExtractor = require('./invoice-extractor');
const SecurityContext = require('../core/context');
const logger = require('../../utils/logger');

exports.extractInvoice = async (req, res) => {
  try {
    const securityContext = SecurityContext.fromRequest(req);

    let fileBuffer;
    let mimeType;
    let originalName;

    if (req.file) {
      fileBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
      originalName = req.file.originalname;
    } else if (req.body && req.body.fileBase64) {
      // Direct base64 upload (e.g. webcam scanner or client-side canvas)
      fileBuffer = Buffer.from(req.body.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      mimeType = req.body.mimeType || 'image/jpeg';
      originalName = req.body.fileName || 'scanned-invoice.jpg';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Please upload an invoice or packing slip file (PNG, JPG, PDF) or provide fileBase64'
      });
    }

    const extraction = await invoiceExtractor.extractInvoice({
      fileBuffer,
      mimeType,
      originalName,
      securityContext
    });

    res.status(200).json({
      success: true,
      message: 'Invoice processed successfully',
      data: extraction
    });
  } catch (err) {
    logger.error('Invoice OCR extraction controller error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to process invoice'
    });
  }
};
