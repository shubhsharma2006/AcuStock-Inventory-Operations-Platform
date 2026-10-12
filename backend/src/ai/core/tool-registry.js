/**
 * AcuStock AI Tool Registry
 * 
 * Defines Gemini-compatible function declarations and maps them to secure,
 * tenant-injected execution handlers.
 */

const inventoryTools = require('../tools/inventory.tools');
const ordersTools = require('../tools/orders.tools');
const { logAiEvent } = require('./audit');
const logger = require('../../utils/logger');

// Gemini Function Declarations Schema
const functionDeclarations = [
  {
    name: 'queryStockLevel',
    description: 'Look up current, available, and reserved stock levels for a product by SKU, name, or part number. Also returns active lot/batches for batch-tracked items.',
    parameters: {
      type: 'OBJECT',
      properties: {
        skuOrName: {
          type: 'STRING',
          description: 'The product SKU, name, or search query (e.g., "SKU-400", "Widget Pro")'
        },
        warehouseId: {
          type: 'STRING',
          description: 'Optional warehouse ID to check stock specifically in that facility'
        }
      },
      required: ['skuOrName']
    }
  },
  {
    name: 'checkExpiringLots',
    description: 'Check batch/lot inventory that is expiring soonest within a specified number of days (FEFO priority).',
    parameters: {
      type: 'OBJECT',
      properties: {
        daysAhead: {
          type: 'INTEGER',
          description: 'Lookahead window in days (default: 30 days, max: 365)'
        },
        warehouseId: {
          type: 'STRING',
          description: 'Optional warehouse ID filter'
        }
      }
    }
  },
  {
    name: 'listLowStockItems',
    description: 'Find products in inventory that are at or below their safety stock thresholds.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of low-stock items to retrieve (default: 10)'
        }
      }
    }
  },
  {
    name: 'getOrderStatus',
    description: 'Retrieve full fulfillment details, line item status (ordered, reserved, fulfilled, backordered), and parcel tracking for a Sales Order.',
    parameters: {
      type: 'OBJECT',
      properties: {
        orderNumber: {
          type: 'STRING',
          description: 'The Sales Order number (e.g., "SO-1001")'
        }
      },
      required: ['orderNumber']
    }
  },
  {
    name: 'listBackorders',
    description: 'List active backorders and unfulfilled line items across all open sales orders.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of backorders to retrieve (default: 10)'
        }
      }
    }
  },
  {
    name: 'draftPurchaseOrder',
    description: 'Draft a new Purchase Order for low stock or backordered products. IMPORTANT: Creates a DRAFT document only, allowing the human manager to review and confirm before submission.',
    parameters: {
      type: 'OBJECT',
      properties: {
        supplierNameOrId: {
          type: 'STRING',
          description: 'Supplier name or Company ID to order from'
        },
        items: {
          type: 'ARRAY',
          description: 'List of items and quantities to reorder',
          items: {
            type: 'OBJECT',
            properties: {
              sku: {
                type: 'STRING',
                description: 'Product SKU or name'
              },
              quantity: {
                type: 'INTEGER',
                description: 'Quantity to order'
              }
            },
            required: ['sku', 'quantity']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'analyzeInventoryHealth',
    description: 'Perform a comprehensive health analysis of the entire inventory, including catalog breakdown, safety stock deficit scores, expiring batch risks (FEFO), pending backorders, and executive recommendations.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  }
];

// Mapping from tool name to handler implementation
const toolHandlers = {
  queryStockLevel: inventoryTools.queryStockLevel,
  checkExpiringLots: inventoryTools.checkExpiringLots,
  listLowStockItems: inventoryTools.listLowStockItems,
  analyzeInventoryHealth: inventoryTools.analyzeInventoryHealth,
  getOrderStatus: ordersTools.getOrderStatus,
  listBackorders: ordersTools.listBackorders,
  draftPurchaseOrder: ordersTools.draftPurchaseOrder
};

/**
 * Returns Gemini tools format
 */
function getToolDeclarations() {
  return [{ functionDeclarations }];
}

/**
 * Executes a tool call securely with injected context
 */
async function executeTool(toolName, args, securityContext) {
  const handler = toolHandlers[toolName];
  if (!handler) {
    throw new Error(`Tool "${toolName}" is not registered in AcuStock AI`);
  }

  logger.info(`🤖 AI Executing Tool: [${toolName}] for tenant [${securityContext.tenantId}]`);

  const startTime = Date.now();
  try {
    // Invariant: securityContext is passed directly as first parameter
    const result = await handler(securityContext, args || {});

    // Log to AuditLog
    await logAiEvent({
      action: 'AI_TOOL_EXECUTED',
      context: securityContext,
      toolName,
      parameters: args,
      summary: `AI executed ${toolName} in ${Date.now() - startTime}ms`
    });

    return result;
  } catch (error) {
    logger.error(`AI Tool Execution Error [${toolName}]: ${error.stack || error.message}`);
    return {
      error: `Failed to execute ${toolName}: ${error.message}`
    };
  }
}

module.exports = {
  functionDeclarations,
  getToolDeclarations,
  executeTool
};
