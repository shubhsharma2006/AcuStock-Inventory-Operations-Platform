<div align="center">

# 📦 AcuStock

**Enterprise-grade Inventory Management System**

[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-≥6.0-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A production-ready, SAP-style inventory management platform with role-based access control, immutable stock ledger, real-time WebSocket synchronization, and enterprise serial-number tracking.

[Features](#-features) · [Tech Stack](#-tech-stack) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Deployment](#-deployment) · [Architecture](#-architecture)

</div>

---

## ✨ Features

| Category | Capabilities |
|----------|-------------|
| 🔐 **Auth & Security** | JWT with token rotation, HTTP-only cookies, CSRF protection, Google OAuth, account lockout |
| 👥 **RBAC** | 4-tier hierarchy: SUPER_ADMIN → ADMIN → MANAGER → USER with fine-grained permissions |
| 📊 **Stock Management** | Stock IN/OUT with immutable ledger, optimistic concurrency, real-time sync |
| 🔢 **Serial Tracking** | Per-item serial policies (`requireSerialOnIN`/`requireSerialOnOUT`), global uniqueness |
| 📁 **Multi-Company** | Company-scoped data isolation; admins manage multiple companies |
| 📡 **Real-Time** | Socket.IO with room-based auth and Redis cluster adapter for horizontal scaling |
| 💳 **Billing** | Stripe integration with quota reservations, grace period, and reconciliation jobs |
| 🗄️ **Reliability** | MongoDB retry with exponential backoff, graceful shutdown, PM2 cluster mode |
| 📈 **Observability** | Winston structured logging, Sentry error tracking, request-ID tracing |
| ☁️ **Object Storage** | S3-compatible uploads (AWS S3, Cloudflare R2) |

---

## 🧰 Tech Stack

### Backend
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 (CommonJS) |
| Framework | Express 5.2 |
| Database | MongoDB 6+ via Mongoose 9 |
| Caching | Redis (ioredis) with in-memory fallback |
| Auth | JWT + bcryptjs, Google OAuth 2.0 |
| Real-Time | Socket.IO 4.8, `@socket.io/cluster-adapter` |
| Payments | Stripe |
| Storage | AWS S3 SDK v3 |
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
| 3D / Viz | Three.js |
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
│   ├── src/
│   │   ├── config/               # App & DB configuration
│   │   ├── controllers/          # Business logic handlers
│   │   ├── middleware/           # Auth, RBAC, validation, CSRF
│   │   ├── models/               # Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Item.js
│   │   │   ├── StockLedger.js    # Immutable transaction log
│   │   │   ├── SerialAudit.js    # Immutable serial trail
│   │   │   ├── Company.js
│   │   │   └── ...
│   │   ├── routes/               # API route definitions
│   │   └── utils/                # Helpers & shared utilities
│   ├── scripts/                  # Seed, reconcile & maintenance scripts
│   ├── tests/                    # Backend test suite
│   └── uploads/                  # Local file upload directory
│
├── frontend/
│   ├── web/                      # Next.js application (App Router)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── dashboard/[role]/   # Role-based dashboard pages
│   │   │   │   └── ...
│   │   │   ├── components/       # Shared UI components
│   │   │   ├── hooks/            # Custom React hooks
│   │   │   └── lib/              # API clients & utilities
│   │   └── Dockerfile
│   ├── admin-dashboard/          # Standalone admin panel
│   ├── manager-dashboard/        # Standalone manager panel
│   ├── user-dashboard/           # Standalone user panel
│   └── shared/                   # Shared config & utilities
│
├── ml-service/                   # ML / analytics microservice
├── docker-compose.yml            # Full-stack container orchestration
├── DEPLOYMENT.md                 # Production deployment checklist
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
| `POST` | `/auth/register` | Public (first-time only) | Register initial admin |
| `POST` | `/auth/register-user` | ADMIN / MANAGER | Create a new user |
| `POST` | `/auth/register-manager` | ADMIN | Create a new manager |
| `POST` | `/auth/refresh` | Authenticated | Rotate access token |
| `GET` | `/auth/google` | Public | Initiate Google OAuth flow |

### Stock Operations

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/stock/in` | ADMIN / MANAGER / USER | Record stock IN |
| `POST` | `/stock/out` | ADMIN / MANAGER / USER | Record stock OUT |
| `GET` | `/stock/ledger` | All roles | Paginated stock ledger |
| `GET` | `/stock/summary` | All roles | Current stock summary per item |
| `GET` | `/stock/transfers` | All roles | Transfer history |

### Items (Products)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/items` | All roles | List items |
| `POST` | `/items` | ADMIN | Create item |
| `PUT` | `/items/:id` | ADMIN | Update item |
| `DELETE` | `/items/:id` | ADMIN | Delete item |
| `PATCH` | `/items/:id/serial-policy` | ADMIN | Update serial policy |

### Companies

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `GET` | `/companies` | ADMIN / MANAGER | List companies |
| `POST` | `/companies` | ADMIN | Create company |
| `PUT` | `/companies/:id` | ADMIN | Update company |

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
│  Rate Limit  │  100 req/15 min (10 for auth endpoints)   │
│  RBAC        │  SUPER_ADMIN → ADMIN → MANAGER → USER    │
│  Input       │  Server-side validation + mongo sanitize  │
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
| View Reports | ✅ | ✅ | ❌ | ❌ |
| Billing Management | ✅ | ✅ | ❌ | ❌ |

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
┌──────────────────────────────────────────────────────────────┐
│                         Clients                              │
│   Browser (Next.js)  ·  Admin Panel  ·  Mobile (future)     │
└──────────────┬──────────────────────────────────────────────┘
               │  HTTPS + WebSocket
┌──────────────▼──────────────────────────────────────────────┐
│                     Next.js (App Router)                     │
│         API Proxy (/api/*) → hides backend URL              │
└──────────────┬──────────────────────────────────────────────┘
               │  Internal HTTP
┌──────────────▼──────────────────────────────────────────────┐
│               Express 5 API  (PM2 Cluster)                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Auth   │  │  Stock   │  │  Items   │  │  Billing    │  │
│  │Middleware│  │  Ledger  │  │  RBAC    │  │  (Stripe)   │  │
│  └─────────┘  └──────────┘  └──────────┘  └─────────────┘  │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
   ┌───────────▼───────────┐    ┌─────────▼──────────────┐
   │       MongoDB          │    │         Redis           │
   │  (Immutable Ledger)    │    │  (Rate Limit · Cache)  │
   └───────────────────────┘    └────────────────────────┘
```

### Immutable Stock Ledger

Every stock movement creates a **StockLedger** document that is never modified or deleted. Current stock is always calculated as:

```
Current Stock = Σ(Stock IN quantities) − Σ(Stock OUT quantities)
```

This approach mirrors SAP FI/MM journal accounting, providing a complete, tamper-proof audit trail.

### Serial Number Policy

Each item can have an independent serial policy configured by ADMIN:

```json
{
  "enableSerial": true,
  "requireSerialOnIN": true,
  "requireSerialOnOUT": true
}
```

- Serial numbers are **globally unique** across all items and companies.
- Every serial movement is recorded in the immutable **SerialAudit** collection.

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
- [ ] Set up S3/R2 credentials for file uploads
- [ ] Configure Stripe and webhook endpoint
- [ ] Configure SMTP for email notifications
- [ ] Review CORS allowed origins
- [ ] Set up Sentry DSN for error tracking
- [ ] Enable HTTPS / SSL certificates
- [ ] Run `npm run seed` to initialize permissions
- [ ] Set up PM2 startup script (`pm2 startup && pm2 save`)
- [ ] Configure recurring maintenance jobs (billing reconciliation)

---

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

FOR FEEDBACK AND UPDATES- shubh4880@gmail.com

<div align="center">

Built with shubh sharma.

</div>
