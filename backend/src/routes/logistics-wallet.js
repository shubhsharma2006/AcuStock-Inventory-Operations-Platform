'use strict';

const express = require('express');
const LogisticsWalletService = require('../services/logistics/LogisticsWalletService');
const { requireAuth, requireTenantId } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireAuth);
router.use(requireTenantId);

/**
 * GET /api/logistics-wallet
 * Retrieve tenant's unified logistics wallet details, transactions, and tax invoices.
 */
router.get('/', async (req, res) => {
  try {
    const wallet = await LogisticsWalletService.getOrCreateWallet(req.tenantId);
    res.json({
      success: true,
      wallet
    });
  } catch (err) {
    logger.error('Logistics wallet fetch error:', err);
    res.status(500).json({ message: 'Failed to retrieve logistics wallet' });
  }
});

/**
 * POST /api/logistics-wallet/topup
 * Add prepaid balance to logistics wallet.
 */
router.post('/topup', async (req, res) => {
  try {
    const { amount, paymentMethod, paymentId, notes } = req.body;
    const result = await LogisticsWalletService.topUpWallet({
      tenantId: req.tenantId,
      amount,
      paymentMethod,
      paymentId,
      notes
    });

    res.json({
      success: true,
      message: `Wallet recharged with ₹${result.amount}`,
      data: result
    });
  } catch (err) {
    logger.error('Wallet top-up error:', err);
    res.status(400).json({ message: err.message || 'Failed to recharge wallet' });
  }
});

/**
 * POST /api/logistics-wallet/auto-recharge
 * Update auto-recharge trigger settings.
 */
router.post('/auto-recharge', async (req, res) => {
  try {
    const { enabled, thresholdAmount, topUpAmount, paymentMethod } = req.body;
    const result = await LogisticsWalletService.configureAutoRecharge({
      tenantId: req.tenantId,
      enabled,
      thresholdAmount,
      topUpAmount,
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Auto-recharge configuration updated successfully',
      data: result.autoRecharge
    });
  } catch (err) {
    logger.error('Auto-recharge config error:', err);
    res.status(400).json({ message: err.message || 'Failed to update auto-recharge settings' });
  }
});

/**
 * POST /api/logistics-wallet/debit-freight
 * Debit freight charges for booking/dispatch.
 */
router.post('/debit-freight', async (req, res) => {
  try {
    const { amount, awb, reference, carrier, warehouseId, costCenter, description } = req.body;
    const result = await LogisticsWalletService.debitFreight({
      tenantId: req.tenantId,
      amount,
      awb,
      reference,
      carrier,
      warehouseId,
      costCenter,
      description
    });

    res.json({
      success: true,
      message: `Debited ₹${result.debitedAmount} from logistics wallet`,
      data: result
    });
  } catch (err) {
    logger.error('Freight debit error:', err);
    res.status(400).json({ message: err.message || 'Failed to debit freight from wallet' });
  }
});

/**
 * POST /api/logistics-wallet/generate-invoice
 * Generate consolidated GST tax invoice with SAC 996511 (18% GST).
 */
router.post('/generate-invoice', async (req, res) => {
  try {
    const { month, year, isInterState } = req.body;
    const result = await LogisticsWalletService.generateMonthlyTaxInvoice({
      tenantId: req.tenantId,
      month,
      year,
      isInterState
    });

    res.json({
      success: true,
      message: 'Monthly GST tax invoice generated',
      invoice: result.invoice
    });
  } catch (err) {
    logger.error('Tax invoice generation error:', err);
    res.status(500).json({ message: err.message || 'Failed to generate tax invoice' });
  }
});

/**
 * GET /api/logistics-wallet/spend-analytics
 * Get breakdown of logistics freight spending across carriers and cost centers.
 */
router.get('/spend-analytics', async (req, res) => {
  try {
    const analytics = await LogisticsWalletService.getSpendAnalytics(req.tenantId);
    res.json({
      success: true,
      analytics
    });
  } catch (err) {
    logger.error('Spend analytics error:', err);
    res.status(500).json({ message: 'Failed to retrieve spend analytics' });
  }
});

module.exports = router;
