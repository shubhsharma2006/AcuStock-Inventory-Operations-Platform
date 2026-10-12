/**
 * AcuStock WhatsApp Webhook Routes
 * 
 * Meta Cloud API endpoints and simulation harness.
 */

const express = require('express');
const whatsappController = require('./whatsapp.controller');

const router = express.Router();

// Meta Webhook Verification (GET)
router.get('/webhook', whatsappController.verifyWebhook);

// Inbound WhatsApp message receiver (POST)
router.post('/webhook', whatsappController.handleWebhook);

// Simulation endpoint for dev & testing (POST)
router.post('/simulate', whatsappController.simulateMessage);

module.exports = router;
