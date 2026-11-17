/**
 * AcuStock Enterprise OpenAPI 3.0 Specification Generator
 * Generates docs/openapi.json, backend/src/docs/openapi.json, and docs/openapi.yaml
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const spec = {
  openapi: "3.0.3",
  info: {
    title: "AcuStock Enterprise ERP, WMS & CRM API",
    version: "2.0.0",
    description: "Production-grade multi-tenant REST API suite for inventory control, warehouse management (WMS), CRM Quote-to-Cash, logistics dispatch, automated billing, and e-commerce integrations.",
    contact: {
      name: "AcuStock Engineering & M&A Due Diligence",
      url: "https://acustock.com",
      email: "api@acustock.com"
    },
    license: {
      name: "Proprietary Commercial Software License",
      url: "https://acustock.com/license"
    }
  },
  servers: [
    {
      url: "http://localhost:5001/api",
      description: "Local Development API Server"
    },
    {
      url: "https://api.acustock.com/api",
      description: "Production Edge Cloud API"
    }
  ],
  tags: [
    { name: "Authentication & Identity", description: "Multi-tenant auth, registration, session management, and TOTP 2FA" },
    { name: "Catalog & Master Data", description: "SKUs, products, barcode generation, measurement units, and warehouse bin locations" },
    { name: "Stock Movements & WMS", description: "Stock IN, picking/dispatch, inter-warehouse transfers, double-entry stock ledger" },
    { name: "Batches, Lots & Traceability", description: "FIFO/FEFO batch management, expiry alerts, and serial number provenance" },
    { name: "Audit & Reconciliation", description: "Scheduled cycle counts, physical inventory audits, and discrepancy reconciliation" },
    { name: "CRM & Quotation Engine", description: "Kanban pipeline, deal management, ATP stock checks, and GST-compliant formal quotations" },
    { name: "Customer 360 & Credit Control", description: "Customer accounts, credit limits, overdue freeze enforcement, and manager overrides" },
    { name: "Sales Orders & Fulfillment", description: "Confirmed orders, warehouse stock allocation, and dispatch execution" },
    { name: "Logistics & Shipping", description: "Carrier dispatch, Delhivery/Shiprocket AWB generation, and live delivery tracking" },
    { name: "Procurement & Suppliers", description: "Purchase Orders, supplier scorecards, and landed cost valuation" },
    { name: "Tally Prime & Reports", description: "RFC-compliant Tally XML voucher export, inventory aging, and analytics" },
    { name: "SaaS Billing & Subscriptions", description: "Tiered subscription plans, quota metering, Razorpay UPI, and Stripe Portal" },
    { name: "Developer API & Webhooks", description: "API key generation, HMAC-SHA256 webhooks, and Shopify/WooCommerce ingestion" },
    { name: "Compliance & GDPR/DPDP", description: "Full tenant archive export and immutable data purge" }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Standard JWT authentication header obtained from `/api/auth/login`"
      },
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Machine-to-machine developer key (starts with `acu_live_` or `acu_test_`)"
      },
      TenantHeader: {
        type: "apiKey",
        in: "header",
        name: "X-Tenant-ID",
        description: "Multi-tenant organization identifier (optional if encoded in JWT)"
      }
    },
    schemas: {
      StandardResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation executed successfully" }
        }
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Invalid or unauthorized request parameters" },
          code: { type: "string", example: "VALIDATION_FAILED" }
        }
      },
      User: {
        type: "object",
        properties: {
          _id: { type: "string", example: "660c1f5e2a1b3c4d5e6f7a8b" },
          name: { type: "string", example: "Vikram Malhotra" },
          email: { type: "string", format: "email", example: "vikram@enterprise.com" },
          role: { type: "string", enum: ["admin", "manager", "user"], example: "admin" },
          tenantId: { type: "string", example: "660c1f5e2a1b3c4d5e6f7a8a" },
          twoFactorEnabled: { type: "boolean", example: false }
        }
      },
      Item: {
        type: "object",
        properties: {
          _id: { type: "string", example: "660c1f5e2a1b3c4d5e6f7a90" },
          sku: { type: "string", example: "ELEC-PREC-001" },
          name: { type: "string", example: "Industrial Microcontroller V2" },
          barcode: { type: "string", example: "8901234567890" },
          category: { type: "string", example: "Electronics" },
          uom: { type: "string", example: "PCS" },
          salesPrice: { type: "number", example: 1450.00 },
          purchasePrice: { type: "number", example: 980.00 },
          reorderPoint: { type: "number", example: 50 },
          safetyStock: { type: "number", example: 20 },
          taxRatePercent: { type: "number", example: 18 }
        }
      },
      StockMovement: {
        type: "object",
        properties: {
          productId: { type: "string" },
          warehouseId: { type: "string" },
          quantity: { type: "number", example: 100 },
          unitPrice: { type: "number", example: 980 },
          batchNumber: { type: "string", example: "LOT-2026-NOV-01" },
          expiryDate: { type: "string", format: "date" },
          serialNumbers: { type: "array", items: { type: "string" } },
          referenceType: { type: "string", enum: ["SUPPLIER_INVOICE", "SALES_DISPATCH", "ADJUSTMENT", "TRANSFER"] },
          referenceNumber: { type: "string", example: "INV-9901" }
        }
      },
      CrmDeal: {
        type: "object",
        properties: {
          _id: { type: "string" },
          dealNumber: { type: "string", example: "DEAL-2026-0001" },
          title: { type: "string", example: "500x Precision Sensors - Apex Corp" },
          stage: { type: "string", enum: ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"], example: "PROPOSAL" },
          value: { type: "number", example: 450000 },
          quoteNumber: { type: "string", example: "QT-2026-0001" },
          quoteExpiresAt: { type: "string", format: "date-time" },
          paymentTerms: { type: "string", example: "NET_30" },
          taxBreakdown: {
            type: "object",
            properties: {
              taxableAmount: { type: "number", example: 381355.93 },
              cgst: { type: "number", example: 34322.03 },
              sgst: { type: "number", example: 34322.03 },
              igst: { type: "number", example: 0 },
              totalTax: { type: "number", example: 68644.06 },
              grandTotal: { type: "number", example: 450000.00 },
              isInterState: { type: "boolean", example: false }
            }
          }
        }
      },
      Customer360: {
        type: "object",
        properties: {
          company: {
            type: "object",
            properties: {
              name: { type: "string", example: "Apex Industrial Corp" },
              creditLimit: { type: "number", example: 500000 },
              creditDays: { type: "number", example: 30 },
              outstandingBalance: { type: "number", example: 125000 },
              isCreditBlocked: { type: "boolean", example: false }
            }
          },
          summary: {
            type: "object",
            properties: {
              lifetimeRevenue: { type: "number", example: 1850000 },
              wonDealsCount: { type: "number", example: 8 },
              activeDealsCount: { type: "number", example: 2 },
              creditUtilizationPct: { type: "number", example: 25.0 }
            }
          }
        }
      }
    }
  },
  paths: {
    // ── AUTHENTICATION ──────────────────────────────────────────
    "/auth/register": {
      post: {
        tags: ["Authentication & Identity"],
        summary: "Tenant & Super Admin Registration",
        description: "Creates an isolated multi-tenant organization with initialized warehouses and admin credentials.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["companyName", "name", "email", "password"],
                properties: {
                  companyName: { type: "string", example: "Apex Logistics Ltd" },
                  name: { type: "string", example: "Rajesh Sharma" },
                  email: { type: "string", format: "email", example: "rajesh@apex.com" },
                  password: { type: "string", format: "password", example: "SecureP@ss2026!" },
                  country: { type: "string", example: "India" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Tenant & Admin registered successfully", content: { "application/json": { schema: { "$ref": "#/components/schemas/StandardResponse" } } } },
          "400": { description: "Validation error or email already in use", content: { "application/json": { schema: { "$ref": "#/components/schemas/ErrorResponse" } } } }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Authentication & Identity"],
        summary: "User Sign In",
        description: "Authenticates credentials and returns a signed multi-tenant JWT token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "admin@acustock.com" },
                  password: { type: "string", format: "password", example: "AdminPassword123" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Authentication successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
                    user: { "$ref": "#/components/schemas/User" }
                  }
                }
              }
            }
          },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/auth/me": {
      get: {
        tags: ["Authentication & Identity"],
        summary: "Current Authenticated Session Profile",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Current user profile and organization details" }
        }
      }
    },

    // ── INVENTORY & CATALOG ─────────────────────────────────────
    "/items": {
      get: {
        tags: ["Catalog & Master Data"],
        summary: "List Catalog Products",
        description: "Returns paginated list of catalog SKUs with live stock balances.",
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "200": {
            description: "Product list with stock summaries",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    items: { type: "array", items: { "$ref": "#/components/schemas/Item" } },
                    total: { type: "integer", example: 120 }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Catalog & Master Data"],
        summary: "Create New Product SKU",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { "$ref": "#/components/schemas/Item" } } }
        },
        responses: {
          "201": { description: "Product created successfully" }
        }
      }
    },
    "/warehouses": {
      get: {
        tags: ["Catalog & Master Data"],
        summary: "List Warehouses & Zones",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Warehouse locations and bin zones" } }
      },
      post: {
        tags: ["Catalog & Master Data"],
        summary: "Create Warehouse Facility",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "Warehouse created" } }
      }
    },

    // ── STOCK MOVEMENTS & WMS ───────────────────────────────────
    "/stock/in": {
      post: {
        tags: ["Stock Movements & WMS"],
        summary: "Stock Inward Receiving (Supplier Entry)",
        description: "Ingests inventory from vendors, generates batches, assigns optional serial numbers, and updates the double-entry stock ledger.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { "$ref": "#/components/schemas/StockMovement" } } }
        },
        responses: {
          "201": { description: "Stock IN transaction recorded" },
          "400": { description: "Invalid quantity or warehouse" }
        }
      }
    },
    "/stock/out": {
      post: {
        tags: ["Stock Movements & WMS"],
        summary: "Stock Outward Dispatch (Picking & Packing)",
        description: "Validates FIFO/FEFO batches, releases stock reservations, and records decrement in ledger.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { "$ref": "#/components/schemas/StockMovement" } } }
        },
        responses: {
          "201": { description: "Stock OUT dispatched" }
        }
      }
    },
    "/stock/remaining": {
      get: {
        tags: ["Stock Movements & WMS"],
        summary: "Real-Time Stock Balances",
        description: "Fetches on-hand, soft-reserved, and available-to-promise inventory levels across all warehouse bins.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Real-time stock levels" } }
      }
    },
    "/stock/ledger": {
      get: {
        tags: ["Stock Movements & WMS"],
        summary: "Immutable Double-Entry Stock Ledger",
        description: "Audit trail of every stock increase, decrease, adjustment, and transfer.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Ledger transaction entries" } }
      }
    },
    "/stock-transfers": {
      post: {
        tags: ["Stock Movements & WMS"],
        summary: "Initiate Inter-Warehouse Transfer",
        description: "Puts inventory in TRANSIT status between source and destination warehouses.",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "Transfer initiated" } }
      }
    },

    // ── BATCHES, EXPIRY & TRACEABILITY ──────────────────────────
    "/lots": {
      get: {
        tags: ["Batches, Lots & Traceability"],
        summary: "List Inventory Batches (FIFO/FEFO)",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Active batches with manufacturing & expiry dates" } }
      }
    },
    "/expiry/alerts": {
      get: {
        tags: ["Batches, Lots & Traceability"],
        summary: "Critical Expiration Alerts",
        description: "Identifies products expiring within 30, 60, or 90 days to prevent unsellable spoilage.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Expiry alert schedule" } }
      }
    },
    "/traceability/serials/{serialNumber}": {
      get: {
        tags: ["Batches, Lots & Traceability"],
        summary: "Serial Provenance & Lifecycle Trace",
        description: "Returns end-to-end audit history of a serialized unit from supplier receiving to customer shipment.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "serialNumber", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Provenance trail" } }
      }
    },

    // ── CRM & QUOTATION ENGINE ──────────────────────────────────
    "/crm/kanban": {
      get: {
        tags: ["CRM & Quotation Engine"],
        summary: "CRM Pipeline Kanban Board",
        description: "Returns deals grouped by stage (LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST) and key win-rate metrics.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Grouped Kanban data" } }
      }
    },
    "/crm/deals": {
      get: {
        tags: ["CRM & Quotation Engine"],
        summary: "List CRM Opportunities",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Deals list" } }
      },
      post: {
        tags: ["CRM & Quotation Engine"],
        summary: "Create CRM Deal / Lead",
        description: "Creates opportunity with line items and real-time Available-to-Promise stock snapshot.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { "$ref": "#/components/schemas/CrmDeal" } } }
        },
        responses: { "201": { description: "Opportunity created" } }
      }
    },
    "/crm/deals/{id}/generate-quote": {
      post: {
        tags: ["CRM & Quotation Engine"],
        summary: "Generate Formal Commercial Quotation (PI)",
        description: "Generates sequential quote number (QT-YYYY-XXXX), calculates state-aware Indian GST (intra-state CGST+SGST vs inter-state IGST), applies soft inventory hold, and sets validity countdown.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  validityDays: { type: "integer", default: 7 },
                  paymentTerms: { type: "string", example: "NET_30" },
                  buyerState: { type: "string", example: "Karnataka" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Quotation generated with tax breakdown" } }
      }
    },
    "/crm/deals/{id}/quote-preview": {
      get: {
        tags: ["CRM & Quotation Engine"],
        summary: "Preview Formal Quotation Sheet",
        description: "Returns printable commercial quotation payload with tenant branding, GSTIN, and digital bank details.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Printable quotation data" } }
      }
    },
    "/crm/deals/{id}/convert-to-so": {
      post: {
        tags: ["CRM & Quotation Engine"],
        summary: "1-Click Convert Won Deal to Sales Order",
        description: "Verifies customer credit limit, converts soft reservation to hard WMS allocation, and dispatches confirmed Sales Order for fulfillment. Supports manager override if credit is breached.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  allowCreditOverride: { type: "boolean", default: false },
                  overrideReason: { type: "string", example: "Board Director Approval" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Sales Order generated and queued in WMS" },
          "403": { description: "Customer credit limit exceeded - manager override required" }
        }
      }
    },

    // ── CUSTOMER 360 & CREDIT MANAGEMENT ────────────────────────
    "/crm/companies/{id}/customer-360": {
      get: {
        tags: ["Customer 360 & Credit Control"],
        summary: "Customer 360 Profile & Credit Health",
        description: "Returns lifetime revenue, order count, approved credit limit, outstanding balance, credit utilization %, and full transaction ledger.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Customer 360 profile",
            content: { "application/json": { schema: { "$ref": "#/components/schemas/Customer360" } } }
          }
        }
      }
    },
    "/crm/companies/{id}/credit-override": {
      post: {
        tags: ["Customer 360 & Credit Control"],
        summary: "Manage Credit Limits & Account Freezes",
        description: "Allows finance managers to set credit limits, credit days, and toggle credit block locks.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  creditLimit: { type: "number", example: 1000000 },
                  creditDays: { type: "integer", example: 45 },
                  isCreditBlocked: { type: "boolean", example: false },
                  blockReason: { type: "string", example: "Overdue payments cleared" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Credit limit updated" } }
      }
    },

    // ── SALES ORDERS & LOGISTICS ────────────────────────────────
    "/sales-orders": {
      get: {
        tags: ["Sales Orders & Fulfillment"],
        summary: "List Confirmed Sales Orders",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "List of sales orders in fulfillment" } }
      },
      post: {
        tags: ["Sales Orders & Fulfillment"],
        summary: "Create Sales Order",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "Sales order created" } }
      }
    },
    "/shipments": {
      post: {
        tags: ["Logistics & Shipping"],
        summary: "Dispatch Shipment & Generate Courier AWB",
        description: "Integrates with Shiprocket or Delhivery B2B to generate live AWB and printable shipping label PDF.",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "Shipment booked and AWB assigned" } }
      }
    },

    // ── PROCUREMENT & VALUATION ─────────────────────────────────
    "/purchase-orders": {
      get: {
        tags: ["Procurement & Suppliers"],
        summary: "List Supplier Purchase Orders",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Purchase orders list" } }
      },
      post: {
        tags: ["Procurement & Suppliers"],
        summary: "Create Purchase Order",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "Purchase order created" } }
      }
    },
    "/valuation": {
      get: {
        tags: ["Procurement & Suppliers"],
        summary: "Inventory Valuation & Landed Cost",
        description: "Calculates total asset value using FIFO, Weighted Average, or Specific Identification methods.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Inventory asset valuation" } }
      }
    },

    // ── TALLY & BUSINESS REPORTS ────────────────────────────────
    "/reports/tally-xml": {
      get: {
        tags: ["Tally Prime & Reports"],
        summary: "Tally Prime XML Export Bridge",
        description: "Streams RFC-compliant Tally XML file containing Purchase/Sales vouchers and Stock Item masters for 1-click import into Tally Prime.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "XML document for Tally import",
            content: { "application/xml": { schema: { type: "string" } } }
          }
        }
      }
    },
    "/reports/aging": {
      get: {
        tags: ["Tally Prime & Reports"],
        summary: "Inventory Aging Report",
        description: "Aggregates inventory balance across 0-30d, 31-60d, 61-90d, and >90d holding periods.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Aging brackets and stock values" } }
      }
    },

    // ── SAAS BILLING & DEVELOPER API ────────────────────────────
    "/billing/usage": {
      get: {
        tags: ["SaaS Billing & Subscriptions"],
        summary: "Subscription Quota & Overage Metering",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Live utilization percentage vs plan limits" } }
      }
    },
    "/billing/customer-portal": {
      post: {
        tags: ["SaaS Billing & Subscriptions"],
        summary: "Stripe Customer Portal Session",
        description: "Generates secure Stripe billing portal URL for invoice downloads and plan upgrades.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Portal session URL" } }
      }
    },
    "/api-keys": {
      get: {
        tags: ["Developer API & Webhooks"],
        summary: "List Developer API Keys",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Active API key prefixes and scopes" } }
      },
      post: {
        tags: ["Developer API & Webhooks"],
        summary: "Generate API Key",
        security: [{ BearerAuth: [] }],
        responses: { "201": { description: "New secret API key (shown only once)" } }
      }
    },
    "/webhooks/shopify/orders-create": {
      post: {
        tags: ["Developer API & Webhooks"],
        summary: "Shopify Inbound Order Webhook",
        description: "Verifies X-Shopify-Hmac-Sha256 and reserves catalog stock in AcuStock.",
        responses: { "200": { description: "Order ingested and stock reserved" } }
      }
    },
    "/gdpr/tenant-full-export": {
      get: {
        tags: ["Compliance & GDPR/DPDP"],
        summary: "Complete Tenant Database Dump",
        description: "Exports all catalog, transactions, customers, and ledger data as a compressed JSON archive.",
        security: [{ BearerAuth: [] }],
        responses: { "200": { description: "Full JSON database archive" } }
      }
    }
  }
};

// 1. Write docs/openapi.json
const rootDocsDir = path.join(__dirname, '../docs');
if (!fs.existsSync(rootDocsDir)) fs.mkdirSync(rootDocsDir, { recursive: true });
fs.writeFileSync(path.join(rootDocsDir, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf-8');
console.log('✅ Generated docs/openapi.json');

// 2. Write backend/src/docs/openapi.json
const backendDocsDir = path.join(__dirname, '../backend/src/docs');
if (!fs.existsSync(backendDocsDir)) fs.mkdirSync(backendDocsDir, { recursive: true });
fs.writeFileSync(path.join(backendDocsDir, 'openapi.json'), JSON.stringify(spec, null, 2), 'utf-8');
console.log('✅ Generated backend/src/docs/openapi.json');

// 3. Convert to docs/openapi.yaml using python3 PyYAML
try {
  execSync(`python3 -c "import json, yaml; spec = json.load(open('docs/openapi.json')); open('docs/openapi.yaml', 'w').write(yaml.dump(spec, sort_keys=False))"`);
  console.log('✅ Generated docs/openapi.yaml');
} catch (e) {
  console.error('⚠️ Could not generate YAML:', e.message);
}

console.log('🎉 OpenAPI 3.0 generation completed successfully.');

