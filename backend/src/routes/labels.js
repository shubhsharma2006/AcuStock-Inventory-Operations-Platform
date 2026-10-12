const express = require('express');
const mongoose = require('mongoose');
const ShippingLabel = require('../models/ShippingLabel');
const Package = require('../models/Package');
const SalesOrder = require('../models/SalesOrder');
const Tenant = require('../models/Tenant');
const { requireAuth, requireTenantId, validateObjectId } = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const storageService = require('../services/storage.service');
const { generateShippingLabelPdf, generatePackingSlipPdf } = require('../services/pdfGenerator');
const { logBusinessEvent } = require('../utils/auditHelper');

const router = express.Router();
router.use(requireTenantId);

/**
 * Helper to capture a PDFKit document stream into a Buffer
 */
function streamToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

/**
 * Helper to generate label number: LBL-YYYYMMDD-NNNNN
 */
async function generateLabelNumber(tenantId) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `LBL-${dateStr}-`;

  const count = await ShippingLabel.countDocuments({
    tenantId,
    labelNumber: { $regex: `^${prefix}` }
  });

  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

/**
 * POST /api/labels/generate
 * Generate shipping label and optional packing slip for a package
 */
router.post('/generate', requireAuth, requirePermission('canGenerateShippingLabels'), async (req, res) => {
  try {
    const {
      packageId,
      carrier,
      trackingNumber,
      labelFormat = 'THERMAL_4X6',
      shipFrom: overrideShipFrom,
      shipTo: overrideShipTo,
      weight
    } = req.body;

    if (!packageId || !mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({ error: 'Valid packageId is required' });
    }

    const pkg = await Package.findOne({
      _id: packageId,
      tenantId: req.tenantId
    }).populate('lineItems.productId', 'name sku weight dimensions');

    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    if (pkg.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot generate shipping label for a cancelled package' });
    }

    const salesOrder = await SalesOrder.findOne({
      _id: pkg.salesOrderId,
      tenantId: req.tenantId
    });

    if (!salesOrder) {
      return res.status(404).json({ error: 'Associated Sales Order not found' });
    }

    const tenant = req.tenant || (await Tenant.findById(req.tenantId)) || {};
    const brand = tenant?.branding || {};

    // Determine shipFrom and shipTo
    const shipFrom = overrideShipFrom || {
      name: tenant.name || 'Warehouse Dispatch',
      company: tenant.name || 'Warehouse Dispatch',
      address: brand.address?.street || 'Central Warehouse',
      city: brand.address?.city || 'Industrial Zone',
      state: brand.address?.state || '',
      pincode: brand.address?.pincode || '',
      phone: brand.phone || ''
    };

    const buyer = salesOrder.buyer || {};
    const shipTo = overrideShipTo || {
      name: buyer.name || 'Customer Recipient',
      company: buyer.company || '',
      address: buyer.address || 'Delivery Address',
      city: buyer.city || '',
      state: buyer.state || '',
      pincode: buyer.pincode || '',
      phone: buyer.phone || ''
    };

    const finalCarrier = (carrier || pkg.carrier || 'STANDARD').toUpperCase();
    const finalTrackingNumber = trackingNumber || pkg.trackingNumber || `TRK-${Date.now().toString().slice(-8)}`;

    const labelNumber = await generateLabelNumber(req.tenantId);

    const totalUnits = (pkg.lineItems || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    const finalWeight = weight !== undefined ? weight : (pkg.weight || 0);

    const labelPdfData = {
      labelNumber,
      carrier: finalCarrier,
      trackingNumber: finalTrackingNumber,
      packageNumber: pkg.packageNumber,
      soNumber: salesOrder.soNumber,
      shipFrom,
      shipTo,
      weight: finalWeight,
      totalUnits
    };

    // 1. Generate 4x6 Thermal Label PDF
    const thermalDoc = await generateShippingLabelPdf(labelPdfData, tenant);
    const thermalBuffer = await streamToBuffer(thermalDoc);

    const thermalStorage = await storageService.putObject({
      key: `shipping-labels/${labelNumber}.pdf`,
      body: thermalBuffer,
      contentType: 'application/pdf',
      tenantId: req.tenantId
    });

    let packingSlipStorageKey = undefined;

    // 2. Generate A4 Packing Slip PDF if requested
    if (labelFormat === 'A4_PACKING_SLIP' || labelFormat === 'BOTH') {
      const packingDoc = generatePackingSlipPdf(pkg, salesOrder, tenant);
      const packingBuffer = await streamToBuffer(packingDoc);

      const packingStorage = await storageService.putObject({
        key: `packing-slips/${pkg.packageNumber}.pdf`,
        body: packingBuffer,
        contentType: 'application/pdf',
        tenantId: req.tenantId
      });
      packingSlipStorageKey = packingStorage.key;
    }

    // Void any existing generated label for this package
    await ShippingLabel.updateMany(
      { tenantId: req.tenantId, packageId: pkg._id, status: 'GENERATED' },
      { $set: { status: 'VOIDED' } }
    );

    // Create new ShippingLabel document
    const shippingLabel = await ShippingLabel.create({
      labelNumber,
      packageId: pkg._id,
      salesOrderId: salesOrder._id,
      carrier: finalCarrier,
      trackingNumber: finalTrackingNumber,
      labelFormat,
      pdfStorageKey: thermalStorage.key,
      packingSlipStorageKey,
      status: 'GENERATED',
      shipFrom,
      shipTo,
      metadata: {
        weight: finalWeight,
        totalUnits,
        dimensions: pkg.dimensions?.length ? `${pkg.dimensions.length}x${pkg.dimensions.width}x${pkg.dimensions.height} cm` : undefined
      },
      createdBy: req.user._id,
      tenantId: req.tenantId
    });

    // Update package with carrier, tracking, and label reference
    pkg.carrier = finalCarrier;
    pkg.trackingNumber = finalTrackingNumber;
    pkg.shippingLabelId = shippingLabel._id;
    if (finalWeight) pkg.weight = finalWeight;
    await pkg.save();

    await logBusinessEvent({
      action: 'LABEL_GENERATED',
      entityType: 'ShippingLabel',
      entityId: shippingLabel._id,
      tenantId: req.tenantId,
      userId: req.user._id,
      changes: {
        labelNumber,
        packageNumber: pkg.packageNumber,
        carrier: finalCarrier,
        trackingNumber: finalTrackingNumber,
        format: labelFormat
      }
    });

    res.status(201).json({
      success: true,
      label: shippingLabel,
      package: pkg
    });
  } catch (err) {
    console.error('Error generating shipping label:', err);
    res.status(500).json({ error: err.message || 'Failed to generate shipping label' });
  }
});

/**
 * GET /api/labels/package/:packageId
 * Get current active shipping label for a package
 */
router.get('/package/:packageId', requireAuth, requirePermission('canViewProducts'), async (req, res) => {
  try {
    const { packageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({ error: 'Invalid packageId' });
    }

    const label = await ShippingLabel.findOne({
      tenantId: req.tenantId,
      packageId,
      status: 'GENERATED'
    }).sort({ createdAt: -1 });

    if (!label) {
      return res.status(404).json({ error: 'No active shipping label found for this package' });
    }

    res.json(label);
  } catch (err) {
    console.error('Error fetching package shipping label:', err);
    res.status(500).json({ error: 'Failed to fetch shipping label' });
  }
});

/**
 * GET /api/labels/:id/download
 * Download or stream PDF for a shipping label or packing slip
 */
router.get('/:id/download', requireAuth, requirePermission('canViewProducts'), async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'label' } = req.query; // 'label' or 'packing_slip'

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid label ID' });
    }

    const label = await ShippingLabel.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!label) {
      return res.status(404).json({ error: 'Shipping label not found' });
    }

    const storageKey = type === 'packing_slip' ? label.packingSlipStorageKey : label.pdfStorageKey;

    if (!storageKey) {
      return res.status(404).json({ error: `No ${type} PDF available for this record` });
    }

    const fileBuffer = await storageService.getObjectBuffer({
      key: storageKey,
      tenantId: req.tenantId
    });

    const filename = type === 'packing_slip'
      ? `packing-slip-${label.labelNumber}.pdf`
      : `shipping-label-${label.labelNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error('Error downloading shipping label PDF:', err);
    res.status(500).json({ error: 'Failed to download PDF document' });
  }
});

/**
 * POST /api/labels/:id/regenerate
 * Regenerate shipping label with optional new carrier/tracking
 */
router.post('/:id/regenerate', requireAuth, requirePermission('canGenerateShippingLabels'), async (req, res) => {
  try {
    const { id } = req.params;
    const { carrier, trackingNumber, labelFormat } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid label ID' });
    }

    const existingLabel = await ShippingLabel.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!existingLabel) {
      return res.status(404).json({ error: 'Shipping label not found' });
    }

    // Call generate logic with existing packageId and overrides
    req.body.packageId = existingLabel.packageId;
    if (!carrier) req.body.carrier = existingLabel.carrier;
    if (!trackingNumber) req.body.trackingNumber = existingLabel.trackingNumber;
    if (!labelFormat) req.body.labelFormat = existingLabel.labelFormat;

    // Void existing
    existingLabel.status = 'VOIDED';
    await existingLabel.save();

    await logBusinessEvent({
      action: 'LABEL_REGENERATED',
      entityType: 'ShippingLabel',
      entityId: existingLabel._id,
      tenantId: req.tenantId,
      userId: req.user._id,
      changes: {
        voidedLabel: existingLabel.labelNumber,
        newCarrier: req.body.carrier
      }
    });

    // Forward to creation
    const pkg = await Package.findOne({
      _id: existingLabel.packageId,
      tenantId: req.tenantId
    }).populate('lineItems.productId', 'name sku weight dimensions');

    const salesOrder = await SalesOrder.findOne({
      _id: pkg.salesOrderId,
      tenantId: req.tenantId
    });

    const tenant = req.tenant || (await Tenant.findById(req.tenantId)) || {};
    const labelNumber = await generateLabelNumber(req.tenantId);

    const finalCarrier = (req.body.carrier || pkg.carrier || 'STANDARD').toUpperCase();
    const finalTrackingNumber = req.body.trackingNumber || pkg.trackingNumber || `TRK-${Date.now().toString().slice(-8)}`;
    const finalFormat = req.body.labelFormat || existingLabel.labelFormat;

    const totalUnits = (pkg.lineItems || []).reduce((sum, item) => sum + (item.quantity || 0), 0);

    const labelPdfData = {
      labelNumber,
      carrier: finalCarrier,
      trackingNumber: finalTrackingNumber,
      packageNumber: pkg.packageNumber,
      soNumber: salesOrder.soNumber,
      shipFrom: existingLabel.shipFrom,
      shipTo: existingLabel.shipTo,
      weight: existingLabel.metadata?.weight || pkg.weight || 0,
      totalUnits
    };

    const thermalDoc = await generateShippingLabelPdf(labelPdfData, tenant);
    const thermalBuffer = await streamToBuffer(thermalDoc);

    const thermalStorage = await storageService.putObject({
      key: `shipping-labels/${labelNumber}.pdf`,
      body: thermalBuffer,
      contentType: 'application/pdf',
      tenantId: req.tenantId
    });

    let packingSlipStorageKey = undefined;
    if (finalFormat === 'A4_PACKING_SLIP' || finalFormat === 'BOTH') {
      const packingDoc = generatePackingSlipPdf(pkg, salesOrder, tenant);
      const packingBuffer = await streamToBuffer(packingDoc);

      const packingStorage = await storageService.putObject({
        key: `packing-slips/${pkg.packageNumber}.pdf`,
        body: packingBuffer,
        contentType: 'application/pdf',
        tenantId: req.tenantId
      });
      packingSlipStorageKey = packingStorage.key;
    }

    const newLabel = await ShippingLabel.create({
      labelNumber,
      packageId: pkg._id,
      salesOrderId: salesOrder._id,
      carrier: finalCarrier,
      trackingNumber: finalTrackingNumber,
      labelFormat: finalFormat,
      pdfStorageKey: thermalStorage.key,
      packingSlipStorageKey,
      status: 'GENERATED',
      shipFrom: existingLabel.shipFrom,
      shipTo: existingLabel.shipTo,
      metadata: existingLabel.metadata,
      createdBy: req.user._id,
      tenantId: req.tenantId
    });

    pkg.carrier = finalCarrier;
    pkg.trackingNumber = finalTrackingNumber;
    pkg.shippingLabelId = newLabel._id;
    await pkg.save();

    res.status(201).json({
      success: true,
      label: newLabel,
      package: pkg
    });
  } catch (err) {
    console.error('Error regenerating shipping label:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate shipping label' });
  }
});

module.exports = router;
