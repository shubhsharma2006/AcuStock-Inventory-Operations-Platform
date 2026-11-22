'use strict';

const express = require('express');
const FreightBooking = require('../models/FreightBooking');
const FreightEngine = require('../services/logistics/FreightEngine');
const EWayBillEngine = require('../services/logistics/EWayBillEngine');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireAuth);
router.use(requireTenantId);

/**
 * POST /api/freight/rates
 * Calculate PTL and FTL freight quotes across commercial vehicles & B2B carriers.
 */
router.post('/rates', async (req, res) => {
  try {
    const { originPincode, destPincode, grossWeightKg, palletCount, boxCount, declaredValue } = req.body;

    if (!originPincode || !destPincode || !grossWeightKg) {
      return res.status(400).json({ message: 'originPincode, destPincode, and grossWeightKg are required' });
    }

    const quotes = FreightEngine.calculateFreightQuotes({
      originPincode,
      destPincode,
      grossWeightKg: Number(grossWeightKg),
      palletCount: Number(palletCount) || 0,
      boxCount: Number(boxCount) || 1,
      declaredValue: Number(declaredValue) || 50000
    });

    res.json({
      success: true,
      ...quotes
    });
  } catch (err) {
    logger.error('Freight rates error:', err);
    res.status(500).json({ message: 'Failed to calculate freight quotes' });
  }
});

/**
 * POST /api/freight/book
 * Book PTL or dedicated FTL cargo with vehicle allocation & automatic E-Way Bill.
 */
router.post('/book', async (req, res) => {
  try {
    const {
      type = 'PTL', // 'PTL' | 'FTL'
      origin,
      destination,
      cargoDetails,
      vehicleDetails = {},
      pricing,
      carrier,
      generateEwb = true
    } = req.body;

    if (!origin?.address || !origin?.pincode || !destination?.address || !destination?.pincode) {
      return res.status(400).json({ message: 'Origin and destination address and pincode are required' });
    }
    if (!cargoDetails?.grossWeightKg) {
      return res.status(400).json({ message: 'cargoDetails.grossWeightKg is required' });
    }

    const bookingNumber = `FRT-${Date.now().toString().slice(-8)}`;
    const lrNumber = `LR-${Date.now().toString().slice(-6)}`;
    const distanceKm = FreightEngine.estimateDistanceKm(origin.pincode, destination.pincode);

    // E-Way Bill Generation if required or requested
    let ewbResult = null;
    const declaredValue = Number(cargoDetails.declaredValue) || 50000;
    const isEwbNeeded = generateEwb || EWayBillEngine.isEWayBillMandatory(declaredValue);

    if (isEwbNeeded && vehicleDetails.vehicleNumber) {
      try {
        ewbResult = EWayBillEngine.generateEWayBill({
          docNo: bookingNumber,
          docDate: new Date(),
          fromGstin: origin.gstin || '27AAAAA0000A1Z5',
          fromTrdName: origin.companyName || 'Origin Consignor',
          fromAddress: origin.address,
          fromPincode: origin.pincode,
          fromState: origin.state || 'Maharashtra',
          toGstin: destination.gstin || 'URP',
          toTrdName: destination.companyName || 'Destination Consignee',
          toAddress: destination.address,
          toPincode: destination.pincode,
          toState: destination.state || 'Karnataka',
          totalValue: declaredValue,
          hsnCode: cargoDetails.hsnCode || '8471',
          distanceKm,
          transporterName: carrier?.name || 'V-Trans Logistics',
          transporterId: carrier?.code || '27VTRNS0000A1Z1',
          vehicleNumber: vehicleDetails.vehicleNumber,
          isOverDimensional: Boolean(cargoDetails.isOverDimensional)
        });
      } catch (ewbErr) {
        logger.warn('E-Way Bill generation warning:', ewbErr.message);
      }
    }

    const booking = await FreightBooking.create({
      bookingNumber,
      type,
      tenantId: req.tenantId,
      origin: {
        warehouseId: origin.warehouseId || null,
        companyName: origin.companyName || '',
        address: origin.address,
        city: origin.city || 'Origin City',
        state: origin.state || 'State',
        pincode: origin.pincode,
        gstin: origin.gstin || '',
        contactPerson: origin.contactPerson || '',
        contactPhone: origin.contactPhone || ''
      },
      destination: {
        warehouseId: destination.warehouseId || null,
        companyName: destination.companyName || '',
        address: destination.address,
        city: destination.city || 'Dest City',
        state: destination.state || 'State',
        pincode: destination.pincode,
        gstin: destination.gstin || '',
        contactPerson: destination.contactPerson || '',
        contactPhone: destination.contactPhone || ''
      },
      cargoDetails: {
        palletCount: Number(cargoDetails.palletCount) || 0,
        boxCount: Number(cargoDetails.boxCount) || 1,
        grossWeightKg: Number(cargoDetails.grossWeightKg),
        volumetricWeightKg: Number(cargoDetails.volumetricWeightKg) || 0,
        cargoType: cargoDetails.cargoType || 'GENERAL',
        declaredValue,
        isFragile: Boolean(cargoDetails.isFragile)
      },
      vehicleDetails: {
        vehicleType: vehicleDetails.vehicleType || (type === 'PTL' ? 'PTL_SHARED_CARGO' : 'TATA_ACE_750KG'),
        vehicleNumber: vehicleDetails.vehicleNumber ? vehicleDetails.vehicleNumber.toUpperCase() : 'DL-01-EA-4921',
        driverName: vehicleDetails.driverName || 'Ramesh Singh',
        driverPhone: vehicleDetails.driverPhone || '+91 9811002233',
        maxPayloadKg: vehicleDetails.maxPayloadKg || 750
      },
      pricing: {
        baseFreight: Number(pricing?.baseFreight) || 1500,
        docketCharge: Number(pricing?.docketCharge) || 250,
        loadingCharges: Number(pricing?.loadingCharges) || 0,
        fuelSurcharge: Number(pricing?.fuelSurcharge) || 150,
        gstAmount: Number(pricing?.gstAmount) || 95,
        totalAmount: Number(pricing?.totalAmount) || 1995
      },
      carrier: {
        transporterId: carrier?.transporterId || null,
        name: carrier?.name || (type === 'PTL' ? 'V-Trans Logistics' : 'Dedicated Fleet'),
        code: carrier?.code || 'VTRANS',
        lrNumber,
        trackingAwb: `CARGO-${lrNumber}`
      },
      ewayBill: ewbResult ? {
        ewbNumber: ewbResult.ewbNumber,
        generatedAt: ewbResult.generatedAt,
        validUpto: ewbResult.validUpto,
        distanceKm: ewbResult.distanceKm,
        qrCodeData: ewbResult.qrCodeData,
        hsnCode: cargoDetails.hsnCode || '8471',
        isOverDimensional: Boolean(cargoDetails.isOverDimensional),
        status: 'ACTIVE'
      } : {
        status: isEwbNeeded ? 'PENDING' : 'NOT_REQUIRED',
        distanceKm
      },
      status: 'ALLOCATED',
      statusHistory: [{
        status: 'ALLOCATED',
        timestamp: new Date(),
        notes: `Cargo booked (${type}). Allocated LR: ${lrNumber}`,
        updatedBy: req.user?.name || 'OPERATIONS'
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Freight cargo booked successfully',
      booking,
      ewayBill: ewbResult
    });
  } catch (err) {
    logger.error('Freight booking error:', err);
    res.status(500).json({ message: err.message || 'Failed to book freight cargo' });
  }
});

/**
 * POST /api/freight/eway-bill/generate
 * Standalone E-Way Bill generation for any invoice, transfer, or cargo load.
 */
router.post('/eway-bill/generate', async (req, res) => {
  try {
    const ewb = EWayBillEngine.generateEWayBill(req.body);
    res.json(ewb);
  } catch (err) {
    logger.error('E-Way Bill generation error:', err);
    res.status(400).json({ message: err.message || 'Failed to generate E-Way Bill' });
  }
});

/**
 * GET /api/freight/bookings
 * List tenant freight bookings with status and E-Way Bill data.
 */
router.get('/bookings', async (req, res) => {
  try {
    const { status, type, limit = 50, page = 1 } = req.query;
    const query = { tenantId: req.tenantId };
    if (status) query.status = status.toUpperCase();
    if (type) query.type = type.toUpperCase();

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [bookings, total] = await Promise.all([
      FreightBooking.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      FreightBooking.countDocuments(query)
    ]);

    res.json({
      success: true,
      bookings,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (err) {
    logger.error('List freight bookings error:', err);
    res.status(500).json({ message: 'Failed to retrieve freight bookings' });
  }
});

module.exports = router;
