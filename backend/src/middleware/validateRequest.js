/**
 * validateRequest — lightweight request body validation middleware.
 * No external dependencies (avoids adding Zod/Joi to the dependency tree).
 *
 * Usage:
 *   const { validateRequest, schemas } = require('../middleware/validateRequest');
 *   router.post('/in', requireAuth, validateRequest(schemas.stockIn), handler);
 */

const mongoose = require('mongoose');

// ── Helpers ────────────────────────────────────────────────────

function isObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value.trim());
}

function isNonEmptyString(value, maxLen = Infinity) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

function isIntInRange(value, min, max) {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
}

function isStringArray(value, maxItemLen = 100, maxArrayLen = 100_000) {
  if (!Array.isArray(value)) return false;
  if (value.length > maxArrayLen) return false;
  return value.every(item => typeof item === 'string' && item.length <= maxItemLen);
}

// ── Schema Definitions ─────────────────────────────────────────

const schemas = {
  /**
   * Stock IN / OUT body validation
   */
  stockIn: {
    rules: {
      productId: { required: true,  check: isObjectId,       message: 'productId must be a valid 24-char hex string' },
      quantity:  { required: true,  check: v => isIntInRange(v, 1, 100_000), message: 'quantity must be an integer between 1 and 100,000' },
      serialNumbers: { required: false, check: v => isStringArray(v), message: 'serialNumbers must be an array of strings (max 100 chars each)' }
    }
  },

  stockOut: {
    rules: {
      productId: { required: true,  check: isObjectId,       message: 'productId must be a valid 24-char hex string' },
      quantity:  { required: true,  check: v => isIntInRange(v, 1, 100_000), message: 'quantity must be an integer between 1 and 100,000' },
      serialNumbers: { required: false, check: v => isStringArray(v), message: 'serialNumbers must be an array of strings (max 100 chars each)' }
    }
  },

  /**
   * Login body validation
   */
  login: {
    rules: {
      identifier: { required: true, check: v => isNonEmptyString(v, 254), message: 'identifier must be a non-empty string (max 254 chars)' },
      password:   { required: true, check: v => isNonEmptyString(v, 128), message: 'password must be a non-empty string (max 128 chars)' }
    }
  },

  /**
   * Shipment Creation & Status Update validation
   */
  createShipment: {
    rules: {
      productId:    { required: true,  check: isObjectId,                    message: 'productId must be a valid 24-char hex string' },
      productName:  { required: true,  check: v => isNonEmptyString(v, 200), message: 'productName is required (max 200 chars)' },
      quantity:     { required: true,  check: v => isIntInRange(v, 1, 100_000), message: 'quantity must be an integer between 1 and 100,000' },
      customerName: { required: true,  check: v => isNonEmptyString(v, 200), message: 'customerName is required (max 200 chars)' },
      phone:        { required: true,  check: v => isNonEmptyString(v, 25),  message: 'phone is required (max 25 chars)' },
      deliveryType: { required: true,  check: v => ['Prepaid', 'COD', 'ToPay'].includes(v), message: 'deliveryType must be Prepaid, COD, or ToPay' },
      carrierType:  { required: false, check: v => ['PORTER','DELHIVERY','DTDC','BLUEDART','DMRC','IN_HOUSE','OTHER'].includes(v), message: 'Invalid carrierType' },
      boxes:        { required: false, check: v => isIntInRange(v, 1, 10_000), message: 'boxes must be between 1 and 10,000' }
    }
  },

  updateShipmentStatus: {
    rules: {
      status:     { required: true,  check: v => ['PENDING','DISPATCHED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','RETURNED','CANCELLED'].includes(v), message: 'Invalid shipment status' },
      receivedBy: { required: false, check: v => typeof v === 'string' && v.length <= 100, message: 'receivedBy must be max 100 chars' },
      notes:      { required: false, check: v => typeof v === 'string' && v.length <= 500, message: 'notes must be max 500 chars' }
    }
  },

  createCompany: {
    rules: {
      name:  { required: true,  check: v => isNonEmptyString(v, 200), message: 'Company name is required (max 200 chars)' },
      email: { required: false, check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Invalid email format' },
      phone: { required: false, check: v => isNonEmptyString(v, 25), message: 'phone must be max 25 chars' }
    }
  },

  createPurchaseOrder: {
    rules: {
      supplierId: { required: true, check: isObjectId, message: 'supplierId must be a valid ObjectId' },
      items:      { required: true, check: v => Array.isArray(v) && v.length > 0, message: 'items must be a non-empty array' }
    }
  },

  createSalesOrder: {
    rules: {
      customerId: { required: true, check: isObjectId, message: 'customerId must be a valid ObjectId' },
      items:      { required: true, check: v => Array.isArray(v) && v.length > 0, message: 'items must be a non-empty array' }
    }
  },

  updateItem: {
    rules: {
      name:        { required: false, check: v => isNonEmptyString(v, 200), message: 'name must be max 200 chars' },
      price:       { required: false, check: v => typeof v === 'number' && v >= 0, message: 'price must be >= 0' },
      category:    { required: false, check: v => isNonEmptyString(v, 100), message: 'category must be max 100 chars' },
    }
  },

  createWarranty: {
    rules: {
      productId:    { required: true, check: isObjectId, message: 'productId must be a valid ObjectId' },
      serialNumber: { required: true, check: v => isNonEmptyString(v, 100), message: 'serialNumber required (max 100 chars)' },
      expiryDate:   { required: true, check: v => !isNaN(Date.parse(v)), message: 'expiryDate must be a valid date' },
    }
  },

  createWarehouse: {
    rules: {
      name:    { required: true, check: v => isNonEmptyString(v, 200), message: 'Warehouse name required (max 200 chars)' },
      code:    { required: false, check: v => isNonEmptyString(v, 50), message: 'code must be max 50 chars' },
      address: { required: false, check: v => isNonEmptyString(v, 500), message: 'address must be max 500 chars' },
    }
  },

  createUser: {
    rules: {
      name:     { required: true, check: v => isNonEmptyString(v, 200), message: 'name is required (max 200 chars)' },
      email:    { required: false, check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Invalid email format' },
      phone:    { required: false, check: v => isNonEmptyString(v, 25), message: 'phone must be max 25 chars' },
      role:     { required: true, check: v => ['ADMIN', 'MANAGER', 'USER'].includes(v), message: 'role must be ADMIN, MANAGER, or USER' },
      password: { required: true, check: v => isNonEmptyString(v, 128) && v.length >= 8, message: 'password: 8-128 chars' },
    }
  },

  stockTransfer: {
    rules: {
      productId:        { required: true, check: isObjectId, message: 'productId required' },
      quantity:         { required: true, check: v => isIntInRange(v, 1, 100_000), message: 'quantity: 1-100000' },
      fromWarehouseId:  { required: true, check: isObjectId, message: 'fromWarehouseId required' },
      toWarehouseId:    { required: true, check: isObjectId, message: 'toWarehouseId required' },
    }
  },

  createCycleCount: {
    rules: {
      warehouseId: { required: true, check: isObjectId, message: 'warehouseId required' },
    }
  }
};

// ── Middleware Factory ──────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against the given schema.
 *
 * @param {{ rules: Object }} schema — one of the schema objects above
 * @returns {Function} Express middleware (req, res, next)
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    for (const [field, rule] of Object.entries(schema.rules)) {
      const value = body[field];

      // Check required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip optional fields that are absent
      if (value === undefined || value === null) continue;

      // Run the check function
      if (!rule.check(value)) {
        errors.push(rule.message);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
}

const { escapeRegex } = require('../utils/regex');

module.exports = { validateRequest, schemas, escapeRegex };
