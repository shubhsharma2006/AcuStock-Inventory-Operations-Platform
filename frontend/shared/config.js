/**
 * AcuStock Frontend Configuration
 * ================================
 * This file manages environment-specific configuration for the frontend.
 * 
 * For Production:
 * - Update API_BASE_URL and SOCKET_URL to your production server
 * - Set IS_PRODUCTION to true
 * 
 * ⚠️ Never commit production secrets to version control
 */

(function() {
  'use strict';

  // ===============================================
  // ENVIRONMENT DETECTION
  // ===============================================
  const hostname = window.location.hostname;
  const IS_LOCALHOST = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // ===============================================
  // CONFIGURATION
  // ===============================================
  const config = {
    // Set to true when deploying to production
    IS_PRODUCTION: !IS_LOCALHOST,
    
    // API Base URL
    // Development: uses same hostname as browser (localhost or 127.0.0.1)
    // Production: https://your-api-domain.com/api
    API_BASE_URL: IS_LOCALHOST 
      ? `http://${hostname}:5001/api`
      : (window.ACUSTOCK_API_URL || '/api'),
    
    // WebSocket URL for real-time updates
    // Development: uses same hostname as browser
    // Production: https://your-api-domain.com
    SOCKET_URL: IS_LOCALHOST 
      ? `http://${hostname}:5001`
      : (window.ACUSTOCK_SOCKET_URL || window.location.origin),
    
    // Application Info
    APP_NAME: 'AcuStock',
    APP_VERSION: '1.0.0',

    // Login page path (relative, works for all dashboards)
    LOGIN_PAGE: '/admin-html/login.html',
    
    // Session Configuration
    SESSION_CHECK_INTERVAL: 5 * 60 * 1000, // Check session every 5 minutes
    SESSION_TIMEOUT_WARNING: 2 * 60 * 1000, // Warn 2 minutes before timeout
    
    // UI Configuration
    TOAST_DURATION: 4000, // Toast notification duration in ms
    DEBOUNCE_DELAY: 300, // Debounce delay for search inputs
    
    // Pagination defaults
    DEFAULT_PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
    
    // Feature flags
    FEATURES: {
      REALTIME_UPDATES: true,
      NOTIFICATIONS: true,
      DARK_MODE: false, // Coming soon
    }
  };

  // ===============================================
  // VALIDATION
  // ===============================================
  if (config.IS_PRODUCTION) {
    // Production checks
    if (config.API_BASE_URL.includes('localhost') || config.API_BASE_URL.includes('127.0.0.1')) {
      console.warn('⚠️ Production mode detected but API URL points to localhost. Please update config.');
    }
  }

  // ===============================================
  // EXPORT
  // ===============================================
  window.AcuStockConfig = Object.freeze(config);

  // Convenience global — used by script.js, manager.js, user.js
  // Falls back to relative /api for any unknown host (production)
  window.ACUSTOCK_API_URL = config.API_BASE_URL;
  window.ACUSTOCK_SOCKET_URL = config.SOCKET_URL;

  // Log configuration in development
  if (!config.IS_PRODUCTION) {
    console.log('🔧 AcuStock Config:', {
      mode: 'Development',
      apiUrl: config.API_BASE_URL,
      socketUrl: config.SOCKET_URL
    });
  }

})();
