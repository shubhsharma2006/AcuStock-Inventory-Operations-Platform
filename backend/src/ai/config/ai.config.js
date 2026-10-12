/**
 * AcuStock AI Configuration
 * 
 * Centralized settings for AI operations. Model names are configurable via
 * environment variables to prevent vendor lock-in or deprecation breakages.
 */

require('dotenv').config();

module.exports = {
  // Primary conversational and multimodal model
  // Defaults to latest fast reasoning model if not specified in env
  model: process.env.AI_MODEL || 'gemini-2.5-flash',

  // Audio transcription model for voice notes
  transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL || 'gemini-2.5-flash',

  // Vision / Document OCR model (falls back to primary model)
  ocrModel: process.env.AI_OCR_MODEL || process.env.AI_MODEL || 'gemini-2.5-flash',

  // Generation parameters
  defaultTemperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
  maxOutputTokens: parseInt(process.env.AI_MAX_OUTPUT_TOKENS || '2048', 10),

  // Feature Flags
  features: {
    copilotEnabled: process.env.AI_COPILOT_ENABLED !== 'false',
    whatsappEnabled: process.env.AI_WHATSAPP_ENABLED === 'true',
    ocrEnabled: process.env.AI_OCR_ENABLED !== 'false',
    forecastingEnabled: process.env.AI_FORECASTING_ENABLED !== 'false',
  },

  // WhatsApp Meta Cloud API configuration
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'acustock_webhook_verify_token',
    apiToken: process.env.WHATSAPP_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  }
};
