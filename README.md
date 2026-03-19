# AcuStock - Inventory Management System

A production-ready, enterprise-grade inventory management system with role-based access control, real-time updates, and SAP-style immutable ledger.

## 🚀 Features

- **Role-Based Access Control**: Admin, Manager, and User roles with fine-grained permissions
- **Stock Management**: Stock IN/OUT with serial number tracking
- **Immutable Ledger**: SAP-style stock ledger (no edit/delete)
- **Real-Time Updates**: WebSocket-based live synchronization
- **Serial Number Tracking**: Global uniqueness enforcement
- **HTTP-Only Cookie Auth**: Secure session management
- **Activity Tracking**: Complete audit trail of all operations

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 6.0 (local or MongoDB Atlas)
- PM2 (for production deployment)

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd acustock
```

### 2. Install backend dependencies
```bash
cd backend
npm install
```

### 3. Configure environment
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your configuration
# CRITICAL: Generate a new JWT_SECRET for production
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Seed permissions
```bash
npm run seed
```

### 5. Start the server
```bash
# Development
npm run dev

# Production
npm run prod

# With PM2 (recommended for production)
npm run pm2:start
```

## 🔐 Environment Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 5001) |
| `NODE_ENV` | Environment mode | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes |
| `JWT_EXPIRE` | Token expiration | No (default: 7d) |
| `FRONTEND_URL` | CORS allowed origins | Yes |

## 🏗️ Project Structure

```
├── backend/
│   ├── index.js              # Express app entry point
│   ├── ecosystem.config.js   # PM2 configuration
│   ├── src/
│   │   ├── config/           # App configuration
│   │   ├── controllers/      # Route handlers
│   │   ├── middleware/       # Auth & permission middleware
│   │   ├── models/           # Mongoose models
│   │   ├── routes/           # API routes
│   │   └── utils/            # Utility functions
│   └── scripts/              # Seed & maintenance scripts
│
├── frontend/
│   ├── admin-dashboard/      # Admin UI
│   ├── manager-dashboard/    # Manager UI
│   ├── user-dashboard/       # User UI
│   └── shared/               # Shared utilities & config
│
└── README.md
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/register` - Register admin (first-time only)

### Stock Operations
- `POST /api/stock/in` - Stock IN entry
- `POST /api/stock/out` - Stock OUT entry
- `GET /api/stock/ledger` - Get stock ledger
- `GET /api/stock/summary` - Get stock summary

### Users & Managers
- `GET /api/users` - List users
- `POST /api/auth/register-user` - Create user
- `POST /api/auth/register-manager` - Create manager (Admin only)

## 🔒 Security Features

1. **HTTP-Only Cookies**: JWT stored in secure, HTTP-only cookies
2. **CORS Protection**: Configurable origin whitelist
3. **Rate Limiting**: 100 requests per 15 minutes per IP
4. **Helmet**: Security headers enabled
5. **Admin Protection**: Admins cannot be deactivated
6. **Token Versioning**: Force logout on password change
7. **Input Validation**: Server-side validation on all inputs

## 📊 Role Permissions

| Feature | Admin | Manager | User |
|---------|-------|---------|------|
| Manage Products | ✅ | ❌ | ❌ |
| Manage Companies | ✅ | ❌ | ❌ |
| Stock IN | ✅ | ✅ | ✅ |
| Stock OUT | ✅ | ✅ | ✅ |
| View Stock Ledger | ✅ | ✅ | ✅ |
| Manage Managers | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | ❌ |
| View Reports | ✅ | ❌ | ❌ |

## 🚀 Production Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Monitor
pm2 monit

# Restart
npm run pm2:restart
```

### Using Docker (Coming Soon)

```bash
docker-compose up -d
```

## 🧪 Testing

```bash
# Run tests
npm test

# Health check
curl http://localhost:5001/api/health
```

## 📝 License

ISC License

## 👥 Support

For support, email support@acustock.com or create an issue in the repository.
