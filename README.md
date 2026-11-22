# AcuStock — Enterprise Cloud ERP, WMS & SCM Platform

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-5.2-000000?logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-8.x_Local_%7C_7.0_Docker-47A248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7.0_Server_%7C_6.0_Client-DC382D?logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16.2.10-000000?logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19.2.4-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Tests-64_Suites_%7C_100%25_Passing-brightgreen?logo=vitest" />
  <img src="https://img.shields.io/badge/OpenAPI-3.0.3-6BA539?logo=swagger&logoColor=white" />
  <img src="https://img.shields.io/badge/Postman-Collection_Ready-FF6C37?logo=postman&logoColor=white" />
  <img src="https://img.shields.io/badge/GST_%2F_E--Way_Bill-Compliant-orange" />
</p>

AcuStock is a **production-grade, multi-tenant Cloud ERP, Warehouse Management (WMS), and Supply Chain Platform** designed for mid-market and enterprise businesses. It governs the entire quote-to-cash and procure-to-pay lifecycle: from CRM leads and supplier purchase orders to multi-level manufacturing (MRP), wave/batch warehouse picking with 3D digital-twin maps, automated double-entry general ledger accounting, Indian courier logistics (Delhivery, Shiprocket, Blue Dart, Porter), and self-service B2B customer/supplier portals.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Module & System Map](#3-module--system-map)
4. [Quick Start](#4-quick-start)
5. [Environment Variables](#5-environment-variables)
6. [Core Functional Modules](#6-core-functional-modules)
   - [6.1 Warehouse Locations & 3D Digital Twin](#61-warehouse-locations--3d-digital-twin)
   - [6.2 Inventory Lifecycle & Stock Adjustments](#62-inventory-lifecycle--stock-adjustments)
   - [6.3 Landed Cost Allocation & Valuation (FIFO / WAVG)](#63-landed-cost-allocation--valuation-fifo--wavg)
   - [6.4 Supplier Management & Performance Scorecards](#64-supplier-management--performance-scorecards)
   - [6.5 Multi-Level BOM, Kits & Assembly Work Orders](#65-multi-level-bom-kits--assembly-work-orders)
   - [6.6 Expiry Tracking, Quarantine & FEFO Picking](#66-expiry-tracking-quarantine--fefo-picking)
   - [6.7 Cycle Counts & Physical Reconciliation](#67-cycle-counts--physical-reconciliation)
   - [6.8 Lot & Serial Number Traceability](#68-lot--serial-number-traceability)
   - [6.9 Demand Forecasting & Automated PO Reorder](#69-demand-forecasting--automated-po-reorder)
   - [6.10 Aging, ABC Classification & Slow-Moving Stock](#610-aging-abc-classification--slow-moving-stock)
   - [6.11 Bulk Data Import & Portability (CSV/XLSX)](#611-bulk-data-import--portability-csvxlsx)
   - [6.12 Mobile WMS, Barcode Scanner & 3D Landing Experience](#612-mobile-wms-barcode-scanner--3d-landing-experience)
   - [6.13 Wave, Batch & Cluster Picking with Put-Wall Sorting](#613-wave-batch--cluster-picking-with-put-wall-sorting)
   - [6.14 Tax Invoicing & Accounts Receivable (GST & E-Way Bill)](#614-tax-invoicing--accounts-receivable-gst--e-way-bill)
   - [6.15 Accounts Payable & Automated 3-Way Match](#615-accounts-payable--automated-3-way-match)
   - [6.16 Return Merchandise Authorization (RMA) & Credit Notes](#616-return-merchandise-authorization-rma--credit-notes)
   - [6.17 B2B Customer & Supplier Self-Service Portals](#617-b2b-customer--supplier-self-service-portals)
   - [6.18 CRM Pipeline & Quotation-to-Order Conversion](#618-crm-pipeline--quotation-to-order-conversion)
   - [6.19 Double-Entry General Ledger (GL) & Financial Statements](#619-double-entry-general-ledger-gl--financial-statements)
   - [6.20 Manufacturing MRP Engine & Work Center Shop-Floor Routing](#620-manufacturing-mrp-engine--work-center-shop-floor-routing)
   - [6.21 Indian Logistics & Real-Time Courier Integrations](#621-indian-logistics--real-time-courier-integrations)
   - [6.22 Tally Prime & Zoho Books Accounting Export Bridge](#622-tally-prime--zoho-books-accounting-export-bridge)
   - [6.23 AI Copilot, Invoice OCR & WhatsApp Automation](#623-ai-copilot-invoice-ocr--whatsapp-automation)
   - [6.24 Multi-Tenant SaaS Engine, Quotas & Enterprise Auth (SAML/OAuth)](#624-multi-tenant-saas-engine-quotas--enterprise-auth-samloauth)
   - [6.25 Security Hardening, Merkle Audit Chains & Resilience](#625-security-hardening-merkle-audit-chains--resilience)
7. [API Reference (69 Route Endpoints)](#7-api-reference-69-route-endpoints)
8. [RBAC — Roles & Permissions Matrix](#8-rbac--roles--permissions-matrix)
   - [8.1 Enterprise Module & Section Governance Control Plane](#81-enterprise-module--section-governance-control-plane)
9. [Complete Test Suite Index (65 Test Suites)](#9-complete-test-suite-index-65-test-suites)
10. [Production Deployment & DevOps](#10-production-deployment--devops)
11. [Indian Compliance & Statutory Standards](#11-indian-compliance--statutory-standards)
12. [Developer Specifications & Operational Docs](#12-developer-specifications--operational-docs)
13. [Contributing & Code Standards](#13-contributing--code-standards)

---

## 1. Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               Presentation Layer                                  │
│  Next.js 16 (React 19 · TypeScript 5 · Tailwind 4 · TanStack Query 5)             │
│  Three.js 3D Interactive Landing Scene & Warehouse Bin Maps                       │
│  Socket.IO Real-time Wave Runner & Put-Wall Matrix Display                        │
│  PWA Mobile Barcode / QR Scanner (Camera + Hardware Gun Support)                  │
└────────────────────────────────────────┬──────────────────────────────────────────┘
                                         │  HTTPS / WSS
                                  ┌──────▼──────┐
                                  │    Nginx    │  TLS 1.3 · HSTS · Reverse Proxy
                                  └──────┬──────┘
                                         │
┌────────────────────────────────────────▼──────────────────────────────────────────┐
│                             API Gateway (Express 5.2)                             │
│  Middleware Pipeline:                                                             │
│  - Tenancy Isolation (`tenancy.js`)                                               │
│  - Enterprise Auth & Session Management (JWT Rotation, TOTP 2FA, SAML 2.0, OAuth) │
│  - RBAC Permission Guards (`requirePermission.js`)                                │
│  - Distributed Rate Limiting & Sliding Windows (Redis / Memory fallback)          │
│  - Security Shield: CSRF, Helmet, NoSQL Sanitizer, XSS Sanitizer, SSRF Guard      │
│  - Maintenance Mode & Plan Quota Enforcement (`checkPlanLimits.js`)               │
│                                                                                   │
│  Domain Service Layer:                                                            │
│  - MRP & Work Center Routing        - Wave / Batch S-Shape Traversal Engine       │
│  - Double-Entry Journal Engine (GL)  - 3-Way Match AP & GST Tax Invoice Engine     │
│  - Stock Valuation & Landed Cost    - Immutable Merkle Audit Log Chain            │
│  - Carrier Logistics Dispatcher     - Gemini 2.0 Flash AI Copilot & Invoice OCR   │
└──────────────────────────┬───────────────────────────────┬────────────────────────┘
                           │                               │
                ┌──────────▼──────────┐         ┌──────────▼──────────┐
                │   MongoDB 8 / 7.0   │         │   Redis 7 (ioredis) │
                │  Mongoose 9 Models  │         │  Session Cache      │
                │  Replica Set (rs0)  │         │  Sliding Rate Limit │
                │  Tenant Isolation   │         │  Overage Metering   │
                └─────────────────────┘         └─────────────────────┘
```

**Guaranteed Multi-Tenant Isolation**: Every database interaction is scoped at the query level by the `tenantIsolationPlugin`. It is structurally impossible for requests from tenant $A$ to read or mutate documents belonging to tenant $B$.

---

## 2. Tech Stack

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | `>= 18.0.0` | Server runtime engine |
| **API Framework** | Express | `5.2.1` | REST API layer with native async error propagation |
| **Database** | MongoDB | `8.x` (Native) / `7.0` (Docker) | Primary document store (Replica set `rs0` for multi-document ACID transactions) |
| **ODM** | Mongoose | `9.1.1` | Strongly typed object modeling with isolation plugins |
| **Caching & Quotas** | Redis / ioredis | `7.0` (Server) / `6.0.0` (Client) | Sliding window rate limits, session tokens, quota reservations |
| **Frontend Framework**| Next.js | `16.2.10` | App router architecture with React Server Components |
| **UI Library** | React | `19.2.4` | Modern UI primitives with Actions and concurrent features |
| **Language** | TypeScript | `5.x` | Strict type safety across client and models |
| **CSS System** | Tailwind CSS | `4.x` | High-performance atomic CSS system |
| **State & Cache** | TanStack Query | `5.101.4` | Server state management, auto-refetch, and mutation sync |
| **3D Rendering** | Three.js | `0.185.1` | 3D WebGL interactive landing scene and warehouse digital twin |
| **Data Viz** | Recharts | `3.10.1` | Dynamic charts for inventory aging, ABC, MRP, and cashflow |
| **Real-time** | Socket.IO | `4.8.3` | Bidirectional push for warehouse put-walls and telemetry |
| **PDF Generation** | PDFKit | `0.20.2` | High-fidelity Tax Invoices, Packing Slips, and QR/Barcode sheets |
| **Artificial Intelligence** | Google Gemini (`@google/genai`) | `2.28.0` | Natural language inventory analytics and visual Invoice OCR |
| **Payment Gateways** | Stripe (`stripe` SDK) + Razorpay | `v22` / Native REST | Dual-mode checkout (Stripe for global, Razorpay for INR/UPI) |
| **Authentication** | JWT + otplib + SAML + OAuth | `9.0.3` / `13.5.0` | Refresh token rotation, TOTP 2FA, SAML 2.0, Google OAuth 2.0 |
| **Process Manager** | PM2 | Cluster Mode | Zero-downtime restarts and CPU core clustering |
| **Reverse Proxy** | Nginx | `1.25-alpine` | TLS 1.3 termination, HTTP/2, and micro-caching |

---

## 3. Module & System Map

```
AcuStock Enterprise Suite
│
├── 1. Warehouse & Inventory Operations
│   ├── Multi-Warehouse Branch Scoping (`/api/warehouses`)
│   ├── Hierarchical 3D Bin Locations (`/api/locations`)
│   ├── Stock In, Stock Out & Transfers (`/api/stock`, `/api/stock-transfers`)
│   ├── Reason-Coded Adjustments & Approval Limits (`/api/adjustments`)
│   ├── Soft Stock Reservations & Auto-Allocation (`/api/reservations`)
│   ├── Scheduled & ABC Cycle Counts (`/api/cycle-counts`, `/api/reconciliation`)
│   ├── Lot & Serial Number Provenance (`/api/lots`, `/api/traceability`)
│   ├── FEFO Picking & Perishable Expiry Alerts (`/api/expiry`)
│   └── Mobile WMS & Hardware Barcode Gun Engine (`/dashboard/[role]/scan`)
│
├── 2. Outbound Fulfillment & Order Orchestration
│   ├── Algorithmic Wave, Batch & Cluster Picking (`/api/picking-waves`)
│   ├── 24-Cubby LED Put-Wall Sorting Matrix (`/put-wall-station`)
│   ├── Package & Weight Dimensioning (`/api/packages`)
│   ├── Barcode & QR Shipping Label Generation (`/api/labels`)
│   └── Shipment Milestone Tracking & Carrier Polling (`/api/shipments`, `/api/tracking`)
│
├── 3. Procurement & Supply Chain
│   ├── Purchase Orders with Approval Workflows (`/api/purchase-orders`)
│   ├── Goods Received Not Invoiced (GRNI) Ledger
│   ├── Accounts Payable 3-Way Match (PO / GRN / Bill) (`/api/vendor-bills`)
│   ├── Vendor Payment Scheduling & Processing (`/api/vendor-bills/:id/pay`)
│   ├── Supplier Performance Scorecards & Risk Tiers (`/api/suppliers`)
│   └── Landed Cost Apportionment (Weight, Volume, Value) (`/api/valuation/landed-cost`)
│
├── 4. Manufacturing & Shop-Floor Execution
│   ├── Multi-Level Bill of Materials (BOM) with Scrap Factors (`/api/kits`)
│   ├── Work Center Capacity, Efficiency & Rate Modeling (`/api/manufacturing/work-centers`)
│   ├── Material Requirements Planning (MRP) Back-Scheduling (`/api/manufacturing/mrp/run`)
│   ├── Assembly Work Orders & Component Consumption (`/api/manufacturing/production-orders`)
│   └── Production Policies & Shop-Floor Routing Queues
│
├── 5. Sales, CRM & Quotation Engine
│   ├── CRM Deal & Lead Pipeline (`/api/crm/leads`)
│   ├── Quotation Builder with Real-time Stock Lock (`/api/crm/quotations`)
│   ├── Quote-to-Sales-Order-to-Invoice Conversion (`/api/sales-orders`)
│   ├── Credit Limit Checks & Receivables Risk Profiling
│   └── B2B Customer & Supplier Self-Service Portals (`/portal/*`)
│
├── 6. Accounting & Statutory Compliance
│   ├── Double-Entry General Ledger (GL) Engine (`/api/gl/*`)
│   ├── Automated Real-time Accounting Posting Hooks
│   ├── Real-time Trial Balance, Profit & Loss, Balance Sheet
│   ├── Indian GST Calculation (CGST/SGST/IGST) & E-Way Bill JSON (`/api/invoices`)
│   ├── Statutory Return Merchandise Authorizations (RMA) & Credit Notes (`/api/rma`, `/api/credit-notes`)
│   └── Tally Prime & Zoho Books XML / API Bridge (`/api/tally-export`)
│
├── 7. SaaS Foundation & Security Shield
│   ├── Multi-Tenant Isolated Subdomains (`{tenant}.acustock.com`)
│   ├── Subscription Tiers, Overage Metering & Billing (`/api/billing`)
│   ├── Enterprise Identity: Google OAuth 2.0 & SAML 2.0 SSO (`/api/auth/google`, `saml.service.js`)
│   ├── Hardware & App TOTP Two-Factor Authentication (`/api/two-factor`)
│   ├── Immutable Merkle-Chain Business Audit Logs (`/api/activity`)
│   └── Security Shields: NoSQL Sanitizer, XSS Guard, CSRF, SSRF, Maintenance Mode
```

---

## 4. Quick Start

### Prerequisites

- **Node.js**: `>= 18.0.0`
- **MongoDB**: `8.x` (Local native) or `7.0` (Docker container) configured as a replica set (`rs0`)
- **Redis** (optional): `7.x` (Server will fall back to in-memory sliding counters if omitted)

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/your-org/acustock.git
cd acustock

# Install Backend Dependencies
cd backend && npm install

# Install Frontend Dependencies
cd ../frontend/web && npm install
```

### Step 2: Configure Environment Files

```bash
# Backend Environment Configuration
cp backend/.env.example backend/.env

# Frontend Environment Configuration
cp frontend/web/.env.local.example frontend/web/.env.local
```

### Step 3: Initialize MongoDB Replica Set (Required for ACID Transactions)

AcuStock utilizes multi-document transactions for inventory balancing and journal posting.

```bash
# Start MongoDB with replica set flag
mongod --replSet rs0 --dbpath /data/db --port 27017 &

# Initiate the replica set
mongosh --eval "rs.initiate()"
```

### Step 4: Seed RBAC Roles, Indexes & Chart of Accounts

```bash
cd backend

# Seed RBAC system permissions and default roles
npm run seed

# Build compound database indexes for search and tenancy
npm run db:index
```

> [!NOTE]
> The **Chart of Accounts (COA)** is seeded automatically on the first financial transaction of each tenant via `journalEngine.service.js`.

### Step 5: Start Local Development Servers

```bash
# Terminal 1 — Express Backend API (Port 5001)
cd backend && npm run dev

# Terminal 2 — Next.js 16 Web Dashboard (Port 3000)
cd frontend/web && npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** to access the landing page and dashboard.

---

## 5. Environment Variables

### Backend Configuration (`backend/.env`)

```dotenv
# ── Server & Runtime ───────────────────────────
PORT=5001
NODE_ENV=development
# Options: development | production | test

# ── Database (Replica set required for ACID) ───
MONGODB_URI=mongodb://localhost:27017/acustock?replicaSet=rs0&directConnection=true

# ── JWT Authentication & Token Rotation ────────
JWT_SECRET=your-256-bit-access-token-secret-change-this-in-production
JWT_REFRESH_SECRET=your-256-bit-refresh-token-secret-change-this-in-production
JWT_EXPIRE=15m

# ── Frontend & CORS Origins ────────────────────
FRONTEND_URL=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5001
FRONTEND_BASE_URL=http://localhost:3000

# ── Google OAuth 2.0 (Optional) ────────────────
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5001/api/auth/google/callback

# ── SMTP Email Relay (Nodemailer) ──────────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=AcuStock Support <noreply@acustock.com>

# ── Redis Cache & Rate-Limiting (Optional) ─────
REDIS_URL=redis://localhost:6379

# ── File Upload & S3 / R2 Object Storage ───────
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
S3_BUCKET=acustock-production-assets
S3_REGION=ap-south-1
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# ── Security & Account Lockout Policies ────────
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=300
LOCK_DURATION_MINUTES=15
SESSION_COOKIE_SECURE=false

# ── Application Logging ────────────────────────
LOG_LEVEL=info
LOG_FILE=logs/app.log

# ── SaaS Billing & Gateway Configuration ───────
PAYMENT_MODE=live
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_WEBHOOK_MAX_ATTEMPTS=5
PAYMENT_GRACE_PERIOD_DAYS=3
QUOTA_RESERVATION_TTL_SECONDS=900

# ── Razorpay Gateway (Native REST Integration) ─
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# ── Indian Logistics & Courier APIs ────────────
PORTER_API_KEY=
DELHIVERY_API_KEY=
DELHIVERY_WEBHOOK_SECRET=
DTDC_API_KEY=
BLUEDART_CLIENT_ID=
BLUEDART_LICENSE_KEY=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=

# ── Meta WhatsApp Cloud API (Notifications) ────
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# ── Gemini GenAI Copilot & Document OCR ────────
GEMINI_API_KEY=
```

### Frontend Configuration (`frontend/web/.env.local`)

```dotenv
# API Base Endpoint (Proxied via Next.js rewrites)
NEXT_PUBLIC_API_URL=http://127.0.0.1:5001/api
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5001

# Sentry Performance & Error Monitoring (Optional)
NEXT_PUBLIC_SENTRY_DSN=

# Google Maps Platform Key (Live Fleet & Vehicle Tracking)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

---

## 6. Core Functional Modules

### 6.1 Warehouse Locations & 3D Digital Twin

Multi-branch warehouse hierarchy modeled down to coordinate precision: `Warehouse → Zone → Aisle → Rack → Shelf → Bin`.

- **3D Digital Twin**: Rendered in client-side WebGL via Three.js. Provides a live heat-map of warehouse bin utilization, highlighting congested aisles and pick hotspots.
- **Dimensional Restrictions**: Every bin stores physical volume limits ($m^3$) and maximum weight load ($kg$). System prevents over-allocation during put-away.
- **Zone Segregation**: Bulk Storage, Pick-Face, Cold Chain, Flammable/Hazmat, Quarantine, and Staging.

```
Model: Warehouse.js, WarehouseLocation.js
Routes: /api/warehouses, /api/locations
Frontend: /dashboard/[role]/warehouses
```

---

### 6.2 Inventory Lifecycle & Stock Adjustments

Comprehensive stock tracking with reason codes, approvals, and dual-entry audit logging.

- **Movement Types**: Stock In (Receipt/GRN), Stock Out (Dispatch), Transfer (In-Transit), Scrap, and Shrinkage.
- **Stock Ledger**: Every change creates an immutable transaction in `StockLedger.js` recording prior quantity, delta, new quantity, actor, and cost layer.
- **Approval Hierarchy**: Stock write-offs exceeding configurable monetary thresholds require Manager or Admin approval before balance adjustment.

```
Model: Stock.js, StockLedger.js, InventoryAdjustment.js, StockTransfer.js
Routes: /api/stock, /api/adjustments, /api/stock-transfers
Frontend: /dashboard/[role]/adjustments, /dashboard/[role]/stock-in, /dashboard/[role]/stock-out
```

---

### 6.3 Landed Cost Allocation & Valuation (FIFO / WAVG)

Accurately amortize ancillary freight, customs duties, insurance, and handling charges directly into inventory asset value.

- **Apportionment Rules**:
  - By **Weight** ($kg$)
  - By **Volume** ($m^3$)
  - By **Item Value** (ad valorem)
  - By **Unit Quantity**
- **Valuation Methods**:
  - **FIFO (First-In, First-Out)**: Maintains discrete cost layers per receipt batch.
  - **Weighted Average (WAVG)**: Continually updates average unit cost on every Goods Receipt.

```
Model: LandedCost.js, Stock.js
Routes: /api/valuation/landed-cost, /api/valuation/stock-value
Frontend: /dashboard/[role]/valuation
```

---

### 6.4 Supplier Management & Performance Scorecards

Vendor qualification, relationship management, and algorithmic scoring.

- **Vendor Performance Algorithm**:
  $$\text{Score} = (w_1 \times \text{OTD}\%) + (w_2 \times \text{Quality Acceptance}\%) + (w_3 \times \text{Invoice Accuracy}\%) - (w_4 \times \text{Lead Time Variance})$$
- **Supplier Tiers**: Automatically classified into Tier A (Preferred), Tier B (Standard), Tier C (At Risk), or Tier D (Probation).
- **PO Workflows**: Direct conversion from automated reorder alerts to formal Purchase Orders.

```
Model: SupplierProfile.js, PurchaseOrder.js
Routes: /api/suppliers, /api/purchase-orders
Frontend: /dashboard/[role]/suppliers, /dashboard/[role]/purchase-orders
```

---

### 6.5 Multi-Level BOM, Kits & Assembly Work Orders

Full support for discrete manufacturing, kit bundling, and disassembly.

- **Multi-Level Explosion**: Explodes complex parent assemblies down to individual sub-components with circular dependency detection.
- **Component Scrap Factors**: Accounts for raw material shrinkage:
  $$\text{Gross Component Qty} = \text{Demand} \times \text{Multiplier} \times (1 + \text{ScrapFactor\%})$$
- **Work Orders**: Reserves raw material components, dispatches kit assemblies, and posts finished goods stock.

```
Model: Kit.js, WorkOrder.js
Routes: /api/kits, /api/kits/:id/assemble
Frontend: /dashboard/[role]/kits
```

---

### 6.6 Expiry Tracking, Quarantine & FEFO Picking

Rigorous compliance for pharmaceuticals, chemical lots, and perishable goods.

- **FEFO (First-Expired, First-Out)**: Outbound pick lists automatically order lots by nearest expiration date rather than arrival order.
- **Quarantine Locking**: Lots with expiration within $N$ days are automatically locked from sales order allocation.
- **Proactive Dispositions**: Configurable alerts at 90, 60, and 30-day thresholds for markdown or disposal.

```
Model: InventoryLot.js
Routes: /api/expiry/alerts, /api/expiry/reconcile
Frontend: /dashboard/[role]/lots
```

---

### 6.7 Cycle Counts & Physical Reconciliation

Continuous inventory auditing without requiring full warehouse shutdowns.

- **ABC Cycle Count Engine**: Generates scheduled counting cycles based on velocity (Category A: Monthly, B: Quarterly, C: Semi-Annually).
- **Variance Analysis**: Calculates count variances, tolerance percentages, and generates automated GL reconciliation entries for write-ups/write-downs.

```
Model: CycleCount.js, ReconciliationTask.js
Routes: /api/cycle-counts, /api/reconciliation
Frontend: /dashboard/[role]/cycle-counts, /dashboard/[role]/reconciliation
```

---

### 6.8 Lot & Serial Number Traceability

Bi-directional lineage tracking from upstream vendor lots to end customers.

- **Upstream Trace**: Trace any customer warranty claim back to production run, raw materials, and vendor GRN.
- **Downstream Trace**: Instantly locate every customer who received items from a recalled batch.
- **Label Sheet Generation**: Renders PDF sheets formatted for standard barcode/QR thermal sticker formats.

```
Model: InventoryLot.js, SerialAudit.js, Warranty.js
Routes: /api/lots, /api/traceability, /api/labels, /api/warranty
Frontend: /dashboard/[role]/serials, /dashboard/[role]/warranty
```

---

### 6.9 Demand Forecasting & Automated PO Reorder

Statistical stock forecasting models and proactive automated reordering.

- **Forecasting Models**: Moving Average, Holt-Winters Exponential Smoothing, and Seasonality Indexing.
- **Dynamic Reorder Calculations**:
  $$\text{Safety Stock} = Z \times \sigma_{\text{demand}} \times \sqrt{\text{Lead Time}}$$
  $$\text{Reorder Point (ROP)} = (\text{Avg Daily Demand} \times \text{Lead Time}) + \text{Safety Stock}$$
- **Auto-Reorder Engine**: Generates draft Purchase Orders when stock reaches ROP.

```
Model: PurchaseOrder.js, Item.js
Routes: /api/forecasts, /api/reorder/auto
Frontend: /dashboard/[role]/analytics/forecasting, /dashboard/[role]/reorder-hub
```

---

### 6.10 Aging, ABC Classification & Slow-Moving Stock

Identify stagnant capital and optimize inventory turnover.

- **Aging Buckets**: Automatically segments stock into `0-30`, `31-60`, `61-90`, `91-180`, and `180+` days.
- **Pareto ABC Analysis**:
  - **Category A**: Top 80% of revenue / usage value (~20% of SKUs)
  - **Category B**: Next 15% of value (~30% of SKUs)
  - **Category C**: Remaining 5% of value (~50% of SKUs)

```
Model: Stock.js, StockLedger.js
Routes: /api/aging, /api/aging/abc
Frontend: /dashboard/[role]/remaining-stock, /dashboard/[role]/analytics
```

---

### 6.11 Bulk Data Import & Portability (CSV/XLSX)

Enterprise ingestion pipeline with transactional validation and rollback.

- **Supported Schemas**: Products/Catalog, Suppliers, Opening Balances, Customers, BOM Kits, and Chart of Accounts.
- **Validation Engine**: Detailed row-by-row error report identifying invalid formats or missing relations prior to insertion.
- **Audit History**: Every bulk job creates an `ImportHistory` record enabling single-click rollback.

```
Model: ImportHistory.js
Routes: /api/import-history, /api/csv-export
Frontend: /dashboard/[role]/import-history
```

---

### 6.12 Mobile WMS, Barcode Scanner & 3D Landing Experience

PWA-ready mobile warehouse client and interactive homepage scene.

- **Interactive 3D Landing Experience**: Powered by Three.js (`ThreeLandingScene.tsx`) on `/`, featuring dynamic particle-based logistics flows.
- **Camera Barcode/QR Scanner**: Browser-based scanning with zero native app requirement.
- **Hardware Barcode Gun Support**: Dedicated hook (`use-hardware-barcode-gun.ts`) captures fast USB/Bluetooth HID keystrokes without losing focus.

```
Routes: /dashboard/[role]/scan
Components: ThreeLandingScene.tsx, mobile-barcode-scanner.tsx, scan-action-overlay.tsx
```

---

### 6.13 Wave, Batch & Cluster Picking with Put-Wall Sorting

Enterprise warehouse picking engine minimizing travel time and fulfillment latency.

#### S-Shape Snake Traversal Algorithm
Orders are sorted into pick sequences designed to traverse aisles in an alternating serpentine motion without backtracking:
$$\text{SortKey} = (\text{Aisle} \times 10000) + \left(\text{isEven}(\text{Aisle}) \ ? \ \text{Rack} : (100 - \text{Rack})\right) \times 100 + \text{Shelf}$$

#### 24-Cubby Put-Wall Sorting Matrix
- **Matrix Layout**: 6 Columns $\times$ 4 Rows (24 discrete cubbies).
- **Socket.IO Push**: Color-coded visual status updates (Empty, In-Progress, Complete).
- **Order Pack-Out**: When an order is fully picked and packed, cubby transitions to green and generates a packing slip.

```
Model: PickingWave.js
Routes: /api/picking-waves
Frontend: /dashboard/[role]/picking-waves, put-wall-station.tsx, mobile-picker-runner.tsx
```

---

### 6.14 Tax Invoicing & Accounts Receivable (GST & E-Way Bill)

End-to-end billing engine compliant with Indian Goods and Services Tax (GST) statutes.

- **Tax Determination**:
  - Intra-State: Split into **CGST** (50%) and **SGST** (50%).
  - Inter-State: Full rate applied to **IGST**.
- **E-Way Bill Generation**: Generates compliant NIC JSON payloads (v1.0.3) for outward goods movement exceeding ₹50,000.
- **PDF Engine**: PDFKit renders watermarked invoices with dynamic QR codes and HSN/SAC summary tables.

```
Model: Invoice.js, PaymentReceipt.js
Routes: /api/invoices, /api/invoices/:id/eway-bill, /api/invoices/:id/send
Frontend: /dashboard/[role]/invoices
```

---

### 6.15 Accounts Payable & Automated 3-Way Match

Prevent duplicate billing, over-billing, and unauthorized vendor payments.

```
    Purchase Order (PO)        Goods Receipt Note (GRN)        Vendor Bill (Invoice)
  [Quantity & Agreed Price]   [Physically Received Units]    [Billed Price & Taxes]
             │                            │                            │
             └────────────────────────────┼────────────────────────────┘
                                          │
                             3-Way Matching Engine
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
          Passes Tolerance                               Fails Tolerance (>2%)
      (Auto-Approve & Post GL)                          (Quarantine to Exception Queue)
```

- **Tolerance Rules**: Customizable tolerance thresholds (e.g., price variance $\le 2\%$, quantity variance $\le 1\%$).
- **GL Posting**: Auto-posts to `Accounts Payable` and clears `Goods Received Not Invoiced (GRNI)`.

```
Model: VendorBill.js, VendorPayment.js
Routes: /api/vendor-bills
Frontend: /dashboard/[role]/vendor-bills
```

---

### 6.16 Return Merchandise Authorization (RMA) & Credit Notes

Structured return management for damaged, defective, or incorrect shipments.

1. **RMA Initiation**: Raised by staff or directly by customers via the B2B portal.
2. **Quarantine Inspection**: Warehouse inspects returned items, recording condition and serial numbers.
3. **Disposition**: Restock into primary inventory, Scrap, or Return-to-Vendor.
4. **Credit Note Issuance**: Generates statutory GST credit note and reconciles Accounts Receivable.

```
Model: RMA.js, CreditNote.js
Routes: /api/rma, /api/credit-notes
Frontend: /dashboard/[role]/rma
```

---

### 6.17 B2B Customer & Supplier Self-Service Portals

External stakeholder portals with tokenized security.

- **Customer Portal** (`/portal/customer/*`):
  - Live product catalog with wholesale price tiers (`/portal/customer/catalog`).
  - Invoice history, PDF downloads, and online payment settlement (`/portal/customer/invoices`).
  - Self-service RMA return tracking.
- **Supplier Portal** (`/portal/supplier/*`):
  - View and confirm open Purchase Orders (`/portal/supplier/orders`).
  - Generate Advance Shipment Notices (**ASN**) with lot details (`/portal/supplier/asn`).
  - Submit electronic invoices for automated 3-way matching.

```
Model: ASN.js, SalesOrder.js, PurchaseOrder.js
Routes: /api/portal/*
Frontend: /portal/customer/*, /portal/supplier/*
```

---

### 6.18 CRM Pipeline & Quotation-to-Order Conversion

Complete sales execution engine integrated with warehouse availability.

- **Deal Pipeline**: Visual Kanban board (`Lead → Qualified → Proposal → Negotiation → Won/Lost`).
- **Live Stock Quotations**: Validates on-hand stock and safety levels while generating price quotes.
- **Credit Risk Profiling**: Blocks quotation conversion if a customer's total unpaid invoices exceed their credit ceiling.

```
Model: CrmDeal.js, SalesOrder.js
Routes: /api/crm/*, /api/sales-orders
Frontend: /dashboard/[role]/crm, /dashboard/[role]/sales-orders
```

---

### 6.19 Double-Entry General Ledger (GL) & Financial Statements

Production-grade double-entry bookkeeping engine enforcing mathematical balance invariants.

#### The Fundamental Accounting Invariant
Every transaction must satisfy the zero-balance equation before persistence:
$$|\sum \text{Debits} - \sum \text{Credits}| < 0.01$$

#### Real Standard Chart of Accounts (Seeded via `DEFAULT_COA`)

AcuStock seeds the following **20 system accounts** across assets, liabilities, equity, revenue, and expenses:

| Code | Account Name | Type | Normal Balance | Classification |
|---|---|---|:---:|---|
| **1010** | Cash on Hand | `ASSET` | Debit | Current Asset |
| **1020** | Bank - Operating Account | `ASSET` | Debit | Bank Account |
| **1200** | Accounts Receivable (AR) | `ASSET` | Debit | Accounts Receivable |
| **1300** | Inventory Asset | `ASSET` | Debit | Inventory Valuation |
| **1400** | Goods Received Not Invoiced (GRNI) | `ASSET` | Credit | Current Asset (Clearing) |
| **1510** | Input CGST Tax Credit | `ASSET` | Debit | GST Tax Credit |
| **1520** | Input SGST Tax Credit | `ASSET` | Debit | GST Tax Credit |
| **1530** | Input IGST Tax Credit | `ASSET` | Debit | GST Tax Credit |
| **2000** | Accounts Payable (AP) | `LIABILITY` | Credit | Accounts Payable |
| **2110** | Output CGST Payable | `LIABILITY` | Credit | Statutory Tax Payable |
| **2120** | Output SGST Payable | `LIABILITY` | Credit | Statutory Tax Payable |
| **2130** | Output IGST Payable | `LIABILITY` | Credit | Statutory Tax Payable |
| **3000** | Owner's Equity & Capital | `EQUITY` | Credit | Equity |
| **3100** | Retained Earnings | `EQUITY` | Credit | Equity |
| **4000** | Wholesale Sales Revenue | `REVENUE` | Credit | Operating Income |
| **4100** | Shipping & Freight Income | `REVENUE` | Credit | Ancillary Income |
| **5000** | Cost of Goods Sold (COGS) | `EXPENSE` | Debit | Direct Cost |
| **5100** | Inbound Freight & Landed Cost | `EXPENSE` | Debit | Direct Landed Cost |
| **5200** | Inventory Shrinkage & Scrap Loss | `EXPENSE` | Debit | Operating Loss |
| **5300** | Warehouse Operating Expenses | `EXPENSE` | Debit | Indirect Operating Expense |

#### Automated Real-Time Posting Hooks

Operational events post balanced journal entries without manual intervention:

| Operational Event | Debit Account | Credit Account |
|---|---|---|
| **Tax Invoice Authorized** | Accounts Receivable (`1200`) | Wholesale Revenue (`4000`) + GST Payable (`2110-2130`) |
| **Customer Payment Received** | Bank Operating (`1020`) | Accounts Receivable (`1200`) |
| **Goods Receipt Confirmed (GRN)** | Inventory Asset (`1300`) | Goods Received Not Invoiced (`1400`) |
| **Vendor Bill Matched** | Goods Received Not Invoiced (`1400`) + Input Tax (`1510-1530`) | Accounts Payable (`2000`) |
| **Vendor Payment Dispatched** | Accounts Payable (`2000`) | Bank Operating (`1020`) |
| **Inventory Shrinkage / Scrap** | Inventory Shrinkage Loss (`5200`) | Inventory Asset (`1300`) |

```
Model: Account.js, JournalEntry.js
Routes: /api/gl/*
Frontend: /dashboard/[role]/general-ledger
```

---

### 6.20 Manufacturing MRP Engine & Work Center Shop-Floor Routing

Full Material Requirements Planning and finite capacity shop-floor scheduling.

#### MRP Explosion & Net Requirements Calculation
1. **Demand Aggregation**: Reads gross demand from confirmed Sales Orders and demand forecasts.
2. **Recursive BOM Explosion**: Calculates total gross requirements across multi-level assemblies.
3. **Netting Formulation**:
   $$\text{Net Qty} = \max\left(0, \ \text{Gross Qty} - \text{Stock On-Hand} - \text{PO On-Order} + \text{Safety Stock}\right)$$
4. **Backward Scheduling**:
   $$\text{Planned Order Release Date} = \text{Order Due Date} - \text{Manufacturing Lead Time (Days)}$$

#### Work Centers & Machine Routing
Every kit includes an ordered routing operation queue linked to a `WorkCenter`:

| Work Center Metric | Description |
|---|---|
| `setupTimeMin` | Batch tooling setup duration |
| `runTimeMin` | Unit processing duration |
| `laborRatePerHour` | Direct hourly technician rate |
| `machineRatePerHour` | Hourly machine depreciation & power rate |
| `efficiencyPercent` | Work center utilization multiplier |
| `dailyCapacityHours` | Total available operating hours per shift |

$$\text{Operation Cost} = \left(\frac{\text{Run Time Min} \times (\text{Labor Rate} + \text{Machine Rate})}{60}\right) \times \left(\frac{100}{\text{Efficiency\%}}\right)$$

```
Model: WorkCenter.js, ProductionPolicy.js, Kit.js, WorkOrder.js
Routes: /api/manufacturing/*
Frontend: /dashboard/[role]/manufacturing
```

---

### 6.21 Indian Logistics & Real-Time Courier Integrations

Pre-integrated logistics APIs for automated shipment dispatch, AWB generation, and milestone tracking.

- **Integrated Couriers**:
  - **Shiprocket**: Multi-carrier aggregation via `ShiprocketService.js`.
  - **Delhivery**: Direct API for surface and express delivery.
  - **Blue Dart**: B2B enterprise cargo bookings.
  - **DTDC**: Pan-India domestic coverage.
  - **Porter**: Intra-city on-demand local truck dispatch.
- **Tracking Poller**: Automated background poller (`trackingPoller.js`) updates delivery milestones (`PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`).

```
Model: Shipment.js, ShippingLabel.js, TrackingEvent.js, Transporter.js
Routes: /api/shipments, /api/tracking, /api/transporters
Frontend: /dashboard/[role]/shipments
```

---

### 6.22 Tally Prime & Zoho Books Accounting Export Bridge

Synchronize inventory transactions with external Indian ERP and accounting software.

- **Tally Prime XML Engine**:
  - Exports standard XML vouchers: Sales Vouchers, Purchase Vouchers, Journal Vouchers, and Payment Vouchers.
  - Generates Tally-compliant ledger master tags, including GSTIN and HSN classifications.
- **Zoho Books API Bridge**:
  - Direct REST integration to synchronize invoices, credit notes, and customer balances.

```
Routes: /api/tally-export/journals, /api/tally-export/sales, /api/tally-export/purchases
```

---

### 6.23 AI Copilot, Invoice OCR & WhatsApp Automation

Machine intelligence powered by **Google Gemini 2.0 Flash** (`@google/genai`).

- **Conversational Copilot**: Natural language interface answering complex queries:
  > *"Which items in Zone B have not moved in 60 days but have pending reorders?"*
- **Visual Invoice OCR**: Upload PDF or image invoices from vendors; Gemini extracts vendor name, invoice date, line items, tax breakdowns, and totals into draft Vendor Bills.
- **WhatsApp Cloud API Integration**: Automated customer alerts for dispatch, out-for-delivery notifications, and low-stock warnings to warehouse managers.

```
Routes: /api/ai-copilot, /api/ai-ocr
Services: WhatsApp Cloud API, Gemini Core Agent
```

---

### 6.24 Multi-Tenant SaaS Engine, Quotas & Enterprise Auth (SAML/OAuth)

Turnkey SaaS platform architecture supporting self-service registration and white-labeling.

- **Tenant Subdomain Routing**: Supports tenant-specific subdomains (`tenant1.acustock.com`).
- **SaaS Quota Metering**: `checkPlanLimits.js` middleware enforces SKU limits, active user seats, and AI request credits with quota reservations (`QuotaReservation.js`).
- **Enterprise Authentication**:
  - **SAML 2.0 SSO**: Enterprise identity integration with Okta, Azure AD, and Google Workspace (`saml.service.js`).
  - **Google OAuth 2.0**: Native sign-in flow (`/api/auth/google`).
  - **Hardware & App 2FA**: Time-based one-time passwords (TOTP) via `otplib`.

```
Model: Tenant.js, QuotaReservation.js, User.js, ApiKey.js
Routes: /api/tenants, /api/register-tenant, /api/billing, /api/two-factor
Frontend: /billing, /dashboard/[role]/settings/permissions, /dashboard/[role]/developer
```

---

### 6.25 Security Hardening, Merkle Audit Chains & Resilience

Production defense-in-depth architecture.

- **Cryptographic Merkle Audit Trail**: Audit log entries in `AuditLog.js` include SHA-256 parent hashes forming an immutable ledger of all financial and inventory adjustments (`auditIntegrity.service.js`).
- **Injection Defenses**:
  - `noSqlSanitizer.js`: Strips `$` and `.` operators from request payloads.
  - `xssSanitizer.js`: Neutralizes malicious script tags and DOM injection.
  - `csrf.js`: Double-submit cookie verification.
- **SSRF Defense**: Outbound webhooks and URL fetchers validate hostnames against an allowlist and reject loopback/internal RFC1918 IPs (`safeHttpClient.js`).
- **Maintenance Mode**: Middleware (`maintenanceMode.js`) allows administrators to place the platform in read-only mode during schema migrations.

---

## 7. API Reference (70 Route Modules · 463 Production Operations)

AcuStock features a complete, enterprise-grade OpenAPI 3.0.3 specification covering all **463 route operations** across **397 unique endpoints**. The full interactive specification is available at `/api/docs` and checked into [`docs/openapi.json`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/docs/openapi.json) and [`docs/openapi.yaml`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/docs/openapi.yaml).

All endpoints require the standard Bearer token header, except for public endpoints (`/api/auth/login`, `/api/register-tenant`, `/api/tracking/public/:reference`, and tokenized customer/supplier portal endpoints):
```http
Authorization: Bearer <jwt_access_token>
X-Tenant-ID: <tenant_id>
```

### Complete Route Map (70 Production Modules)

| Module File | Base URI | Purpose & Operations |
|---|---|---|
| `auth.js` | `/api/auth` | Login, registration, token refresh, password resets, SAML SSO (`/api/auth/sso/*`) |
| `google-auth.js` | `/api/auth/google` | Google OAuth 2.0 handshake and callback |
| `two-factor.js` | `/api/two-factor` | TOTP 2FA secret generation, verify, disable |
| `sessions.js` | `/api/sessions` | Active device sessions, remote revocation |
| `users.js` | `/api/users` | User CRUD, branch assignments, role mapping |
| `permissions.js` | `/api/permissions` | Granular capability definitions and role assignment |
| `tenants.js` | `/api/tenants` | Tenant profile, branding, custom domain settings |
| `register-tenant.js`| `/api/register-tenant` | Public self-service tenant registration |
| `ownership.js` | `/api/ownership` | Tenant superadmin ownership transfer |
| `onboarding.js` | `/api/onboarding` | Interactive setup wizard state and initialization |
| `setup.js` | `/api/setup` | First-run system initialization check |
| `warehouses.js` | `/api/warehouses` | Warehouse facility definitions, 3D Digital Twin CAD, and AMR Pick-Path routing |
| `locations.js` | `/api/locations` | Hierarchical bins, 3D coordinates, weight limits |
| `items.js` | `/api/items` | Master catalog, variants, HSN codes, reorder points |
| `units.js` | `/api/units` | Units of Measure (UOM) definitions and conversions |
| `stock.js` | `/api/stock` | Real-time on-hand stock queries and adjustments |
| `adjustments.js` | `/api/adjustments` | Reason-coded stock increases, scrap, write-offs |
| `stock-transfers.js`| `/api/stock-transfers`| Inter-warehouse transfer manifests, ACID shipping, shortage-aware receiving |
| `reservations.js` | `/api/reservations` | Soft stock reservation allocations for orders |
| `lots.js` | `/api/lots` | Batch creation, manufacturer dates, expiry dates |
| `expiry.js` | `/api/expiry` | FEFO near-expiry alerts and quarantine disposition |
| `cycle-counts.js` | `/api/cycle-counts` | Cycle count schedules, count entry, variance reports |
| `reconciliation.js`| `/api/reconciliation`| Reconciliation tasks, physical vs book balance |
| `traceability.js` | `/api/traceability` | Bi-directional lot and serial number trace trees |
| `warranty.js` | `/api/warranty` | Serial warranty registration, status, claims |
| `labels.js` | `/api/labels` | Printable thermal barcode and QR PDF generation |
| `purchase-orders.js`| `/api/purchase-orders`| PO lifecycle: Draft, Approve, Receive (GRN), Cancel |
| `suppliers.js` | `/api/suppliers` | Vendor profiles, scorecards, performance metrics |
| `vendor-bills.js` | `/api/vendor-bills` | AP invoices, 3-way matching, payment scheduling |
| `valuation.js` | `/api/valuation` | Landed cost allocation, FIFO/WAVG asset valuation |
| `reorder.js` | `/api/reorder` | Dynamic reorder calculation and auto-PO dispatch |
| `forecasts.js` | `/api/forecasts` | Exponential smoothing and moving average forecasts |
| `sales-orders.js` | `/api/sales-orders` | Outbound sales orders, picking allocation, fulfillment |
| `picking-waves.js` | `/api/picking-waves` | Wave generation, S-shape routing, put-wall station |
| `packages.js` | `/api/packages` | Shipping package dimensioning, tare weights |
| `shipments.js` | `/api/shipments` | Carrier assignment, manifest generation, dispatch |
| `tracking.js` | `/api/tracking` | Multi-carrier status webhooks, live fleet telemetry, on-demand Porter booking, and e-POD |
| `transporters.js` | `/api/transporters` | Dedicated carrier fleet and driver management |
| `logistics.js` | `/api/logistics` | Real-time courier rate comparison and booking |
| `invoices.js` | `/api/invoices` | Tax Invoices, GST calculations, E-Way Bill JSON |
| `credit-notes.js` | `/api/credit-notes` | Statutory GST credit notes and AR adjustments |
| `rma.js` | `/api/rma` | Customer return authorizations, quarantine inspect |
| `portal.js` | `/api/portal` | Tokenized B2B customer and supplier portal data |
| `crm.js` | `/api/crm` | Leads, deals, pipeline stages, quote builder |
| `kits.js` | `/api/kits` | Multi-level Bill of Materials (BOM) & assembly |
| `manufacturing.js` | `/api/manufacturing` | Work centers, shop-floor routing, MRP runs |
| `general-ledger.js`| `/api/gl` | Chart of accounts, manual journals, TB, P&L, BS |
| `tally-export.js` | `/api/tally-export` | Tally Prime XML vouchers and ledger exports |
| `aging.js` | `/api/aging` | Inventory aging buckets and Pareto ABC analysis |
| `import-history.js`| `/api/import-history`| Bulk upload logs, error manifests, batch rollbacks |
| `csv-export.js` | `/api/csv-export` | Export inventory, sales, aging, and ledger to CSV |
| `reports.js` | `/api/reports` | Standard business reports and KPI summaries |
| `reports-scheduled.js`| `/api/reports-scheduled`| Cron-scheduled automated report delivery (Distributed Leader Lock protected) |
| `dashboard.js` | `/api/dashboard` | Real-time aggregate KPIs for dashboard views |
| `metrics.js` | `/api/metrics` | System health and resource telemetry endpoints |
| `search.js` | `/api/search` | Global multi-entity full-text elastic search |
| `activity.js` | `/api/activity` | Cryptographic Merkle audit log feed |
| `notifications.js`| `/api/notifications`| Notification center, read status, channel preferences |
| `billing.js` | `/api/billing` | Stripe/Razorpay subscription plans, invoices, quotas |
| `superadmin.js` | `/api/superadmin` | Cross-tenant administration, maintenance switches |
| `governance.js` | `/api/superadmin/governance` | Enterprise module & section governance control plane |
| `managers.js` | `/api/managers` | Warehouse manager assignments and staff scoping |
| `companies.js` | `/api/companies` | Multi-company legal entities under a single tenant |
| `invites.js` | `/api/invites` | User team invitation tokens and role assignments |
| `backups.js` | `/api/backups` | Manual database snapshots and S3 archive status |
| `gdpr.js` | `/api/gdpr` | Full tenant data export and right-to-be-forgotten |
| `settings.js` | `/api/settings` | Tenant preferences, currency, tax rates |
| `apiKeys.js` | `/api/apiKeys` | Developer API keys with scoped capabilities |
| `webhooks.js` | `/api/webhooks` | Outbound webhook subscriptions, delivery logs |
| `ecommerce-webhooks.js`| `/api/ecommerce-webhooks`| Shopify, WooCommerce, Amazon inbound webhooks |
| `docs.js` | `/api/docs` | OpenAPI 3.0.3 specification presentation |

---

## 8. RBAC — Roles & Permissions Matrix

AcuStock provides granular Role-Based Access Control enforced at the route and service levels:

| Capability / Resource | Super Admin | Admin | Manager | Accountant | Warehouse Staff | Picker | Viewer | Supplier | Customer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Tenant & Domain Settings | ✓ | ✓ | — | — | — | — | — | — | — |
| User & Role Administration | ✓ | ✓ | — | — | — | — | — | — | — |
| Stock Adjustment Creation | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |
| Stock Adjustment Approval | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Purchase Order Authorization | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Goods Receipt Processing (GRN)| ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |
| Tax Invoicing & Credit Notes | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| General Ledger Manual Journals | ✓ | ✓ | — | ✓ | — | — | — | — | — |
| Financial Statements (P&L, BS)| ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| Wave Generation & Routing | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |
| Barcode Pick Confirmation | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| MRP Execution & Work Centers | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Supplier Portal Self-Service | — | — | — | — | — | — | — | ✓ | — |
| Customer Portal Invoices/Orders| — | — | — | — | — | — | — | — | ✓ |
| Developer API Keys & Webhooks | ✓ | ✓ | — | — | — | — | — | — | — |
| Cryptographic Audit Trail | ✓ | ✓ | — | — | — | — | — | — | — |
| GDPR Data Export & Erase | ✓ | ✓ | — | — | — | — | — | — | — |

### 8.1 Enterprise Module & Section Governance Control Plane

AcuStock features a dedicated **Super Admin Governance Control Plane** (`/dashboard/superadmin/governance`) that allows Super Admins to dynamically control feature visibility, section availability, and mutation privileges across the entire workforce.

- **Canonical Catalog**: 7 standard enterprise sections (`operations`, `inventory`, `manufacturing`, `procurement`, `finance`, `customers`, `analytics`) and 32 discrete modules.
- **Tri-State Granular Access**: Every module can be configured as `FULL_ACCESS`, `READ_ONLY` (view-only badges, blocking mutations with `403 Forbidden`), or `HIDDEN` (completely hidden from UI, navigation, and API).
- **Hierarchical Governance Resolution**:
  1. *Super Admin Immunity*: `SUPER_ADMIN` is hard-locked with full bypass immunity against lockout.
  2. *Worker Custom Overrides*: Individual employees can be granted specialized exceptions overriding role defaults.
  3. *Time-Bound Shift Delegation*: Temporary worker delegations support `expiresAt` timestamps (e.g. 8-hour shift coverage or seasonal inventory audits) that revert automatically upon expiration.
  4. *Role-Level Section & Module Policies*: Bulk disablement cascades across all member users instantly.
  5. *Data Loss Prevention (DLP)*: Worker-level `maskFinancials` hides margins/costs, and `disableExport` blocks CSV/Excel exfiltration.
- **Pre-Built Enterprise Persona Presets**: 1-click policy templates for *Warehouse Picker*, *Inventory Auditor*, *Shop Floor Lead*, *Billing Specialist*, *Procurement Officer*, and *Sales Representative*.
- **Zero-Latency Push Revocation**: Live WebSocket broadcasts (`governance:revoked`) instantly synchronize active sessions without requiring page reloads or token re-issuance.
- **Snapshot Revisioning & Rollback**: Every governance policy change produces a cryptographically referenced `GovernanceSnapshot`, enabling 1-click operational rollback.
- **Omni-Channel UI Hiding & Search DLP**: Sidebar auto-collapses empty sections, direct URL visits are routed with security toasts, and the global search (`Cmd+K`) filters out hidden modules.

---

## 9. Complete Test Suite Index (65 Test Suites)

The AcuStock backend is covered by **65 automated test suites** built using the Node.js native test runner (`node --test`).

```bash
# Execute all 65 test suites
cd backend && npm test

# Run key enterprise suites individually
node --test tests/module-governance.test.js
node --test tests/wave-batch-picking.test.js
node --test tests/general-ledger-double-entry.test.js
node --test tests/manufacturing-mrp-routing.test.js
node --test tests/tax-invoicing-ar.test.js
node --test tests/accounts-payable-3way-match.test.js
node --test tests/rma-credit-notes.test.js
node --test tests/b2b-portals.test.js
node --test tests/tally-export.test.js

# Generate code coverage report
npm run test:coverage
```

### Full Index of 65 Test Suites

| # | Test Suite Filename | Primary Domain Tested |
|---|---|---|
| 1 | `accounts-payable-3way-match.test.js` | 3-way matching between PO, GRN, and Vendor Bill |
| 2 | `aging-forecasting-import.test.js` | Inventory aging buckets, ABC Pareto, and bulk import |
| 3 | `ai-copilot.test.js` | Gemini AI agent natural language inventory queries |
| 4 | `ai-ocr.test.js` | Multimodal invoice line-item OCR extraction |
| 5 | `ai-saas-limits.test.js` | AI token credit limits and tenant quota enforcement |
| 6 | `ai-whatsapp.test.js` | WhatsApp notification dispatch and templates |
| 7 | `api-keys-and-webhooks.test.js` | API key lifecycle and outbound webhook delivery |
| 8 | `auto-po-reorder.test.js` | Automatic reorder point and draft PO creation |
| 9 | `b2b-portals.test.js` | B2B customer and supplier portal authentication and APIs |
| 10 | `backup-management.test.js` | S3 automated database backup and retention policy |
| 11 | `billing-invoice-pdf.test.js` | PDFKit rendering for SaaS subscription receipts |
| 12 | `billing.test.js` | Stripe and Razorpay subscription webhooks and transitions |
| 13 | `branch-scoping.test.js` | Multi-warehouse branch permissions and isolation |
| 14 | `business-audit-trail.test.js` | Business operation logging and state change capture |
| 15 | `courier-ecommerce-webhooks.test.js` | Logistics webhooks (Shiprocket, Delhivery) and orders |
| 16 | `crm-pipeline-fulfillment.test.js` | CRM deal lifecycle and quote-to-sales-order workflow |
| 17 | `crm-quotation-credit-360.test.js` | 360-degree customer view, quotes, and credit limits |
| 18 | `csrf.test.js` | CSRF cookie token generation and rejection |
| 19 | `dashboard-kpis.test.js` | Real-time dashboard KPI metric aggregations |
| 20 | `docs-and-usage.test.js` | OpenAPI specification generation and swagger endpoint |
| 21 | `enhanced-bulk-upload.test.js` | High-volume CSV/XLSX bulk import pipeline |
| 22 | `enterprise-auth.test.js` | JWT access/refresh rotation and session management |
| 23 | `expiry-reconciliation-traceability.test.js` | FEFO picking order, lot expiry alerts, and lot trace |
| 24 | `general-ledger-double-entry.test.js` | Double-entry journal engine, balance invariants, TB |
| 25 | `global-search.test.js` | Full-text global search across products, orders, and lots |
| 26 | `inventory-adjustments.test.js` | Reason-coded adjustments and automated GL posting |
| 27 | `kits-assemblies.test.js` | BOM kit explosion, scrap factor, and work order assembly |
| 28 | `landed-cost.test.js` | Landed cost apportionment (weight, volume, value) |
| 29 | `maintenance-and-data-portability.test.js` | Maintenance mode switch and GDPR data export |
| 30 | `manufacturing-mrp-routing.test.js` | MRP requirements explosion, work centers, routing |
| 31 | `multi-gateway-payment.test.js` | Payment routing across Stripe and Razorpay |
| 32 | `multi-tenant-billing-security.test.js` | Cross-tenant billing isolation and tamper prevention |
| 33 | `notification-center.test.js` | Real-time push, in-app notifications, and read states |
| 34 | `openapi-and-deployment.test.js` | System healthcheck and OpenAPI 3.0 specification |
| 35 | `pdf-engine.test.js` | Invoice, packing slip, and barcode PDF generation |
| 36 | `product-master.test.js` | Product catalog CRUD, variant trees, and unit conversions |
| 37 | `production-emails.test.js` | Transactional email generation and SMTP delivery |
| 38 | `production-features.test.js` | Production feature flag toggles and enterprise policies |
| 39 | `production-hardening-gaps.test.js` | Security hardening, cookie flags, and input validation |
| 40 | `request-validation.test.js` | Schema validation on request payloads |
| 41 | `rma-credit-notes.test.js` | Return merchandise authorizations and credit note issuance |
| 42 | `saas-features-trio.test.js` | Tenant invitation, onboarding wizard, and usage tracking |
| 43 | `security-ai-shield.test.js` | Prompt injection protection and sanitization for AI |
| 44 | `security-audit-merkle-chain.test.js` | Cryptographic SHA-256 Merkle chain audit integrity |
| 45 | `security-nosql-injection.test.js` | MongoDB operator injection prevention |
| 46 | `security-ssrf-dns.test.js` | Outbound request SSRF protection and internal IP blocks |
| 47 | `socket-auth.test.js` | Socket.IO handshake JWT authentication and room joins |
| 48 | `stock-reservations.test.js` | Soft reservation locking and release on order cancel |
| 49 | `stock-validation.test.js` | Negative inventory prevention and balance constraints |
| 50 | `stock-valuation.test.js` | FIFO cost layers and weighted average calculations |
| 51 | `subdomain-tenant-routing.test.js` | Custom subdomain tenant resolution middleware |
| 52 | `supplier-performance.test.js` | Supplier KPI scorecards, acceptance rate, and risk tier |
| 53 | `tally-export.test.js` | Tally Prime XML voucher generation and schema validity |
| 54 | `tax-invoicing-ar.test.js` | GST tax determination (CGST/SGST/IGST) and E-Way Bill |
| 55 | `tenant-isolation.test.js` | Strict multi-tenant database isolation verification |
| 56 | `transporters.test.js` | Carrier fleet management and driver dispatch |
| 57 | `two-factor-security.test.js` | TOTP secret enrollment, token verification, and recovery |
| 58 | `upload-error-handling.test.js` | Multer file upload edge cases and error handling |
| 59 | `upload-security.test.js` | MIME-type verification and upload payload limits |
| 60 | `user-lock-duration.test.js` | Brute-force account lockout policy and timing |
| 61 | `user-permissions.test.js` | RBAC permission matrix checks on restricted routes |
| 62 | `warehouse-locations.test.js` | Warehouse bin hierarchy, dimensions, and weight limits |
| 63 | `warehouse-transfer.test.js` | Inter-warehouse stock transfer manifests and receiving |
| 64 | `wave-batch-picking.test.js` | Wave generation, S-shape routing, and put-wall sorting |
| 65 | `module-governance.test.js` | Granular module & section governance, personas, and temporary overrides |

---

## 10. Production Deployment & DevOps

### Deployment Topology

```
                  Internet (Client Requests)
                              │
                    ┌─────────▼─────────┐
                    │    Nginx Proxy    │  Ports 80 & 443 (SSL)
                    └─────────┬─────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
┌─────────▼─────────┐                   ┌─────────▼─────────┐
│ Next.js Frontend  │  Port 3000        │  Express Backend  │  Port 5001
│ 3D Landing / Web  │                   │ PM2 Cluster Mode  │
└───────────────────┘                   └─────────┬─────────┘
                                                  │
                               ┌──────────────────┴──────────────────┐
                               │                                     │
                     ┌─────────▼─────────┐                 ┌─────────▼─────────┐
                     │     MongoDB 7     │  Port 27017     │     Redis 7       │  Port 6379
                     │  Replica Set rs0  │                 │ Rate Limit/Cache  │
                     └───────────────────┘                 └───────────────────┘
```

### Option A: Railway Cloud Deployment (Recommended)

Deployment manifests and configuration are located in `deploy/`:
- `deploy/railway.json`: Declares multi-service configuration.
- `deploy/README.md`: Step-by-step Railway setup instructions.

```bash
# Install Railway CLI and authenticate
npm install -g @railway/cli
railway login

# Deploy environment from the deploy folder
cd deploy
railway up
```

### Option B: Docker Compose (5 Containers)

The production configuration runs **5 isolated services** (`acustock-proxy`, `acustock-frontend`, `acustock-backend`, `acustock-mongo`, `acustock-redis`):

```bash
# Build and start all 5 containers in detached mode
docker compose -f docker-compose.production.yml up -d --build

# Verify container health
docker compose -f docker-compose.production.yml ps
```

### Option C: Bare Metal / Linux VM (PM2 + Nginx)

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Build Next.js production bundle
cd frontend/web && npm run build

# 3. Start Express backend in cluster mode using ecosystem.config.js
cd ../../backend && npm run pm2:start

# 4. Start Next.js frontend with PM2
pm2 start "npm run start" --name acustock-frontend --cwd /path/to/frontend/web

# 5. Persist PM2 processes across system reboots
pm2 save && pm2 startup

# 6. Configure Nginx with production SSL
sudo cp deploy/nginx-ssl.conf /etc/nginx/sites-available/acustock
sudo ln -s /etc/nginx/sites-available/acustock /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Production Maintenance Scripts

```bash
# Create all compound database indexes
npm run db:index

# Perform S3 MongoDB archive backup
npm run backup

# Reconcile SaaS billing usage counters
npm run reconcile-usage

# Clean up stale quota reservations
npm run cleanup-quota-reservations

# Retry failed webhook and billing events
npm run retry-billing-events

# Reconcile subscription status against gateways
npm run reconcile-billing
```

### Recommended Crontab Configuration

```cron
# Reconcile SaaS plan usage every hour
0 * * * * cd /app/backend && node scripts/reconcile-usage.js >> /var/log/acustock-usage.log 2>&1

# Clean up stale quota reservations daily at 02:00
0 2 * * * cd /app/backend && node scripts/cleanup-quota-reservations.js

# Trigger daily automated MongoDB backup to S3 at 03:00
0 3 * * * cd /app/backend && bash scripts/backup-mongodb.sh

# Reconcile billing subscriptions daily at 04:00
0 4 * * * cd /app/backend && node scripts/reconcile-billing.js
```

---

## 11. Indian Compliance & Statutory Standards

AcuStock complies natively with Indian commercial statutes and logistics protocols:

1. **Goods and Services Tax (GST)**:
   - Automated identification of Intra-State vs. Inter-State transactions based on Supplier GSTIN and Place of Supply.
   - Separate accounting ledgers for Input CGST, SGST, IGST (Assets) and Output CGST, SGST, IGST (Liabilities).
   - Validation of 15-digit GSTIN structures and state codes.
2. **E-Way Bill System**:
   - Generates NIC JSON format (v1.0.3) for road consignments exceeding statutory thresholds.
   - Captures Transporter ID, Vehicle Registration, Distance ($km$), and Document Numbers.
3. **Indian Carrier Integrations**:
   - Direct API support for **Delhivery, Blue Dart, DTDC, Porter, and Shiprocket**.
4. **Accounting Software Interoperability**:
   - Native XML export engine for **Tally Prime** vouchers.
   - REST API synchronization with **Zoho Books**.

---

## 12. Developer Specifications & Operational Docs

AcuStock includes exhaustive operational documentation and specifications within the repository:

- **OpenAPI 3.0.3 Specification**:
  - YAML: [`docs/openapi.yaml`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/docs/openapi.yaml)
  - JSON: [`docs/openapi.json`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/docs/openapi.json)
- **Postman API Collection**:
  - Full request suite: [`docs/AcuStock_Enterprise_API_Collection.postman_collection.json`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/docs/AcuStock_Enterprise_API_Collection.postman_collection.json)
- **Deployment Manifests**:
  - Railway instructions: [`deploy/README.md`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/deploy/README.md)
  - Production Nginx SSL configuration: [`deploy/nginx-ssl.conf`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/deploy/nginx-ssl.conf)
- **Audit & Governance Reports**:
  - SaaS Production Readiness Audit: [`SAAS_PRODUCTION_READINESS_AUDIT.md`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/SAAS_PRODUCTION_READINESS_AUDIT.md)
  - Password & Credential Management Policy: [`PASSWORD_MANAGEMENT.md`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/PASSWORD_MANAGEMENT.md)
  - Production Audit Report: [`AcuStock_Production_Audit_Report.md`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/AcuStock_Production_Audit_Report.md)
  - Roadmap & Backlog: [`TODO.md`](file:///Users/shubhsharma/Desktop/untitled%20folder%203%20copy%202/TODO.md)

---

## 13. Contributing & Code Standards

### Quality Gate Requirements
1. **Multi-Tenant Isolation**: Every new Mongoose schema must import and apply `tenantIsolationPlugin`.
2. **Accounting Invariant**: Any service that mutates financial balances must post balanced debits and credits through `journalEngine.service.js`.
3. **Zero Test Regressions**: All 64 test suites must pass (`cd backend && npm test`).
4. **Strict TypeScript Compilation**: The frontend build must compile without errors (`cd frontend/web && npx tsc --noEmit`).

---

<p align="center">
  <b>AcuStock Enterprise Platform</b> &nbsp;•&nbsp; Production-Ready Cloud ERP, WMS & SCM
</p>
