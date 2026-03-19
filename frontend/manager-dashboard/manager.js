/**
 * ===============================================
 * AcuStock Manager Dashboard
 * SAP-Style Inventory Management System
 * ===============================================
 * 
 * Manager Capabilities:
 * - View Products (Read-only from Admin)
 * - View Companies (Admin's + Own)
 * - Add Companies
 * - Stock IN (Supplier Entry)
 * - Stock OUT (Buyer Entry)
 * - View Stock Ledger (No edit/delete - SAP style)
 * - Add Users (Role: USER)
 * - Activate/Deactivate Users
 * - View Remaining Stock (Real-time)
 * 
 * Manager Restrictions:
 * - Cannot change serial policy (Admin only)
 * - Cannot edit/delete stock entries
 * - Cannot view other managers' data
 */

(function() {
  'use strict';

  // ===============================================
  // CONFIGURATION
  // ===============================================
  // API_URL: reads from shared config.js (loaded before this script).
  // Falls back to localhost for dev if config is not loaded.
  const API_URL = (window.AcuStockConfig && window.AcuStockConfig.API_BASE_URL)
    || window.ACUSTOCK_API_URL
    || 'http://127.0.0.1:5001/api';
  const LOGIN_PAGE = (window.AcuStockConfig && window.AcuStockConfig.LOGIN_PAGE)
    || '../admin-dashboard/admin-html/login.html';

  // ===============================================
  // STATE MANAGEMENT
  // ===============================================
  const state = {
    user: null,
    token: null,
    currentSection: 'dashboard',
    products: [],
    companies: [],
    users: [],
    stockEntries: [],
    pagination: {
      products: { page: 1, limit: 10, total: 0 },
      companies: { page: 1, limit: 10, total: 0 },
      ledger: { page: 1, limit: 20, total: 0 }
    },
    charts: {},
    permissions: {} // Admin-controlled permissions
  };

  // ===============================================
  // AUTH UTILITIES (HTTP-only cookies - Production Ready)
  // Token stored in HTTP-only cookie (secure, not accessible by JS)
  // User info cached in memory only (refreshed from API)
  // ===============================================
  const auth = {
    // Get user from state (populated on init via API call)
    getUser() {
      return state.user;
    },
    
    // Cache user in memory only (not in storage - more secure)
    setUser(user) {
      state.user = user;
    },
    
    clearAuth() {
      state.user = null;
    },
    
    isAuthenticated() {
      return !!state.user;
    },
    
    isManager() {
      return state.user && state.user.role === 'MANAGER';
    },
    
    // Logout - call API to clear HTTP-only cookie
    async logout() {
      try {
        await fetch(`${API_URL}/auth/logout`, { 
          method: 'POST',
          credentials: 'include' // Include cookies
        });
      } catch (e) {
        console.error('Logout error:', e);
      }
      this.clearAuth();
      window.location.href = LOGIN_PAGE;
    },

    // Verify session with API (HTTP-only cookie sent automatically)
    async verifySession() {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          method: 'GET',
          credentials: 'include', // Include HTTP-only cookie
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          return null;
        }
        
        const user = await response.json();
        return user;
      } catch (error) {
        console.error('Session verification failed:', error);
        return null;
      }
    }
  };

  // ===============================================
  // API UTILITIES (Using HTTP-only cookies)
  // ===============================================
  async function fetchAPI(endpoint, options = {}) {
    const config = {
      credentials: 'include', // Always include HTTP-only cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle token expiry
        if (response.status === 401) {
          auth.logout();
          return { success: false, message: 'Session expired. Please login again.' };
        }
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // ===============================================
  // PERMISSION UTILITIES
  // Fetch and apply permissions from Admin settings
  // ===============================================
  
  /**
   * Fetch permissions from backend and store in state
   */
  async function fetchPermissions() {
    try {
      const permRes = await fetchAPI('/settings/permissions/MANAGER');
      state.permissions = permRes;
      return state.permissions;
    } catch (e) {
      console.error('Failed to fetch permissions:', e);
      // Default to all enabled if can't fetch
      state.permissions = {
        canAddProduct: true,
        canEditProduct: true,
        canDeleteProduct: true,
        canStockIn: true,
        canStockOut: true,
        canViewStockLedger: true,
        canManageUsers: true,
        canViewReports: true,
        canManageItems: true,
        canManageCompanies: true,
        canAddLogistics: true,
        canEditLogistics: true,
        canDeleteLogistics: true
      };
      return state.permissions;
    }
  }

  /**
   * Apply permissions to sidebar menu - show/hide items based on Admin settings
   */
  function applyPermissions() {
    const permissions = state.permissions;
    if (!permissions) return;

    // Permission mapping: menu data-section -> permission key
    const permissionMap = {
      // Products submenu
      'product-list': true, // Always visible (view only)
      'remaining-stock': true, // Always visible
      
      // Stock Management submenu
      'stock-in': permissions.canStockIn,
      'stock-out': permissions.canStockOut,
      'stock-ledger': permissions.canViewStockLedger,
      
      // Companies submenu
      'company-list': true, // Always visible (view)
      'company-add': permissions.canManageCompanies,
      
      // Users submenu
      'user-list': permissions.canManageUsers,
      'user-add': permissions.canManageUsers,
      
      // Reports
      'reports': permissions.canViewReports,
      
      // Logistics submenu
      'logistics-list': true, // Always visible (view)
      'logistics-add': permissions.canAddLogistics,

      // Warranty — always visible for manager
      'warranty-list': true
    };

    // Apply to individual menu items
    document.querySelectorAll('.menu a[data-section], .submenu a[data-section]').forEach(link => {
      const section = link.getAttribute('data-section');
      const isAllowed = permissionMap[section];
      
      if (isAllowed === false) {
        link.closest('li').style.display = 'none';
      } else {
        link.closest('li').style.display = '';
      }
    });

    // Hide entire menu groups if all their items are hidden
    hideEmptyMenuGroups();
  }

  /**
   * Hide menu groups that have no visible items
   */
  function hideEmptyMenuGroups() {
    document.querySelectorAll('.menu-group').forEach(group => {
      const submenu = group.querySelector('.submenu');
      if (submenu) {
        const visibleItems = submenu.querySelectorAll('li:not([style*="display: none"])');
        const menuToggle = group.querySelector('.menu-toggle');
        if (visibleItems.length === 0 && menuToggle) {
          group.style.display = 'none';
        } else {
          group.style.display = '';
        }
      }
    });

    // Special handling for parent menu items that are permission-controlled
    const permissions = state.permissions;
    
    // Users menu - hide if canManageUsers is false
    if (permissions.canManageUsers === false) {
      const usersToggle = document.querySelector('[data-target="users-sub"]');
      if (usersToggle) {
        usersToggle.closest('.menu-group').style.display = 'none';
      }
    }

    // Reports menu - hide if canViewReports is false
    if (permissions.canViewReports === false) {
      const reportsLink = document.querySelector('a[data-section="reports"]');
      if (reportsLink) {
        reportsLink.closest('.menu-group').style.display = 'none';
      }
    }
  }

  // ===============================================
  // UI UTILITIES
  // ===============================================
  function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="title">${type === 'success' ? '✓ Success' : type === 'error' ? '✗ Error' : 'ℹ Info'}</div>
      <div class="msg">${message}</div>
    `;

    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));

    // Remove after 4 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function showLoading(show = true) {
    const loader = document.getElementById('global-loading');
    if (loader) {
      loader.style.display = show ? 'flex' : 'none';
    }
  }

  function updateBreadcrumb(section) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const sectionNames = {
      'dashboard': 'Dashboard',
      'product-list': 'Products → View Products',
      'remaining-stock': 'Products → Remaining Stock',
      'stock-in': 'Stock Management → Stock IN',
      'stock-out': 'Stock Management → Stock OUT',
      'stock-ledger': 'Stock Management → Stock Ledger',
      'company-list': 'Companies → View Companies',
      'company-add': 'Companies → Add Company',
      'user-list': 'Users → User List',
      'user-add': 'Users → Add User',
      'reports': 'Reports',
      'warranty-list': '🛡️ Warranty',
      'all-notifications': '🔔 All Notifications',
    };

    breadcrumb.innerHTML = `<span class="breadcrumb-item">${sectionNames[section] || section}</span>`;
  }

  // ===============================================
  // TEMPLATE RENDERING
  // ===============================================
  function loadTemplate(templateId) {
    const template = document.getElementById(templateId);
    const content = document.getElementById('content');
    
    if (!template || !content) {
      console.error('Template or content container not found:', templateId);
      return;
    }

    // Clone and insert template
    const clone = template.content.cloneNode(true);
    content.innerHTML = '';
    content.appendChild(clone);

    // Update state and UI
    state.currentSection = templateId;
    updateBreadcrumb(templateId);
    updateMenuActive(templateId);

    // Initialize section
    initSection(templateId);
  }

  function updateMenuActive(section) {
    // Remove all active states
    document.querySelectorAll('.menu .single, .submenu li a').forEach(el => {
      el.classList.remove('active');
    });
    document.querySelectorAll('.menu-toggle').forEach(el => {
      el.classList.remove('active');
    });

    // Add active state to current section
    const menuItem = document.querySelector(`[data-section="${section}"]`);
    if (menuItem) {
      menuItem.classList.add('active');
      
      // Open parent submenu if exists
      const parentSubmenu = menuItem.closest('.submenu');
      if (parentSubmenu) {
        parentSubmenu.classList.add('open');
        const toggle = document.querySelector(`[data-target="${parentSubmenu.id}"]`);
        if (toggle) toggle.classList.add('active');
      }
    }
  }

  // ===============================================
  // SECTION INITIALIZERS
  // ===============================================
  function initSection(section) {
    switch (section) {
      case 'dashboard':
        initDashboard();
        break;
      case 'product-list':
        initProductList();
        break;
      case 'remaining-stock':
        initRemainingStock();
        break;
      case 'stock-in':
        initStockSupplier();
        break;
      case 'stock-out':
        initStockBuyer();
        break;
      case 'stock-ledger':
        initStockLedger();
        break;
      case 'company-list':
        initCompanyList();
        break;
      case 'company-add':
        initCompanyAdd();
        break;
      case 'user-list':
        initUserList();
        break;
      case 'user-add':
        initUserAdd();
        break;
      case 'reports':
        initReports();
        break;
      case 'logistics-list':
        initLogisticsList();
        break;
      case 'logistics-add':
        initLogisticsAdd();
        break;
      case 'logistics-modify':
        initLogisticsModify();
        break;
      case 'profile':
        initProfile();
        break;
      case 'settings':
        initSettings();
        break;
      case 'warranty-list':
        initWarrantyList();
        break;
      case 'all-notifications':
        initAllNotifications();
        break;
    }
  }

  // ===============================================
  // DASHBOARD
  // ===============================================
  async function initDashboard() {
    try {
      // Fetch comprehensive dashboard data
      const dashboardData = await fetchAPI(`/reports/manager-dashboard?t=${Date.now()}`);
      
      if (!dashboardData) {
        throw new Error('Failed to fetch dashboard data');
      }
      
      const { stats, charts, lowStockAlerts, recentActivity } = dashboardData;
      
      // Update stat cards
      const statProducts = document.getElementById('stat-products');
      const statStockIn = document.getElementById('stat-stock-in');
      const statStockOut = document.getElementById('stat-stock-out');
      const statUsers = document.getElementById('stat-users');

      if (statProducts) statProducts.textContent = stats.totalProducts || 0;
      if (statStockIn) statStockIn.textContent = stats.stockInToday || 0;
      if (statStockOut) statStockOut.textContent = stats.stockOutToday || 0;
      if (statUsers) statUsers.textContent = stats.totalUsers || 0;
      
      // Initialize charts with real data
      initDashboardCharts(charts);
      
      // Render recent activity
      renderRecentActivity(recentActivity);
      
      // Render low stock alerts
      renderLowStockAlerts(lowStockAlerts);

      // Quick action buttons
      document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const section = btn.dataset.section;
          if (section) loadTemplate(section);
        });
      });
      
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      showToast('Failed to load dashboard data', 'error');
    }
  }

  function renderRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    
    if (activities && activities.length > 0) {
      container.innerHTML = `
        <div class="activity-list">
          ${activities.map(entry => `
            <div class="activity-item">
              <span class="activity-icon">${entry.type === 'IN' ? '📥' : '📤'}</span>
              <div class="activity-details">
                <strong>${entry.productName || 'Unknown Product'}</strong>
                <span class="muted"> - ${entry.quantity} units by ${entry.userName}</span>
              </div>
              <span class="activity-time">${formatDate(entry.timestamp)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      container.innerHTML = '<p class="muted">No recent activity.</p>';
    }
  }

  function renderLowStockAlerts(alerts) {
    const container = document.getElementById('low-stock-list');
    if (!container) return;
    
    if (alerts && alerts.length > 0) {
      container.innerHTML = alerts.map(item => `
        <div class="alert-item ${item.currentStock <= 0 ? 'critical' : 'warning'}">
          <span class="alert-icon">⚠️</span>
          <div class="alert-info">
            <strong>${item.productName}</strong>
            <span class="stock-level">Stock: ${item.currentStock} / Reorder: ${item.reorderLevel}</span>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = '<p class="muted" style="text-align: center; padding: 20px;">✅ All products have adequate stock levels.</p>';
    }
  }

  function initDashboardCharts(chartsData) {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded');
      return;
    }
    
    // Destroy existing charts
    if (state.charts.stockMovement) {
      state.charts.stockMovement.destroy();
    }
    if (state.charts.topProducts) {
      state.charts.topProducts.destroy();
    }
    
    // Color palette
    const colors = {
      success: '#10B981',
      danger: '#EF4444',
      primary: '#1F3C88',
      secondary: '#C8A35A',
      info: '#3B82F6',
      purple: '#8B5CF6',
      gray: '#6B7280'
    };

    // Stock Movement Chart (Line)
    const stockMovementCtx = document.getElementById('stockMovementChart');
    if (stockMovementCtx && chartsData?.stockMovement) {
      const { labels, stockIn, stockOut } = chartsData.stockMovement;
      
      // Format labels to show shorter date format
      const formattedLabels = labels.map(l => {
        const d = new Date(l);
        return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
      });
      
      state.charts.stockMovement = new Chart(stockMovementCtx, {
        type: 'line',
        data: {
          labels: formattedLabels,
          datasets: [
            {
              label: 'Stock IN',
              data: stockIn,
              borderColor: colors.success,
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 6
            },
            {
              label: 'Stock OUT',
              data: stockOut,
              borderColor: colors.danger,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointHoverRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { 
              beginAtZero: true,
              ticks: { color: '#6B7280' },
              grid: { color: 'rgba(107, 114, 128, 0.1)' }
            },
            x: {
              ticks: { color: '#6B7280' },
              grid: { display: false }
            }
          }
        }
      });
    }

    // Top Products Chart (Doughnut)
    const topProductsCtx = document.getElementById('topProductsChart');
    if (topProductsCtx && chartsData?.productWise) {
      const { labels, data } = chartsData.productWise;
      
      // If no data, show placeholder
      const hasData = data && data.length > 0 && data.some(d => d > 0);
      
      state.charts.topProducts = new Chart(topProductsCtx, {
        type: 'doughnut',
        data: {
          labels: hasData ? labels : ['No Data'],
          datasets: [{
            data: hasData ? data : [1],
            backgroundColor: hasData ? [
              colors.primary,
              colors.secondary,
              colors.success,
              colors.info,
              colors.gray
            ] : ['#E5E7EB']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' }
          }
        }
      });
    }
  }

  function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
    }
    return days;
  }

  function generateRandomData(count, min, max) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min + 1)) + min);
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ===============================================
  // PRODUCT LIST (Read-Only)
  // ===============================================
  async function initProductList() {
    await loadProducts();
    
    // Search
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadProducts(searchInput.value), 300);
      });
    }

    // Pagination
    document.getElementById('product-prev')?.addEventListener('click', () => {
      if (state.pagination.products.page > 1) {
        state.pagination.products.page--;
        loadProducts();
      }
    });

    document.getElementById('product-next')?.addEventListener('click', () => {
      const totalPages = Math.ceil(state.pagination.products.total / state.pagination.products.limit);
      if (state.pagination.products.page < totalPages) {
        state.pagination.products.page++;
        loadProducts();
      }
    });
  }

  async function loadProducts(search = '') {
    const tbody = document.querySelector('#product-table tbody');
    if (!tbody) return;

    try {
      const { page, limit } = state.pagination.products;
      let endpoint = `/items?page=${page}&limit=${limit}`;
      if (search) endpoint += `&search=${encodeURIComponent(search)}`;

      const res = await fetchAPI(endpoint);
      const items = res.items || res || [];
      state.pagination.products.total = res.total || items.length;

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">No products found</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(item => {
        const stock = item.quantity ?? item.currentStock ?? 0;
        return `
        <tr>
          <td><strong>${item.name || '-'}</strong></td>
          <td>${item.shortName || '-'}</td>
          <td>${item.hsn || '-'}</td>
          <td>${item.unit?.name || item.unit || '-'}</td>
          <td>₹${item.salesPrice?.toFixed(2) || '0.00'}</td>
          <td><span class="status-badge ${stock < 10 ? 'low' : 'ok'}">${stock}</span></td>
          <td>${item.serialPolicy?.enableSerial ? '✅ Enabled' : '❌ Disabled'}</td>
        </tr>
      `;
      }).join('');

      updatePagination('products');

    } catch (error) {
      console.error('Failed to load products:', error);
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Failed to load products</td></tr>';
    }
  }

  function updatePagination(type) {
    const { page, limit, total } = state.pagination[type];
    const totalPages = Math.ceil(total / limit) || 1;
    
    const pageInfo = document.getElementById(`${type === 'products' ? 'product' : type}-page-info`);
    const prevBtn = document.getElementById(`${type === 'products' ? 'product' : type}-prev`);
    const nextBtn = document.getElementById(`${type === 'products' ? 'product' : type}-next`);

    if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  // ===============================================
  // REMAINING STOCK (Real-time)
  // ===============================================
  let _remainingStockData = [];

  async function initRemainingStock() {
    await loadRemainingStock();

    const searchEl   = document.getElementById('rs-search');
    const filterEl   = document.getElementById('rs-status-filter');
    const exportBtn  = document.getElementById('rs-export-btn');
    const refreshBtn = document.getElementById('rs-refresh-btn');

    if (searchEl)   searchEl.addEventListener('input',  () => renderRemainingStockTable(_remainingStockData));
    if (filterEl)   filterEl.addEventListener('change', () => renderRemainingStockTable(_remainingStockData));
    if (exportBtn)  exportBtn.addEventListener('click',  () => exportRemainingStockCSV(_remainingStockData));
    if (refreshBtn) refreshBtn.addEventListener('click', async () => {
      await loadRemainingStock();
      showToast('Stock data refreshed', 'success');
    });
  }

  async function loadRemainingStock() {
    const tbody = document.getElementById('rs-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Loading…</td></tr>';

    try {
      const res = await fetchAPI('/stock/summary');
      _remainingStockData = (res.items || []).map(item => ({
        ...item,
        remaining: (item.totalIn || 0) - (item.totalOut || 0)
      }));
      renderRemainingStockTable(_remainingStockData);
    } catch (err) {
      console.error('Failed to load remaining stock:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:red;">Failed to load data</td></tr>';
    }
  }

  function renderRemainingStockTable(data) {
    const tbody    = document.getElementById('rs-tbody');
    const searchEl = document.getElementById('rs-search');
    const filterEl = document.getElementById('rs-status-filter');
    const countEl  = document.getElementById('rs-row-count');
    if (!tbody) return;

    const query  = searchEl ? searchEl.value.trim().toLowerCase() : '';
    const status = filterEl ? filterEl.value : 'all';
    const LOW_THRESHOLD = 10;

    const getStatus = (rem) => rem <= 0 ? 'out-of-stock' : rem <= LOW_THRESHOLD ? 'low-stock' : 'in-stock';

    const statusLabel = {
      'in-stock':     '<span class="rs-badge rs-badge-in">✅ In Stock</span>',
      'low-stock':    '<span class="rs-badge rs-badge-low">⚠️ Low Stock</span>',
      'out-of-stock': '<span class="rs-badge rs-badge-out">❌ Out of Stock</span>',
    };

    const filtered = data.filter(item => {
      const matchQ = !query || item.name.toLowerCase().includes(query) || (item.shortName || '').toLowerCase().includes(query);
      const matchS = status === 'all' || getStatus(item.remaining) === status;
      return matchQ && matchS;
    });

    // Summary cards
    const totalIn        = data.reduce((s, i) => s + (i.totalIn  || 0), 0);
    const totalOut       = data.reduce((s, i) => s + (i.totalOut || 0), 0);
    const totalRemaining = data.reduce((s, i) => s + i.remaining,        0);
    const lowOrOut       = data.filter(i => getStatus(i.remaining) !== 'in-stock').length;

    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('rs-total-in',        totalIn);
    setEl('rs-total-out',       totalOut);
    setEl('rs-total-remaining', totalRemaining);
    setEl('rs-low-stock',       lowOrOut);

    // Last updated
    const lu = document.getElementById('rs-last-updated');
    if (lu) lu.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="rs-loading">No products match your filter</td></tr>';
      if (countEl) countEl.textContent = '';
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      const st = getStatus(item.remaining);
      const threshold = item.lowStockThreshold ?? 10;
      const remClass = item.remaining <= 0 ? 'rs-val-zero' : item.remaining <= threshold ? 'rs-val-low' : 'rs-val-ok';
      return `
        <tr>
          <td style="color:var(--muted,#888);font-size:.85rem;">${idx + 1}</td>
          <td><strong>${item.name || '—'}</strong></td>
          <td style="color:var(--muted,#888);">${item.shortName || '—'}</td>
          <td><span class="rs-val-in">+${item.totalIn || 0}</span></td>
          <td><span class="rs-val-out-col">−${item.totalOut || 0}</span></td>
          <td><span class="${remClass}">${item.remaining}</span></td>
          <td>${statusLabel[st]}</td>
        </tr>
      `;
    }).join('');

    if (countEl) countEl.textContent = `Showing ${filtered.length} of ${data.length} product${data.length !== 1 ? 's' : ''}`;
  }

  function exportRemainingStockCSV(data) {
    if (!data || data.length === 0) { showToast('No data to export', 'error'); return; }
    const LOW_THRESHOLD = 10;
    const getStatus = (rem) => rem <= 0 ? 'Out of Stock' : rem <= LOW_THRESHOLD ? 'Low Stock' : 'In Stock';

    const rows = [
      ['#', 'Product Name', 'Short Name', 'Total IN', 'Total OUT', 'Remaining', 'Status'],
      ...data.map((item, idx) => [
        idx + 1, item.name || '', item.shortName || '',
        item.totalIn || 0, item.totalOut || 0, item.remaining, getStatus(item.remaining)
      ])
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `remaining-stock-${new Date().toISOString().slice(0,10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  }

  // ===============================================
  // STOCK IN (Supplier Entry) - Admin Style
  // ===============================================
  
  // Helper: Load unique product names into a dropdown
  async function loadProductNamesDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return [];
    
    try {
      const productNames = await fetchAPI('/items/product-names');
      
      select.innerHTML = '<option value="">-- Select Product Name --</option>' +
        productNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

      _initTomSelect(select, 'Type product name…');
      return productNames;
    } catch (err) {
      console.error('Failed to load product names:', err);
      return [];
    }
  }
  
  // Helper: Load models/shortNames for a specific product name
  async function loadModelsForProduct(productName, modelSelectId) {
    const select = document.getElementById(modelSelectId);
    if (!select) return [];
    
    if (!productName) {
      select.innerHTML = '<option value="">-- Select Product Name First --</option>';
      select.disabled = true;
      _initTomSelect(select, 'Select model / short name…');
      return [];
    }
    
    try {
      const models = await fetchAPI(`/items/models-by-name/${encodeURIComponent(productName)}`);
      
      if (models.length === 0) {
        select.innerHTML = '<option value="">-- No models found --</option>';
        select.disabled = true;
        _initTomSelect(select, 'No models found');
        return [];
      }
      
      select.innerHTML = '<option value="">-- Select Model --</option>' +
        models.map(m => `<option value="${m._id}" 
          data-serial-policy='${JSON.stringify(m.serialPolicy || { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false })}'
          data-product-name="${escapeHtml(m.name)}"
          data-short-name="${escapeHtml(m.shortName || '')}"
          data-warranty="${escapeHtml(m.warranty || '')}"
          data-seller-warranty="${escapeHtml(m.defaultSellerWarranty || '')}"
        >${escapeHtml(m.shortName || m.name)}${m.shortName ? ` (${escapeHtml(m.name)})` : ''}</option>`).join('');
      
      select.disabled = false;
      _initTomSelect(select, 'Select model / short name…');
      return models;
    } catch (err) {
      console.error('Failed to load models:', err);
      select.innerHTML = '<option value="">-- Error loading models --</option>';
      select.disabled = true;
      return [];
    }
  }

  // ── Tom Select helper (inside IIFE) ────────────────────────────────────────
  function _initTomSelect(el, placeholder) {
    if (typeof TomSelect === 'undefined') return;
    if (!el) return;
    if (el.tomselect) { el.tomselect.destroy(); }
    new TomSelect(el, {
      placeholder:      placeholder || 'Type to search…',
      searchField:      ['text', 'value'],
      maxOptions:       100,
      highlight:        true,
      allowEmptyOption: true,
      selectOnTab:      true,
      closeAfterSelect: true,
    });
  }
  
  // Helper: Load products into a dropdown (legacy - for backwards compatibility)
  async function loadProductsDropdown(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    try {
      const res = await fetchAPI('/items');
      const items = res.items || res || [];
      
      // Keep the first "All" option if it exists
      const firstOption = select.options[0];
      select.innerHTML = '';
      if (firstOption && firstOption.value === '') {
        select.appendChild(firstOption);
      }
      
      items.forEach(item => {
        const option = document.createElement('option');
        option.value = item._id;
        option.textContent = item.name || item.shortName;
        select.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load products for dropdown:', err);
    }
  }

  // Helper: Clear form errors
  function clearFormErrors(form) {
    if (!form) return;
    const errorMessages = form.querySelectorAll('.error-message');
    errorMessages.forEach(el => el.textContent = '');
    const errorInputs = form.querySelectorAll('.error');
    errorInputs.forEach(el => el.classList.remove('error'));
  }

  // Helper: Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // ===============================================
  // SERIAL / PRODUCT QUICK SEARCH
  // ===============================================
  function initSerialSearch() {
    const input    = document.getElementById('global-search');
    const dropdown = document.getElementById('serial-search-dropdown');
    if (!input || !dropdown) return;

    let debounceTimer = null;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(() => runSerialSearch(q), 300);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        input.blur();
      }
    });
  }

  async function runSerialSearch(q) {
    const dropdown = document.getElementById('serial-search-dropdown');
    if (!dropdown) return;
    dropdown.style.display = 'block';
    dropdown.innerHTML = '<div class="qs-empty">Searching…</div>';
    try {
      const data = await fetchAPI(`/stock/serial/search?q=${encodeURIComponent(q)}`);
      renderSerialSearchResults(data, q);
    } catch (err) {
      dropdown.innerHTML = '<div class="qs-empty">Search failed. Try again.</div>';
    }
  }

  function renderSerialSearchResults(data, q) {
    const dropdown = document.getElementById('serial-search-dropdown');
    if (!dropdown) return;

    const { results = [], perProduct = [], totalMatches } = data;

    if (results.length === 0) {
      dropdown.innerHTML = `<div class="qs-empty">No serials found matching <strong>${escapeHtml(q)}</strong></div>`;
      return;
    }

    const highlight = (str) => {
      if (!str) return '—';
      const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return str.replace(regex, '<mark class="qs-mark">$1</mark>');
    };

    const summaryHtml = perProduct.map(p => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg-2,#f9fafb);border-radius:8px;margin-bottom:4px;">
        <span style="font-size:1.1rem;">📦</span>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:.9rem;color:var(--text);">${escapeHtml(p.productName || '—')}</div>
          <div style="font-size:.78rem;color:var(--muted,#6b7280);">${escapeHtml(p.productShortName || '')}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">✅ ${p.inStock} in stock</span>
          <span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">📤 ${p.outOfStock} sold</span>
        </div>
      </div>
    `).join('');

    const rowsHtml = results.map(r => {
      const isIn = r.status === 'in-stock';
      const statusBadge = isIn
        ? '<span class="rs-badge rs-badge-in" style="font-size:.75rem;background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 9px;font-weight:700;">In Stock</span>'
        : '<span class="rs-badge rs-badge-out" style="font-size:.75rem;background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 9px;font-weight:700;">Sold / Out</span>';
      const date = r.lastActionAt
        ? new Date(r.lastActionAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
        : '—';
      return `
        <li class="qs-item" style="cursor:default;">
          <div style="font-size:1rem;min-width:20px;">${isIn ? '📗' : '📕'}</div>
          <div class="qs-main">
            <div class="qs-title" style="font-family:monospace;letter-spacing:.04em;">${highlight(r.serial)}</div>
            <div class="qs-sub">${escapeHtml(r.productName || '—')}${r.productShortName ? ' · ' + escapeHtml(r.productShortName) : ''}</div>
            <div class="qs-sub" style="font-size:.75rem;margin-top:2px;">Last ${r.lastAction} · ${date}${r.actorName ? ' · by ' + escapeHtml(r.actorName) : ''}</div>
          </div>
          <div>${statusBadge}</div>
        </li>
      `;
    }).join('');

    dropdown.innerHTML = `
      <div style="padding:8px 12px 4px;font-size:.75rem;color:var(--muted,#6b7280);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">
        ${totalMatches} serial${totalMatches !== 1 ? 's' : ''} matched
      </div>
      ${summaryHtml}
      <ul class="qs-list">${rowsHtml}</ul>
    `;
  }

  // Cache for companies
  let companiesCache = [];

  // Load companies into cache
  async function loadCompaniesCache() {
    try {
      const res = await fetchAPI('/companies?limit=100');
      companiesCache = res.companies || res || [];
      return companiesCache;
    } catch (err) {
      console.error('Failed to load companies:', err);
      return [];
    }
  }

  // Populate company dropdown for Stock IN (Supplier)
  async function initSupplierCompanyDropdown(form) {
    const companySelect = form.querySelector('#sp-companySelect');
    const companyNameInput = form.querySelector('#sp-companyName');
    const customerPhoneInput = form.querySelector('#sp-customerPhone');
    const customerEmailInput = form.querySelector('#sp-customerEmail');
    const customerAddressInput = form.querySelector('#sp-customerAddress');
    const cityInput = form.querySelector('#sp-city');
    const stateInput = form.querySelector('#sp-state');
    const pincodeInput = form.querySelector('#sp-pincode');

    if (!companySelect) return;

    // Load companies if not cached
    if (companiesCache.length === 0) {
      await loadCompaniesCache();
    }

    // Populate dropdown
    companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
      companiesCache.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');

    // Auto-fill on selection
    companySelect.addEventListener('change', async () => {
      const companyId = companySelect.value;
      
      if (!companyId) {
        // Clear all fields if "Enter New" is selected
        if (companyNameInput) companyNameInput.value = '';
        if (customerPhoneInput) customerPhoneInput.value = '';
        if (customerEmailInput) customerEmailInput.value = '';
        if (customerAddressInput) customerAddressInput.value = '';
        if (cityInput) cityInput.value = '';
        if (stateInput) stateInput.value = '';
        if (pincodeInput) pincodeInput.value = '';
        return;
      }

      // Try to find company in cache first
      let company = companiesCache.find(c => c._id === companyId);
      
      // If not in cache, fetch from API
      if (!company) {
        try {
          company = await fetchAPI(`/companies/${companyId}`);
        } catch (err) {
          showToast('Failed to load company details', 'error');
          return;
        }
      }

      // Auto-fill the form fields
      if (company) {
        if (companyNameInput) companyNameInput.value = company.name || '';
        if (customerPhoneInput) customerPhoneInput.value = company.phone || '';
        if (customerEmailInput) customerEmailInput.value = company.email || '';
        if (customerAddressInput) customerAddressInput.value = company.address?.street || '';
        if (cityInput) cityInput.value = company.address?.city || '';
        if (stateInput) stateInput.value = company.address?.state || '';
        if (pincodeInput) pincodeInput.value = company.address?.zipCode || '';
        
        showToast('Company details loaded!', 'success');
      }
    });
  }

  // Populate company dropdown for Stock OUT (Buyer)
  async function initBuyerCompanyDropdown(form) {
    const companySelect = form.querySelector('#by-companySelect');
    const companyNameInput = form.querySelector('#by-companyName');
    const customerPhoneInput = form.querySelector('#by-customerPhone');
    const customerEmailInput = form.querySelector('#by-customerEmail');
    const customerAddressInput = form.querySelector('#by-customerAddress');
    const cityInput = form.querySelector('#by-city');
    const stateInput = form.querySelector('#by-state');
    const pincodeInput = form.querySelector('#by-pincode');

    if (!companySelect) return;

    // Load companies if not cached
    if (companiesCache.length === 0) {
      await loadCompaniesCache();
    }

    // Populate dropdown
    companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
      companiesCache.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');

    // Auto-fill on selection
    companySelect.addEventListener('change', async () => {
      const companyId = companySelect.value;
      
      if (!companyId) {
        // Clear all fields if "Enter New" is selected
        if (companyNameInput) companyNameInput.value = '';
        if (customerPhoneInput) customerPhoneInput.value = '';
        if (customerEmailInput) customerEmailInput.value = '';
        if (customerAddressInput) customerAddressInput.value = '';
        if (cityInput) cityInput.value = '';
        if (stateInput) stateInput.value = '';
        if (pincodeInput) pincodeInput.value = '';
        return;
      }

      // Try to find company in cache first
      let company = companiesCache.find(c => c._id === companyId);
      
      // If not in cache, fetch from API
      if (!company) {
        try {
          company = await fetchAPI(`/companies/${companyId}`);
        } catch (err) {
          showToast('Failed to load company details', 'error');
          return;
        }
      }

      // Auto-fill the form fields
      if (company) {
        if (companyNameInput) companyNameInput.value = company.name || '';
        if (customerPhoneInput) customerPhoneInput.value = company.phone || '';
        if (customerEmailInput) customerEmailInput.value = company.email || '';
        if (customerAddressInput) customerAddressInput.value = company.address?.street || '';
        if (cityInput) cityInput.value = company.address?.city || '';
        if (stateInput) stateInput.value = company.address?.state || '';
        if (pincodeInput) pincodeInput.value = company.address?.zipCode || '';
        
        showToast('Company details loaded!', 'success');
      }
    });
  }
  // Generate serial input fields
  function generateSerialInputs(container, qty, prefix = 'SN') {
    if (!container) return;
    container.innerHTML = '';
    
    for (let i = 0; i < qty; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'serial-input';
      input.placeholder = `${prefix}-${String(i + 1).padStart(4, '0')}`;
      input.dataset.index = i;
      input.addEventListener('input', () => validateSerialInputs(container));
      input.addEventListener('blur', (e) => {
        e.target.value = e.target.value.trim().toUpperCase();
      });
      container.appendChild(input);
    }
  }

  // Validate serial inputs
  function validateSerialInputs(container) {
    if (!container) return { valid: false };
    
    const inputs = container.querySelectorAll('.serial-input');
    const values = [];
    let allFilled = true;
    let hasDuplicates = false;
    
    inputs.forEach(input => {
      const val = input.value.trim().toUpperCase();
      if (!val) {
        allFilled = false;
        input.classList.remove('filled', 'duplicate');
      } else {
        input.classList.add('filled');
        if (values.includes(val)) {
          hasDuplicates = true;
          input.classList.add('duplicate');
        } else {
          input.classList.remove('duplicate');
        }
        values.push(val);
      }
    });

    // Update status
    const statusEl = container.closest('.serial-number-section')?.querySelector('[id$="-serial-status"]');
    if (statusEl) {
      statusEl.textContent = `${values.length} / ${inputs.length} filled`;
      statusEl.className = allFilled && !hasDuplicates ? 'badge complete' : 'badge incomplete';
    }

    return { valid: allFilled && !hasDuplicates, hasDuplicates };
  }

  // Get serial numbers from container
  function getSerialNumbers(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('.serial-input'))
      .map(input => input.value.trim().toUpperCase())
      .filter(Boolean);
  }

  // Auto-generate serial numbers
  function autoGenerateSerials(container, prefix = 'SN', startNum = 1) {
    if (!container) return;
    
    const inputs = container.querySelectorAll('.serial-input');
    const timestamp = Date.now().toString(36).toUpperCase();
    
    inputs.forEach((input, index) => {
      if (!input.value.trim()) {
        input.value = `${prefix}-${timestamp}-${String(startNum + index).padStart(4, '0')}`;
      }
    });
    
    validateSerialInputs(container);
  }

  // Apply bulk serial entry
  function applyBulkSerials(container, bulkText) {
    if (!container || !bulkText) return;
    
    const serials = bulkText
      .split(/[,;\n\r]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    
    const inputs = container.querySelectorAll('.serial-input');
    
    serials.forEach((serial, index) => {
      if (inputs[index]) {
        inputs[index].value = serial;
      }
    });
    
    validateSerialInputs(container);
  }

  async function initStockSupplier() {
    const form = document.getElementById('stock-supplier-form');
    if (!form) return;

    // Initialize company dropdown with auto-fill
    await initSupplierCompanyDropdown(form);

    // Get form elements
    const productNameSelect = form.querySelector('#sp-productName');
    const productSelect = form.querySelector('#sp-productId');
    const serialSection = document.getElementById('supplier-serial-section');
    const serialInputsContainer = document.getElementById('supplier-serial-inputs');
    const quantityInput = form.querySelector('#sp-quantity');
    const serialCountEl = document.getElementById('supplier-serial-count');
    const serialHintEl = document.querySelector('#sp-serial-hint');
    const serialStatusEl = document.getElementById('supplier-serial-status');

    let currentPolicy = null;

    // Load product names for first dropdown
    await loadProductNamesDropdown('sp-productName');
    
    // Handle product name selection - load models
    if (productNameSelect) {
      productNameSelect.addEventListener('change', async () => {
        const selectedName = productNameSelect.value;
        await loadModelsForProduct(selectedName, 'sp-productId');
        // Reset quantity and serial fields when product name changes
        if (quantityInput) quantityInput.value = '';
        updateSerialFields();
      });
    }

    // Set default date
    const supplyDateInput = form.querySelector('#sp-supplyDate');
    if (supplyDateInput) {
      supplyDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Update serial hint based on policy
    function updateSerialHint(policy) {
      if (!serialHintEl) return;
      
      if (!policy || !policy.enableSerial) {
        serialHintEl.style.display = 'none';
        return;
      }
      
      serialHintEl.style.display = 'block';
      if (policy.requireSerialOnIN) {
        serialHintEl.innerHTML = '⚠️ <strong>Serial numbers required</strong> for this product on Stock IN';
        serialHintEl.style.color = '#dc2626';
      } else {
        serialHintEl.innerHTML = 'ℹ️ Serial numbers enabled (optional for Stock IN)';
        serialHintEl.style.color = '#6b7280';
      }
    }

    // Dynamic serial fields
    function updateSerialFields() {
      if (!serialSection || !productSelect || !quantityInput) return;

      const selectedOption = productSelect.selectedOptions[0];
      currentPolicy = selectedOption?.dataset?.serialPolicy 
        ? JSON.parse(selectedOption.dataset.serialPolicy) 
        : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };
      
      const qty = parseInt(quantityInput.value) || 0;

      updateSerialHint(currentPolicy);

      if (serialCountEl) {
        serialCountEl.innerHTML = `Enter <strong>${qty}</strong> serial number${qty !== 1 ? 's' : ''}`;
      }

      if (!currentPolicy.enableSerial) {
        serialSection.style.display = 'none';
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        return;
      }

      if (qty <= 0 || !Number.isInteger(qty)) {
        serialSection.style.display = 'none';
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        return;
      }

      serialSection.style.display = 'block';

      const productName = selectedOption?.dataset?.productName || 'SN';
      const prefix = productName.substring(0, 3).toUpperCase();
      generateSerialInputs(serialInputsContainer, qty, prefix);
      
      if (serialStatusEl) {
        serialStatusEl.textContent = `0 / ${qty} filled`;
        serialStatusEl.className = 'badge incomplete';
      }
    }

    if (productSelect) {
      productSelect.addEventListener('change', () => {
        if (quantityInput) quantityInput.value = '';
        const opt = productSelect.selectedOptions[0];
        const warrantyEl = document.getElementById('sp-warrantyPeriod');
        if (warrantyEl && opt) warrantyEl.value = opt.dataset.warranty || '';
        updateSerialFields();
      });
    }
    
    if (quantityInput) {
      quantityInput.addEventListener('input', updateSerialFields);
      quantityInput.addEventListener('change', () => {
        const val = parseInt(quantityInput.value);
        if (val <= 0 || isNaN(val)) {
          quantityInput.value = '';
        } else {
          quantityInput.value = Math.floor(val);
        }
        updateSerialFields();
      });
    }

    // Auto-generate button
    const autoGenBtn = document.getElementById('supplier-auto-generate-serials');
    if (autoGenBtn) {
      autoGenBtn.addEventListener('click', () => {
        const selectedOption = productSelect?.selectedOptions[0];
        const productName = selectedOption?.dataset?.productName || 'SN';
        const prefix = productName.substring(0, 3).toUpperCase();
        autoGenerateSerials(serialInputsContainer, prefix);
        showToast('Serial numbers auto-generated!', 'success');
      });
    }

    // Clear all button
    const clearBtn = document.getElementById('supplier-clear-serials');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        serialInputsContainer?.querySelectorAll('.serial-input').forEach(input => {
          input.value = '';
          input.classList.remove('filled', 'duplicate', 'error');
        });
        validateSerialInputs(serialInputsContainer);
      });
    }

    // Bulk entry
    const bulkTextarea = document.getElementById('supplier-bulk-serials');
    const applyBulkBtn = document.getElementById('supplier-apply-bulk');
    if (applyBulkBtn && bulkTextarea) {
      applyBulkBtn.addEventListener('click', () => {
        applyBulkSerials(serialInputsContainer, bulkTextarea.value);
        bulkTextarea.value = '';
        showToast('Bulk serials applied!', 'success');
      });
    }

    // CSV file upload
    const fileInput = document.getElementById('supplier-serial-file');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const text = await file.text();
        applyBulkSerials(serialInputsContainer, text);
        showToast(`Loaded ${getSerialNumbers(serialInputsContainer).length} serials from file`, 'success');
        fileInput.value = '';
      });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const productId = productSelect?.value;
      const quantity = parseInt(quantityInput?.value);
      const serialNumbers = getSerialNumbers(serialInputsContainer);

      if (!productId) {
        showToast('Please select a product', 'error');
        return;
      }

      if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
        showToast('Quantity must be a positive whole number', 'error');
        return;
      }

      const selectedOption = productSelect?.querySelector(`option[value="${productId}"]`);
      const policy = selectedOption?.dataset?.serialPolicy 
        ? JSON.parse(selectedOption.dataset.serialPolicy) 
        : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };

      if (policy.enableSerial && policy.requireSerialOnIN) {
        if (serialNumbers.length !== quantity) {
          showToast(`You must enter exactly ${quantity} serial number${quantity !== 1 ? 's' : ''}`, 'error');
          return;
        }

        const validation = validateSerialInputs(serialInputsContainer);
        if (!validation.valid) {
          if (validation.hasDuplicates) {
            showToast('Duplicate serial numbers found! Each serial must be unique.', 'error');
          } else {
            showToast(`Please fill all ${quantity} serial number fields`, 'error');
          }
          return;
        }
      }

      const supplierData = {
        companyName: formData.get('companyName'),
        customerName: formData.get('customerName'),
        customerPhone: formData.get('customerPhone'),
        customerEmail: formData.get('customerEmail'),
        customerAddress: formData.get('customerAddress'),
        city: formData.get('city'),
        state: formData.get('state'),
        pincode: formData.get('pincode')
      };

      const transactionData = {
        supplierType: formData.get('supplierType'),
        paymentMethod: formData.get('paymentMethod'),
        transactionId: formData.get('transactionId'),
        transactionDate: formData.get('supplyDate'),
        warrantyPeriod: formData.get('warrantyPeriod'),
        deliveredBy: formData.get('deliveredBy')
      };

      try {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        // Get shortName from selected model option
        const selectedModelOption = productSelect?.selectedOptions[0];
        const shortName = selectedModelOption?.dataset?.shortName || '';

        await fetchAPI('/stock/in', {
          method: 'POST',
          body: JSON.stringify({ 
            productId, 
            quantity, 
            serialNumbers: policy.enableSerial ? serialNumbers : [],
            supplier: supplierData,
            transaction: transactionData,
            condition: formData.get('condition'),
            modelVariant: shortName // Send shortName as modelVariant
          })
        });
        
        showToast('Stock IN recorded successfully!', 'success');
        form.reset();
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        if (serialSection) serialSection.style.display = 'none';
        if (serialHintEl) serialHintEl.style.display = 'none';
        loadTemplate('stock-ledger');
      } catch (err) {
        showToast(err.message || 'Failed to record stock', 'error');
      } finally {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Entry';
        }
      }
    });

    const cancelBtn = document.getElementById('stock-supplier-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => loadTemplate('dashboard'));
    }
  }

  // ===============================================
  // STOCK OUT (Buyer Entry) - Admin Style
  // ===============================================
  async function initStockBuyer() {
    const form = document.getElementById('stock-buyer-form');
    if (!form) return;

    // Initialize company dropdown with auto-fill
    await initBuyerCompanyDropdown(form);

    const productNameSelect = form.querySelector('#by-productName');
    const productSelect = form.querySelector('#by-productId');
    const serialSection = document.getElementById('buyer-serial-section');
    const serialInputsContainer = document.getElementById('buyer-serial-inputs');
    const availableSerialsContainer = document.getElementById('buyer-serials-list');
    const quantityInput = form.querySelector('#by-quantity');
    const serialCountEl = document.getElementById('buyer-serial-count');
    const serialHintEl = form.querySelector('#by-serial-hint');
    const stockInfoEl = form.querySelector('#by-stock-info');
    const serialStatusEl = document.getElementById('buyer-serial-status');

    let availableSerials = [];
    let currentPolicy = null;
    let currentStock = 0;

    // Load product names for first dropdown
    await loadProductNamesDropdown('by-productName');
    
    // Handle product name selection - load models
    if (productNameSelect) {
      productNameSelect.addEventListener('change', async () => {
        const selectedName = productNameSelect.value;
        
        if (!selectedName) {
          productSelect.innerHTML = '<option value="">-- Select Product Name First --</option>';
          productSelect.disabled = true;
          if (quantityInput) quantityInput.value = '';
          if (stockInfoEl) stockInfoEl.style.display = 'none';
          updateSerialFields();
          return;
        }
        
        try {
          const models = await fetchAPI(`/items/models-by-name/${encodeURIComponent(selectedName)}`);
          
          if (models.length === 0) {
            productSelect.innerHTML = '<option value="">-- No models found --</option>';
            productSelect.disabled = true;
            return;
          }
          
          // models-by-name already returns quantity (stock) computed from ledger (IN - OUT)
          productSelect.innerHTML = '<option value="">-- Select Model --</option>' +
            models.map(m => `<option value="${m._id}" 
              data-serial-policy='${JSON.stringify(m.serialPolicy || { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false })}'
              data-product-name="${escapeHtml(m.name)}"
              data-short-name="${escapeHtml(m.shortName || '')}"
              data-stock="${m.quantity || 0}"
              data-warranty="${escapeHtml(m.warranty || '')}"
              data-seller-warranty="${escapeHtml(m.defaultSellerWarranty || '')}"
            >${escapeHtml(m.shortName || m.name)}${m.shortName ? ` (${escapeHtml(m.name)})` : ''} (Stock: ${m.quantity || 0})</option>`).join('');
          
          productSelect.disabled = false;
        } catch (err) {
          console.error('Failed to load models:', err);
          productSelect.innerHTML = '<option value="">-- Error loading models --</option>';
          productSelect.disabled = true;
        }
        
        // Reset quantity and serial fields when product name changes
        if (quantityInput) quantityInput.value = '';
        if (stockInfoEl) stockInfoEl.style.display = 'none';
        updateSerialFields();
      });
    }

    // Set default date
    const purchaseDateInput = form.querySelector('#by-purchaseDate');
    if (purchaseDateInput) {
      purchaseDateInput.value = new Date().toISOString().split('T')[0];
    }

    // Update stock info display
    function updateStockInfo() {
      if (!stockInfoEl) return;
      stockInfoEl.style.display = 'block';
      stockInfoEl.innerHTML = `📦 Current stock: <strong>${currentStock}</strong> units available`;
    }

    // Update serial hint
    function updateSerialHint(policy) {
      if (!serialHintEl) return;
      
      if (!policy || !policy.enableSerial) {
        serialHintEl.style.display = 'none';
        return;
      }
      
      serialHintEl.style.display = 'block';
      if (policy.requireSerialOnOUT) {
        serialHintEl.innerHTML = '⚠️ <strong>Serial numbers required</strong> for this product on Stock OUT';
        serialHintEl.style.color = '#dc2626';
      } else {
        serialHintEl.innerHTML = 'ℹ️ Serial numbers enabled (optional for Stock OUT)';
        serialHintEl.style.color = '#6b7280';
      }
    }

    // Load available serials for product — clicking a pill fills the next empty text input
    async function loadAvailableSerials(productId) {
      try {
        const res = await fetchAPI(`/stock/serials/${productId}?status=available`);
        availableSerials = res.serials || [];
        
        if (availableSerialsContainer) {
          if (availableSerials.length === 0) {
            availableSerialsContainer.innerHTML = '<p style="padding: 10px; color: #6b7280;">No serial numbers available for this product.</p>';
          } else {
            availableSerialsContainer.innerHTML = availableSerials.map(serial => `
              <button type="button" class="serial-pill" data-serial="${serial}">${serial}</button>
            `).join('');
            
            // Clicking a pill fills the next empty input box (or toggles it off)
            availableSerialsContainer.querySelectorAll('.serial-pill').forEach(btn => {
              btn.addEventListener('click', () => {
                const serial = btn.dataset.serial;
                const inputs = serialInputsContainer?.querySelectorAll('.serial-input');
                if (!inputs) return;

                // If this serial is already in an input, clear it
                let found = false;
                inputs.forEach(input => {
                  if (input.value.trim().toUpperCase() === serial) {
                    input.value = '';
                    input.classList.remove('filled');
                    btn.classList.remove('selected');
                    found = true;
                  }
                });
                if (found) {
                  validateSerialInputs(serialInputsContainer);
                  return;
                }

                // Fill the next empty input
                for (const input of inputs) {
                  if (!input.value.trim()) {
                    input.value = serial;
                    input.classList.add('filled');
                    btn.classList.add('selected');
                    break;
                  }
                }
                validateSerialInputs(serialInputsContainer);
              });
            });
          }
        }
      } catch (err) {
        console.error('Failed to load serials:', err);
      }
    }

    // Update serial fields
    async function updateSerialFields() {
      if (!serialSection || !productSelect || !quantityInput) return;

      const selectedOption = productSelect.selectedOptions[0];
      currentPolicy = selectedOption?.dataset?.serialPolicy 
        ? JSON.parse(selectedOption.dataset.serialPolicy) 
        : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };
      
      currentStock = parseInt(selectedOption?.dataset?.stock) || 0;
      const productId = productSelect.value;
      const qty = parseInt(quantityInput.value) || 0;

      updateStockInfo();
      updateSerialHint(currentPolicy);

      if (serialCountEl) {
        serialCountEl.innerHTML = `Enter <strong>${qty}</strong> serial number${qty !== 1 ? 's' : ''}`;
      }

      if (!currentPolicy.enableSerial || !productId) {
        serialSection.style.display = 'none';
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        return;
      }

      if (qty <= 0 || !Number.isInteger(qty)) {
        serialSection.style.display = 'none';
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        return;
      }

      serialSection.style.display = 'block';

      // Generate typed input boxes (one per unit)
      generateSerialInputs(serialInputsContainer, qty);

      // Load available serial pills below (click-to-fill)
      await loadAvailableSerials(productId);
    }

    if (productSelect) {
      productSelect.addEventListener('change', async () => {
        if (quantityInput) quantityInput.value = '';
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        const opt = productSelect.selectedOptions[0];
        const sellerWarrantyEl = document.getElementById('by-sellerWarrantyPeriod');
        if (sellerWarrantyEl && opt) sellerWarrantyEl.value = opt.dataset.sellerWarranty || '';
        await updateSerialFields();
      });
    }
    
    if (quantityInput) {
      quantityInput.addEventListener('input', updateSerialFields);
      quantityInput.addEventListener('change', async () => {
        const val = parseInt(quantityInput.value);
        if (val <= 0 || isNaN(val)) {
          quantityInput.value = '';
        } else if (val > currentStock) {
          showToast(`Only ${currentStock} units available`, 'warning');
          quantityInput.value = currentStock;
        } else {
          quantityInput.value = Math.floor(val);
        }
        await updateSerialFields();
      });
    }

    // Clear selection button
    const clearBtn = document.getElementById('buyer-clear-serials');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        // Clear all text inputs
        serialInputsContainer?.querySelectorAll('.serial-input').forEach(input => {
          input.value = '';
          input.classList.remove('filled', 'duplicate');
        });
        // Deselect all pills
        availableSerialsContainer?.querySelectorAll('.serial-pill').forEach(btn => {
          btn.classList.remove('selected');
        });
        validateSerialInputs(serialInputsContainer);
      });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const productId = productSelect?.value;
      const quantity = parseInt(quantityInput?.value);

      if (!productId) {
        showToast('Please select a product', 'error');
        return;
      }

      if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
        showToast('Quantity must be a positive whole number', 'error');
        return;
      }

      if (quantity > currentStock) {
        showToast(`Insufficient stock. Only ${currentStock} units available.`, 'error');
        return;
      }

      const selectedOption = productSelect?.querySelector(`option[value="${productId}"]`);
      const policy = selectedOption?.dataset?.serialPolicy 
        ? JSON.parse(selectedOption.dataset.serialPolicy) 
        : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };

      // Read serial numbers from typed input boxes
      let serialNumbers = getSerialNumbers(serialInputsContainer);

      if (policy.enableSerial && policy.requireSerialOnOUT) {
        if (serialNumbers.length !== quantity) {
          showToast(`You must enter exactly ${quantity} serial number${quantity !== 1 ? 's' : ''}`, 'error');
          return;
        }
        const validation = validateSerialInputs(serialInputsContainer);
        if (!validation.valid) {
          if (validation.hasDuplicates) {
            showToast('Duplicate serial numbers found! Each serial must be unique.', 'error');
          } else {
            showToast(`Please fill all ${quantity} serial number fields`, 'error');
          }
          return;
        }
      }

      const buyerData = {
        companyName: formData.get('companyName'),
        customerName: formData.get('customerName'),
        customerPhone: formData.get('customerPhone'),
        customerEmail: formData.get('customerEmail'),
        customerAddress: formData.get('customerAddress'),
        city: formData.get('city'),
        state: formData.get('state'),
        pincode: formData.get('pincode')
      };

      const transactionData = {
        buyerType: formData.get('buyerType'),
        paymentMethod: formData.get('paymentMethod'),
        transactionId: formData.get('transactionId'),
        transactionDate: formData.get('purchaseDate'),
        sellerWarrantyPeriod: formData.get('sellerWarrantyPeriod') || undefined,
        receivedBy: formData.get('receivedBy')
      };

      try {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        // Get shortName from selected model option
        const selectedModelOption = productSelect?.selectedOptions[0];
        const shortName = selectedModelOption?.dataset?.shortName || '';

        await fetchAPI('/stock/out', {
          method: 'POST',
          body: JSON.stringify({ 
            productId, 
            quantity, 
            serialNumbers: policy.enableSerial ? serialNumbers : [],
            buyer: buyerData,
            transaction: transactionData,
            condition: formData.get('condition'),
            modelVariant: shortName // Send shortName as modelVariant
          })
        });
        
        showToast('Stock OUT recorded successfully!', 'success');
        form.reset();
        if (serialInputsContainer) serialInputsContainer.innerHTML = '';
        if (serialSection) serialSection.style.display = 'none';
        loadTemplate('stock-ledger');
      } catch (err) {
        showToast(err.message || 'Failed to record stock', 'error');
      } finally {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Entry';
        }
      }
    });

    const cancelBtn = document.getElementById('stock-buyer-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => loadTemplate('dashboard'));
    }
  }

  // ===============================================
  // STOCK LEDGER (SAP-Style - No Edit/Delete)
  // ===============================================
  async function initStockLedger() {
    // Load product filter
    await loadProductsDropdown('ledger-product-filter');

    await loadStockLedger();

    // Filters
    const productFilter = document.getElementById('ledger-product-filter');
    const typeFilter = document.getElementById('ledger-type-filter');
    const searchInput = document.getElementById('ledger-search');

    productFilter?.addEventListener('change', () => loadStockLedger());
    typeFilter?.addEventListener('change', () => loadStockLedger());

    let timeout;
    searchInput?.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadStockLedger(), 300);
    });

    // Pagination
    document.getElementById('ledger-prev')?.addEventListener('click', () => {
      if (state.pagination.ledger.page > 1) {
        state.pagination.ledger.page--;
        loadStockLedger();
      }
    });

    document.getElementById('ledger-next')?.addEventListener('click', () => {
      const totalPages = Math.ceil(state.pagination.ledger.total / state.pagination.ledger.limit);
      if (state.pagination.ledger.page < totalPages) {
        state.pagination.ledger.page++;
        loadStockLedger();
      }
    });
  }

  async function loadStockLedger() {
    const tbody = document.querySelector('#ledger-table tbody');
    if (!tbody) {
      return;
    }

    const productFilter = document.getElementById('ledger-product-filter')?.value;
    const typeFilter = document.getElementById('ledger-type-filter')?.value;
    const search = document.getElementById('ledger-search')?.value;

    try {
      const { page, limit } = state.pagination.ledger;
      let endpoint = `/stock/ledger?page=${page}&limit=${limit}`;
      
      if (productFilter) endpoint += `&productId=${productFilter}`;
      if (typeFilter) endpoint += `&type=${typeFilter}`;
      if (search) endpoint += `&search=${encodeURIComponent(search)}`;

      const res = await fetchAPI(endpoint);
      const entries = res.entries || [];
      state.pagination.ledger.total = res.pagination?.total || entries.length;

      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px;">No stock entries found</td></tr>';
        return;
      }

      // Calculate running balance per product
      let runningBalances = {};
      const rows = entries.map(entry => {
        const productId = entry.productId?._id || entry.productId;
        if (!runningBalances[productId]) runningBalances[productId] = 0;
        
        // Quantity is positive for IN, negative for OUT in the new model
        runningBalances[productId] += entry.quantity;

        const displayQty = entry.type === 'IN' ? `+${entry.quantity}` : `${entry.quantity}`;
        const companyName = entry.partyDetails?.companyName || '-';

        return `
          <tr>
            <td>${formatDate(entry.createdAt)}</td>
            <td><span class="status-badge ${entry.type?.toLowerCase() || ''}">${entry.type || 'N/A'}</span></td>
            <td><strong>${entry.productId?.name || 'Unknown'}</strong></td>
            <td>${companyName}</td>
            <td>${displayQty}</td>
            <td><strong>${runningBalances[productId]}</strong></td>
            <td>${entry.createdBy?.name || 'System'}</td>
            <td>
              <button class="btn-icon-sm btn-view-entry" title="View Details"
                onclick="viewLedgerEntry('${entry._id}')">👁 View</button>
            </td>
          </tr>
        `;
      }).join('');
      
      tbody.innerHTML = rows;

      // Update pagination
      const pageInfo = document.getElementById('ledger-page-info');
      const totalPages = res.pagination?.pages || Math.ceil(state.pagination.ledger.total / limit) || 1;
      if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages}`;
      
      document.getElementById('ledger-prev').disabled = page <= 1;
      document.getElementById('ledger-next').disabled = page >= totalPages;

    } catch (error) {
      console.error('Failed to load ledger:', error);
      tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">Failed to load ledger</td></tr>';
    }
  }

  // ===============================================
  // STOCK LEDGER - VIEW ENTRY DETAIL MODAL
  // ===============================================
  window.viewLedgerEntry = async function(entryId) {
    try {
      const res = await fetchAPI(`/stock/ledger/${entryId}`);
      const entry = res.entry;
      if (!entry) { showToast('Entry not found', 'error'); return; }
      showLedgerDetailsModal(entry);
    } catch (err) {
      showToast('Failed to load entry details', 'error');
    }
  };

  function showLedgerDetailsModal(entry) {
    const overlay = document.getElementById('mgr-sd-modal-overlay');
    if (!overlay) return;

    const isIn    = entry.type === 'IN';
    const product = entry.productId || {};
    const party   = entry.partyDetails || {};
    const tx      = entry.transactionDetails || {};
    const serials = entry.serialNumbers || [];
    const initials = (product.name || '?').charAt(0).toUpperCase();

    const fmt  = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const fmtT = d => d ? new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const field = (label, val) => val && val !== '—'
      ? `<div class="mgr-sd-field"><span class="mgr-sd-field-label">${label}</span><span class="mgr-sd-field-value">${escapeHtml(String(val))}</span></div>`
      : '';

    // Populate header
    document.getElementById('mgr-sd-icon').textContent = initials;
    document.getElementById('mgr-sd-product-name').textContent = product.name || 'Unknown Product';
    document.getElementById('mgr-sd-badges').innerHTML = `
      <span class="mgr-sd-badge ${isIn ? 'badge-in' : 'badge-out'}">${isIn ? '▲ Stock IN' : '▼ Stock OUT'}</span>
      ${entry.condition ? `<span class="mgr-sd-badge badge-neutral">${escapeHtml(entry.condition)}</span>` : ''}
      ${entry.role ? `<span class="mgr-sd-badge badge-neutral">${escapeHtml(entry.role)}</span>` : ''}
    `;
    const qtyBlock = document.getElementById('mgr-sd-qty-block');
    qtyBlock.className = `mgr-sd-qty-block ${isIn ? 'qty-in' : 'qty-out'}`;
    document.getElementById('mgr-sd-qty-num').textContent = `${isIn ? '+' : ''}${entry.quantity}`;

    // Populate body
    document.getElementById('mgr-sd-body').innerHTML = `
      <div class="mgr-sd-section">
        <div class="mgr-sd-section-title">${isIn ? 'Supplier' : 'Buyer'} Details</div>
        <div class="mgr-sd-grid">
          ${field('Company',   party.companyName)}
          ${field('Contact',   party.customerName)}
          ${field('Phone',     party.customerPhone)}
          ${field('Email',     party.customerEmail)}
          ${field('Address',   party.customerAddress)}
          ${field('City',      party.city)}
          ${field('State',     party.state)}
          ${field('Pincode',   party.pincode)}
        </div>
      </div>
      <div class="mgr-sd-section">
        <div class="mgr-sd-section-title">Transaction Details</div>
        <div class="mgr-sd-grid">
          ${field('Payment Method',  tx.paymentMethod)}
          ${field('Transaction ID',  tx.transactionId)}
          ${field('Supplier Type',   tx.supplierType)}
          ${field('Warranty Period', tx.warrantyPeriod)}
          ${field('Delivered By',    tx.deliveredBy)}
          ${field('Received By',     tx.receivedBy)}
          ${field('Transaction Date',fmt(tx.transactionDate))}
        </div>
      </div>
      ${serials.length ? `
      <div class="mgr-sd-section">
        <div class="mgr-sd-section-title">Serial Numbers (${serials.length})</div>
        <div class="mgr-sd-chips">
          ${serials.map(s => `<span class="mgr-sd-chip">${escapeHtml(s)}</span>`).join('')}
        </div>
      </div>` : ''}
      ${entry.notes ? `
      <div class="mgr-sd-section">
        <div class="mgr-sd-section-title">Notes</div>
        <p class="mgr-sd-notes">${escapeHtml(entry.notes)}</p>
      </div>` : ''}
      <div class="mgr-sd-section mgr-sd-section-last">
        <div class="mgr-sd-section-title">Entry Info</div>
        <div class="mgr-sd-grid">
          ${field('Entry ID',    entry._id)}
          ${field('Recorded By', entry.createdBy?.name || entry.createdBy)}
          ${field('Recorded At', fmtT(entry.createdAt))}
          ${entry.lastEditedBy ? field('Last Edited', fmtT(entry.lastEditedAt)) : ''}
        </div>
      </div>
    `;

    // Wire close buttons
    const closeModal = () => {
      overlay.style.display = 'none';
      overlay.classList.remove('mgr-sd-overlay-visible');
    };
    document.getElementById('mgr-sd-close-btn').onclick = closeModal;
    document.getElementById('mgr-sd-footer-close-btn').onclick = closeModal;
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };

    // Show
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('mgr-sd-overlay-visible'));
  }

  // ===============================================
  // COMPANY LIST & ADD
  // ===============================================
  async function initCompanyList() {
    await loadCompanies();

    // Search
    const searchInput = document.getElementById('company-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadCompanies(searchInput.value), 300);
      });
    }

    // Add button
    document.querySelector('[data-section="company-add"]')?.addEventListener('click', () => {
      loadTemplate('company-add');
    });
  }

  async function loadCompanies(search = '') {
    const tbody = document.querySelector('#company-table tbody');
    if (!tbody) return;

    try {
      const { page, limit } = state.pagination.companies;
      let endpoint = `/companies?page=${page}&limit=${limit}`;
      if (search) endpoint += `&search=${encodeURIComponent(search)}`;

      const res = await fetchAPI(endpoint);
      const companies = res.companies || res || [];
      state.pagination.companies.total = res.total || companies.length;

      if (companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px;">No companies found</td></tr>';
        return;
      }

      tbody.innerHTML = companies.map(company => `
        <tr>
          <td><strong>${company.name}</strong></td>
          <td>${company.industry || '-'}</td>
          <td>${company.phone || '-'}</td>
          <td>${company.email || '-'}</td>
          <td>${company.city || '-'}</td>
          <td>${company.createdBy?.name || 'Admin'}</td>
          <td><span class="status-badge ${company.isActive !== false ? 'active' : 'inactive'}">${company.isActive !== false ? 'Active' : 'Inactive'}</span></td>
        </tr>
      `).join('');

    } catch (error) {
      console.error('Failed to load companies:', error);
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Failed to load companies</td></tr>';
    }
  }

  function initCompanyAdd() {
    const form = document.getElementById('company-add-form');
    form?.addEventListener('submit', handleCompanySubmit);

    document.getElementById('company-cancel')?.addEventListener('click', () => {
      loadTemplate('company-list');
    });
  }

  async function handleCompanySubmit(e) {
    e.preventDefault();
    clearFormErrors(e.target);

    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      industry: form.industry.value,
      address: {
        street: form.street?.value?.trim() || '',
        city: form.city?.value?.trim() || '',
        state: form.state?.value?.trim() || '',
        zipCode: form.zipCode?.value?.trim() || '',
        country: form.country?.value || 'India'
      },
      website: form.website?.value?.trim() || '',
      taxId: form.taxId?.value?.trim() || ''
    };

    if (!payload.name || !payload.email || !payload.phone) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    if (!payload.industry) {
      showToast('Please select an industry', 'error');
      return;
    }

    if (!payload.address.street || !payload.address.city || !payload.address.state || !payload.address.zipCode) {
      showToast('Please fill all address fields', 'error');
      return;
    }

    try {
      await fetchAPI('/companies', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Company added successfully!', 'success');
      loadTemplate('company-list');

    } catch (error) {
      showToast(error.message || 'Failed to add company', 'error');
    }
  }

  // ===============================================
  // USER LIST & ADD
  // ===============================================
  async function initUserList() {
    await loadUsers();

    // Search
    const searchInput = document.getElementById('user-search');
    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => loadUsers(searchInput.value), 300);
      });
    }

    // Add button
    document.querySelector('[data-section="user-add"]')?.addEventListener('click', () => {
      loadTemplate('user-add');
    });
  }

  async function loadUsers(search = '') {
    const tbody = document.querySelector('#user-table tbody');
    if (!tbody) return;

    try {
      let endpoint = '/users?role=USER';
      if (search) endpoint += `&search=${encodeURIComponent(search)}`;

      const res = await fetchAPI(endpoint);
      const users = res.users || res || [];

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px;">No users found</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(user => `
        <tr>
          <td><strong>${user.name}</strong></td>
          <td>${user.phone || '-'}</td>
          <td>${user.email || '-'}</td>
          <td><span class="status-badge ${user.isActive !== false ? 'active' : 'inactive'}">${user.isActive !== false ? 'Active' : 'Inactive'}</span></td>
          <td>${user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</td>
          <td>
            <button class="action-btn toggle" onclick="toggleUserStatus('${user._id}', ${user.isActive !== false})">
              ${user.isActive !== false ? '🚫 Deactivate' : '✅ Activate'}
            </button>
          </td>
        </tr>
      `).join('');

      state.users = users;

    } catch (error) {
      console.error('Failed to load users:', error);
      tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;">Failed to load users</td></tr>';
    }
  }

  // Make toggleUserStatus global
  window.toggleUserStatus = async function(userId, currentStatus) {
    try {
      await fetchAPI(`/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !currentStatus })
      });

      showToast(`User ${currentStatus ? 'deactivated' : 'activated'} successfully`, 'success');
      loadUsers();

    } catch (error) {
      showToast(error.message || 'Failed to update user status', 'error');
    }
  };

  function initUserAdd() {
    const form = document.getElementById('user-add-form');
    form?.addEventListener('submit', handleUserSubmit);

    document.getElementById('user-cancel')?.addEventListener('click', () => {
      loadTemplate('user-list');
    });
  }

  async function handleUserSubmit(e) {
    e.preventDefault();
    clearFormErrors(e.target);

    const form = e.target;
    const payload = {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email?.value?.trim() || '',
      password: form.password.value,
      role: 'USER'
    };

    if (!payload.name || !payload.phone || !payload.password) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    if (payload.password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    try {
      await fetchAPI('/auth/register-user', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('User created successfully!', 'success');
      loadTemplate('user-list');

    } catch (error) {
      showToast(error.message || 'Failed to create user', 'error');
    }
  }

  // ===============================================
  // REPORTS
  // ===============================================
  function initReports() {
    const reportCards = document.querySelectorAll('.report-card');
    
    reportCards.forEach(card => {
      card.addEventListener('click', () => {
        const reportType = card.dataset.report;
        generateReport(reportType);
      });
    });
  }

  async function generateReport(type) {
    const outputDiv = document.getElementById('report-output');
    const titleEl = document.getElementById('report-title');
    const contentEl = document.getElementById('report-content');
    
    if (!outputDiv || !contentEl) return;

    outputDiv.style.display = 'block';

    const titles = {
      'stock-summary': '📊 Stock Summary Report',
      'stock-movement': '📈 Stock Movement Report',
      'low-stock': '⚠️ Low Stock Alert Report',
      'activity': '📋 Activity Log Report'
    };

    if (titleEl) titleEl.textContent = titles[type] || 'Report';

    try {
      let content = '';
      
      switch (type) {
        case 'stock-summary':
          const summaryRes = await fetchAPI('/stock/summary');
          const summaryItems = summaryRes.items || [];
          content = `
            <table class="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Total IN</th>
                  <th>Total OUT</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${summaryItems.map(item => `
                  <tr>
                    <td>${item.name || item.item?.name}</td>
                    <td class="text-success">+${item.totalIn || 0}</td>
                    <td class="text-error">-${item.totalOut || 0}</td>
                    <td><strong>${(item.totalIn || 0) - (item.totalOut || 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          break;

        case 'stock-movement':
          const movementRes = await fetchAPI('/stock/ledger?limit=50');
          const entries = movementRes.entries || [];
          content = `
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                ${entries.length > 0 ? entries.map(entry => `
                  <tr>
                    <td>${formatDate(entry.createdAt)}</td>
                    <td><span class="status-badge ${entry.type?.toLowerCase() || ''}">${entry.type || 'N/A'}</span></td>
                    <td>${entry.productId?.name || 'Unknown'}</td>
                    <td>${entry.type === 'IN' ? '+' : '-'}${entry.quantity || 0}</td>
                    <td>${entry.createdBy?.name || 'System'}</td>
                  </tr>
                `).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;">No stock movements found</td></tr>'}
              </tbody>
            </table>
          `;
          break;

        case 'low-stock':
          const lowRes = await fetchAPI('/stock/summary?lowStock=true');
          const lowItems = lowRes.items || [];
          content = `
            <table class="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${lowItems.length > 0 ? lowItems.map(item => {
                  const remaining = (item.totalIn || 0) - (item.totalOut || 0);
                  return `
                  <tr>
                    <td>${item.name || item.shortName || 'Unknown'}</td>
                    <td>${remaining}</td>
                    <td><span class="status-badge low">Low Stock</span></td>
                  </tr>
                `;
                }).join('') : '<tr><td colspan="3" class="muted" style="text-align:center;">No low stock items</td></tr>'}
              </tbody>
            </table>
          `;
          break;

        case 'activity':
          const activityRes = await fetchAPI('/stock/ledger?limit=30');
          const activities = activityRes.entries || [];
          content = `
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                ${activities.length > 0 ? activities.map(entry => `
                  <tr>
                    <td>${formatDate(entry.createdAt)}</td>
                    <td>Stock ${entry.type || 'N/A'}</td>
                    <td>${entry.productId?.name || 'Unknown'} - ${entry.quantity || 0} units</td>
                    <td>${entry.createdBy?.name || 'System'}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" class="muted" style="text-align:center;">No activity found</td></tr>'}
              </tbody>
            </table>
          `;
          break;
      }

      contentEl.innerHTML = content;

    } catch (error) {
      console.error('Report generation error:', error);
      contentEl.innerHTML = `<p class="muted">Failed to generate report: ${error.message || 'Unknown error'}</p>`;
    }
  }

  // ===============================================
  // PROFILE SECTION
  // ===============================================
  async function initProfile() {
    const user = auth.getUser();
    if (!user) return;

    // Set avatar initial
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) {
      const initial = (user.name || 'M').charAt(0).toUpperCase();
      avatarEl.querySelector('.avatar-text').textContent = initial;
    }

    // Set profile info
    document.getElementById('profile-name').textContent = user.name || 'Manager';
    
    // Format join date
    if (user.createdAt) {
      const joinDate = new Date(user.createdAt);
      document.getElementById('profile-joined').textContent = joinDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }

    // Fill form fields
    document.getElementById('profile-fullname').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-department').value = user.department || '';

    // Set form to read-only initially
    setProfileFormReadonly(true);

    // Load activity stats
    await loadProfileStats();

    // Load recent activity
    await loadProfileActivity();

    // Event listeners
    setupProfileEventListeners();
  }

  function setProfileFormReadonly(readonly) {
    const form = document.getElementById('profile-form');
    const editBtn = document.getElementById('edit-profile-btn');
    const cancelBtn = document.getElementById('cancel-profile-btn');
    const saveBtn = document.getElementById('save-profile-btn');

    if (!form) return;

    const inputs = form.querySelectorAll('input:not(.readonly-field)');
    
    inputs.forEach(input => {
      input.readOnly = readonly;
      if (readonly) {
        input.classList.add('readonly-field');
      } else {
        input.classList.remove('readonly-field');
      }
    });

    if (editBtn) editBtn.style.display = readonly ? 'inline-flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = readonly ? 'none' : 'inline-flex';
    if (saveBtn) saveBtn.style.display = readonly ? 'none' : 'inline-flex';
  }

  function setupProfileEventListeners() {
    const editBtn = document.getElementById('edit-profile-btn');
    const cancelBtn = document.getElementById('cancel-profile-btn');
    const profileForm = document.getElementById('profile-form');
    const passwordForm = document.getElementById('password-form');

    // Edit button
    editBtn?.addEventListener('click', () => {
      setProfileFormReadonly(false);
    });

    // Cancel button
    cancelBtn?.addEventListener('click', () => {
      // Reset form values
      const user = auth.getUser();
      document.getElementById('profile-fullname').value = user?.name || '';
      document.getElementById('profile-phone').value = user?.phone || '';
      document.getElementById('profile-department').value = user?.department || '';
      setProfileFormReadonly(true);
    });

    // Profile form submit
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(profileForm);
      const data = {
        name: formData.get('name'),
        phone: formData.get('phone'),
        department: formData.get('department')
      };

      try {
        const updated = await fetchAPI('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        // Update local user data
        const user = auth.getUser();
        if (user) {
          user.name = data.name;
          user.phone = data.phone;
          user.department = data.department;
          auth.setUser(user);
        }

        // Update displayed info
        document.getElementById('profile-name').textContent = data.name;
        displayUserInfo();

        setProfileFormReadonly(true);
        showToast('Profile updated successfully!', 'success');

      } catch (error) {
        showToast(error.message || 'Failed to update profile', 'error');
      }
    });

    // Password form submit
    passwordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill all password fields', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
      }

      if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      try {
        await fetchAPI('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword })
        });

        passwordForm.reset();
        showToast('Password changed successfully!', 'success');

      } catch (error) {
        showToast(error.message || 'Failed to change password', 'error');
      }
    });
  }

  async function loadProfileStats() {
    try {
      // Get user's activity stats
      const stats = await fetchAPI('/reports/user-stats');
      
      document.getElementById('total-stock-in').textContent = stats.stockInCount || 0;
      document.getElementById('total-stock-out').textContent = stats.stockOutCount || 0;
      document.getElementById('companies-added').textContent = stats.companiesAdded || 0;
      document.getElementById('users-managed').textContent = stats.usersManaged || 0;

    } catch (error) {
      console.error('Failed to load profile stats:', error);
    }
  }

  async function loadProfileActivity() {
    const timeline = document.getElementById('activity-timeline');
    if (!timeline) return;

    try {
      const activities = await fetchAPI('/reports/user-activity?limit=5');
      
      if (!activities || activities.length === 0) {
        timeline.innerHTML = `
          <div class="timeline-item">
            <div class="timeline-icon">📋</div>
            <div class="timeline-content">
              <p class="timeline-title">No recent activity</p>
              <p class="timeline-meta">Start by adding stock entries</p>
            </div>
          </div>
        `;
        return;
      }

      timeline.innerHTML = activities.map(activity => {
        const isStockIn = activity.type === 'IN';
        const icon = isStockIn ? '📥' : '📤';
        const className = isStockIn ? 'stock-in' : 'stock-out';
        const date = new Date(activity.date).toLocaleString();

        return `
          <div class="timeline-item ${className}">
            <div class="timeline-icon">${icon}</div>
            <div class="timeline-content">
              <p class="timeline-title">${activity.description || `Stock ${activity.type} - ${activity.quantity} units`}</p>
              <p class="timeline-meta">${activity.productName || 'Product'} • ${date}</p>
            </div>
          </div>
        `;
      }).join('');

    } catch (error) {
      console.error('Failed to load activity:', error);
      timeline.innerHTML = `
        <div class="timeline-item">
          <div class="timeline-icon">⚠️</div>
          <div class="timeline-content">
            <p class="timeline-title">Failed to load activity</p>
          </div>
        </div>
      `;
    }
  }

  // ===============================================
  // SETTINGS SECTION
  // ===============================================
  async function initSettings() {
    // Setup tab navigation
    setupSettingsTabs();

    // Load data for each tab
    await loadSettingsProfile();
    await loadSettingsUsers();
    await loadMyPermissions();

    // Load saved settings from localStorage
    loadSavedSettings();

    // Event listeners
    setupSettingsEventListeners();
  }

  function setupSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active from all tabs and panels
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        // Add active to clicked tab and corresponding panel
        tab.classList.add('active');
        const tabId = tab.dataset.tab;
        const targetPanel = document.getElementById(tabId + '-panel');
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  async function loadSettingsProfile() {
    try {
      const res = await fetchAPI('/auth/me');
      
      // Populate profile form in settings
      document.getElementById('mgr-name').value = res.name || '';
      document.getElementById('mgr-email').value = res.email || '';
      document.getElementById('mgr-phone').value = res.phone || '';
      document.getElementById('mgr-department').value = res.department || '';

      // Update session info
      document.getElementById('session-user-name').textContent = res.name || res.email || '-';
      document.getElementById('session-start-time').textContent = new Date().toLocaleString();
      document.getElementById('session-last-activity').textContent = 'Just now';

    } catch (error) {
      console.error('Failed to load settings profile:', error);
    }
  }

  async function loadSettingsUsers() {
    const selectEl = document.getElementById('settings-user-select');
    if (!selectEl) return;

    try {
      const users = await fetchAPI('/users');
      
      // Update stats
      const totalUsers = users.length;
      const activeUsers = users.filter(u => u.isActive !== false).length;
      const inactiveUsers = users.filter(u => u.isActive === false).length;

      document.getElementById('stat-total-users').textContent = totalUsers;
      document.getElementById('stat-active-users').textContent = activeUsers;
      document.getElementById('stat-inactive-users').textContent = inactiveUsers;

      // Populate select dropdown
      selectEl.innerHTML = '<option value="">-- Select a user to manage --</option>' +
        users.map(user => `<option value="${user._id}">${user.name || user.email || user.phone}</option>`).join('');

      // User selection change
      selectEl.addEventListener('change', () => {
        const userId = selectEl.value;
        const userActionPanel = document.getElementById('user-action-panel');
        
        if (!userId) {
          userActionPanel.style.display = 'none';
          return;
        }

        const user = users.find(u => u._id === userId);
        if (!user) return;

        // Populate user details
        document.getElementById('selected-user-avatar').textContent = user.name ? user.name.charAt(0).toUpperCase() : '👤';
        document.getElementById('selected-user-name').textContent = user.name || 'Unknown';
        document.getElementById('selected-user-email').textContent = user.email || user.phone || 'No contact';
        document.getElementById('selected-user-status').textContent = user.isActive !== false ? 'active' : 'inactive';
        document.getElementById('selected-user-status').className = `badge ${user.isActive !== false ? 'active' : 'inactive'}`;
        document.getElementById('selected-user-phone').textContent = user.role || 'USER';

        // Update toggle button text
        const isActive = user.isActive !== false;
        document.getElementById('toggle-user-text').textContent = isActive ? '🚫 Deactivate User' : '✅ Activate User';
        document.getElementById('btn-toggle-user-status').className = `btn ${isActive ? 'warning' : 'primary'}`;
        document.getElementById('btn-toggle-user-status').dataset.userId = userId;
        document.getElementById('btn-toggle-user-status').dataset.currentStatus = isActive ? 'true' : 'false';

        document.getElementById('btn-reset-user-password').dataset.userId = userId;
        document.getElementById('btn-reset-user-password').dataset.userName = user.name || user.email;

        userActionPanel.style.display = 'block';
      });
    } catch (error) {
      console.error('Failed to load settings users:', error);
    }
  }

  async function loadMyPermissions() {
    const container = document.getElementById('my-permissions-grid');
    if (!container) return;

    try {
      const res = await fetchAPI('/auth/me');

      // Get permissions for manager role
      const permissions = [
        { key: 'canStockIn', label: 'Stock IN', icon: '📥' },
        { key: 'canStockOut', label: 'Stock OUT', icon: '📤' },
        { key: 'canViewStockLedger', label: 'View Stock Ledger', icon: '📒' },
        { key: 'canManageUsers', label: 'Manage Users', icon: '👥' },
        { key: 'canViewReports', label: 'View Reports', icon: '📊' },
        { key: 'canManageItems', label: 'Manage Items', icon: '📦' },
        { key: 'canManageCompanies', label: 'Manage Companies', icon: '🏢' }
      ];

      // Fetch actual permissions from backend
      let permData = {};
      try {
        const permRes = await fetchAPI('/settings/permissions/MANAGER');
        permData = permRes;
      } catch (e) {
        // Default permissions if can't fetch
        permData = {
          canStockIn: true,
          canStockOut: true,
          canViewStockLedger: true,
          canManageUsers: true,
          canViewReports: true,
          canManageItems: true,
          canManageCompanies: true
        };
      }

      container.innerHTML = permissions.map(perm => {
        const enabled = permData[perm.key] !== false;
        return `
          <div class="permission-item ${enabled ? 'enabled' : 'disabled'}">
            <span class="permission-icon">${perm.icon}</span>
            <span class="permission-name">${perm.label}</span>
            <span class="permission-status">${enabled ? '✅' : '❌'}</span>
          </div>
        `;
      }).join('');

    } catch (error) {
      container.innerHTML = '<p class="muted">Failed to load permissions</p>';
    }
  }

  function loadSavedSettings() {
    // Load from localStorage
    const settings = JSON.parse(localStorage.getItem('managerSettings') || '{}');

    // Apply to notification elements
    if (settings.notifyLowStock !== undefined) {
      const el = document.getElementById('notify-low-stock');
      if (el) el.checked = settings.notifyLowStock;
    }
    if (settings.notifyStockEntries !== undefined) {
      const el = document.getElementById('notify-stock-entries');
      if (el) el.checked = settings.notifyStockEntries;
    }
    if (settings.notifyUserActivity !== undefined) {
      const el = document.getElementById('notify-user-activity');
      if (el) el.checked = settings.notifyUserActivity;
    }
    if (settings.notifyDailySummary !== undefined) {
      const el = document.getElementById('notify-daily-summary');
      if (el) el.checked = settings.notifyDailySummary;
    }
    if (settings.notifyBrowser !== undefined) {
      const el = document.getElementById('notify-browser');
      if (el) el.checked = settings.notifyBrowser;
    }

    // Apply to display elements
    if (settings.dashboardRefresh) {
      const el = document.getElementById('dashboard-refresh');
      if (el) el.value = settings.dashboardRefresh;
    }
    if (settings.itemsPerPage) {
      const el = document.getElementById('items-per-page');
      if (el) el.value = settings.itemsPerPage;
    }
    if (settings.dateFormat) {
      const el = document.getElementById('date-format');
      if (el) el.value = settings.dateFormat;
    }
    if (settings.compactMode !== undefined) {
      const el = document.getElementById('compact-mode');
      if (el) el.checked = settings.compactMode;
    }
    if (settings.showStockWarnings !== undefined) {
      const el = document.getElementById('show-stock-warnings');
      if (el) el.checked = settings.showStockWarnings;
    }
  }

  function setupSettingsEventListeners() {
    // Manager Profile Form (in My Profile tab)
    const mgrProfileForm = document.getElementById('manager-profile-form');
    mgrProfileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = {
        name: document.getElementById('mgr-name').value,
        phone: document.getElementById('mgr-phone').value,
        department: document.getElementById('mgr-department').value
      };

      try {
        await fetchAPI('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        showToast('Profile updated successfully!', 'success');
      } catch (error) {
        showToast('Failed to update profile', 'error');
      }
    });

    // Manager Password Form
    const mgrPasswordForm = document.getElementById('manager-password-form');
    mgrPasswordForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const current = document.getElementById('mgr-current-password').value;
      const newPass = document.getElementById('mgr-new-password').value;
      const confirm = document.getElementById('mgr-confirm-password').value;

      if (newPass !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
      }

      if (newPass.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      try {
        await fetchAPI('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: current,
            newPassword: newPass
          })
        });
        showToast('Password changed successfully!', 'success');
        mgrPasswordForm.reset();
      } catch (error) {
        showToast(error.message || 'Failed to change password', 'error');
      }
    });

    // User Management - Toggle Status
    document.getElementById('btn-toggle-user-status')?.addEventListener('click', async (e) => {
      const userId = e.target.dataset.userId;
      const currentIsActive = e.target.dataset.currentStatus === 'true';
      const newIsActive = !currentIsActive;
      const action = newIsActive ? 'activate' : 'deactivate';

      if (!confirm(`Are you sure you want to ${action} this user?`)) return;

      try {
        await fetchAPI(`/users/${userId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ isActive: newIsActive })
        });
        showToast(`User ${action}d successfully`, 'success');
        await loadSettingsUsers();
        document.getElementById('settings-user-select').value = '';
        document.getElementById('user-action-panel').style.display = 'none';
      } catch (error) {
        showToast(`Failed to ${action} user`, 'error');
      }
    });

    // User Management - Reset Password
    document.getElementById('btn-reset-user-password')?.addEventListener('click', (e) => {
      const userName = e.target.dataset.userName;
      document.getElementById('reset-user-name').textContent = `Setting new password for: ${userName}`;
      document.getElementById('user-reset-password-modal').style.display = 'flex';
    });

    document.getElementById('cancel-user-reset')?.addEventListener('click', () => {
      document.getElementById('user-reset-password-modal').style.display = 'none';
      document.getElementById('user-new-password').value = '';
      const tempNotice = document.getElementById('user-temp-password-notice');
      if (tempNotice) tempNotice.style.display = 'none';
    });

    // Generate temporary password for users (manager capability)
    document.getElementById('generate-user-temp-password')?.addEventListener('click', async () => {
      const userId = document.getElementById('btn-reset-user-password').dataset.userId;
      
      try {
        const response = await fetchAPI(`/settings/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ userId, generateTemporary: true })
        });
        
        if (response.success && response.temporaryPassword) {
          const passwordInput = document.getElementById('user-new-password');
          passwordInput.value = response.temporaryPassword;
          passwordInput.type = 'text'; // Show the password
          
          // Show temp password notice
          const tempNotice = document.getElementById('user-temp-password-notice');
          if (tempNotice) {
            tempNotice.innerHTML = `
              <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 12px; margin: 12px 0;">
                <p style="margin: 0 0 8px 0; font-size: 0.9rem; color: #10b981;"><strong>✓ Temporary Password Generated</strong></p>
                <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">User will be required to change this password on next login.</p>
              </div>
            `;
            tempNotice.style.display = 'block';
          }
          
          showToast('Temporary password generated', 'success');
        }
      } catch (error) {
        showToast('Failed to generate temporary password', 'error');
      }
    });

    document.getElementById('confirm-user-reset')?.addEventListener('click', async () => {
      const userId = document.getElementById('btn-reset-user-password').dataset.userId;
      const newPassword = document.getElementById('user-new-password').value;

      if (!newPassword || newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      try {
        // Use the settings API endpoint which sets forcePasswordReset=true
        await fetchAPI(`/settings/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ userId, newPassword })
        });
        showToast('Password reset successfully. User will be required to change password on next login.', 'success');
        document.getElementById('user-reset-password-modal').style.display = 'none';
        document.getElementById('user-new-password').value = '';
        const tempNotice = document.getElementById('user-temp-password-notice');
        if (tempNotice) tempNotice.style.display = 'none';
      } catch (error) {
        showToast('Failed to reset password', 'error');
      }
    });

    // Save notification settings button
    document.getElementById('save-notification-settings')?.addEventListener('click', () => {
      const settings = JSON.parse(localStorage.getItem('managerSettings') || '{}');
      settings.notifyLowStock = document.getElementById('notify-low-stock')?.checked;
      settings.notifyStockEntries = document.getElementById('notify-stock-entries')?.checked;
      settings.notifyUserActivity = document.getElementById('notify-user-activity')?.checked;
      settings.notifyDailySummary = document.getElementById('notify-daily-summary')?.checked;
      settings.notifyBrowser = document.getElementById('notify-browser')?.checked;

      localStorage.setItem('managerSettings', JSON.stringify(settings));
      showToast('Notification settings saved!', 'success');
    });

    // Save display settings button
    document.getElementById('save-display-settings')?.addEventListener('click', () => {
      const settings = JSON.parse(localStorage.getItem('managerSettings') || '{}');
      settings.dashboardRefresh = document.getElementById('dashboard-refresh')?.value;
      settings.itemsPerPage = document.getElementById('items-per-page')?.value;
      settings.dateFormat = document.getElementById('date-format')?.value;
      settings.compactMode = document.getElementById('compact-mode')?.checked;
      settings.showStockWarnings = document.getElementById('show-stock-warnings')?.checked;

      localStorage.setItem('managerSettings', JSON.stringify(settings));
      showToast('Display settings saved!', 'success');
    });

    // Export data buttons
    document.getElementById('export-stock-activities')?.addEventListener('click', async () => {
      try {
        showToast('Preparing stock data export...', 'info');
        const data = await fetchAPI('/reports/user-activity?limit=1000');
        
        if (!data || data.length === 0) {
          showToast('No stock data to export', 'warning');
          return;
        }

        const headers = ['Date', 'Type', 'Product', 'Quantity', 'Description'];
        const rows = data.map(d => [
          new Date(d.date).toISOString(),
          d.type,
          d.productName || '',
          d.quantity || 0,
          d.description || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csv, `stock-activities-${new Date().toISOString().split('T')[0]}.csv`);
        showToast('Stock data exported successfully!', 'success');
      } catch (error) {
        showToast('Failed to export stock data', 'error');
      }
    });

    document.getElementById('export-my-users')?.addEventListener('click', async () => {
      try {
        showToast('Preparing user data export...', 'info');
        const users = await fetchAPI('/users');
        
        if (!users || users.length === 0) {
          showToast('No user data to export', 'warning');
          return;
        }

        const headers = ['Name', 'Email', 'Phone', 'Role', 'Status', 'Created'];
        const rows = users.map(u => [
          u.name || '',
          u.email || '',
          u.phone || '',
          u.role || '',
          u.status || '',
          u.createdAt ? new Date(u.createdAt).toISOString() : ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csv, `my-users-${new Date().toISOString().split('T')[0]}.csv`);
        showToast('User data exported successfully!', 'success');
      } catch (error) {
        showToast('Failed to export user data', 'error');
      }
    });

    document.getElementById('export-my-companies')?.addEventListener('click', async () => {
      try {
        showToast('Preparing companies export...', 'info');
        const companies = await fetchAPI('/companies');
        
        if (!companies || companies.length === 0) {
          showToast('No company data to export', 'warning');
          return;
        }

        const headers = ['Name', 'Code', 'Type', 'Email', 'Phone', 'Address'];
        const rows = companies.map(c => [
          c.name || '',
          c.code || '',
          c.type || '',
          c.email || '',
          c.phone || '',
          c.address || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csv, `my-companies-${new Date().toISOString().split('T')[0]}.csv`);
        showToast('Companies exported successfully!', 'success');
      } catch (error) {
        showToast('Failed to export companies', 'error');
      }
    });

    // Logout all sessions
    document.getElementById('logout-all-sessions')?.addEventListener('click', async () => {
      if (!confirm('This will log you out from all devices. Continue?')) return;
      
      try {
        await fetchAPI('/auth/logout-all', { method: 'POST' });
        showToast('Logged out from all devices', 'success');
        window.location.href = 'login.html';
      } catch (error) {
        // Just logout locally
        window.location.href = 'login.html';
      }
    });
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===============================================
  // NAVIGATION & MENU
  // ===============================================
  function initNavigation() {
    // Menu toggles
    document.querySelectorAll('.menu-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const targetId = toggle.dataset.target;
        const submenu = document.getElementById(targetId);
        
        // Close other submenus
        document.querySelectorAll('.submenu.open').forEach(sm => {
          if (sm.id !== targetId) {
            sm.classList.remove('open');
            document.querySelector(`[data-target="${sm.id}"]`)?.classList.remove('active');
          }
        });

        // Toggle current
        submenu?.classList.toggle('open');
        toggle.classList.toggle('active');
      });
    });

    // Single menu items
    document.querySelectorAll('.menu .single[data-section]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (section) loadTemplate(section);
      });
    });

    // Submenu items
    document.querySelectorAll('.submenu a[data-section]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (section) loadTemplate(section);
      });
    });

    // Hamburger menu (mobile)
    document.getElementById('toggle-sidebar')?.addEventListener('click', () => {
      document.getElementById('sidebar')?.classList.toggle('open');
    });

    // Logout buttons
    document.getElementById('logout-btn')?.addEventListener('click', () => auth.logout());
    document.getElementById('profile-logout')?.addEventListener('click', () => auth.logout());

    // Profile view link (in dropdown)
    document.getElementById('profile-view')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('profile-menu')?.classList.remove('open');
      loadTemplate('profile');
    });

    // Profile dropdown
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    
    profileBtn?.addEventListener('click', () => {
      profileMenu?.classList.toggle('open');
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!profileBtn?.contains(e.target) && !profileMenu?.contains(e.target)) {
        profileMenu?.classList.remove('open');
      }
    });
  }

  // ===============================================
  // USER INFO DISPLAY
  // ===============================================
  function displayUserInfo() {
    const user = auth.getUser();
    if (!user) return;

    const initial = (user.name || 'M').charAt(0).toUpperCase();

    // Sidebar
    const sidebarName = document.getElementById('sidebar-user-name');
    const sidebarEmail = document.getElementById('sidebar-user-email');
    const sidebarAvatar = document.getElementById('user-avatar');

    if (sidebarName) sidebarName.textContent = user.name || 'Manager';
    if (sidebarEmail) sidebarEmail.textContent = user.email || '';
    if (sidebarAvatar) sidebarAvatar.textContent = initial;

    // Topbar
    const topbarName = document.getElementById('topbar-user-name');
    const topbarAvatar = document.getElementById('topbar-avatar');

    if (topbarName) topbarName.textContent = user.name || 'Manager';
    if (topbarAvatar) topbarAvatar.textContent = initial;
  }

  // ===============================================
  // NOTIFICATION SYSTEM
  // ===============================================
  let notificationPollInterval = null;

  // Start polling for notifications
  function startNotificationPolling() {
    // Initial load
    loadNotifications();
    
    // Poll every 30 seconds for unread count
    notificationPollInterval = setInterval(() => {
      fetchUnreadCount();
    }, 30000);
  }

  // Stop polling (when logging out)
  function stopNotificationPolling() {
    if (notificationPollInterval) {
      clearInterval(notificationPollInterval);
      notificationPollInterval = null;
    }
  }

  // Fetch just the unread count (lightweight)
  async function fetchUnreadCount() {
    try {
      const data = await fetchAPI('/notifications/unread-count');
      updateNotificationCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Error fetching notification count:', error);
    }
  }

  // Load full notifications list
  async function loadNotifications() {
    try {
      const data = await fetchAPI('/notifications?limit=10');
      const notifications = data.notifications || [];
      
      // Update badge count
      updateNotificationCount(data.unreadCount || 0);
      
      // Store notifications for dropdown display
      state.notifications = notifications;
      
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  // Mark single notification as read
  async function markNotificationRead(notificationId) {
    try {
      await fetchAPI(`/notifications/${notificationId}/read`, { method: 'PATCH' });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Mark all notifications as read
  async function markAllNotificationsRead() {
    try {
      await fetchAPI('/notifications/read-all', { method: 'PATCH' });
      loadNotifications();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  // Format time ago helper
  function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) > 1 ? 's' : ''} ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} day${Math.floor(seconds / 86400) > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  }

  // Update notification badge count
  function updateNotificationCount(count) {
    const badge = document.getElementById('notification-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  // Initialize notification dropdown/panel
  function initNotificationUI() {
    const notifBtn = document.getElementById('notification-btn');
    if (!notifBtn) return;

    const dropdownPanel = document.getElementById('notification-dropdown');
    if (!dropdownPanel) return;

    // Position the dropdown relative to its parent button container
    notifBtn.parentElement.style.position = 'relative';
    notifBtn.parentElement.appendChild(dropdownPanel);

    // Toggle dropdown on button click
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdownPanel.style.display === 'block';
      dropdownPanel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) renderNotificationList();
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!dropdownPanel.contains(e.target) && e.target !== notifBtn) {
        dropdownPanel.style.display = 'none';
      }
    });

    // Mark all read button
    document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
      await markAllNotificationsRead();
      renderNotificationList();
    });

    // Wire "View All Notifications" link
    document.getElementById('view-all-notifications')?.addEventListener('click', (e) => {
      e.preventDefault();
      dropdownPanel.style.display = 'none';
      loadTemplate('all-notifications');
    });
  }

  // Render notification list in dropdown
  function renderNotificationList() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    
    const notifications = state.notifications || [];
    
    if (notifications.length === 0) {
      list.innerHTML = '<div class="empty-state">No notifications yet</div>';
      return;
    }
    
    list.innerHTML = notifications.map(n => `
      <div class="notification-item ${!n.isRead ? 'unread' : ''} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
        <div class="notification-icon">${getMgrNotifIcon(n)}</div>
        <div class="notification-content">
          <div class="notification-title">
            <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
            ${escapeHtml(n.title)}
          </div>
          <div class="notification-desc">${escapeHtml(n.message)}</div>
          <div class="notification-time">${formatTimeAgo(n.createdAt)}</div>
          ${n.category ? `<span class="notif-category-badge">${getMgrNotifCategoryLabel(n.category)}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    // Add click handlers with deep link navigation
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id;
        if (item.classList.contains('unread')) {
          item.classList.remove('unread');
          await markNotificationRead(notifId);
          fetchUnreadCount();
        }
        const notif = (state.notifications || []).find(n => n._id === notifId);
        if (notif) {
          const deepLink = resolveMgrNotifDeepLink(notif);
          if (deepLink) {
            document.getElementById('notification-dropdown').style.display = 'none';
            loadTemplate(deepLink);
          }
        }
      });
    });
  }

  // ── Manager Notification Helpers ─────────────────────────────

  function getMgrNotifIcon(n) {
    if (n.icon && n.icon !== '🔔') return n.icon;
    const map = {
      stock_in: '📥', stock_out: '📤', low_stock: '⚠️', stock_deleted: '🗑️',
      user_registered: '👤', user_deactivated: '🚫', user_activated: '✅',
      role_changed: '🔄', password_changed: '🔑', password_reset: '🔓',
      failed_login: '❌', account_locked: '🔒',
      admin_promoted: '⬆️', admin_demoted: '⬇️', ownership_transferred: '👑',
      'warranty-purchase-expiring': '⏳', 'warranty-purchase-expired': '🛡️',
      'warranty-seller-expiring': '⏳', 'warranty-seller-expired': '🛡️',
      'warranty-claim': '📋',
      system: '⚙️', info: 'ℹ️', warning: '⚠️', error: '🚨',
      order_completed: '✅'
    };
    return map[n.type] || '🔔';
  }

  function getMgrNotifCategoryLabel(cat) {
    const labels = {
      STOCK: '📦 Stock', WARRANTY: '🛡️ Warranty', SYSTEM: '⚙️ System',
      USER: '👤 User', SECURITY: '🔒 Security', COMPANY: '🏢 Company',
      SHIPMENT: '🚚 Shipment'
    };
    return labels[cat] || cat;
  }

  function resolveMgrNotifDeepLink(n) {
    if (n.link) return n.link;
    const typeMap = {
      stock_in: 'stock-in', stock_out: 'stock-out', low_stock: 'remaining-stock',
      stock_deleted: 'remaining-stock',
      user_registered: 'user-list', user_deactivated: 'user-list', user_activated: 'user-list',
      role_changed: 'user-list', password_changed: 'settings', password_reset: 'user-list',
      'warranty-purchase-expiring': 'warranty-list', 'warranty-purchase-expired': 'warranty-list',
      'warranty-seller-expiring': 'warranty-list', 'warranty-seller-expired': 'warranty-list',
      'warranty-claim': 'warranty-list',
      order_completed: 'stock-out'
    };
    return typeMap[n.type] || null;
  }

  function getMgrNotifTimeGroup(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    if (diffDays < 30) return 'This Month';
    return 'Older';
  }

  // ── All Notifications Full Page (Manager) ─────────────────────

  let mgrNotifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

  function initAllNotifications() {
    mgrNotifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

    document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        mgrNotifPageState.category = tab.dataset.category === 'ALL' ? '' : tab.dataset.category;
        mgrNotifPageState.page = 1;
        loadMgrNotifPage();
      });
    });

    document.getElementById('notif-priority-filter')?.addEventListener('change', (e) => {
      mgrNotifPageState.priority = e.target.value;
      mgrNotifPageState.page = 1;
      loadMgrNotifPage();
    });

    document.getElementById('notif-read-filter')?.addEventListener('change', (e) => {
      mgrNotifPageState.readFilter = e.target.value;
      mgrNotifPageState.page = 1;
      loadMgrNotifPage();
    });

    document.getElementById('notif-mark-all-read')?.addEventListener('click', async () => {
      await markAllNotificationsRead();
      showToast('All notifications marked as read', 'success');
      loadMgrNotifPage();
    });

    document.getElementById('notif-delete-read')?.addEventListener('click', async () => {
      if (!confirm('Delete all read notifications?')) return;
      try {
        await fetchAPI('/notifications/read', { method: 'DELETE' });
        showToast('Read notifications cleared', 'success');
        loadMgrNotifPage();
      } catch (e) {
        showToast('Failed to delete', 'error');
      }
    });

    // Wire "View All" link in dropdown
    const viewAllLink = document.getElementById('view-all-notifications');
    if (viewAllLink) {
      viewAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('notification-dropdown').style.display = 'none';
        loadTemplate('all-notifications');
      });
    }

    loadMgrNotifPage();
  }

  async function loadMgrNotifPage() {
    const container = document.getElementById('notif-page-list');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner">Loading notifications...</div>';

    try {
      let url = `/notifications?page=${mgrNotifPageState.page}&limit=${mgrNotifPageState.limit}`;
      if (mgrNotifPageState.category) url += `&category=${mgrNotifPageState.category}`;
      if (mgrNotifPageState.priority) url += `&priority=${mgrNotifPageState.priority}`;

      const data = await fetchAPI(url);
      let notifications = data.notifications || [];

      if (mgrNotifPageState.readFilter === 'unread') {
        notifications = notifications.filter(n => !n.isRead);
      } else if (mgrNotifPageState.readFilter === 'read') {
        notifications = notifications.filter(n => n.isRead);
      }

      if (notifications.length === 0) {
        container.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">🔔</div><p>No notifications found</p></div>';
        renderMgrNotifPagination(data);
        return;
      }

      const groups = {};
      notifications.forEach(n => {
        const group = getMgrNotifTimeGroup(n.createdAt);
        if (!groups[group]) groups[group] = [];
        groups[group].push(n);
      });

      let html = '';
      for (const [groupName, items] of Object.entries(groups)) {
        html += `<div class="notif-time-group">${groupName}</div>`;
        items.forEach(n => {
          html += `
            <div class="notification-item ${!n.isRead ? 'unread' : ''} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
              <div class="notification-icon">${getMgrNotifIcon(n)}</div>
              <div class="notification-content">
                <div class="notification-title">
                  <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
                  ${escapeHtml(n.title)}
                </div>
                <div class="notification-desc">${escapeHtml(n.message)}</div>
                <div class="notification-time">${formatTimeAgo(n.createdAt)}</div>
                ${n.category ? `<span class="notif-category-badge">${getMgrNotifCategoryLabel(n.category)}</span>` : ''}
              </div>
            </div>`;
        });
      }
      container.innerHTML = html;

      container.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', async () => {
          const notifId = item.dataset.id;
          if (item.classList.contains('unread')) {
            item.classList.remove('unread');
            await markNotificationRead(notifId);
            fetchUnreadCount();
          }
          const notif = notifications.find(n => n._id === notifId);
          if (notif) {
            const deepLink = resolveMgrNotifDeepLink(notif);
            if (deepLink) loadTemplate(deepLink);
          }
        });
      });

      renderMgrNotifPagination(data);
    } catch (error) {
      console.error('Error loading notifications page:', error);
      container.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">❌</div><p>Failed to load notifications</p></div>';
    }
  }

  function renderMgrNotifPagination(data) {
    const pag = document.getElementById('notif-pagination');
    if (!pag) return;
    const total = data.total || 0;
    const totalPages = Math.ceil(total / mgrNotifPageState.limit) || 1;

    pag.innerHTML = `
      <button id="notif-prev" ${mgrNotifPageState.page <= 1 ? 'disabled' : ''}>← Prev</button>
      <span class="page-info">Page ${mgrNotifPageState.page} of ${totalPages} (${total} total)</span>
      <button id="notif-next" ${mgrNotifPageState.page >= totalPages ? 'disabled' : ''}>Next →</button>
    `;

    document.getElementById('notif-prev')?.addEventListener('click', () => {
      if (mgrNotifPageState.page > 1) { mgrNotifPageState.page--; loadMgrNotifPage(); }
    });
    document.getElementById('notif-next')?.addEventListener('click', () => {
      if (mgrNotifPageState.page < totalPages) { mgrNotifPageState.page++; loadMgrNotifPage(); }
    });
  }

  // ===============================================
  // INITIALIZATION
  // ===============================================
  async function init() {
    // Show loading while verifying session
    showLoading(true);

    try {
      // Verify session with API (uses HTTP-only cookie)
      const user = await auth.verifySession();
      
      if (!user) {
        // No valid session - redirect to login
        window.location.href = LOGIN_PAGE;
        return;
      }

      // Check if user is manager
      if (user.role !== 'MANAGER') {
        showLoading(false);
        showToast('Access denied. Manager role required.', 'error');
        setTimeout(() => {
          auth.logout();
        }, 2000);
        return;
      }

      // Store user in memory
      auth.setUser(user);
      state.user = user;

      // Fetch and apply permissions from Admin settings
      await fetchPermissions();
      applyPermissions();

      // Check for force password reset
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('forceReset') === 'true' || urlParams.get('forcePasswordReset') === 'true' || sessionStorage.getItem('forcePasswordReset') === 'true') {
        sessionStorage.removeItem('forcePasswordReset');
        showForcePasswordResetModal();
        showLoading(false);
        return;
      }

      // Display user info
      displayUserInfo();

      // Initialize navigation
      initNavigation();
      
      // Initialize notifications
      initNotificationUI();
      startNotificationPolling();
      
      // Initialize real-time updates
      initRealTimeUpdates(user);

      // Initialize serial search in topbar
      initSerialSearch();

      // Load dashboard by default
      loadTemplate('dashboard');

      // Mark body as loaded (for CSS transition)
      document.body.classList.add('loaded');
    } catch (error) {
      console.error('Initialization error:', error);
      window.location.href = LOGIN_PAGE;
    } finally {
      showLoading(false);
    }
  }

  // Force Password Reset Modal
  function showForcePasswordResetModal() {
    // Mark body as loaded so it becomes visible
    document.body.classList.add('loaded');

    const modal = document.getElementById('force-password-reset-modal');
    if (!modal) return;

    // Reset form state
    const form = document.getElementById('force-reset-form');
    form.reset();
    const errorDiv = document.getElementById('force-reset-error');
    errorDiv.style.display = 'none';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Change Password & Continue';

    // Show the modal
    modal.style.display = 'flex';

    // Setup show/hide password toggles (re-wire each time in case of re-show)
    const toggleNewPassword     = document.getElementById('toggle-new-password');
    const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
    const newPasswordInput      = document.getElementById('force-new-password');
    const confirmPasswordInput  = document.getElementById('force-confirm-password');

    // Clone to remove previous listeners
    toggleNewPassword.replaceWith(toggleNewPassword.cloneNode(true));
    toggleConfirmPassword.replaceWith(toggleConfirmPassword.cloneNode(true));

    document.getElementById('toggle-new-password').addEventListener('click', () => {
      const isPwd = newPasswordInput.type === 'password';
      newPasswordInput.type = isPwd ? 'text' : 'password';
      document.getElementById('toggle-new-password').textContent = isPwd ? '🙈' : '👁️';
    });

    document.getElementById('toggle-confirm-password').addEventListener('click', () => {
      const isPwd = confirmPasswordInput.type === 'password';
      confirmPasswordInput.type = isPwd ? 'text' : 'password';
      document.getElementById('toggle-confirm-password').textContent = isPwd ? '🙈' : '👁️';
    });

    // Handle form submission (re-wire)
    const newForm = form.cloneNode(true);
    form.replaceWith(newForm);

    document.getElementById('force-reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPassword     = document.getElementById('force-new-password').value;
      const confirmPassword = document.getElementById('force-confirm-password').value;
      const errDiv          = document.getElementById('force-reset-error');
      const btn             = e.target.querySelector('button[type="submit"]');

      errDiv.style.display = 'none';

      if (newPassword.length < 8) {
        errDiv.textContent = 'Password must be at least 8 characters';
        errDiv.style.display = 'block';
        return;
      }

      if (newPassword !== confirmPassword) {
        errDiv.textContent = 'Passwords do not match';
        errDiv.style.display = 'block';
        return;
      }

      try {
        btn.disabled = true;
        btn.textContent = 'Changing...';

        const response = await fetch(`${API_URL}/auth/change-password`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (response.ok) {
          modal.style.display = 'none';
          showToast('Password changed successfully!', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          errDiv.textContent = data.message || 'Failed to change password';
          errDiv.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Change Password & Continue';
        }
      } catch (error) {
        errDiv.textContent = 'Network error. Please try again.';
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Change Password & Continue';
      }
    });
  }

  // ===============================================
  // LOGISTICS MANAGEMENT
  // ===============================================
  async function initLogisticsList() {
    await loadLogisticsList();

    // Search
    const searchInput = document.getElementById('trans-search');
    let timeout;
    searchInput?.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadLogisticsList(), 300);
    });
  }

  async function loadLogisticsList() {
    const tbody = document.querySelector('#trans-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Loading transporters...</td></tr>';

    const search = document.getElementById('trans-search')?.value || '';

    try {
      const res = await fetchAPI(`/logistics?search=${encodeURIComponent(search)}`);
      const transporters = res.transporters || res || [];

      if (transporters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">No transporters found. Click "Add New" to add one.</td></tr>';
        return;
      }

      tbody.innerHTML = transporters.map(t => `
        <tr>
          <td><strong>${escapeHtml(t.name)}</strong></td>
          <td>${escapeHtml(t.phone || t.contactPerson || '-')}</td>
          <td>${escapeHtml(t.email || '-')}</td>
          <td>${escapeHtml(t.address?.city || '-')}</td>
          <td>${escapeHtml(t.address?.pincode || '-')}</td>
          <td>${escapeHtml(t.gstin || '-')}</td>
          <td class="actions">
            <button class="btn ghost btn-sm" data-action="edit" data-id="${t._id}">✏️ Edit</button>
            <button class="btn ghost btn-sm ${t.isActive ? 'danger' : 'success'}" data-action="toggle" data-id="${t._id}">
              ${t.isActive ? '🔴 Deactivate' : '🟢 Activate'}
            </button>
          </td>
        </tr>
      `).join('');

      // Add event handlers
      tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          const id = btn.dataset.id;
          
          if (action === 'edit') {
            loadTemplate('logistics-modify');
            setTimeout(() => {
              const select = document.getElementById('modify-trans-select');
              if (select) {
                select.value = id;
                select.dispatchEvent(new Event('change'));
              }
            }, 100);
          } else if (action === 'toggle') {
            try {
              await fetchAPI(`/logistics/${id}/status`, { method: 'PUT' });
              showToast('Transporter status updated', 'success');
              loadLogisticsList();
            } catch (err) {
              showToast(err.message || 'Failed to update status', 'error');
            }
          }
        });
      });

    } catch (error) {
      console.error('Failed to load transporters:', error);
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Failed to load transporters</td></tr>';
    }
  }

  async function initLogisticsAdd() {
    const form = document.getElementById('logistics-add-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(form);

      const data = {
        name: document.getElementById('transporterName')?.value || '',
        contactPerson: document.getElementById('trans-contact')?.value || '',
        phone: document.getElementById('trans-contact')?.value || '',
        email: document.getElementById('trans-email')?.value || '',
        gstin: document.getElementById('trans-gstin')?.value || '',
        address: {
          street: [
            document.getElementById('trans-address1')?.value,
            document.getElementById('trans-address2')?.value,
            document.getElementById('trans-address3')?.value
          ].filter(Boolean).join(', '),
          city: document.getElementById('trans-city')?.value || '',
          state: document.getElementById('trans-state')?.value || '',
          pincode: document.getElementById('trans-pincode')?.value || '',
          country: document.getElementById('trans-country')?.value || 'India'
        }
      };

      if (!data.name) {
        showToast('Transporter name is required', 'error');
        return;
      }

      if (!data.phone) {
        showToast('Primary contact is required', 'error');
        return;
      }

      try {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        await fetchAPI('/logistics', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        showToast('Transporter added successfully!', 'success');
        form.reset();
        loadTemplate('logistics-list');
      } catch (err) {
        showToast(err.message || 'Failed to add transporter', 'error');
      } finally {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Transporter';
        }
      }
    });

    const cancelBtn = document.getElementById('logistics-add-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => loadTemplate('logistics-list'));
    }
  }

  async function initLogisticsModify() {
    const selectEl = document.getElementById('modify-trans-select');
    const form = document.getElementById('logistics-modify-form');
    if (!selectEl || !form) return;

    // Load transporters into dropdown
    try {
      const res = await fetchAPI('/logistics');
      const transporters = res.transporters || res || [];
      
      selectEl.innerHTML = '<option value="">-- Select a transporter --</option>' +
        transporters.map(t => `<option value="${t._id}">${escapeHtml(t.name)}</option>`).join('');
      
      // Store for later use
      selectEl._transporters = transporters;
    } catch (err) {
      showToast('Failed to load transporters', 'error');
    }

    // When transporter is selected, populate form
    selectEl.addEventListener('change', async () => {
      const id = selectEl.value;
      if (!id) return;

      try {
        const res = await fetchAPI(`/logistics/${id}`);
        const transporter = res.transporter || res;
        
        document.getElementById('modify-trans-name').value = transporter.name || '';
        document.getElementById('modify-trans-gstin').value = transporter.gstin || '';
        document.getElementById('modify-trans-contact').value = transporter.phone || transporter.contactPerson || '';
        document.getElementById('modify-trans-email').value = transporter.email || '';
        document.getElementById('modify-trans-city').value = transporter.address?.city || '';
        document.getElementById('modify-trans-state').value = transporter.address?.state || '';
      } catch (err) {
        showToast('Failed to load transporter details', 'error');
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(form);

      const id = selectEl.value;
      if (!id) {
        showToast('Please select a transporter', 'error');
        return;
      }

      const data = {
        name: document.getElementById('modify-trans-name')?.value || '',
        gstin: document.getElementById('modify-trans-gstin')?.value || '',
        phone: document.getElementById('modify-trans-contact')?.value || '',
        contactPerson: document.getElementById('modify-trans-contact')?.value || '',
        email: document.getElementById('modify-trans-email')?.value || '',
        address: {
          city: document.getElementById('modify-trans-city')?.value || '',
          state: document.getElementById('modify-trans-state')?.value || ''
        }
      };

      try {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        await fetchAPI(`/logistics/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });

        showToast('Transporter updated successfully!', 'success');
        loadTemplate('logistics-list');
      } catch (err) {
        showToast(err.message || 'Failed to update transporter', 'error');
      } finally {
        const submitBtn = form.querySelector('[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Changes';
        }
      }
    });

    const cancelBtn = document.getElementById('logistics-modify-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => loadTemplate('logistics-list'));
    }
  }

  // Global function for editing transporter
  window.editTransporter = async function(id) {
    loadTemplate('logistics-modify');
    // Wait for template to load, then select the transporter
    setTimeout(async () => {
      const selectEl = document.getElementById('modify-trans-select');
      if (selectEl) {
        selectEl.value = id;
        selectEl.dispatchEvent(new Event('change'));
      }
    }, 200);
  };

  // Global function for deleting transporter
  window.deleteTransporter = async function(id) {
    if (!confirm('Are you sure you want to delete this transporter?')) return;

    try {
      await fetchAPI(`/logistics/${id}`, { method: 'DELETE' });
      showToast('Transporter deleted successfully', 'success');
      loadLogisticsList();
    } catch (err) {
      showToast(err.message || 'Failed to delete transporter', 'error');
    }
  };
  
  // ===============================================
  // REAL-TIME UPDATES
  // ===============================================
  function initRealTimeUpdates(user) {
    if (typeof AcuStockRealtime === 'undefined') {
      console.warn('Real-time module not loaded');
      return;
    }

    // Connect to WebSocket server
    AcuStockRealtime.connect('MANAGER', user._id);

    // Handle stock updates
    AcuStockRealtime.on('stock-update', (data) => {
      showToast(`Stock ${data.type}: ${data.quantity} units of ${data.productName}`, 'info');
      
      // Always refresh dashboard data on stock changes
      loadDashboardData();
      
      // Refresh current section if relevant
      if (state.currentSection === 'remaining-stock') {
        loadRemainingStock();
      } else if (state.currentSection === 'stock-ledger') {
        loadStockLedger();
      } else if (state.currentSection === 'product-list') {
        loadProducts();
      }
    });

    // Handle product updates
    AcuStockRealtime.on('product-update', (data) => {
      showToast(`Product ${data.action}: ${data.product?.name || 'Unknown'}`, 'info');
      
      // Always refresh products and dashboard
      loadDashboardData();
      if (state.currentSection === 'product-list') {
        loadProducts();
      }
    });

    // Handle user updates
    AcuStockRealtime.on('user-update', (data) => {
      if (data.action === 'created') {
        showToast(`New user: ${data.userName}`, 'info');
      } else {
        showToast(`User ${data.userName} ${data.action}`, 'info');
      }
      
      // Always refresh dashboard and user list
      loadDashboardData();
      if (state.currentSection === 'user-list') {
        loadUsers();
      }
    });

    // Handle company updates
    AcuStockRealtime.on('company-update', (data) => {
      showToast(`Company ${data.action}: ${data.company?.name || 'Unknown'}`, 'info');
      
      loadDashboardData();
      if (state.currentSection === 'company-list') {
        loadCompanies();
      }
    });

    // Handle low stock alerts
    AcuStockRealtime.on('low-stock-alert', (data) => {
      showToast(`⚠️ Low Stock: ${data.productName} (${data.currentStock} remaining)`, 'warning');
      
      loadLowStockAlerts();
      if (state.currentSection === 'dashboard') {
        loadDashboardData();
      }
    });
  }

  // ===============================================
  // WARRANTY
  // ===============================================
  let _wPage  = 1;
  let _wPages = 1;
  const W_LIMIT = 20;

  async function initWarrantyList() {
    // Manager sees both purchase + seller — no columns hidden

    // Load stats
    try {
      const stats = await fetchAPI('/warranty/stats');
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
      set('ws-pw-active',   stats.purchase?.active);
      set('ws-pw-expiring', stats.purchase?.expiringSoon);
      set('ws-pw-expired',  stats.purchase?.expired);
      set('ws-sw-active',   stats.seller?.active);
      set('ws-sw-expiring', stats.seller?.expiringSoon);
      set('ws-sw-expired',  stats.seller?.expired);
    } catch (e) { /* silent */ }

    _wPage = 1;
    await _loadWarranties();

    // Search
    let _wTimer;
    document.getElementById('warranty-search')?.addEventListener('input', () => {
      clearTimeout(_wTimer);
      _wTimer = setTimeout(() => { _wPage = 1; _loadWarranties(); }, 350);
    });
    document.getElementById('warranty-type-filter')?.addEventListener('change',   () => { _wPage = 1; _loadWarranties(); });
    document.getElementById('warranty-status-filter')?.addEventListener('change', () => { _wPage = 1; _loadWarranties(); });

    document.getElementById('warranty-prev')?.addEventListener('click', () => {
      if (_wPage > 1) { _wPage--; _loadWarranties(); }
    });
    document.getElementById('warranty-next')?.addEventListener('click', () => {
      if (_wPage < _wPages) { _wPage++; _loadWarranties(); }
    });

    document.getElementById('warranty-export-btn')?.addEventListener('click', _exportWarrantyCSV);
  }

  async function _loadWarranties() {
    const tbody = document.getElementById('warranty-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:#6B7280;">Loading…</td></tr>`;

    const search = document.getElementById('warranty-search')?.value?.trim() || '';
    const type   = document.getElementById('warranty-type-filter')?.value    || '';
    const status = document.getElementById('warranty-status-filter')?.value  || '';

    const params = new URLSearchParams({ page: _wPage, limit: W_LIMIT });
    if (search) params.append('search', search);
    if (type)   params.append('type',   type);
    if (status) params.append('status', status);

    try {
      const res  = await fetchAPI(`/warranty?${params}`);
      const list = res.warranties || [];
      _wPages = res.pages || res.totalPages || 1;

      const pi = document.getElementById('warranty-page-info');
      if (pi) pi.textContent = `Page ${_wPage} of ${_wPages}`;
      const pb = document.getElementById('warranty-prev');
      const nb = document.getElementById('warranty-next');
      if (pb) pb.disabled = _wPage <= 1;
      if (nb) nb.disabled = _wPage >= _wPages;

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#6B7280;">No warranties found</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(w => {
        const serial      = escapeHtml(w.serialNumber || '—');
        const productName = escapeHtml(w.productId?.name || '—');

        const pw      = w.purchaseWarranty || {};
        const pwDays  = w.purchaseDaysLeft ?? 0;
        const pwSt    = pw.status || 'none';
        const pwColor = pwSt === 'active' ? '#22c55e' : pwSt === 'expiring-soon' ? '#f59e0b' : pwSt === 'expired' ? '#ef4444' : '#9ca3af';
        const pwIcon  = pwSt === 'active' ? '✅' : pwSt === 'expiring-soon' ? '⚠️' : pwSt === 'expired' ? '❌' : '—';
        const pwBadge = pwSt === 'none' ? '<span style="color:#9ca3af;">—</span>'
          : `<span style="color:${pwColor};font-weight:600;">${pwIcon} ${escapeHtml(pw.period || '—')}</span><br><small style="color:#6B7280;">Exp: ${pw.expiryDate ? new Date(pw.expiryDate).toLocaleDateString('en-IN') : '—'}</small>`;
        const pwDaysCell = pwSt === 'none' ? '—' : `<span style="color:${pwColor};font-weight:700;">${pwDays > 0 ? pwDays + ' days' : 'Expired'}</span>`;

        const sw      = w.sellerWarranty || {};
        const swDays  = w.sellerDaysLeft ?? 0;
        const swSt    = sw.status || 'not-sold';
        const swColor = swSt === 'active' ? '#22c55e' : swSt === 'expiring-soon' ? '#f59e0b' : swSt === 'expired' ? '#ef4444' : '#9ca3af';
        const swIcon  = swSt === 'active' ? '✅' : swSt === 'expiring-soon' ? '⚠️' : swSt === 'expired' ? '❌' : '📦';
        const swBadge = swSt === 'not-sold' ? '<span style="color:#9ca3af;">📦 Not Sold</span>'
          : swSt === 'none' ? '<span style="color:#9ca3af;">No Warranty</span>'
          : `<span style="color:${swColor};font-weight:600;">${swIcon} ${escapeHtml(sw.period || '—')}</span><br><small style="color:#6B7280;">Exp: ${sw.expiryDate ? new Date(sw.expiryDate).toLocaleDateString('en-IN') : '—'}</small>`;
        const swDaysCell = (swSt === 'not-sold' || swSt === 'none') ? '—' : `<span style="color:${swColor};font-weight:700;">${swDays > 0 ? swDays + ' days' : 'Expired'}</span>`;

        return `
          <tr>
            <td style="font-family:monospace;font-size:.85rem;">${serial}</td>
            <td><strong>${productName}</strong></td>
            <td>${pwBadge}</td>
            <td>${pwDaysCell}</td>
            <td>${escapeHtml(pw.supplierName || '—')}</td>
            <td>${swBadge}</td>
            <td>${swDaysCell}</td>
            <td>${escapeHtml(sw.buyerName || sw.companyName || '—')}</td>
            <td><button class="btn secondary btn-sm" data-wid="${w._id}">👁 View</button></td>
          </tr>`;
      }).join('');

      // Attach view handlers
      tbody.querySelectorAll('button[data-wid]').forEach(btn => {
        btn.addEventListener('click', () => viewWarrantyDetail(btn.dataset.wid));
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#ef4444;">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function viewWarrantyDetail(id) {
    try {
      const w       = await fetchAPI(`/warranty/${id}`);
      const modal   = document.getElementById('warranty-detail-modal');
      const content = document.getElementById('warranty-detail-content');
      if (!modal || !content) return;

      const pwDays  = w.purchaseDaysLeft ?? 0;
      const swDays  = w.sellerDaysLeft   ?? 0;
      const pwSt    = w.purchaseWarranty?.status || 'none';
      const swSt    = w.sellerWarranty?.status   || 'not-sold';
      const pwColor = pwSt === 'active' ? '#22c55e' : pwSt === 'expiring-soon' ? '#f59e0b' : '#ef4444';
      const swColor = swSt === 'active' ? '#22c55e' : swSt === 'expiring-soon' ? '#f59e0b' : swSt === 'expired' ? '#ef4444' : '#9ca3af';

      content.innerHTML = `
        <div class="wd-header">
          <div class="wd-product-name">${escapeHtml(w.productId?.name || '—')}</div>
          <div class="wd-serial">🔖 Serial: <code>${escapeHtml(w.serialNumber || 'N/A')}</code></div>
        </div>
        <div class="wd-tiers">
          <div class="wd-tier-card wd-purchase">
            <div class="wd-tier-title">📦 Purchase Warranty <span class="wd-tier-sub">(from supplier)</span></div>
            <div class="wd-tier-grid">
              <div class="wd-field"><span class="wd-label">Period</span><span class="wd-value">${escapeHtml(w.purchaseWarranty?.period || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Start Date</span><span class="wd-value">${w.purchaseWarranty?.startDate ? new Date(w.purchaseWarranty.startDate).toLocaleDateString('en-IN') : '—'}</span></div>
              <div class="wd-field"><span class="wd-label">Expiry Date</span><span class="wd-value">${w.purchaseWarranty?.expiryDate ? new Date(w.purchaseWarranty.expiryDate).toLocaleDateString('en-IN') : '—'}</span></div>
              <div class="wd-field"><span class="wd-label">Days Left</span><span class="wd-value" style="color:${pwColor};font-weight:700;">${pwDays > 0 ? pwDays + ' days' : 'Expired'}</span></div>
              <div class="wd-field"><span class="wd-label">Supplier</span><span class="wd-value">${escapeHtml(w.purchaseWarranty?.supplierName || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Status</span><span class="wd-value"><span class="badge" style="background:${pwColor}20;color:${pwColor};border:1px solid ${pwColor}40;">${pwSt}</span></span></div>
            </div>
          </div>
          <div class="wd-tier-card wd-seller">
            <div class="wd-tier-title">🏷️ Seller Warranty <span class="wd-tier-sub">(given to customer)</span></div>
            <div class="wd-tier-grid">
              <div class="wd-field"><span class="wd-label">Period</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.period || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Start Date</span><span class="wd-value">${w.sellerWarranty?.startDate ? new Date(w.sellerWarranty.startDate).toLocaleDateString('en-IN') : '—'}</span></div>
              <div class="wd-field"><span class="wd-label">Expiry Date</span><span class="wd-value">${w.sellerWarranty?.expiryDate ? new Date(w.sellerWarranty.expiryDate).toLocaleDateString('en-IN') : '—'}</span></div>
              <div class="wd-field"><span class="wd-label">Days Left</span><span class="wd-value" style="color:${swColor};font-weight:700;">${swSt === 'not-sold' ? 'Not Sold Yet' : swDays > 0 ? swDays + ' days' : 'Expired'}</span></div>
              <div class="wd-field"><span class="wd-label">Buyer</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.buyerName || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Buyer Phone</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.buyerPhone || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Company</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.companyName || '—')}</span></div>
              <div class="wd-field"><span class="wd-label">Status</span><span class="wd-value"><span class="badge" style="background:${swColor}20;color:${swColor};border:1px solid ${swColor}40;">${swSt}</span></span></div>
            </div>
          </div>
        </div>
        ${w.claims?.length ? `<div class="wd-claims"><h4>📋 Claims (${w.claims.length})</h4>${w.claims.map(c => `<div class="wd-claim-item"><span class="badge">${escapeHtml(c.status)}</span><span>${escapeHtml(c.description || '—')}</span><span style="color:#6B7280;font-size:.8rem;">${new Date(c.claimedAt).toLocaleDateString('en-IN')}</span></div>`).join('')}</div>` : ''}
      `;
      modal.style.display = 'flex';
    } catch (err) {
      showToast('Failed to load warranty details', 'error');
    }
  }

  function closeWarrantyModal() {
    const modal = document.getElementById('warranty-detail-modal');
    if (modal) modal.style.display = 'none';
  }
  window.closeWarrantyModal = closeWarrantyModal;
  window.viewWarrantyDetail = viewWarrantyDetail;

  async function _exportWarrantyCSV() {
    try {
      const res  = await fetchAPI('/warranty?limit=1000');
      const list = res.warranties || [];
      const headers = ['Serial','Product','PW Period','PW Expiry','PW Days Left','PW Status','Supplier','SW Period','SW Expiry','SW Days Left','SW Status','Buyer','Buyer Phone'];
      const rows = list.map(w => [
        w.serialNumber || '',
        w.productId?.name || '',
        w.purchaseWarranty?.period || '',
        w.purchaseWarranty?.expiryDate ? new Date(w.purchaseWarranty.expiryDate).toLocaleDateString('en-IN') : '',
        w.purchaseDaysLeft ?? '',
        w.purchaseWarranty?.status || '',
        w.purchaseWarranty?.supplierName || '',
        w.sellerWarranty?.period || '',
        w.sellerWarranty?.expiryDate ? new Date(w.sellerWarranty.expiryDate).toLocaleDateString('en-IN') : '',
        w.sellerDaysLeft ?? '',
        w.sellerWarranty?.status || '',
        w.sellerWarranty?.buyerName || w.sellerWarranty?.companyName || '',
        w.sellerWarranty?.buyerPhone || ''
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `warranties-${new Date().toISOString().slice(0,10)}.csv` });
      a.click();
    } catch (err) {
      showToast('Failed to export', 'error');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
