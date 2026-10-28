<div align="center">

# AcuStock

### Enterprise Inventory & Operations Platform

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-ISC-blue.svg?style=flat-square)](LICENSE)

**A production-ready, full-stack inventory management system built for multi-tenant operations — featuring real-time stock tracking, AI-powered copilot, serial number lifecycle management, end-to-end shipment tracking, and a role-gated dashboard experience.**

[Quick Start](#-quick-start) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Deployment](#-deployment)

</div>

---

## Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Role-Based Access Control](#-role-based-access-control)
- [AI Copilot](#-ai-copilot)
- [Deployment](#-deployment)
- [Database Schema](#-database-schema)
- [Testing](#-testing)
- [Security](#-security)
- [Contributing](#-contributing)

---

## 📦 Overview

AcuStock is a **multi-tenant, role-based inventory operations platform** designed for businesses that need reliable, auditable stock control. It replaces spreadsheet chaos with a structured ledger, configurable serial number policies, real-time notifications, and an AI-driven copilot that answers inventory and order questions in natural language.

The system supports three distinct user tiers — **Admin**, **Manager**, and **User** — each with a tailored dashboard experience and enforced API-level permissions. Data isolation between tenants is enforced at the database query layer.

---

## ✨ Features

### Inventory & Stock

- **Ledger-based stock tracking** — every IN/OUT movement is an immutable ledger entry; no mutable quantity counters
- **Serial number lifecycle management** — per-item configurable policies (`requireSerialOnIN`, `requireSerialOnOUT`), global uniqueness enforcement, and an immutable `SerialAudit` trail
- **Inventory lots** — batch/lot tracking with expiry dates
- **Cycle counting** — scheduled physical inventory verification against ledger values
- **Warehouse management** — multi-location stock segmentation
- **Stock transfers** — inter-warehouse movements with full audit trail
- **Reorder hub** — configurable reorder points with automated low-stock alerts
- **Bulk CSV import/export** — mass item creation and stock data exports

### Orders & Fulfillment

- **Purchase Orders (PO)** — supplier PO creation, approval workflow, and receive-against-PO stock IN
- **Sales Orders (SO)** — customer order management with stock reservation
- **Backorder tracking** — automatic detection of unfulfillable order lines
- **Shipment management** — multi-carrier dispatch with package and label generation
- **Returns / RMA** — return merchandise authorization and stock reintegration
- **Barcode / QR label printing** — PDF-quality barcode labels via PDFKit

### Logistics & Tracking

- **Live shipment tracking** — real-time tracking event ingestion (Porter, Delhivery, DTDC, BlueDart adapters)
- **Transporter management** — carrier profiles with SLA configuration
- **Google Maps integration** — live delivery map view
- **Delivery package builder** — multi-item package creation with weight/dimension capture

### Analytics & Reporting

- **Dashboard KPI strip** — real-time totals (products, stock value, active orders, managers, users)
- **Stock movement charts** — daily IN/OUT trend visualization with Recharts
- **Demand forecasting** — AI-assisted reorder prediction
- **Scheduled reports** — automated report generation and email delivery
- **CSV export** — filterable, paginated data exports across all modules
- **Warranty management** — warranty registration, expiry tracking, and claim handling

### Platform & Operations

- **Multi-tenant SaaS** — isolated tenant data with per-tenant configuration via the `Tenant` model
- **AI Copilot** — Gemini-powered assistant with structured tool-use for live inventory and order queries
- **Real-time notifications** — Socket.IO push notifications with in-app notification hub
- **Two-factor authentication (2FA)** — TOTP-based 2FA via `otplib`
- **Google OAuth** — social sign-in alongside email/password
- **User invites** — email-based invitation flow with role pre-assignment
- **Audit logs** — structured, queryable event log for compliance
- **GDPR endpoints** — data export and deletion request handling
- **Billing integration** — Stripe subscription management with webhook reliability, quota reservations, and grace period enforcement
- **Sentry integration** — error tracking on both frontend and backend
- **Onboarding wizard** — guided setup flow for new tenants
- **Super-admin panel** — cross-tenant oversight and user impersonation tooling

---

## 🛠 Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18, CommonJS |
| Framework | Express 5.2 |
| Database | MongoDB 7 via Mongoose 9.1 |
| Cache / Pub-Sub | Redis 7 (ioredis) — in-memory fallback when unavailable |
| Authentication | JWT (access + refresh tokens), bcryptjs, Google OAuth 2.0 |
| 2FA | otplib (TOTP) |
| Real-time | Socket.IO 4.8, `@socket.io/cluster-adapter` |
| AI | Google Gemini (`@google/genai`) |
| File Storage | AWS S3-compatible (multer + `@aws-sdk/client-s3`) |
| Email | Nodemailer (SMTP) |
| Payments | Stripe 22 |
| PDF Generation | PDFKit |
| Barcodes / QR | qrcode |
| Security | Helmet, CORS, express-rate-limit, express-mongo-sanitize |
| Logging | Winston, Morgan |
| Process Manager | PM2 (cluster mode) |
| Error Tracking | Sentry |

### Frontend

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| Language | TypeScript 5 |
| UI Library | React 19 |
| Styling | Tailwind CSS 4 |
| Data Fetching | TanStack Query v5 |
| Charts | Recharts 3 |
| Real-time | Socket.IO Client |
| Maps | `@vis.gl/react-google-maps` |
| 3D | Three.js (landing scene) |
| Virtualization | TanStack Virtual |
| Error Tracking | Sentry |

### Infrastructure

| Component | Technology |
|---|---|
| Container Orchestration | Docker Compose |
| CI | GitHub Actions (`.github/`) |

---

## 🏛 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  Next.js 16 App Router  ·  Role-gated Dashboard  ·  Socket.IO  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / REST + WebSocket
┌──────────────────────────────▼──────────────────────────────────┐
│                        API Layer (Express 5)                    │
│  43 route modules  ·  JWT Auth  ·  RBAC middleware              │
│  Rate limiting  ·  Helmet  ·  Mongo-sanitize  ·  Compression    │
└───────────┬──────────────────────────┬──────────────────────────┘
            │                          │
┌───────────▼──────────┐  ┌────────────▼─────────────────────────┐
│    MongoDB 7         │  │            Redis 7                    │
│  33 Mongoose models  │  │  Rate-limit store · Socket.IO adapter │
│  Ledger-based stock  │  │  Quota TTL · Session cache            │
│  Immutable serials   │  └──────────────────────────────────────┘
└──────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                  External Integrations                           │
│  Stripe  ·  Gemini AI  ·  S3/R2  ·  SMTP  ·  Google OAuth      │
│  Porter  ·  Delhivery  ·  DTDC  ·  BlueDart  ·  Sentry         │
└──────────────────────────────────────────────────────────────────┘
```

### Stock IN/OUT Data Flow

```
POST /api/stock/in
  → requireAuth
  → requireRole(['ADMIN', 'MANAGER'])
  → Validate productId, quantity, serialNumbers
  → Enforce serialPolicy (requireSerialOnIN)
  → Check global serial uniqueness
  → Write StockLedger entry   (type: 'IN', quantity: +N, immutable)
  → Write SerialAudit entries (one per serial, immutable)
  → Emit Socket.IO event      → push notification to connected clients
  → Return ledger entry
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0
- **Docker** & **Docker Compose** (recommended for local dev)
- **npm** ≥ 9

### Docker (Recommended)

Spins up MongoDB, Redis, the Express API, and the Next.js frontend in one command:

```bash
# 1. Clone
git clone https://github.com/shubhsharma2006/AcuStock-Inventory-Operations-Platform.git
cd AcuStock-Inventory-Operations-Platform

# 2. Configure backend environment
cp backend/.env.example backend/.env
# Edit backend/.env — see Environment Variables section below

# 3. Start all services
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5001/api |
| MongoDB | 127.0.0.1:27017 (localhost only) |
| Redis | 127.0.0.1:6379 (localhost only) |

### Manual Setup

#### Backend

```bash
cd backend
npm install
cp .env.example .env        # fill in values

npm run seed                 # seed permissions (first install only)
npm run dev                  # hot-reload dev server → http://localhost:5001
```

#### Frontend

```bash
cd frontend/web
npm install
cp .env.example .env.local  # set NEXT_PUBLIC_ACUSTOCK_API_URL=http://localhost:5001

npm run dev                  # → http://localhost:3000
```

---

## 🔐 Environment Variables

Copy `backend/.env.example` → `backend/.env` and fill in the values below.

### Required

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | 256-bit secret for access tokens |
| `JWT_REFRESH_SECRET` | 256-bit secret for refresh tokens |
| `FRONTEND_URL` | Comma-separated allowed CORS origins |
| `FRONTEND_BASE_URL` | Canonical frontend URL (used in email links) |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Optional — Feature Unlocks

| Variable | Feature |
|---|---|
| `REDIS_URL` | Distributed rate-limiting, Socket.IO cluster adapter, quota TTL. Falls back to in-memory if unset. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASS` | Transactional email (invites, password reset, reports) |
| `S3_BUCKET` + `S3_*` | Cloud file storage. Uses local `uploads/` if unset. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Subscription billing |
| `PORTER_API_KEY`, `DELHIVERY_API_KEY`, `DTDC_API_KEY`, `BLUEDART_*` | Logistics carrier integrations |

### Security Defaults

| Variable | Default | Notes |
|---|---|---|
| `BCRYPT_ROUNDS` | `12` | Increase to `14` for higher-security environments |
| `RATE_LIMIT_WINDOW` | `15` | Minutes per rate-limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Requests per window per IP |
| `JWT_EXPIRE` | `15m` | Short-lived — pair with refresh token rotation |
| `SESSION_COOKIE_SECURE` | `false` | **Set `true` behind HTTPS in production** |

---

## 📁 Project Structure

```
acustock/
├── backend/
│   ├── src/
│   │   ├── ai/                      # Gemini AI copilot
│   │   │   ├── core/                # Base agent, tool runner
│   │   │   ├── tools/               # inventory.tools.js · orders.tools.js
│   │   │   ├── copilot/             # Chat session management
│   │   │   ├── forecasting/         # Demand forecast engine
│   │   │   ├── ocr/                 # Document OCR pipeline
│   │   │   └── whatsapp/            # WhatsApp channel adapter
│   │   ├── config/                  # DB, Redis, S3 client init
│   │   ├── controllers/             # Thin controller layer
│   │   ├── middleware/
│   │   │   └── auth.js              # requireAuth · requireRole · enforceSerialPolicy
│   │   ├── models/                  # 33 Mongoose schemas
│   │   │   ├── Item.js              # Product master (serialPolicy, HSN, pricing)
│   │   │   ├── StockLedger.js       # Immutable stock movement log
│   │   │   ├── SerialAudit.js       # Immutable serial lifecycle trail
│   │   │   ├── User.js              # Auth + RBAC (ADMIN/MANAGER/USER)
│   │   │   ├── Tenant.js            # Multi-tenant configuration
│   │   │   ├── Company.js           # Company profiles
│   │   │   ├── PurchaseOrder.js     # Supplier POs
│   │   │   ├── SalesOrder.js        # Customer SOs
│   │   │   ├── Shipment.js          # Dispatch + tracking
│   │   │   ├── Warranty.js          # Warranty registration & claims
│   │   │   ├── CycleCount.js        # Physical inventory counts
│   │   │   ├── Notification.js      # In-app notification store
│   │   │   └── ...                  # 33 models total
│   │   ├── routes/                  # 43 Express route modules
│   │   │   ├── auth.js              # Login · register · refresh · 2FA
│   │   │   ├── stock.js             # Stock IN/OUT · ledger · serials
│   │   │   ├── items.js             # Product CRUD · serial policy
│   │   │   ├── reports.js           # Dashboard stats · movement charts
│   │   │   ├── shipments.js         # Shipment dispatch & tracking
│   │   │   ├── purchase-orders.js   # PO workflow
│   │   │   ├── sales-orders.js      # SO workflow
│   │   │   ├── billing.js           # Stripe subscription events
│   │   │   ├── settings.js          # Tenant/org configuration
│   │   │   ├── superadmin.js        # Cross-tenant admin ops
│   │   │   └── ...                  # 43 routes total
│   │   ├── services/                # Business logic services
│   │   └── utils/                   # Shared helpers
│   ├── scripts/                     # Operational maintenance scripts
│   │   ├── seedPermissions.js       # One-time RBAC permission seeding
│   │   ├── reconcile-billing.js     # Stripe reconciliation
│   │   └── cleanup-quota-reservations.js
│   ├── ecosystem.config.js          # PM2 cluster configuration
│   ├── Dockerfile
│   └── package.json
│
└── frontend/
    └── web/                         # Next.js 16 App Router application
        └── src/
            ├── app/
            │   ├── dashboard/
            │   │   └── [role]/      # Role-resolved dynamic route
            │   │       ├── products/
            │   │       ├── stock-in/
            │   │       ├── stock-out/
            │   │       ├── stock-ledger/
            │   │       ├── serials/
            │   │       ├── purchase-orders/
            │   │       ├── sales-orders/
            │   │       ├── shipments/
            │   │       ├── warehouses/
            │   │       ├── cycle-counts/
            │   │       ├── reorder-hub/
            │   │       ├── warranty/
            │   │       ├── analytics/
            │   │       ├── reports/
            │   │       ├── billing/
            │   │       ├── settings/
            │   │       └── super-control/
            │   ├── login/
            │   ├── register/
            │   ├── onboarding/
            │   └── billing/
            ├── components/
            │   ├── feature-shells.tsx          # All major feature UIs
            │   ├── enterprise-settings-view.tsx
            │   ├── dashboard-shell.tsx          # Role-aware nav + layout
            │   ├── barcode/                     # Barcode/QR label modal
            │   ├── ai/                          # Copilot chat panel
            │   └── ui/                          # Design system primitives
            ├── hooks/                           # TanStack Query hooks
            └── lib/                             # API client, utils
```

---

## 📡 API Reference

All endpoints are prefixed with `/api`. Protected routes require:

```http
Authorization: Bearer <JWT_TOKEN>
```

### Authentication

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Email/password login → access + refresh tokens |
| `POST` | `/api/auth/register` | Admin | Create a new user account |
| `POST` | `/api/auth/refresh` | Public | Rotate access token using refresh token |
| `POST` | `/api/auth/logout` | Auth | Invalidate refresh token |
| `GET` | `/api/auth/google` | Public | Initiate Google OAuth flow |
| `GET` | `/api/auth/google/callback` | Public | Google OAuth callback |
| `POST` | `/api/two-factor/setup` | Auth | Enable TOTP 2FA |
| `POST` | `/api/two-factor/verify` | Auth | Verify TOTP code |

### Items (Products)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/items` | Auth | List all active items with live stock quantities |
| `GET` | `/api/items/:id` | Auth | Get single item detail |
| `POST` | `/api/items` | Admin | Create item |
| `PUT` | `/api/items/:id` | Admin | Update item |
| `DELETE` | `/api/items/:id` | Admin | Soft-delete item |
| `PATCH` | `/api/items/:id/serial-policy` | Admin | Update serial number policy |

### Stock

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/stock/in` | Admin, Manager | Record stock IN (with optional serial numbers) |
| `POST` | `/api/stock/out` | Admin, Manager | Record stock OUT (validates serials are currently IN) |
| `GET` | `/api/stock/:productId` | Auth | Current stock level + movement history |
| `GET` | `/api/stock/serials/:productId` | Auth | List all serial numbers for an item |
| `GET` | `/api/stock/ledger` | Auth | Paginated full ledger |

### Purchase Orders

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/purchase-orders` | Admin, Manager | List POs |
| `POST` | `/api/purchase-orders` | Admin, Manager | Create PO |
| `GET` | `/api/purchase-orders/:id` | Admin, Manager | PO detail |
| `PATCH` | `/api/purchase-orders/:id/receive` | Admin, Manager | Receive goods → auto creates Stock IN ledger entries |
| `PUT` | `/api/purchase-orders/:id` | Admin | Update PO |

### Sales Orders

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/sales-orders` | Admin, Manager | List SOs |
| `POST` | `/api/sales-orders` | Admin, Manager | Create SO |
| `PATCH` | `/api/sales-orders/:id/fulfill` | Admin, Manager | Fulfill → reserves/decrements stock |
| `GET` | `/api/sales-orders/backorders` | Admin, Manager | List unfulfillable lines |

### Shipments

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/shipments` | Auth | List shipments |
| `POST` | `/api/shipments` | Admin, Manager | Create shipment |
| `GET` | `/api/shipments/:id/track` | Auth | Live tracking events |
| `POST` | `/api/shipments/:id/label` | Admin, Manager | Generate PDF shipping label |

### Reports & Analytics

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/api/reports/dashboard` | Admin | KPI totals (products, stock, users, managers) |
| `GET` | `/api/reports/stock-movement` | Admin | Daily IN/OUT aggregates for charting |
| `GET` | `/api/reports/inventory-value` | Admin | Current stock valuation |
| `GET` | `/api/reports/low-stock` | Admin, Manager | Items at or below reorder threshold |
| `POST` | `/api/reports-scheduled` | Admin | Schedule automated report delivery |

### Other Endpoints

| Route Module | Coverage |
|---|---|
| `/api/users` | User CRUD, role management |
| `/api/companies` | Company profiles |
| `/api/warehouses` | Multi-location management |
| `/api/stock-transfers` | Inter-warehouse transfers |
| `/api/cycle-counts` | Physical count sessions |
| `/api/lots` | Batch/lot tracking |
| `/api/warranty` | Warranty registration & claims |
| `/api/labels` | Barcode / QR label generation |
| `/api/billing` | Stripe plan management |
| `/api/invites` | Email invitation workflow |
| `/api/notifications` | In-app notification CRUD |
| `/api/search` | Cross-module full-text search |
| `/api/gdpr` | Data export / deletion requests |
| `/api/superadmin` | Cross-tenant administration |

### Standard HTTP Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Validation / bad request |
| `401` | Missing or invalid token |
| `403` | Insufficient role permissions |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## 🔒 Role-Based Access Control

Three-tier RBAC enforced at API middleware and UI layers.

| Capability | Admin | Manager | User |
|---|:---:|:---:|:---:|
| Create / edit / delete items | ✅ | ❌ | ❌ |
| Configure serial number policy | ✅ | ❌ | ❌ |
| Stock IN | ✅ | ✅ | ❌ |
| Stock OUT | ✅ | ✅ | ❌ |
| View stock & ledger | ✅ | ✅ | ✅ |
| Create Purchase Orders | ✅ | ✅ | ❌ |
| Create Sales Orders | ✅ | ✅ | ❌ |
| Manage shipments | ✅ | ✅ | View only |
| Manage users | ✅ | Limited | ❌ |
| View analytics & reports | ✅ | ✅ | ❌ |
| Billing management | ✅ | ❌ | ❌ |
| Super-admin panel | ✅ | ❌ | ❌ |
| Tenant settings | ✅ | ❌ | ❌ |

Roles are validated server-side via `requireRole` middleware on every protected route. The frontend resolves the authenticated user's role and renders the appropriate `dashboard/[role]` route.

---

## 🤖 AI Copilot

AcuStock embeds a **Google Gemini**-powered copilot accessible from the dashboard sidebar. It uses structured function-calling to query live data — not training memory.

### Available Tools

| Tool | Description |
|---|---|
| `getInventoryLevels` | Current stock across all items or filtered by category |
| `getLowStockAlerts` | Items at or below reorder point |
| `searchItemByName` | Fuzzy product search |
| `getStockMovementHistory` | Recent IN/OUT for a given product |
| `getOrderStatus` | PO/SO status and fulfillment details |
| `getDemandForecast` | AI-assisted reorder prediction |

### Architecture

```
User message
  → Copilot session manager (maintains turn context)
  → Gemini model (function-calling mode)
  → Tool dispatcher → live MongoDB queries
  → Gemini model (formats natural-language response with real data)
  → Chat UI
```

---

## 🚢 Deployment

### Docker Compose (Production)

```bash
# Configure environment
# Set NODE_ENV=production and SESSION_COOKIE_SECURE=true in backend/.env

# Build and launch
docker compose up -d --build

# First deploy: seed RBAC permissions
docker compose exec backend npm run seed

# Tail logs
docker compose logs -f backend
```

| Service | Port | Notes |
|---------|------|-------|
| `frontend` | `3000` | Next.js production build |
| `backend` | `5001` | Express API |
| `mongo` | `27017` | Bound to 127.0.0.1 only |
| `redis` | `6379` | Bound to 127.0.0.1 only |

> **Recommended**: Place Nginx in front for TLS termination and HTTP→HTTPS redirects.

### PM2 (Bare Metal)

```bash
cd backend

npm install -g pm2          # once per server

npm run pm2:start           # cluster mode, one worker per CPU core
pm2 monit                   # live process monitor
npm run pm2:logs            # tail logs
pm2 reload acustock-api     # zero-downtime reload
pm2 save && pm2 startup     # persist across reboots
```

**`ecosystem.config.js` highlights:**

| Setting | Value | Purpose |
|---|---|---|
| `exec_mode` | `cluster` | One worker per CPU core |
| `max_memory_restart` | `1G` | Auto-restart on memory pressure |
| `exp_backoff_restart_delay` | `100` | Exponential backoff on crash loops |
| `kill_timeout` | `5000ms` | Graceful shutdown window |
| Log rotation | 10 MB / 14 days | Via `pm2-logrotate` |

### Maintenance Cron (Production)

```bash
npm run reconcile-usage               # every 15 min  — Stripe quota sync
npm run cleanup-quota-reservations    # every hour    — expire stale reservations
npm run retry-billing-events          # every 30 min  — retry failed webhooks
npm run reconcile-billing             # daily         — full Stripe reconciliation
```

---

## 🗄 Database Schema

```
Tenant ──── Company ──── User (ADMIN | MANAGER | USER)
                │
               Item (serialPolicy · HSN · pricing)
                │
         ┌──────┴──────┐
    StockLedger    SerialAudit
    (immutable     (immutable
     IN/OUT log)    per-serial trail)
         │
    InventoryLot ── Warehouse
         │
    ┌────┴─────────────────┐
PurchaseOrder          SalesOrder
    │                      │
  (receive)            (fulfill)
    │                      │
    └──────── Shipment ─────┘
                  │
            TrackingEvent
                  │
       ShippingLabel · Package
```

**Stock calculation** — quantities are derived by aggregating `StockLedger` entries (`SUM(IN) - SUM(OUT)`). There is no mutable quantity field.

**Serial numbers** — globally unique within a tenant. Each movement writes an immutable `SerialAudit` record. Current serial state = its most recent audit entry (`IN` or `OUT`).

---

## 🧪 Testing

```bash
cd backend

npm test                                        # run all tests
node --test tests/notification-center.test.js   # single file
npm run verify                                  # verify all production fixes
```

Test suite covers:

- Notification center logic
- Stock ledger calculations
- Serial number uniqueness enforcement
- RBAC middleware behavior

---

## 🔐 Security

| Control | Implementation |
|---|---|
| Authentication | JWT — short-lived access tokens + refresh token rotation |
| Password hashing | bcryptjs, configurable rounds (default 12) |
| Account deactivation | `isActive` checked on every authenticated request |
| Rate limiting | `express-rate-limit` with Redis store |
| HTTP security headers | Helmet.js (CSP, HSTS, X-Frame-Options, …) |
| CORS | Explicit origin allowlist via `FRONTEND_URL` |
| Input sanitization | `express-mongo-sanitize` — prevents NoSQL injection |
| Two-factor auth | TOTP via `otplib` |
| Audit trail | Immutable `AuditLog` entries for all sensitive operations |
| Secrets management | All secrets via env vars — never committed to VCS |

> ⚠️ **Never commit `.env` to version control.** It is already listed in `.gitignore`. Generate a unique `JWT_SECRET` and `JWT_REFRESH_SECRET` per environment.

---

## 🤝 Contributing

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Write tests for any new behavior in `backend/tests/`.
3. Run the full test suite: `npm test`
4. Follow existing code style — CommonJS on the backend, TypeScript strict mode on the frontend.
5. Open a pull request with a clear description of the problem and solution.

| Branch type | Pattern |
|---|---|
| Feature | `feature/description` |
| Bug fix | `fix/description` |
| Hotfix | `hotfix/description` |
| Docs | `docs/description` |

---

## 📄 License

ISC — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ by the **AcuStock Team**

</div>
