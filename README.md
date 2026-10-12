<div align="center">

# 📦 AcuStock

**Autonomous Enterprise Inventory Operations Platform**

[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-≥6.0-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-Powered-4285F4?logo=google&logoColor=white)](https://ai.google.dev)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A production-ready, SAP-style inventory management platform with a built-in AI operations suite (AcuBot), immutable stock ledger, Gemini-powered OCR invoice scanning, WhatsApp notifications, end-to-end order lifecycle, shipment dispatch with PDF challans, warranty tracking, and enterprise serial-number management — all behind a role-based access system with real-time WebSocket synchronisation.

[Features](#-features) · [AI Suite](#-ai-suite--acubot) · [Pages & Modules](#-frontend-pages--modules) · [API Reference](#-api-reference) · [Tech Stack](#-tech-stack) · [Quick Start](#-quick-start) · [Deployment](#-deployment) · [Architecture](#-architecture)

</div>

---

## ✨ Features

| Category | Capabilities |
|----------|-------------|
| 🤖 **AI Suite (AcuBot)** | Gemini-powered conversational copilot, OCR invoice scanning, WhatsApp notifications, SSE streaming |
| 🔐 **Auth & Security** | JWT with token rotation, HTTP-only cookies, CSRF protection, Google OAuth 2.0, 2FA (TOTP), account lockout |
| 👥 **RBAC** | 4-tier hierarchy: SUPER_ADMIN → ADMIN → MANAGER → USER with fine-grained permission engine |
| 📊 **Stock Management** | Stock IN/OUT with immutable ledger, lot/batch tracking, multi-warehouse transfers, optimistic concurrency |
| 🔢 **Serial Tracking** | Per-item serial policies (`requireSerialOnIN`/`requireSerialOnOUT`), global uniqueness, immutable `SerialAudit` |
| 🛒 **Order Lifecycle** | Full Purchase Order & Sales Order management with draft → approve → receive/dispatch auto-ledger flow |
| 🚚 **Shipments & Logistics** | Porter hyperlocal, courier dispatch, e-Way bill, AWB tracking, delivery challan PDF, transporter registry |
| 🏷️ **Labels & Packing** | Shipping label generation, packing slip PDFs, package management, S3/R2 upload |
| 🔒 **Warranty Management** | Purchase & seller dual-warranty per serial, status tracking (active / expiring / expired) |
| 📁 **Multi-Company** | Company-scoped data isolation; admins manage multiple supplier/customer companies |
| 📡 **Real-Time** | Socket.IO with room-based auth and Redis cluster adapter for horizontal scaling |
| 📈 **Analytics & Reports** | Dashboard analytics, scheduled reports, CSV export, user-activity drill-down with 60-second cache |
| 🔍 **Audit Logs** | Immutable structured audit trail for all business events with actor tracking |
| 💳 **Billing** | Stripe integration with quota reservations, plan limits, grace period, and reconciliation jobs |
| 🗄️ **Reliability** | MongoDB retry with exponential backoff, graceful shutdown, PM2 cluster mode |
| 📈 **Observability** | Winston structured logging, Sentry error tracking, request-ID tracing |
| ☁️ **Object Storage** | S3-compatible uploads (AWS S3, Cloudflare R2) |
| 🌐 **GDPR** | Data export and right-to-erasure endpoints |

---

## 🤖 AI Suite — AcuBot

AcuStock ships with a fully integrated AI operations layer powered by **Google Gemini**.

### AcuBot Conversational Copilot

A context-aware, role-gated AI assistant that understands your live inventory data.

- **Streaming chat** via Server-Sent Events (SSE) — responses appear word-by-word
- **Function calling** — AcuBot calls real backend tools to query stock levels, expiring batches, backorders, and sales/purchase order status
- **Confirm-before-commit** — can draft Purchase Orders that require human approval before being written
- **Fallback mode** — intelligent local reasoning engine activates when `GEMINI_API_KEY` is not configured
- **Role-gated suggestions** — ADMIN/MANAGER see procurement prompts; all roles see operational queries
- **Security invariants** — every tool call receives a verified `SecurityContext` extracted from the authenticated session; tenant boundary is never crossable

```
POST /api/ai/copilot/chat        — streaming SSE or JSON chat
GET  /api/ai/copilot/suggestions — role-aware quick-prompt suggestions
```

### OCR Invoice Scanner

Upload a vendor invoice or packing slip → AcuBot extracts structured Stock-IN data ready for human review.

- Accepts **PNG, JPG, WEBP, PDF** (up to 10 MB)
- Uses **Gemini Multimodal Vision** with a strict JSON schema for structured output
- Extracts: invoice number, date, supplier name, GSTIN, currency, line items with quantities and unit prices
- **Catalog grounding** — matched against the tenant's existing Item and Company records
- **Confirm-before-commit** invariant — returns a draft for human review, never auto-commits stock
- Quota-gated via `checkPlanLimits('maxOcrScans')` per billing plan
- Graceful fallback when API key is absent

```
POST /api/ai/ocr/invoice-to-stock-in   — multipart upload → structured stock-in draft
```

### WhatsApp Notifications

AcuStock can send operational alerts and summaries directly to WhatsApp via the **Meta Cloud API**.

- Live mode with Meta Graph API (E.164 phone numbers, plain text / markdown messages)
- **Simulation mode** — when API credentials are not configured, messages are logged locally so development flows are not blocked
- Used for low-stock alerts, shipment dispatch confirmations, and order status updates

---

## 🗂️ Frontend Pages & Modules

All pages live under the Next.js App Router at `frontend/web/src/app/dashboard/[role]/`.

### Core Stock Operations

| Page | Route | Description |
|------|-------|-------------|
| **Stock IN** | `/stock-in` | Record inbound stock with serial capture, lot assignment |
| **Stock OUT** | `/stock-out` | Record outbound stock with serial/lot deduction |
| **Stock Ledger** | `/stock-ledger` | Paginated, filterable immutable transaction history |
| **Remaining Stock** | `/remaining-stock` | Current stock summary per item / warehouse |
| **Stock Transfers** | `/stock-transfers` | Inter-warehouse transfer requests with status tracking |

### Order Management

| Page | Route | Description |
|------|-------|-------------|
| **Purchase Orders** | `/purchase-orders` | Full PO lifecycle: draft → approve → receive (auto-ledger IN) |
| **Sales Orders** | `/sales-orders` | Full SO lifecycle: draft → confirm → dispatch (auto-ledger OUT) |
| **Backorders** | `/backorders` | View and manage unfulfilled customer demand |

### Logistics & Fulfilment

| Page | Route | Description |
|------|-------|-------------|
| **Shipments** | `/shipments` | Create & track shipments; Porter, courier, in-house fleet; delivery challan PDF |
| **Warranty** | `/warranty` | Dual warranty management (purchase + seller) per serial number |

### Catalogue & Configuration

| Page | Route | Description |
|------|-------|-------------|
| **Products** | `/products` | Item catalogue with serial policy configuration |
| **Units** | `/units` | Unit of measure management |
| **Companies** | `/companies` | Supplier & customer company directory |
| **Warehouses** | `/warehouses` | Multi-warehouse setup |

### Users & Access

| Page | Route | Description |
|------|-------|-------------|
| **Users** | `/users` | User management with role assignment |
| **Invites** | `/invites` | Email-based user invitations |
| **Serials** | `/serials` | Global serial number registry and audit trail |

### Analytics & Observability

| Page | Route | Description |
|------|-------|-------------|
| **Analytics** | `/analytics` | Interactive charts — stock trends, top movers, category breakdown |
| **Reports** | `/reports` | Comprehensive report engine with CSV export and scheduled delivery |
| **Audit Logs** | `/audit-logs` | Full immutable business-event audit trail with actor/IP |
| **Notifications** | `/notifications` | In-app notification centre |

### Administration

| Page | Route | Description |
|------|-------|-------------|
| **Settings** | `/settings` | Tenant settings, serial policies, permissions, privacy |
| **Billing** | `/billing` | Stripe plan management, usage quotas |
| **Super Control** | `/super-control` | SUPER_ADMIN panel — tenant management, platform health |

### Public & Auth Pages

| Page | Route | Description |
|------|-------|-------------|
| **Landing Page** | `/` | Redesigned 3D landing with Three.js neural scene, animated copilot terminal, interactive story chapters |
| **Login** | `/login` | Email/password + Google OAuth |
| **Register** | `/register` | Initial admin registration |
| **Forgot Password** | `/forgot-password` | Email-based password reset |
| **Reset Password** | `/reset-password` | Token-gated password update |
| **Onboarding** | `/onboarding` | First-run guided setup flow |
| **Billing Portal** | `/billing` | Standalone billing management |

---

## 🧰 Tech Stack

### Backend

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 (CommonJS) |
| Framework | Express 5.2 |
| Database | MongoDB 6+ via Mongoose 9 |
| Caching | Redis (ioredis) with in-memory fallback |
| Auth | JWT + bcryptjs, Google OAuth 2.0, TOTP 2FA |
| Real-Time | Socket.IO 4.8, `@socket.io/cluster-adapter` |
| AI | Google Gemini API (`@google/genai`) — function calling, multimodal OCR |
| Messaging | WhatsApp Meta Cloud API |
| Payments | Stripe |
| PDF | PDFKit — PO, SO invoice, delivery challan, shipping labels, packing slips |
| Storage | AWS S3 SDK v3 (S3 / Cloudflare R2 / MinIO) |
| Monitoring | Winston, Morgan, Sentry |
| Process Manager | PM2 with cluster mode |

### Frontend

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 5 |
| UI Library | React 19 |
| Styling | Tailwind CSS 4 |
| Data Fetching | TanStack Query (React Query) v5 |
| Charts | Recharts 3 |
| 3D / Viz | Three.js (interactive landing scene) |
| Real-Time | Socket.IO Client 4.8 |
| Monitoring | Sentry Next.js |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **MongoDB** ≥ 6.0 (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- **Redis** (optional — in-memory fallback used when not configured)
- **npm** ≥ 9

### 1. Clone the repository

```bash
git clone <repository-url>
cd acustock
```

### 2. Configure the backend

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Paste the output into JWT_SECRET and JWT_REFRESH_SECRET in .env
```

Edit `.env` and set at minimum:

```dotenv
MONGODB_URI=mongodb://localhost:27017/acustock
JWT_SECRET=<your-generated-secret>
JWT_REFRESH_SECRET=<your-generated-refresh-secret>
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Optional — enables live AI features
GEMINI_API_KEY=<your-google-gemini-api-key>

# Optional — enables live WhatsApp notifications
WHATSAPP_API_TOKEN=<meta-cloud-api-token>
WHATSAPP_PHONE_NUMBER_ID=<meta-phone-number-id>
```

### 3. Seed permissions

```bash
npm run seed
```

### 4. Start the backend

```bash
# Development (hot-reload)
npm run dev

# Production (plain Node)
npm run prod

# Production (PM2 cluster, recommended)
npm run pm2:start
```

The API will be available at `http://localhost:5001`.

### 5. Configure the frontend

```bash
cd ../frontend/web

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
BACKEND_URL=http://localhost:5001
NEXT_PUBLIC_ACUSTOCK_API_URL=/api
NEXT_PUBLIC_ACUSTOCK_SOCKET_URL=http://localhost:5001
```

### 6. Start the frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗂️ Project Structure

```
acustock/
├── backend/
│   ├── index.js                  # Express app entry point
│   ├── ecosystem.config.js       # PM2 cluster configuration
│   ├── Dockerfile                # Backend container image
│   ├── .env.example              # Environment variable template
│   └── src/
│       ├── ai/                   # AI Operations Suite
│       │   ├── core/             # AcuBot agent, tool registry, audit, context
│       │   │   ├── agent.js      # Gemini function-calling orchestrator (AcuBot)
│       │   │   ├── tool-registry.js  # Registered AI tools
│       │   │   ├── context.js    # SecurityContext builder
│       │   │   └── audit.js      # AI event audit logger
│       │   ├── copilot/          # Chat copilot (SSE streaming)
│       │   ├── ocr/              # Invoice / packing slip OCR extractor
│       │   ├── whatsapp/         # WhatsApp Meta Cloud API client
│       │   └── tools/            # AI-callable tool implementations
│       ├── config/               # App & DB configuration
│       ├── controllers/          # Business logic handlers
│       ├── middleware/           # Auth, RBAC, validation, CSRF, plan limits
│       ├── models/               # Mongoose schemas
│       │   ├── User.js
│       │   ├── Item.js
│       │   ├── StockLedger.js    # Immutable transaction log
│       │   ├── SerialAudit.js    # Immutable serial trail
│       │   ├── Company.js
│       │   ├── PurchaseOrder.js  # PO with approve/receive lifecycle
│       │   ├── SalesOrder.js     # SO with confirm/dispatch lifecycle
│       │   ├── Shipment.js       # Shipment with Porter/courier/in-house
│       │   ├── Transporter.js    # Carrier registry
│       │   ├── Warranty.js       # Dual warranty per serial
│       │   ├── InventoryLot.js   # Batch / lot tracking
│       │   ├── StockTransfer.js  # Inter-warehouse transfers
│       │   ├── StockReservation.js # Soft stock reservations for SOs
│       │   ├── Package.js        # Packing unit management
│       │   ├── ShippingLabel.js  # Label records (LBL-YYYYMMDD-NNNNN)
│       │   ├── AuditLog.js       # Business event audit trail
│       │   ├── Notification.js   # In-app notifications
│       │   ├── Warehouse.js
│       │   └── ...
│       ├── routes/               # API route definitions (38 route files)
│       ├── services/             # PDF generator, email, notification, lot, storage
│       ├── scripts/              # Seed, reconcile & maintenance scripts
│       └── utils/                # Helpers & shared utilities
│
├── frontend/
│   └── web/                      # Next.js application (App Router)
│       └── src/
│           ├── app/
│           │   ├── page.tsx              # Redesigned 3D landing page (Three.js)
│           │   ├── login/
│           │   ├── register/
│           │   ├── forgot-password/
│           │   ├── reset-password/
│           │   ├── onboarding/
│           │   ├── billing/
│           │   └── dashboard/[role]/     # Role-based dashboard pages
│           │       ├── stock-in/
│           │       ├── stock-out/
│           │       ├── stock-ledger/
│           │       ├── remaining-stock/
│           │       ├── stock-transfers/
│           │       ├── purchase-orders/
│           │       ├── sales-orders/
│           │       ├── backorders/
│           │       ├── shipments/
│           │       ├── warranty/
│           │       ├── products/
│           │       ├── companies/
│           │       ├── warehouses/
│           │       ├── units/
│           │       ├── serials/
│           │       ├── users/
│           │       ├── invites/
│           │       ├── analytics/
│           │       ├── reports/
│           │       ├── audit-logs/
│           │       ├── notifications/
│           │       ├── settings/
│           │       ├── billing/
│           │       └── super-control/
│           ├── components/       # Shared UI components
│           ├── hooks/            # Custom React hooks
│           └── lib/              # API clients & utilities
│
├── docker-compose.yml            # Full-stack container orchestration
├── AcuStock_Production_Audit_Report.md
├── SAAS_PRODUCTION_READINESS_AUDIT.md
└── PASSWORD_MANAGEMENT.md        # Credential management guide
```

---

## 🔑 API Reference

> **Base URL**: `http://localhost:5001/api`
> All protected routes require a valid JWT cookie (`Authorization: Bearer <token>` is also accepted).

### Authentication

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/auth/login` | Public | Login with email & password |
| `POST` | `/auth/logout` | Authenticated | Logout and clear session |
| `GET` | `/auth/me` | Authenticated | Get current user profile |
| `POST` | `/auth/register` | Public (first-time) | Register initial admin |
| `POST` | `/auth/register-user` | ADMIN / MANAGER | Create a new user |
| `POST` | `/auth/register-manager` | ADMIN | Create a new manager |
| `POST` | `/auth/refresh` | Authenticated | Rotate access token |
| `GET` | `/auth/google` | Public | Initiate Google OAuth flow |
| `POST` | `/auth/2fa/setup` | Authenticated | Initiate TOTP 2FA setup |
| `POST` | `/auth/2fa/verify` | Authenticated | Verify and activate 2FA |
| `POST` | `/auth/forgot-password` | Public | Send password reset email |
| `POST` | `/auth/reset-password` | Public | Complete password reset |

### Stock Operations

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/stock/in` | All roles | Record stock IN (with optional serials & lot) |
| `POST` | `/stock/out` | All roles | Record stock OUT (with optional serials & lot) |
| `GET` | `/stock/ledger` | All roles | Paginated immutable stock ledger |
| `GET` | `/stock/summary` | All roles | Current stock summary per item |

### Stock Transfers

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/stock-transfers` | All roles | List inter-warehouse transfers |
| `POST` | `/stock-transfers` | ADMIN / MANAGER | Create warehouse-to-warehouse transfer |
| `PATCH` | `/stock-transfers/:id` | ADMIN / MANAGER | Update transfer status |
| `DELETE` | `/stock-transfers/:id` | ADMIN | Cancel transfer |

### Items (Products)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/items` | All roles | List items |
| `POST` | `/items` | ADMIN | Create item |
| `PUT` | `/items/:id` | ADMIN | Update item |
| `DELETE` | `/items/:id` | ADMIN | Delete item |
| `PATCH` | `/items/:id/serial-policy` | ADMIN | Update serial policy |

### Purchase Orders

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/purchase-orders` | ADMIN / MANAGER | List purchase orders |
| `POST` | `/purchase-orders` | ADMIN / MANAGER | Create draft PO |
| `GET` | `/purchase-orders/:id` | ADMIN / MANAGER | Get single PO |
| `PATCH` | `/purchase-orders/:id` | ADMIN / MANAGER | Update draft PO |
| `POST` | `/purchase-orders/:id/approve` | ADMIN | Approve PO |
| `POST` | `/purchase-orders/:id/receive` | ADMIN / MANAGER | Receive goods → auto StockLedger IN |
| `POST` | `/purchase-orders/:id/cancel` | ADMIN | Cancel PO |
| `GET` | `/purchase-orders/:id/pdf` | ADMIN / MANAGER | Download PO PDF |

### Sales Orders

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/sales-orders` | ADMIN / MANAGER | List sales orders |
| `POST` | `/sales-orders` | ADMIN / MANAGER | Create draft SO |
| `GET` | `/sales-orders/:id` | ADMIN / MANAGER | Get single SO |
| `PATCH` | `/sales-orders/:id` | ADMIN / MANAGER | Update draft SO |
| `POST` | `/sales-orders/:id/confirm` | ADMIN / MANAGER | Confirm SO |
| `POST` | `/sales-orders/:id/dispatch` | ADMIN / MANAGER | Dispatch goods → auto StockLedger OUT |
| `POST` | `/sales-orders/:id/cancel` | ADMIN | Cancel SO |
| `GET` | `/sales-orders/:id/invoice-pdf` | ADMIN / MANAGER | Download sales invoice PDF |

### Shipments

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/shipments` | All roles | List shipments (paginated, filterable by status/carrier) |
| `POST` | `/shipments` | ADMIN / MANAGER | Create shipment |
| `GET` | `/shipments/:id` | All roles | Get single shipment |
| `PATCH` | `/shipments/:id/status` | ADMIN / MANAGER | Update shipment status |
| `GET` | `/shipments/:id/challan-pdf` | All roles | Download delivery challan PDF |

### Transporters

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/transporters` | All roles | List carriers (auto-seeded with Indian carrier defaults) |
| `GET` | `/transporters/:id` | All roles | Get single carrier |
| `POST` | `/transporters` | ADMIN / MANAGER | Register carrier |
| `PUT` | `/transporters/:id` | ADMIN / MANAGER | Update carrier details |
| `DELETE` | `/transporters/:id` | ADMIN | Soft-deactivate carrier |

### Warranty

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/warranty/stats` | All roles | Warranty status summary (active / expiring / expired) |
| `GET` | `/warranty/serial/:serial` | All roles | Lookup full warranty by serial number |
| `GET` | `/warranty` | All roles | List warranties with filters |
| `POST` | `/warranty` | ADMIN / MANAGER | Register warranty |
| `PATCH` | `/warranty/:id` | ADMIN / MANAGER | Update warranty record |

### Shipping Labels & Packages

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/labels` | All roles | List shipping labels |
| `POST` | `/labels` | ADMIN / MANAGER | Generate shipping label PDF |
| `GET` | `/labels/:id/pdf` | All roles | Download label PDF |
| `GET` | `/labels/packing-slip/:orderId` | All roles | Download packing slip PDF |

### Companies

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/companies` | ADMIN / MANAGER | List companies |
| `POST` | `/companies` | ADMIN | Create company |
| `PUT` | `/companies/:id` | ADMIN | Update company |
| `DELETE` | `/companies/:id` | ADMIN | Soft-delete company |

### Reports & Analytics

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/reports/user-activity/:userId` | ADMIN | Per-user activity drill-down |
| `GET` | `/reports/dashboard` | ADMIN / MANAGER | 60-second cached dashboard aggregation |
| `GET` | `/reports/inventory` | ADMIN / MANAGER | Full inventory value report |
| `GET` | `/reports/scheduled` | ADMIN | Manage scheduled report delivery |
| `GET` | `/csv-export` | ADMIN / MANAGER | CSV export for stock / ledger data |

### AI Suite

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/ai/copilot/chat` | Authenticated | AcuBot streaming chat (SSE or JSON) |
| `GET` | `/ai/copilot/suggestions` | Authenticated | Role-gated quick prompts |
| `POST` | `/ai/ocr/invoice-to-stock-in` | ADMIN / MANAGER | Upload invoice → structured stock-in draft |

### Settings & Permissions

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/settings/serial-policies` | ADMIN / MANAGER | Get all serial policies |
| `POST` | `/settings/serial-policies` | ADMIN | Create/update serial policy |
| `GET` | `/settings/permissions` | ADMIN | Get role permission matrix |
| `PUT` | `/settings/permissions` | ADMIN | Update permissions |
| `GET` | `/settings/audit-log` | ADMIN | Paginated audit log |

### Health & Monitoring

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/health` | Public | Liveness probe (DB ping + latency) |
| `GET` | `/ready` | Public | Readiness probe (MongoDB + Redis) |

---

## 🔒 Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Security Layers                     │
├──────────────┬──────────────────────────────────────────┤
│  Transport   │  HTTPS (TLS 1.2+), HSTS, Helmet headers  │
│  Auth        │  JWT (15m) + Refresh token rotation       │
│  Session     │  HTTP-only, Secure, SameSite=Strict cookie│
│  CSRF        │  Double-submit cookie pattern             │
│  2FA         │  TOTP (Google Authenticator compatible)   │
│  Rate Limit  │  100 req/15 min (10 for auth endpoints)   │
│  RBAC        │  SUPER_ADMIN → ADMIN → MANAGER → USER    │
│  Plan Limits │  Per-feature quota gates (maxOcrScans …)  │
│  Input       │  Server-side validation + mongo sanitize  │
│  AI Boundary │  SecurityContext injected per tool call   │
│  Audit Trail │  Immutable StockLedger + SerialAudit      │
│  Account     │  Lockout after N failed attempts          │
│  Password    │  bcrypt (12 rounds), token versioning     │
└──────────────┴──────────────────────────────────────────┘
```

### Role Permissions Matrix

| Feature | SUPER_ADMIN | ADMIN | MANAGER | USER |
|---------|:-----------:|:-----:|:-------:|:----:|
| Manage Companies | ✅ | ✅ | ❌ | ❌ |
| Manage Products | ✅ | ✅ | ❌ | ❌ |
| Configure Serial Policy | ✅ | ✅ | ❌ | ❌ |
| Create Managers | ✅ | ✅ | ❌ | ❌ |
| Create Users | ✅ | ✅ | ✅ | ❌ |
| Stock IN | ✅ | ✅ | ✅ | ✅ |
| Stock OUT | ✅ | ✅ | ✅ | ✅ |
| View Ledger | ✅ | ✅ | ✅ | ✅ |
| Purchase Orders | ✅ | ✅ | ✅ | ❌ |
| Sales Orders | ✅ | ✅ | ✅ | ❌ |
| Shipments | ✅ | ✅ | ✅ | ✅ |
| Manage Transporters | ✅ | ✅ | ✅ | ❌ |
| Warranty Management | ✅ | ✅ | ✅ | ❌ |
| OCR Invoice Scan | ✅ | ✅ | ✅ | ❌ |
| AcuBot Copilot | ✅ | ✅ | ✅ | ✅ |
| View Reports | ✅ | ✅ | ✅ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ |
| Billing Management | ✅ | ✅ | ❌ | ❌ |
| Super Control Panel | ✅ | ❌ | ❌ | ❌ |

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `PORT` | No | `5001` | Server port |
| `NODE_ENV` | ✅ | — | `development` \| `production` \| `test` |
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | 64-char hex secret for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | — | 64-char hex secret for refresh tokens |
| `JWT_EXPIRE` | No | `15m` | Access token TTL |
| `FRONTEND_URL` | ✅ | — | Comma-separated CORS allowed origins |
| `FRONTEND_BASE_URL` | ✅ | — | Canonical frontend URL (email links) |
| `REDIS_URL` | No | In-memory | Redis connection URL |
| `GEMINI_API_KEY` | No | — | Google Gemini API key (enables live AcuBot + OCR) |
| `GOOGLE_GENAI_API_KEY` | No | — | Alias for `GEMINI_API_KEY` |
| `WHATSAPP_API_TOKEN` | No | — | Meta Cloud API token (enables live WhatsApp) |
| `WHATSAPP_PHONE_NUMBER_ID` | No | — | Meta phone number ID |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `EMAIL_HOST` | No | — | SMTP host |
| `EMAIL_USER` | No | — | SMTP username |
| `EMAIL_PASS` | No | — | SMTP password / app password |
| `S3_BUCKET` | No | — | S3-compatible bucket name |
| `S3_ENDPOINT` | No | — | S3-compatible endpoint (for R2, MinIO) |
| `S3_ACCESS_KEY_ID` | No | — | Object storage access key |
| `S3_SECRET_ACCESS_KEY` | No | — | Object storage secret key |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt cost factor |
| `RATE_LIMIT_MAX_REQUESTS` | No | `300` | Max requests per window |
| `SESSION_COOKIE_SECURE` | No | `false` | Set `true` behind HTTPS |
| `LOG_LEVEL` | No | `info` | Winston log level |

### Frontend (`frontend/web/.env.local`)

| Variable | Required | Description |
|----------|:--------:|-------------|
| `BACKEND_URL` | ✅ | Internal backend URL (server-side only) |
| `NEXT_PUBLIC_ACUSTOCK_API_URL` | ✅ | Public API base path (use `/api` for proxy) |
| `NEXT_PUBLIC_ACUSTOCK_SOCKET_URL` | ✅ | Public WebSocket URL |

---

## 🚀 Deployment

### Docker Compose (Recommended)

```bash
# Start full stack (API + frontend + MongoDB + Redis)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### PM2 (Bare Metal / VPS)

```bash
cd backend

# Install PM2 globally
npm install -g pm2

# Install dependencies (production only)
npm ci --production

# Seed permissions
npm run seed

# Start in cluster mode
npm run pm2:start

# Persist across reboots
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
npm run pm2:logs

# Restart
npm run pm2:restart
```

### Next.js Frontend

```bash
cd frontend/web

npm ci
npm run build
npm start          # or deploy to Vercel / Docker
```

### Recurring Maintenance Jobs

Run these from a scheduler (cron, container, or PM2) in production:

```bash
# Every minute: retry failed Stripe webhook events
npm run retry-billing-events

# Every 5 minutes: release stale quota reservations
npm run cleanup-quota-reservations

# Daily: reconcile usage counters with Stripe
npm run reconcile-usage
npm run reconcile-billing
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Clients                                  │
│        Browser (Next.js 3D)  ·  WhatsApp  ·  Mobile (future)        │
└──────────────────┬───────────────────────────────────────────────────┘
                   │  HTTPS + WebSocket + SSE
┌──────────────────▼───────────────────────────────────────────────────┐
│                        Next.js (App Router)                           │
│              API Proxy (/api/*) → hides backend URL                   │
└──────────────────┬───────────────────────────────────────────────────┘
                   │  Internal HTTP
┌──────────────────▼───────────────────────────────────────────────────┐
│                    Express 5 API  (PM2 Cluster)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Auth &  │ │  Stock   │ │  Orders  │ │Shipments │ │  Billing  │  │
│  │  RBAC    │ │  Ledger  │ │  PO / SO │ │ Warranty │ │  (Stripe) │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    AI Operations Suite                            │ │
│  │  AcuBot (Gemini)  ·  OCR Extractor  ·  WhatsApp Notifier        │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────┬───────────────────────────┬────────────────────────┘
                   │                           │
       ┌───────────▼──────────┐    ┌──────────▼────────────┐
       │       MongoDB         │    │         Redis          │
       │  (Immutable Ledger)   │    │  (Rate Limit · Cache) │
       └──────────┬───────────┘    └───────────────────────┘
                  │
       ┌──────────▼───────────┐
       │   Google Gemini API   │
       │  (Copilot · OCR)     │
       └──────────────────────┘
```

### Immutable Stock Ledger

Every stock movement creates a **StockLedger** document that is never modified or deleted. Current stock is always calculated as:

```
Current Stock = Σ(Stock IN quantities) − Σ(Stock OUT quantities)
```

This approach mirrors SAP FI/MM journal accounting, providing a complete, tamper-proof audit trail. Purchase Order "receive" and Sales Order "dispatch" actions write directly to this ledger.

### Serial Number Policy

Each item can have an independent serial policy configured by ADMIN:

```json
{
  "enableSerial": true,
  "requireSerialOnIN": true,
  "requireSerialOnOUT": true
}
```

- Serial numbers are **globally unique** across all items and companies within a tenant.
- Every serial movement is recorded in the immutable **SerialAudit** collection.
- Warranty records are bound per serial number.

### Transporter Auto-Seeding

When a tenant registers their first shipment, the system automatically seeds a default carrier registry:

- **Porter** — Hyperlocal intra-city (2W / 3W / mini truck)
- **Delhivery** — National B2B/B2C express & heavy surface cargo
- **DTDC Express** — Domestic express & plus cargo
- **Blue Dart** — Aviation air express & priority delivery
- **DMRC Transit Cargo** — Metro parcel corridor & local transit runners
- **In-House Company Fleet** — Dedicated company vehicles & local runners

Custom carriers can be added by ADMIN / MANAGER at any time.

### Dashboard Report Cache

Report and dashboard aggregation endpoints run 10–15 parallel MongoDB aggregations per request. A **60-second TTL in-process cache** (keyed per user ID) eliminates redundant DB work when multiple admins have the dashboard open simultaneously, while keeping data operationally fresh. The cache is automatically busted after any stock-in/out event.

---

## 🧪 Testing

```bash
cd backend

# Run built-in Node.js test suite
npm test

# Verify critical fixes & data integrity
npm run verify

# Health check (server must be running)
curl http://localhost:5001/api/health
curl http://localhost:5001/api/ready
```

---

## 📋 Production Go-Live Checklist

- [ ] Generate fresh `JWT_SECRET` and `JWT_REFRESH_SECRET` (64+ chars)
- [ ] Set `NODE_ENV=production`
- [ ] Set `SESSION_COOKIE_SECURE=true` (HTTPS required)
- [ ] Update `FRONTEND_URL` to production domain(s)
- [ ] Configure MongoDB Atlas or production replica set
- [ ] Enable MongoDB authentication with least-privilege DB user
- [ ] Set up regular database backups
- [ ] Configure Redis (`REDIS_URL`) for distributed rate limiting
- [ ] Set up S3/R2 credentials for file uploads (labels, PO/SO PDFs)
- [ ] Configure Stripe and webhook endpoint
- [ ] Configure SMTP for email notifications (invites, password reset)
- [ ] Set `GEMINI_API_KEY` to enable live AcuBot copilot & OCR features
- [ ] Set `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` for WhatsApp alerts
- [ ] Review CORS allowed origins
- [ ] Set up Sentry DSN for error tracking
- [ ] Enable HTTPS / SSL certificates
- [ ] Run `npm run seed` to initialize permissions
- [ ] Set up PM2 startup script (`pm2 startup && pm2 save`)
- [ ] Configure recurring maintenance jobs (billing reconciliation)
- [ ] Verify liveness and readiness probes respond correctly

---


---

## 🛡️ Permission Module

AcuStock ships a **two-tier, live-editable permission engine** — role-level defaults combined with per-user granular overrides — all controllable from the **Permission Builder** UI at `/dashboard/[role]/settings/permissions`.

### How It Works

```
┌────────────────────────────────────────────────────────┐
│               Effective Permission Resolution           │
├────────────────────────────────────────────────────────┤
│                                                        │
│  1. Role-level defaults  (Permission collection)       │
│         ↓                                              │
│  2. Per-user overrides   (UserPermission collection)   │
│         ↓                                              │
│  3. Hard-locked fields   (pre-save hook — immutable)   │
│                                                        │
│  Result = role default, overridden by user override,   │
│           with hard-locked fields always false         │
└────────────────────────────────────────────────────────┘
```

- **`null`** on a user override → inherits the role-level default
- **`true`** on a user override → explicitly granted, even if role says false
- **`false`** on a user override → explicitly denied, even if role says true
- **Hard-locked** fields (`canEditStock`, `canDeleteStock`, `canManageAdmins`) are always `false` regardless of any input — enforced at the Mongoose pre-save hook

### Permission Categories

| Category | Permissions |
|----------|-------------|
| 📦 **Stock & Ledger** | `canStockIn`, `canStockOut`, `canViewStockLedger`, ~~`canEditStock`~~, ~~`canDeleteStock`~~ |
| 🏷️ **Product Catalog** | `canViewProducts`, `canViewProductDetails`, `canAddProduct`, `canEditProduct`, `canDeleteProduct`, `canChangeSerialPolicy`, `canManageProductImages` |
| 🏢 **Companies** | `canViewCompanies`, `canAddCompany`, `canEditCompany`, `canDeleteCompany`, `canManageCompanies` |
| 🏬 **Warehouses & Units** | `canManageWarehouses`, `canViewUnits`, `canManageUnits` |
| 👥 **User Administration** | `canManageUsers`, `canManageManagers`, `canActivateDeactivateUsers`, ~~`canManageAdmins`~~ |
| 📊 **Reports & Audit** | `canViewAllReports`, `canViewOwnReports`, `canViewAuditLogs`, `canExportData`, `canAccessSettings` |
| 🚚 **Lots, Orders & Logistics** | `canManageLots`, `canBlockLots`, `canCreatePackages`, `canDispatchPackages`, `canGenerateShippingLabels` |

> ~~Strikethrough~~ = hard-locked, cannot be changed via API or UI.

### API Endpoints

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/permissions` | ADMIN | List all role permission documents |
| `GET` | `/api/permissions/me` | Authenticated | Get the current user's effective permissions |
| `GET` | `/api/permissions/:role` | ADMIN | Get permissions for a specific role (`ADMIN`, `MANAGER`, `USER`) |
| `PATCH` | `/api/permissions/:role` | ADMIN | Update toggleable flags for a role (hard-locked fields silently ignored) |
| `GET` | `/api/permissions/user/:userId` | ADMIN | Get a user's merged effective permissions (role defaults + overrides) |
| `PATCH` | `/api/permissions/user/:userId` | ADMIN | Set per-user permission overrides (`true`, `false`, or `null` to inherit) |
| `DELETE` | `/api/permissions/user/:userId` | ADMIN | Reset user to role defaults (removes all overrides) |

### Permission Builder UI

The **Permission Builder** page (`/settings/permissions`) provides:

- **Role tabs** — switch between `ADMIN`, `MANAGER`, `USER` in one click
- **Grouped toggle panels** — 7 categorised sections with labelled on/off toggles
- **Hard-locked badges** — locked permissions show a `LOCKED` badge and are non-interactive
- **Unsaved-changes bar** — tracks pending local edits and shows a count before committing
- **Live cache invalidation** — after saving, the permission cache for affected roles/users is instantly busted server-side so changes take effect on the next request

### Permission Cache

Resolved permissions are cached in-process per `(tenantId, userId)` pair to avoid repeated DB lookups on every authenticated request. The cache is invalidated automatically whenever:

- An ADMIN updates role-level permissions (`PATCH /api/permissions/:role`)
- An ADMIN sets per-user overrides (`PATCH /api/permissions/user/:userId`)
- An ADMIN resets a user to role defaults (`DELETE /api/permissions/user/:userId`)

### Seeding Defaults

Run the seed script to initialize the default permission matrix for all roles:

```bash
cd backend
npm run seed
```

This creates one `Permission` document per role per tenant with sensible production defaults. Re-running the seed is idempotent — it will not overwrite manual changes.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

This project is licensed under the **ISC License** — see the [LICENSE](LICENSE) file for details.

---

## 💬 Support

For feedback and updates — **shubh4880@gmail.com**

<div align="center">

Built with ❤️ by **Shubh Sharma**

</div>
