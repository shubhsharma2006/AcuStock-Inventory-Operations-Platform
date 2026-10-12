/**
 * AcuStock AI Module Aggregator
 * 
 * Exports the master Express router and AI services.
 */

const express = require('express');
const router = express.Router();
const copilotRoutes = require('./copilot/copilot.routes');
const ocrRoutes = require('./ocr/ocr.routes');
const whatsappRoutes = require('./whatsapp/whatsapp.routes');
const aiConfig = require('./config/ai.config');

// Mount Sub-routers
router.use('/copilot', copilotRoutes);
router.use('/ocr', ocrRoutes);
router.use('/whatsapp', whatsappRoutes);

// Health & Status endpoint for AI subsystem
router.get('/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'AcuStock AcuBot Core',
    model: aiConfig.model,
    hasLiveKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY),
    features: aiConfig.features
  });
});

module.exports = {
  aiRouter: router,
  aiConfig
};
