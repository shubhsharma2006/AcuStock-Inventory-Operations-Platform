const http = require('http');

const ROLES = [
  { role: 'SUPER_ADMIN', email: 'rajeshkumar@acustock.com', pass: 'SuperAdmin@123' },
  { role: 'ADMIN',       email: 'admin@company.com',        pass: 'Admin@123' },
  { role: 'MANAGER',     email: 'manager@test.com',         pass: 'Manager@123' },
  { role: 'USER',        email: 'shubh4w880@gmail.com',     pass: 'User@123' },
];

const ENDPOINTS = [
  // Dashboard & Analytics (Graphs)
  { path: '/api/reports/dashboard', method: 'GET', name: 'Dashboard Analytics' },
  { path: '/api/reports/admin-dashboard', method: 'GET', name: 'Admin Dashboard Stats' },
  { path: '/api/reports/user-summary', method: 'GET', name: 'User Summary Report' },
  { path: '/api/reports/stock-movement', method: 'GET', name: 'Stock Movement Report' },
  { path: '/api/reports/product-by-user', method: 'GET', name: 'Product By User Report' },
  { path: '/api/reports/user-activity', method: 'GET', name: 'User Activity Report' },

  // Inventory & Master Data
  { path: '/api/items', method: 'GET', name: 'Products List' },
  { path: '/api/units', method: 'GET', name: 'Units of Measure' },
  { path: '/api/warehouses', method: 'GET', name: 'Warehouses List' },
  { path: '/api/stock-transfers', method: 'GET', name: 'Stock Transfers' },
  { path: '/api/stock/ledger', method: 'GET', name: 'Stock Ledger' },
  { path: '/api/warranty', method: 'GET', name: 'Warranty List' },
  { path: '/api/shipments', method: 'GET', name: 'Shipments List' },
  { path: '/api/companies', method: 'GET', name: 'Companies List' },
  { path: '/api/purchase-orders', method: 'GET', name: 'Purchase Orders' },
  { path: '/api/sales-orders', method: 'GET', name: 'Sales Orders' },

  // Permissions & Governance
  { path: '/api/permissions/me', method: 'GET', name: 'My Permissions' },
  { path: '/api/settings/permissions', method: 'GET', name: 'All Role Permissions' },
  { path: '/api/users', method: 'GET', name: 'Users List' },
  { path: '/api/audit-logs', method: 'GET', name: 'Audit Logs' },
  { path: '/api/billing/status', method: 'GET', name: 'Billing Status' },
  { path: '/api/notifications?page=1&limit=10', method: 'GET', name: 'Notifications' },
];

function request(options, body = null) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    if (body) req.write(body);
    req.end();
  });
}

async function login(email, password, role) {
  const payload = JSON.stringify({ identifier: email, password, role });
  const res = await request({
    hostname: '127.0.0.1',
    port: 5001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  if (res.statusCode === 200 && res.data.user) {
    const rawCookies = res.headers['set-cookie'] || [];
    const cookies = rawCookies.map(c => c.split(';')[0]).join('; ');
    return { success: true, token: res.data.token, user: res.data.user, cookies };
  }
  return { success: false, status: res.statusCode, error: res.data };
}

async function evaluate() {
  console.log('================================================================');
  console.log('       AcuStock Cross-Role Comprehensive Audit & Evaluation     ');
  console.log('================================================================\n');

  const results = {};

  for (const account of ROLES) {
    console.log(`\n🔑 Testing Authentication for Role: ${account.role} (${account.email})...`);
    const auth = await login(account.email, account.pass, account.role);

    if (!auth.success) {
      console.error(`❌ Login FAILED for ${account.role}:`, auth);
      results[account.role] = { loginFailed: true, details: auth };
      continue;
    }

    console.log(`✅ Logged in successfully as ${auth.user.name} (${auth.user.role})`);
    results[account.role] = { login: 'SUCCESS', endpoints: {} };

    for (const ep of ENDPOINTS) {
      const headers = {
        'Authorization': `Bearer ${auth.token}`
      };
      if (auth.cookies) {
        headers['Cookie'] = auth.cookies;
      }

      const res = await request({
        hostname: '127.0.0.1',
        port: 5001,
        path: ep.path,
        method: ep.method,
        headers
      });

      const isOk = res.statusCode >= 200 && res.statusCode < 300;
      const isForbidden = res.statusCode === 403;
      const isNotFound = res.statusCode === 404;

      results[account.role].endpoints[ep.name] = {
        status: res.statusCode,
        path: ep.path,
        result: isOk ? '200 OK' : (isForbidden ? '403 Forbidden (RBAC Protected)' : (isNotFound ? '404 Not Found' : `${res.statusCode} Error`)),
        dataSummary: isOk ? (Array.isArray(res.data) ? `Array[${res.data.length}]` : (typeof res.data === 'object' ? Object.keys(res.data).slice(0, 5).join(', ') : 'OK')) : (res.data?.message || res.data?.error || 'Failed')
      };
    }
  }

  console.log('\n\n================================================================');
  console.log('                   EVALUATION MATRIX BY ROLE                    ');
  console.log('================================================================\n');

  for (const ep of ENDPOINTS) {
    console.log(`📌 ${ep.name} [${ep.method} ${ep.path}]`);
    for (const r of ROLES) {
      const epRes = results[r.role]?.endpoints?.[ep.name];
      const statusIcon = epRes?.status === 200 ? '🟢' : (epRes?.status === 403 ? '🔒' : '🔴');
      console.log(`   ${statusIcon} ${r.role.padEnd(12)}: ${epRes?.result} (${epRes?.dataSummary})`);
    }
    console.log('');
  }
}

evaluate();
