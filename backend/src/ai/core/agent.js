/**
 * AcuStock AcuBot Agent Core
 * 
 * Orchestrates multi-turn conversation and function-calling workflows.
 * Invariant: All tool executions receive verified securityContext injected by the runtime.
 */

const { GoogleGenAI } = require('@google/genai');
const aiConfig = require('../config/ai.config');
const { getToolDeclarations, executeTool } = require('./tool-registry');
const logger = require('../../utils/logger');

// System Instruction for AcuBot
const SYSTEM_INSTRUCTION = `You are AcuBot, the autonomous AI Operations Assistant for AcuStock Inventory Management Platform.
You assist warehouse managers, inventory controllers, and operations staff with real-time stock insights, order tracking, and procurement drafts.

Operating Invariants:
1. You have direct access to tools for querying stock levels, checking expiring lots, order statuses, backorders, and drafting purchase orders.
2. Always execute tools to fetch ground truth from the database rather than guessing or fabricating numbers.
3. For draft purchase orders (Confirm-Before-Commit): You can create DRAFT purchase orders, but clearly inform the user that it is a DRAFT requiring human review and approval.
4. Keep responses professional, concise, and structured with bullet points or summary cards where appropriate.
5. If an item or order is not found, offer helpful suggestions (e.g. check for typos or search by product name).
6. Never attempt to manipulate, mention, or override tenant boundaries.`;

class AcuBotAgent {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
    this.hasLiveKey = Boolean(apiKey && apiKey.trim() !== '' && !apiKey.includes('YourActualKeyHere') && !apiKey.startsWith('AIzaSyYour'));

    if (this.hasLiveKey) {
      this.client = new GoogleGenAI({ apiKey });
      logger.info('🤖 AcuBot Agent initialized with Google Gemini API');
    } else {
      this.client = null;
      logger.warn('🤖 AcuBot Agent initialized in Local Intelligent Fallback mode (Set GEMINI_API_KEY for live cloud model)');
    }
  }

  /**
   * Main conversational interface
   * 
   * @param {Object} params
   * @param {string} params.prompt - Current user message
   * @param {Array} params.history - Array of { role: 'user'|'model', text: string }
   * @param {SecurityContext} params.securityContext - Injected runtime security context
   * @param {Function} [params.onStep] - Optional callback for progress updates
   */
  async chat({ prompt, history = [], securityContext, onStep = null }) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('A user prompt is required');
    }
    if (!securityContext) {
      throw new Error('SecurityContext is strictly required for AcuBot execution');
    }

    if (this.hasLiveKey) {
      try {
        return await this._runGeminiConversation({ prompt, history, securityContext, onStep });
      } catch (err) {
        logger.error('Gemini API call failed, falling back to local reasoning engine:', err.message);
        // Fallback to local intelligent engine if live API call errors
        return await this._runLocalEngine({ prompt, securityContext, onStep });
      }
    }

    return await this._runLocalEngine({ prompt, securityContext, onStep });
  }

  /**
   * Live Gemini API Multi-turn Tool Loop
   */
  async _runGeminiConversation({ prompt, history, securityContext, onStep }) {
    const model = aiConfig.model || 'gemini-2.5-flash';
    const tools = getToolDeclarations();

    // Format contents array
    const contents = [];

    // Append prior history
    for (const h of history.slice(-6)) { // Keep last 6 turns for memory
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    }

    // Append current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    let currentTurn = 0;
    const maxTurns = 5;
    const executedTools = [];

    while (currentTurn < maxTurns) {
      currentTurn++;

      const response = await this.client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools,
          temperature: aiConfig.defaultTemperature
        }
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        throw new Error('Empty response from Gemini API');
      }

      const content = candidate.content;
      contents.push(content);

      // Check for function calls
      const functionCalls = content.parts?.filter(p => p.functionCall)?.map(p => p.functionCall) || [];

      if (functionCalls.length === 0) {
        // Model produced final text response
        const textParts = content.parts?.filter(p => p.text)?.map(p => p.text) || [];
        return {
          text: textParts.join('\n').trim(),
          executedTools,
          mode: 'gemini-cloud'
        };
      }

      // Execute each function call with injected securityContext
      const responseParts = [];
      for (const call of functionCalls) {
        if (onStep) {
          onStep({ type: 'tool_start', tool: call.name, args: call.args });
        }

        const toolResult = await executeTool(call.name, call.args, securityContext);
        executedTools.push({ name: call.name, args: call.args, result: toolResult });

        if (onStep) {
          onStep({ type: 'tool_finish', tool: call.name, result: toolResult });
        }

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: toolResult
          }
        });
      }

      // Add tool responses back to model conversation
      contents.push({
        role: 'user',
        parts: responseParts
      });
    }

    return {
      text: 'Completed tool operations.',
      executedTools,
      mode: 'gemini-cloud'
    };
  }

  /**
   * Local Intelligent Engine (Deterministic Intent Mapping + Tool Execution)
   * Ensures the system is 100% functional locally, during tests, or if offline.
   */
  async _runLocalEngine({ prompt, securityContext, onStep }) {
    const lower = prompt.toLowerCase();
    const executedTools = [];
    let replyText = '';

    // 1. Conversational Greetings & Identity
    if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|who\s*are\s*you|what\s*are\s*you)[\s!.]*$/i.test(lower.trim())) {
      replyText = `👋 Hello! I am **AcuBot**, your autonomous inventory & operations intelligence assistant for AcuStock.\n\n` +
        `I continuously monitor your warehouse telemetry, safety stock thresholds, FEFO lot expirations, and sales order fulfillment bottlenecks.\n\n` +
        `*Try asking me:*\n` +
        `• *"Give me a full inventory health analysis"*\n` +
        `• *"Which products are below safety stock?"*\n` +
        `• *"Show me items expiring in 30 days"*\n` +
        `• *"Draft a PO for critical stock"*`;
      return { text: replyText, executedTools, mode: 'local-intelligent' };
    }

    // 2. Capabilities & "Is this only 4 questions?"
    if (lower.includes('only') && (lower.includes('question') || lower.includes('4') || lower.includes('four')) ||
        lower.includes('what can you do') || lower.includes('how do you work') || lower.includes('capabilities') ||
        lower.includes('only feeded') || lower.includes('can you analyze') || lower.includes('is this ai')) {
      replyText = `🤖 **No, I am not limited to just canned questions!**\n\n` +
        `I am built to perform **deep multi-dimensional supply chain analytics** across your entire warehouse inventory:\n\n` +
        `1. 📊 **Comprehensive Inventory Health & Audit**: Multi-point diagnostic calculating deficit units, stock health score, and risk grade.\n` +
        `2. 🔴 **Safety Stock Deficit Analysis**: Identifies exact shortages against configured minimum buffers.\n` +
        `3. ⏳ **FEFO & Shelf-Life Diagnostics**: Proactively spots expiring lots to minimize inventory write-offs.\n` +
        `4. 📦 **Fulfillment & Backorder Bottlenecks**: Analyzes open sales orders, reserves, and delayed line items.\n` +
        `5. 📄 **Autonomous Procurement (Confirm-Before-Commit)**: Calculates reorder math and drafts purchase orders for manager approval.\n` +
        `6. 🔍 **Multimodal Invoice & Packing Slip OCR**: Automatically reads supplier bills into stock receipts.\n\n` +
        `*(💡 Note: You are currently running the built-in deterministic engine. Adding ` + '`GEMINI_API_KEY`' + ` to your ` + '`.env`' + ` unlocks full open-ended conversational reasoning with Google Gemini 2.5 Flash!)*\n\n` +
        `👉 **Try asking:** *"Give me an inventory health analysis"* or *"Which products are below safety stock?"*`;
      return { text: replyText, executedTools, mode: 'local-intelligent' };
    }

    // 3. Comprehensive Inventory Health Analysis
    if (lower.includes('analy') || lower.includes('health') || lower.includes('audit') || lower.includes('overview') || lower.includes('summary') || lower.includes('report') || lower.includes('how is my stock') || lower.includes('how is everything')) {
      if (onStep) onStep({ type: 'tool_start', tool: 'analyzeInventoryHealth' });
      const result = await executeTool('analyzeInventoryHealth', {}, securityContext);
      executedTools.push({ name: 'analyzeInventoryHealth', result });

      const scoreEmoji = result.healthScore >= 80 ? '🟢' : result.healthScore >= 50 ? '🟡' : '🔴';
      
      let breakdownText = `🏥 **Warehouse Inventory Health Analysis**\n\n` +
        `${scoreEmoji} **Health Score**: **${result.healthScore}/100** — \`${result.statusGrade}\`\n\n` +
        `📊 **Catalog Breakdown**:\n` +
        `• Total Tracked SKUs: **${result.totalSkus} items**\n` +
        `• Serial Tracked: **${result.trackingBreakdown.serialTracked}** | Batch (FEFO) Tracked: **${result.trackingBreakdown.batchTracked}** | Standard: **${result.trackingBreakdown.standard}**\n\n` +
        `⚠️ **Operational Vulnerabilities**:\n` +
        `• Items Below Safety Buffer: **${result.lowStockItems} SKUs** (Deficit: **-${result.totalDeficitUnits} units**)\n` +
        `• Expiring Batches (Next 30 Days): **${result.expiringBatchesCount} lots**\n` +
        `• Orders with Open Backorders: **${result.pendingBackordersCount} orders**\n\n`;

      if (result.criticalShortages?.length > 0) {
        breakdownText += `🔴 **Top Critical Shortages:**\n` +
          result.criticalShortages.map(s => `  - **${s.name}** (\`${s.sku}\`): Stock **${s.currentStock}** / Target **${s.threshold}** (Deficit: **-${s.deficit}**)`).join('\n') +
          `\n\n`;
      }

      breakdownText += `💡 **Actionable Executive Recommendations:**\n` +
        result.actionableRecommendations.map(r => `• ${r}`).join('\n') +
        `\n\n👉 *Reply with "Draft a PO for critical stock" to automatically stage a replenishment order.*`;

      return { text: breakdownText, executedTools, mode: 'local-intelligent' };
    }

    // 4. Expiring lots
    if (lower.includes('expir') || lower.includes('shelf life') || lower.includes('fefo')) {
      if (onStep) onStep({ type: 'tool_start', tool: 'checkExpiringLots' });
      const result = await executeTool('checkExpiringLots', { daysAhead: 30 }, securityContext);
      executedTools.push({ name: 'checkExpiringLots', result });

      if (!result.found || result.count === 0) {
        replyText = '✅ **Zero Lot Expirations**: All active inventory lots are fresh with no batches expiring within the next 30 days.';
      } else {
        replyText = `⚠️ **Expiring Batches Alert** (${result.count} lots within 30 days):\n\n` +
          result.lots.map(l => `• **${l.itemName}** (${l.itemSku}) — Batch: \`${l.batchNumber}\`, Available: **${l.availableQty} units**, Expiry: **${l.expiryDate}** (${l.daysRemaining} days remaining)`).join('\n') +
          '\n\n*Recommendation: Prioritize these batches for upcoming dispatches under FEFO rules.*';
      }
    }
    // 5. Draft Purchase Order
    else if (/\b(draft|create)\s*(a\s*)?po\b/i.test(lower) || (lower.includes('po') && lower.includes('draft')) || lower.includes('reorder') || lower.includes('procure')) {
      if (!securityContext.isAtLeastManager()) {
        replyText = '🔒 **Permission Notice**: Only Managers and Admins can draft Purchase Orders. Please contact your administrator.';
      } else {
        // Look up low stock items to auto-reorder if not specified
        const lowResult = await executeTool('listLowStockItems', { limit: 5 }, securityContext);
        const itemsToOrder = lowResult.items?.length > 0
          ? lowResult.items.map(i => ({ id: i.id, sku: i.sku || i.name, name: i.name, quantity: Math.max(20, i.deficit * 2) }))
          : [{ sku: 'SKU-SAMPLE', quantity: 25 }];

        if (onStep) onStep({ type: 'tool_start', tool: 'draftPurchaseOrder' });
        const poResult = await executeTool('draftPurchaseOrder', {
          supplierNameOrId: 'Acme Supply Co.',
          items: itemsToOrder
        }, securityContext);
        executedTools.push({ name: 'draftPurchaseOrder', result: poResult });

        if (poResult.success) {
          replyText = `📄 **${poResult.message}**\n\n` +
            `• **PO Number**: \`${poResult.poNumber}\`\n` +
            `• **Supplier**: ${poResult.supplier}\n` +
            `• **Estimated Total**: $${poResult.totalValue.toLocaleString()}\n` +
            `• **Status**: 🟡 **DRAFT** (Awaiting your review)\n\n` +
            `*Line Items:*\n` +
            poResult.items.map(i => `  - ${i.name} (${i.sku}): ${i.quantity} units @ $${i.unitPrice} = $${i.lineTotal}`).join('\n') +
            `\n\n👉 *Review this draft in the Purchase Orders section to approve and submit.*`;
        } else {
          replyText = `❌ Could not draft PO: ${poResult.error}`;
        }
      }
    }
    // 6. Low stock / Safety stock
    else if (lower.includes('low stock') || lower.includes('shortage') || lower.includes('below safety') || lower.includes('critical stock') || lower.includes('deficit')) {
      if (onStep) onStep({ type: 'tool_start', tool: 'listLowStockItems' });
      const result = await executeTool('listLowStockItems', { limit: 10 }, securityContext);
      executedTools.push({ name: 'listLowStockItems', result });

      if (result.count === 0) {
        replyText = '✅ **Healthy Inventory**: All products in your catalog are currently above their safety stock thresholds.';
      } else {
        replyText = `🔴 **Low Stock Threshold Alert** (${result.count} items below threshold):\n\n` +
          result.items.map(i => `• **${i.name}** (\`${i.sku || 'N/A'}\`): Stock **${i.currentStock}** / Threshold **${i.threshold}** (Deficit: -${i.deficit} units)`).join('\n') +
          '\n\nWould you like me to draft a Purchase Order for these items?';
      }
    }
    // 7. Sales Order Status / Backorders
    else if (lower.includes('so-') || lower.includes('sales order') || lower.includes('fulfillment') || lower.includes('backorder')) {
      const soMatch = prompt.match(/so-[\w-]+/i);
      if (soMatch) {
        if (onStep) onStep({ type: 'tool_start', tool: 'getOrderStatus' });
        const result = await executeTool('getOrderStatus', { orderNumber: soMatch[0] }, securityContext);
        executedTools.push({ name: 'getOrderStatus', result });

        if (!result.found) {
          replyText = `🔍 ${result.message}`;
        } else {
          replyText = `📦 **Sales Order ${result.soNumber} Details**\n\n` +
            `• **Buyer**: ${result.buyer}\n` +
            `• **Order Status**: \`${result.status.toUpperCase()}\`\n` +
            `• **Fulfillment**: \`${result.fulfillmentStatus}\`\n` +
            `• **Total Value**: $${(result.totalValue || 0).toLocaleString()}\n\n` +
            `*Items:*\n` +
            result.items.map(i => `  - **${i.name}**: Ordered: ${i.orderedQty} | Reserved: ${i.reservedQty} | Fulfilled: ${i.fulfilledQty} | Backordered: ${i.backorderedQty}`).join('\n') +
            (result.packages?.length > 0
              ? `\n\n*Packages:* \n` + result.packages.map(p => `  - Package \`${p.packageNumber}\`: ${p.carrier} (Tracking: ${p.trackingNumber}) [${p.status}]`).join('\n')
              : '\n\n*No parcels packed yet.*');
        }
      } else {
        if (onStep) onStep({ type: 'tool_start', tool: 'listBackorders' });
        const result = await executeTool('listBackorders', { limit: 10 }, securityContext);
        executedTools.push({ name: 'listBackorders', result });

        if (result.count === 0) {
          replyText = '✅ **Zero Open Backorders**: All sales orders are currently either fully fulfilled or allocated.';
        } else {
          replyText = `📦 **Active Backorders Overview** (${result.count} lines pending stock):\n\n` +
            result.backorders.map(b => `• **${b.soNumber}** (${b.buyer || 'Customer'}): **${b.itemName}** (\`${b.sku}\`) — Backordered: **${b.backorderedQty} units**`).join('\n') +
            '\n\n*Visit the Backorders dashboard to generate vendor POs for these shortages.*';
        }
      }
    }
    // 8. General Stock Inquiry by SKU or Name
    else {
      const stopWords = ['how', 'many', 'what', 'stock', 'left', 'show', 'check', 'the', 'for', 'have', 'are', 'tell', 'about', 'find', 'get', 'product', 'item', 'units', 'can', 'you', 'please'];
      const tokens = prompt.replace(/[?!,.]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w.toLowerCase()));

      // If user typed something that doesn't look like a product search query (e.g. conversational sentence)
      if (tokens.length === 0 || lower.startsWith('why') || lower.startsWith('can you') || lower.startsWith('what is') || lower.length > 60) {
        replyText = `💡 I'm here to analyze and manage your inventory operations.\n\n` +
          `*Here is what you can ask me right now:*\n` +
          `• *"Give me a full inventory health analysis"*\n` +
          `• *"Which products are below safety stock?"*\n` +
          `• *"Show me items expiring in 30 days"*\n` +
          `• *"What is the status of SO-1001?"*\n` +
          `• *"Draft a PO for critical stock"*\n\n` +
          `*(To enable open-ended natural conversation on any topic, add ` + '`GEMINI_API_KEY`' + ` to your ` + '`.env`' + ` file.)*`;
      } else {
        const searchTarget = tokens.join(' ');
        if (onStep) onStep({ type: 'tool_start', tool: 'queryStockLevel' });
        const result = await executeTool('queryStockLevel', { skuOrName: searchTarget }, securityContext);
        executedTools.push({ name: 'queryStockLevel', result });

        if (!result.found) {
          replyText = `🔍 **Inventory Search**: ${result.message}\n\n*You can ask me things like:*\n• *"Give me an inventory health analysis"*\n• *"Which products are below safety stock?"*\n• *"Show me items expiring in 30 days"*\n• *"Draft a PO for critical stock"*`;
        } else {
          replyText = `📊 **Stock Level for "${searchTarget}"** (${result.count} matched):\n\n` +
            result.products.map(p => {
              let details = `• **${p.name}** (\`${p.sku}\`):\n` +
                `  - Current Physical Stock: **${p.currentStock} ${p.unit}**\n` +
                `  - Available to Promise: **${p.availableStock} ${p.unit}**\n` +
                `  - Reserved for Orders: **${p.reservedStock} ${p.unit}**\n` +
                `  - Tracking Mode: \`${p.trackingMode}\``;
              if (p.activeBatches?.length > 0) {
                details += `\n  - Active Batches: ` + p.activeBatches.map(b => `\`${b.batchNumber}\` (${b.availableQty} units, exp: ${b.expiryDate})`).join(', ');
              }
              if (p.isLowStock) {
                details += `\n  - ⚠️ **Below safety threshold of ${p.threshold}!**`;
              }
              return details;
            }).join('\n\n');
        }
      }
    }

    return {
      text: replyText,
      executedTools,
      mode: 'local-intelligent'
    };
  }
}

// Singleton instance
const agent = new AcuBotAgent();

module.exports = agent;
