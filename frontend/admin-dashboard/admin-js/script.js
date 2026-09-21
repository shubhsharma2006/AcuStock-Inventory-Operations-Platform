// ============================================================
// AcuStock Inventory Management System - Complete Script
// Production-Ready JavaScript (HTTP-only Cookie Authentication)
// ============================================================

// API_URL: reads from shared config.js (loaded before this script).
// Falls back to localhost for dev if config is not loaded.
const API_URL = (window.AcuStockConfig && window.AcuStockConfig.API_BASE_URL)
  || window.ACUSTOCK_API_URL
  || 'http://127.0.0.1:5001/api';

// Tracks the currently active section for real-time update handlers.
let currentSection = 'dashboard';

// ============================================================
// AUTHENTICATION SYSTEM (HTTP-only Cookies - Production Ready)
// Token stored in HTTP-only cookie (secure, not accessible by JS)
// User info cached in memory/sessionStorage for display only
// ============================================================

const auth = {
  _user: null, // In-memory cache

  async login(identifier, password, role, remember = false) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include', // Include cookies
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, role, remember })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }
    // Handle force password reset
    if (data.forcePasswordReset || data.code === 'FORCE_PASSWORD_RESET') {
      this._user = data.user;
      sessionStorage.setItem('user', JSON.stringify(data.user));
      sessionStorage.setItem('forcePasswordReset', 'true');
      throw new Error('FORCE_PASSWORD_RESET');
    }
    // Token now in HTTP-only cookie, cache user for display
    this._user = data.user;
    sessionStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.removeItem('forcePasswordReset');
    return data.user;
  },

  async logout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.error('Logout error:', e);
    }
    this._user = null;
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('forcePasswordReset');
    window.location.href = 'login.html';
  },

  getUser() {
    if (this._user) return this._user;
    const user = sessionStorage.getItem('user');
    if (user) {
      this._user = JSON.parse(user);
    }
    return this._user;
  },

  // Check if user must reset password
  mustResetPassword() {
    return sessionStorage.getItem('forcePasswordReset') === 'true';
  },

  // Verify session with server (HTTP-only cookie sent automatically)
  async verifySession() {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) return null;
      const user = await res.json();
      this._user = user;
      sessionStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Session verification failed:', error);
      return null;
    }
  },

  async isAuthenticated() {
    // First check cached user
    if (this.getUser()) return true;
    // Then verify with server
    const user = await this.verifySession();
    return !!user;
  },
  
  // Change password (for force reset or self-change)
  async changePassword(currentPassword, newPassword) {
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to change password');
    }
    // Clear force reset flag on successful password change
    sessionStorage.removeItem('forcePasswordReset');
    return data;
  }
};

// ============================================================
// FORCE PASSWORD RESET MODAL
// ============================================================

function showForcePasswordResetModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById('force-password-reset-modal');
  if (!modal) {
    const tpl = document.getElementById('tpl-force-reset-modal');
    modal = tpl
      ? tpl.content.cloneNode(true).firstElementChild
      : document.createElement('div');
    modal.id = 'force-password-reset-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    
    // Handle form submission
    const form = document.getElementById('force-password-reset-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('force-current-password').value;
      const newPassword = document.getElementById('force-new-password').value;
      const confirmPassword = document.getElementById('force-confirm-password').value;
      const errorDiv = document.getElementById('force-reset-error');
      const btn = document.getElementById('force-reset-btn');
      
      // Validation
      if (newPassword.length < 8) {
        errorDiv.textContent = 'New password must be at least 8 characters';
        errorDiv.style.display = 'block';
        return;
      }
      
      if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
      }
      
      // Show loading
      btn.disabled = true;
      btn.querySelector('.btn-text').style.display = 'none';
      btn.querySelector('.btn-loader').style.display = 'inline';
      errorDiv.style.display = 'none';
      
      try {
        await auth.changePassword(currentPassword, newPassword);
        showToast('Password changed successfully! Please login again.', 'success');
        modal.style.display = 'none';
        setTimeout(() => {
          auth.logout();
        }, 1500);
      } catch (err) {
        errorDiv.textContent = err.message || 'Failed to change password';
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loader').style.display = 'none';
      }
    });
  }
  
  modal.style.display = 'flex';
}

// ============================================================
// ROLE-BASED PERMISSION HELPERS
// Admin: View, Edit, Delete
// Manager: View, Edit (no Delete)
// User: View only (no Edit, no Delete)
// ============================================================

function getCurrentUserRole() {
  const user = auth.getUser();
  return user?.role?.toUpperCase() || 'USER';
}

function canEdit() {
  const role = getCurrentUserRole();
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MANAGER';
}

function canDelete() {
  const role = getCurrentUserRole();
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function isAdmin() {
  const role = getCurrentUserRole();
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function isSuperAdmin() {
  return getCurrentUserRole() === 'SUPER_ADMIN';
}

function isManager() {
  return getCurrentUserRole() === 'MANAGER';
}

// ============================================================
// API WRAPPER (HTTP-only Cookie Authentication)
// ============================================================

async function fetchAPI(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${endpoint}`, { 
    ...options, 
    headers,
    credentials: 'include' // Always include HTTP-only cookies
  });

  if (res.status === 401) {
    auth.logout();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'API request failed');
  }

  return res.json();
}


// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function clearFormErrors(form) {
  if (!form) return;
  const errorMessages = form.querySelectorAll('.error-message');
  errorMessages.forEach(el => el.textContent = '');
  const errorInputs = form.querySelectorAll('.error');
  errorInputs.forEach(el => el.classList.remove('error'));
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidPhone(value) {
  return /^[\d\s\-\+\(\)]{6,20}$/.test(String(value || '').trim());
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Export table to CSV file
function exportTableToCSV(tableId, filename = 'export.csv') {
  const table = document.getElementById(tableId);
  if (!table) {
    showToast('Table not found', 'error');
    return;
  }
  
  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  
  const csvData = [];
  
  rows.forEach((row, index) => {
    const cols = row.querySelectorAll('th, td');
    const rowData = [];
    
    cols.forEach((col, colIndex) => {
      // Skip the Actions column (usually the last one)
      if (col.textContent.trim().toLowerCase() === 'actions' || 
          col.querySelector('.action-buttons') || 
          col.querySelector('.action-btn')) {
        return;
      }
      
      // Get text content, handling badges and special elements
      let text = col.textContent.trim();
      
      // Clean up the text (remove extra whitespace, newlines)
      text = text.replace(/\s+/g, ' ').trim();
      
      // Escape quotes and wrap in quotes if contains comma
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        text = '"' + text.replace(/"/g, '""') + '"';
      }
      
      rowData.push(text);
    });
    
    if (rowData.length > 0) {
      csvData.push(rowData.join(','));
    }
  });
  
  if (csvData.length <= 1) {
    showToast('No data to export', 'error');
    return;
  }
  
  // Create blob and download
  const csvContent = csvData.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (navigator.msSaveBlob) {
    // IE 10+
    navigator.msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
  
  showToast(`Exported to ${filename}`, 'success');
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', title = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const icon = icons[type] || icons.info;

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      ${title ? `<div class="title">${escapeHtml(title)}</div>` : ''}
      <div class="msg">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  const timer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);

  toast.addEventListener('click', () => {
    clearTimeout(timer);
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  });

  return toast;
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  if (page === 'login') {
    initLoginPage();
  } else if (page === 'admin' || page === 'manager' || page === 'user') {
    // First check if user is in sessionStorage (set during login)
    let user = auth.getUser();
    
    // If no cached user, try to verify with server
    if (!user) {
      user = await auth.verifySession();
    }
    
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    
    // Verify role matches page
    // SUPER_ADMIN and ADMIN both belong on the 'admin' page
    const userPage = (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN')
      ? 'admin'
      : user.role.toLowerCase();

    if (page !== userPage) {
      auth.logout();
      return;
    }
    
    // Check for force password reset
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('forcePasswordReset') === 'true' || auth.mustResetPassword()) {
      showForcePasswordResetModal();
    }
    
    initDashboardPage(page);
  }
});

// ============================================================
// LOGIN PAGE
// ============================================================

function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const role = document.getElementById('login-role')?.value || '';

    if (!identifier || !password || !role) {
      showToast('Please enter all fields', 'error');
      return;
    }

    try {
      const user = await auth.login(identifier, password, role);

      const r = user.role.toUpperCase();
      if (r === 'SUPER_ADMIN' || r === 'ADMIN') {
        window.location.href = 'index.html';
      } else if (r === 'MANAGER') {
        window.location.href = '../../manager-dashboard/manager.html';
      } else if (r === 'USER') {
        window.location.href = '../../user-dashboard/user.html';
      }
    } catch (err) {
      showToast(err.message || 'Login failed.', 'error');
    }
  });
}


// ============================================================
// DASHBOARD INITIALIZATION
// ============================================================

function initDashboardPage(page) {
  const user = auth.getUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  updateUserInfo(user);
  initializeRoleBasedUI(user.role);
  initSidebar();
  initTemplateSystem();
  initTopbarDropdowns();
  startNotificationPolling(); // Start real-time notifications
  initRealTimeUpdates(user); // Initialize WebSocket real-time updates
  loadSection('dashboard');
  initLogout();
  initSerialSearch(); // Serial number global search
}

// ============================================================
// GLOBAL SERIAL / PRODUCT SEARCH
// ============================================================
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

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Keyboard: Escape closes
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

  // Highlight matching part in a string
  const highlight = (str) => {
    if (!str) return '—';
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return str.replace(regex, '<mark class="qs-mark">$1</mark>');
  };

  // Build per-product summary header
  const summaryHtml = perProduct.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg-2);border-radius:8px;margin-bottom:4px;">
      <span style="font-size:1.1rem;">📦</span>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:.9rem;color:var(--text);">${escapeHtml(p.productName || '—')}</div>
        <div style="font-size:.78rem;color:var(--muted);">${escapeHtml(p.productShortName || '')}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">✅ ${p.inStock} in stock</span>
        <span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 10px;font-size:.75rem;font-weight:700;">📤 ${p.outOfStock} sold</span>
      </div>
    </div>
  `).join('');

  // Build individual serial rows
  const rowsHtml = results.map(r => {
    const isIn = r.status === 'in-stock';
    const statusBadge = isIn
      ? '<span class="rs-badge rs-badge-in" style="font-size:.75rem;">In Stock</span>'
      : '<span class="rs-badge rs-badge-out" style="font-size:.75rem;">Sold / Out</span>';
    const date = r.lastActionAt ? new Date(r.lastActionAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

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
    <div style="padding:8px 12px 4px;font-size:.75rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;">
      ${totalMatches} serial${totalMatches !== 1 ? 's' : ''} matched
    </div>
    ${summaryHtml}
    <ul class="qs-list">${rowsHtml}</ul>
  `;
}

// ============================================================
// REAL-TIME UPDATES VIA WEBSOCKET
// ============================================================
function initRealTimeUpdates(user) {
  if (typeof AcuStockRealtime === 'undefined') {
    console.warn('Real-time module not loaded');
    return;
  }

  // Connect to WebSocket server
  AcuStockRealtime.connect(user.role, user._id);

  // Handle stock updates
  AcuStockRealtime.on('stock-update', (data) => {
    showToast(`Stock ${data.type}: ${data.quantity} units of ${data.productName}`, 'info');
    
    // Refresh current section if relevant
    if (currentSection === 'dashboard') {
      initDashboard();
    } else if (currentSection === 'stock-list') {
      initStockList();
    }
  });

  // Handle product updates
  AcuStockRealtime.on('product-update', (data) => {
    showToast(`Product ${data.action}: ${data.product?.name || 'Unknown'}`, 'info');
    
    if (currentSection === 'item-list') {
      initItemList();
    }
  });

  // Handle user updates
  AcuStockRealtime.on('user-update', (data) => {
    if (data.action === 'created') {
      showToast(`New user created: ${data.userName}`, 'info');
    } else {
      showToast(`User ${data.userName} ${data.action}`, 'info');
    }
    
    if (currentSection === 'user-list' || currentSection === 'manager-list') {
      if (currentSection === 'user-list') initUserList();
      if (currentSection === 'manager-list') initManagerList();
    }
  });

  // Handle company updates
  AcuStockRealtime.on('company-update', (data) => {
    showToast(`Company ${data.action}: ${data.company?.name || 'Unknown'}`, 'info');
    
    if (currentSection === 'company-list') {
      initCompanyList();
    }
  });

  // Handle low stock alerts
  AcuStockRealtime.on('low-stock-alert', (data) => {
    showToast(`⚠️ Low Stock Alert: ${data.productName} (${data.currentStock} remaining)`, 'warning');
  });

  // Handle permission updates
  AcuStockRealtime.on('permission-update', (data) => {
    showToast(`Permissions updated for role: ${data.role}`, 'info');
  });
}

function updateUserInfo(user) {
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarEmail = document.getElementById('sidebar-user-email');
  const userAvatar = document.getElementById('user-avatar');

  if (sidebarName) sidebarName.textContent = user.name || 'User';
  if (sidebarEmail) sidebarEmail.textContent = user.email || user.phone || '';
  if (userAvatar) {
    const initial = (user.name || 'U').charAt(0).toUpperCase();
    userAvatar.textContent = initial;
  }

  const topbarName = document.getElementById('topbar-user-name');
  if (topbarName) topbarName.textContent = user.name?.split(' ')[0] || 'User';

  const roleBadge = document.getElementById('user-role-badge');
  if (roleBadge) {
    const roleLabels = {
      SUPER_ADMIN: '👑 Super Admin',
      ADMIN: 'Admin Panel',
      MANAGER: 'Manager Panel',
      USER: 'User Panel'
    };
    roleBadge.textContent = roleLabels[user.role] || 'Dashboard';
  }
}

function initializeRoleBasedUI(role) {
  // SUPER_ADMIN has the same access as ADMIN for all UI elements
  const effectiveRole = role === 'SUPER_ADMIN' ? 'ADMIN' : role;

  document.querySelectorAll('[data-roles]').forEach(element => {
    const allowedRoles = element.dataset.roles.split(',').map(r => r.trim().toUpperCase());
    // Check against effective role (ADMIN) AND original role (SUPER_ADMIN)
    if (!allowedRoles.includes(effectiveRole) && !allowedRoles.includes(role)) {
      element.style.display = 'none';
    }
  });

  // Show Ownership nav only for SUPER_ADMIN
  const ownershipNav = document.getElementById('ownership-nav-item');
  if (ownershipNav) {
    ownershipNav.style.display = role === 'SUPER_ADMIN' ? '' : 'none';
  }

  document.body.dataset.role = role.toLowerCase();
}

function initLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  }
  
  // Also handle logout from profile dropdown
  const profileLogout = document.getElementById('profile-logout');
  if (profileLogout) {
    profileLogout.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  }
}

// ============================================================
// TOPBAR DROPDOWNS (Notifications, Support, Profile)
// ============================================================

function initTopbarDropdowns() {
  const dropdowns = {
    notifications: {
      btn: document.getElementById('notifications-btn'),
      panel: document.getElementById('notifications-panel')
    },
    support: {
      btn: document.getElementById('support-btn'),
      panel: document.getElementById('support-panel')
    },
    profile: {
      btn: document.getElementById('user-profile-btn'),
      panel: document.getElementById('profile-panel')
    }
  };

  // Toggle dropdown on button click
  Object.entries(dropdowns).forEach(([name, { btn, panel }]) => {
    if (btn && panel) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close other dropdowns
        Object.entries(dropdowns).forEach(([otherName, { panel: otherPanel }]) => {
          if (otherName !== name && otherPanel) {
            otherPanel.classList.remove('active');
          }
        });
        
        // Toggle this dropdown
        panel.classList.toggle('active');
        
        // Load notifications if opening notifications panel
        if (name === 'notifications' && panel.classList.contains('active')) {
          loadNotifications();
        }
      });
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    Object.values(dropdowns).forEach(({ btn, panel }) => {
      if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('active');
      }
    });
  });

  // Initialize profile info
  initProfileDropdown();
  
  // Initialize support links
  initSupportLinks();
  
  // Initialize notification actions
  initNotificationActions();
}

function initProfileDropdown() {
  const user = auth.getUser();
  if (!user) return;

  const elements = {
    name: document.getElementById('profile-name'),
    email: document.getElementById('profile-email'),
    role: document.getElementById('profile-role'),
    avatarLarge: document.getElementById('profile-avatar-large'),
    avatarSmall: document.getElementById('topbar-avatar'),
    topbarName: document.getElementById('topbar-user-name')
  };

  const initial = (user.name || 'U').charAt(0).toUpperCase();
  
  if (elements.name) elements.name.textContent = user.name || 'User';
  if (elements.email) elements.email.textContent = user.email || user.phone || '';
  if (elements.role) elements.role.textContent = user.role || 'USER';
  if (elements.avatarLarge) elements.avatarLarge.textContent = initial;
  if (elements.avatarSmall) elements.avatarSmall.textContent = initial;
  if (elements.topbarName) elements.topbarName.textContent = user.name?.split(' ')[0] || 'User';

  // Profile link actions
  document.querySelectorAll('.profile-link[data-action]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const action = link.dataset.action;
      
      // Close profile dropdown
      document.getElementById('profile-panel')?.classList.remove('active');
      
      switch (action) {
        case 'my-profile':
          showProfileModal();
          break;
        case 'account-settings':
          loadSection('settings');
          break;
        case 'activity-log':
          loadSection('report-user-activity');
          break;
      }
    });
  });
}

function showProfileModal() {
  const user = auth.getUser();
  if (!user) return;
  
  const tpl = document.getElementById('tpl-user-profile-modal');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  if (tpl) {
    modal.appendChild(tpl.content.cloneNode(true));
  }
  
  // Populate dynamic data
  const pm = modal.querySelector('.profile-modal');
  if (pm) {
    const avatar = pm.querySelector('.profile-modal-avatar');
    if (avatar) avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
    const nameEl = pm.querySelector('.profile-modal-name');
    if (nameEl) nameEl.textContent = user.name || 'User';
    const emailEl = pm.querySelector('.profile-modal-email');
    if (emailEl) emailEl.textContent = user.email || user.phone || '';
    const roleEl = pm.querySelector('.profile-modal-role');
    if (roleEl) roleEl.textContent = user.role || 'USER';
    const memberEl = pm.querySelector('[data-field="member-since"]');
    if (memberEl) memberEl.textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
    const loginEl = pm.querySelector('[data-field="last-login"]');
    if (loginEl) loginEl.textContent = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Today';
    const typeEl = pm.querySelector('[data-field="account-type"]');
    if (typeEl) typeEl.textContent = user.role || 'USER';
  }

  document.body.appendChild(modal);
  
  // Close modal handlers
  const closeModal = () => modal.remove();
  modal.querySelector('#close-profile-modal')?.addEventListener('click', closeModal);
  modal.querySelector('#profile-modal-close-btn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Settings button
  modal.querySelector('#profile-modal-settings')?.addEventListener('click', () => {
    closeModal();
    loadSection('settings');
  });
}

function initSupportLinks() {
  document.querySelectorAll('.support-link[data-action]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const action = link.dataset.action;
      
      // Close support dropdown
      document.getElementById('support-panel')?.classList.remove('active');
      
      switch (action) {
        case 'docs':
          showToast('Documentation coming soon!', 'info');
          break;
        case 'faq':
          showToast('FAQ section coming soon!', 'info');
          break;
        case 'contact':
          showContactModal();
          break;
        case 'feedback':
          showFeedbackModal();
          break;
      }
    });
  });
}

function showContactModal() {
  const tpl = document.getElementById('tpl-contact-modal');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  if (tpl) modal.appendChild(tpl.content.cloneNode(true));
  
  document.body.appendChild(modal);
  
  modal.querySelector('#close-contact-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-contact')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  modal.querySelector('#contact-support-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Message sent! Our team will get back to you soon.', 'success');
    modal.remove();
  });
}

function showFeedbackModal() {
  const tpl = document.getElementById('tpl-feedback-modal');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  if (tpl) modal.appendChild(tpl.content.cloneNode(true));
  
  document.body.appendChild(modal);
  
  // Rating buttons
  let selectedRating = 0;
  modal.querySelectorAll('.rating-star').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRating = parseInt(btn.dataset.rating);
      modal.querySelector('#feedback-rating').value = selectedRating;
      modal.querySelectorAll('.rating-star').forEach((b, i) => {
        b.classList.toggle('active', i < selectedRating);
      });
    });
    
    // Hover effect
    btn.addEventListener('mouseenter', () => {
      const hoverRating = parseInt(btn.dataset.rating);
      modal.querySelectorAll('.rating-star').forEach((b, i) => {
        b.classList.toggle('hover', i < hoverRating);
      });
    });
    
    btn.addEventListener('mouseleave', () => {
      modal.querySelectorAll('.rating-star').forEach((b, i) => {
        b.classList.remove('hover');
        b.classList.toggle('active', i < selectedRating);
      });
    });
  });
  
  modal.querySelector('#close-feedback-modal')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#cancel-feedback')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  modal.querySelector('#feedback-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Thank you for your feedback! 🙏', 'success');
    modal.remove();
  });
}

function initNotificationActions() {
  const markAllRead = document.getElementById('mark-all-read');
  if (markAllRead) {
    markAllRead.addEventListener('click', async () => {
      document.querySelectorAll('.notification-item.unread').forEach(item => {
        item.classList.remove('unread');
      });
      await markAllNotificationsRead();
      updateNotificationCount(0);
      showToast('All notifications marked as read', 'success');
    });
  }
  // Wire "View All Notifications" button
  const viewAll = document.getElementById('view-all-notifications');
  if (viewAll) {
    viewAll.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('notifications-panel')?.classList.remove('active');
      loadSection('all-notifications');
    });
  }
}

// ============================================================
// REAL-TIME NOTIFICATIONS SYSTEM
// ============================================================

let notificationPollInterval = null;
let lastNotificationCheck = null;

// Start polling for notifications
function startNotificationPolling() {
  // Initial load
  loadNotifications();
  
  // Poll every 30 seconds
  notificationPollInterval = setInterval(() => {
    fetchUnreadCount();
  }, 30000);
  
  // Also poll for new notifications every 60 seconds
  setInterval(() => {
    if (document.getElementById('notifications-panel')?.classList.contains('active')) {
      loadNotifications();
    }
  }, 60000);
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
  const list = document.getElementById('notifications-list');
  if (!list) return;
  
  try {
    const data = await fetchAPI('/notifications?limit=10');
    const notifications = data.notifications || [];
    
    if (notifications.length === 0) {
      list.innerHTML = '<div class="empty-state">No notifications yet</div>';
      updateNotificationCount(0);
      return;
    }
    
    list.innerHTML = notifications.map(n => `
      <div class="notification-item ${!n.isRead ? 'unread' : ''} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
        <div class="notification-icon">${getNotifIcon(n)}</div>
        <div class="notification-content">
          <div class="notification-title">
            <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
            ${escapeHtml(n.title)}
          </div>
          <div class="notification-desc">${escapeHtml(n.message)}</div>
          <div class="notification-time">${formatTimeAgo(n.createdAt)}</div>
          ${n.category ? `<span class="notif-category-badge">${getNotifCategoryLabel(n.category)}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    // Mark as read on click + deep link navigate
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id;
        if (item.classList.contains('unread')) {
          item.classList.remove('unread');
          await markNotificationRead(notifId);
          fetchUnreadCount();
        }
        
        const notification = notifications.find(n => n._id === notifId);
        if (notification) {
          const deepLink = resolveNotifDeepLink(notification);
          if (deepLink) {
            document.getElementById('notifications-panel')?.classList.remove('active');
            loadSection(deepLink);
          }
        }
      });
    });
    
    // Update badge count
    updateNotificationCount(data.unreadCount || 0);
    
  } catch (error) {
    console.error('Error loading notifications:', error);
    list.innerHTML = '<div class="empty-state">Failed to load notifications</div>';
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
    // Refresh the list
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

function updateNotificationCount(count) {
  const badge = document.getElementById('notification-count');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

// ── Shared Notification Helpers ──────────────────────────────

function getNotifIcon(n) {
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

function getNotifCategoryLabel(cat) {
  const labels = {
    STOCK: '📦 Stock', WARRANTY: '🛡️ Warranty', SYSTEM: '⚙️ System',
    USER: '👤 User', SECURITY: '🔒 Security', COMPANY: '🏢 Company',
    SHIPMENT: '🚚 Shipment'
  };
  return labels[cat] || cat;
}

function resolveNotifDeepLink(n) {
  // First check the link field from backend
  if (n.link) return n.link;
  // Fallback: resolve from type / category
  const typeMap = {
    stock_in: 'stock-list', stock_out: 'stock-list', low_stock: 'remaining-stock',
    stock_deleted: 'stock-list',
    user_registered: 'user-list', user_deactivated: 'user-list', user_activated: 'user-list',
    role_changed: 'user-list', password_changed: 'settings', password_reset: 'user-list',
    failed_login: 'user-list', account_locked: 'user-list',
    admin_promoted: 'ownership-admins', admin_demoted: 'ownership-admins',
    ownership_transferred: 'ownership-admins',
    'warranty-purchase-expiring': 'warranty-list', 'warranty-purchase-expired': 'warranty-list',
    'warranty-seller-expiring': 'warranty-list', 'warranty-seller-expired': 'warranty-list',
    'warranty-claim': 'warranty-list',
    order_completed: 'stock-list'
  };
  return typeMap[n.type] || null;
}

function getNotifTimeGroup(dateStr) {
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

// ── All Notifications Full Page ──────────────────────────────

let notifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

async function initAllNotifications() {
  notifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

  // Category tabs
  document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      notifPageState.category = tab.dataset.category === 'ALL' ? '' : tab.dataset.category;
      notifPageState.page = 1;
      loadNotifPage();
    });
  });

  // Priority filter
  document.getElementById('notif-priority-filter')?.addEventListener('change', (e) => {
    notifPageState.priority = e.target.value;
    notifPageState.page = 1;
    loadNotifPage();
  });

  // Read filter
  document.getElementById('notif-read-filter')?.addEventListener('change', (e) => {
    notifPageState.readFilter = e.target.value;
    notifPageState.page = 1;
    loadNotifPage();
  });

  // Mark all read
  document.getElementById('notif-mark-all-read')?.addEventListener('click', async () => {
    await markAllNotificationsRead();
    showToast('All notifications marked as read', 'success');
    loadNotifPage();
  });

  // Delete read
  document.getElementById('notif-delete-read')?.addEventListener('click', async () => {
    if (!confirm('Delete all read notifications?')) return;
    try {
      await fetchAPI('/notifications/read', { method: 'DELETE' });
      showToast('Read notifications cleared', 'success');
      loadNotifPage();
    } catch (e) {
      showToast('Failed to delete', 'error');
    }
  });

  loadNotifPage();
}

async function loadNotifPage() {
  const container = document.getElementById('notif-page-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading notifications...</div>';

  try {
    let url = `/notifications?page=${notifPageState.page}&limit=${notifPageState.limit}`;
    if (notifPageState.category) url += `&category=${notifPageState.category}`;
    if (notifPageState.priority) url += `&priority=${notifPageState.priority}`;

    const data = await fetchAPI(url);
    let notifications = data.notifications || [];

    // Client-side read filter
    if (notifPageState.readFilter === 'unread') {
      notifications = notifications.filter(n => !n.isRead);
    } else if (notifPageState.readFilter === 'read') {
      notifications = notifications.filter(n => n.isRead);
    }

    if (notifications.length === 0) {
      container.innerHTML = `<div class="notif-empty"><div class="notif-empty-icon">🔔</div><p>No notifications found</p></div>`;
      renderNotifPagination(data);
      return;
    }

    // Group by time
    const groups = {};
    notifications.forEach(n => {
      const group = getNotifTimeGroup(n.createdAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    });

    let html = '';
    for (const [groupName, items] of Object.entries(groups)) {
      html += `<div class="notif-time-group">${groupName}</div>`;
      items.forEach(n => {
        html += `
          <div class="notification-item ${!n.isRead ? 'unread' : ''} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
            <div class="notification-icon">${getNotifIcon(n)}</div>
            <div class="notification-content">
              <div class="notification-title">
                <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
                ${escapeHtml(n.title)}
              </div>
              <div class="notification-desc">${escapeHtml(n.message)}</div>
              <div class="notification-time">${formatTimeAgo(n.createdAt)}</div>
              ${n.category ? `<span class="notif-category-badge">${getNotifCategoryLabel(n.category)}</span>` : ''}
            </div>
          </div>`;
      });
    }
    container.innerHTML = html;

    // Click handlers
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
          const deepLink = resolveNotifDeepLink(notif);
          if (deepLink) loadSection(deepLink);
        }
      });
    });

    renderNotifPagination(data);
  } catch (error) {
    console.error('Error loading notifications page:', error);
    container.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">❌</div><p>Failed to load notifications</p></div>';
  }
}

function renderNotifPagination(data) {
  const pag = document.getElementById('notif-pagination');
  if (!pag) return;
  const total = data.total || 0;
  const totalPages = Math.ceil(total / notifPageState.limit) || 1;

  pag.innerHTML = `
    <button id="notif-prev" ${notifPageState.page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="page-info">Page ${notifPageState.page} of ${totalPages} (${total} total)</span>
    <button id="notif-next" ${notifPageState.page >= totalPages ? 'disabled' : ''}>Next →</button>
  `;

  document.getElementById('notif-prev')?.addEventListener('click', () => {
    if (notifPageState.page > 1) { notifPageState.page--; loadNotifPage(); }
  });
  document.getElementById('notif-next')?.addEventListener('click', () => {
    if (notifPageState.page < totalPages) { notifPageState.page++; loadNotifPage(); }
  });
}

// ============================================================
// SIDEBAR & TEMPLATE SYSTEM
// ============================================================

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggle-sidebar');
  if (!sidebar || !toggleBtn) return;

  const isMobile = () => window.innerWidth <= 980;

  // Sidebar collapse/expand toggle
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle(isMobile() ? 'open' : 'collapsed');
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (isMobile() && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });

  // Menu toggle for submenus (Company, Manager, Users, Products, etc.)
  document.querySelectorAll('.menu-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const targetId = btn.getAttribute('data-target');
      const submenu = document.getElementById(targetId);
      
      if (!submenu) return;
      
      // Toggle active state on button
      btn.classList.toggle('active');
      
      // Toggle open state on submenu
      submenu.classList.toggle('open');
      
      // Optionally close other open submenus (accordion style)
      document.querySelectorAll('.submenu').forEach(sub => {
        if (sub.id !== targetId && sub.classList.contains('open')) {
          sub.classList.remove('open');
          const otherBtn = document.querySelector(`[data-target="${sub.id}"]`);
          if (otherBtn) otherBtn.classList.remove('active');
        }
      });
    });
  });
}

function initTemplateSystem() {
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      document.querySelectorAll('[data-section]').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      loadSection(section);
      if (window.innerWidth <= 980) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
}

function loadSection(name) {
  return new Promise((resolve) => {
    const template = document.getElementById(name);
    const content = document.getElementById('content');
    if (!content) { resolve(); return; }

    currentSection = name; // Track active section for real-time updates
    updateBreadcrumb(name);
    content.innerHTML = '';

    if (template) {
      const clone = template.content.cloneNode(true);
      content.appendChild(clone);
      postLoadInit(name);
    } else {
      content.innerHTML = `<div class="hero-card"><h2>Section Not Found</h2><p class="muted">The requested section could not be loaded.</p></div>`;
    }
    resolve();
  });
}

function updateBreadcrumb(section) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;
  const titles = {
    dashboard: 'Dashboard', settings: 'System Settings',
    'company-add': 'Add Company', 'company-modify': 'Modify Company', 'company-list': 'Company List',
    'manager-add': 'Add Manager', 'manager-modify': 'Modify Manager', 'manager-list': 'Manager List',
    'user-add': 'Add User', 'user-modify': 'Modify User', 'user-list': 'User List',
    'invite-list': '📬 Pending Invites',
    'item-add': 'Add Product', 'item-modify': 'Modify Product', 'item-list': 'Product List',
    'stock-supplier': 'Supplier Entry', 'stock-buyer': 'Buyer Entry', 'stock-list': 'Stock List',
    'remaining-stock': 'Remaining Stock',
    'warranty-list': '🛡️ Warranty',
    'all-notifications': '🔔 All Notifications',
  };
  breadcrumb.innerHTML = `<span class="breadcrumb-item">${titles[section] || 'Dashboard'}</span>`;
}

function postLoadInit(section) {
  const handlers = {
    dashboard: initDashboard,
    'company-add': initCompanyAdd,
    'company-modify': initCompanyModify,
    'company-list': initCompanyList,
    'manager-add': initManagerAdd,
    'manager-modify': initManagerModify,
    'manager-list': initManagerList,
    'user-add': initUserAdd,
    'user-modify': initUserModify,
    'user-list': initUserList,
    'user-assign': initUserAssign,
    'invite-list': initInviteList,
    'item-add': initItemAdd,
    'item-modify': initItemModify,
    'item-list': initItemList,
    'stock-list': initStockList,
    'remaining-stock': initRemainingStock,
    'stock-supplier': initStockSupplier,
    'stock-buyer': initStockBuyer,
    settings: initSettings,
    'report-user-activity': initReportUserActivity,
    'report-user-summary': initReportUserSummary,
    'logistics-add': initLogisticsAdd,
    'logistics-modify': initLogisticsModify,
    'logistics-list': initLogisticsList,
    'unit-add': initUnitAdd,
    'unit-modify': initUnitModify,
    'unit-list': initUnitList,
    'warranty-list': initWarrantyList,
    'ownership-admins': initOwnershipAdmins,
    'ownership-transfer': initOwnershipTransfer,
    'all-notifications': initAllNotifications,
  };
  if (handlers[section]) {
    handlers[section]();
  }
}

// ============================================================
// DASHBOARD
// ============================================================

async function initDashboard() {
  try {
    // Fetch comprehensive dashboard data from admin-dashboard endpoint
    const dashboardData = await fetchAPI('/reports/admin-dashboard');
    
    if (!dashboardData) {
      throw new Error('Failed to fetch dashboard data');
    }
    
    const { stats, charts, lowStockAlerts, recentActivity, topPerformers } = dashboardData;
    
    // ========== STAT CARDS ==========
    // Using dash- prefix to match HTML template IDs
    updateStatCard('dash-total-products', stats.totalProducts || 0);
    updateStatCard('dash-products-active', stats.activeProducts || 0);
    updateStatCard('dash-total-companies', stats.totalCompanies || 0);
    updateStatCard('dash-total-stock', formatNumber(stats.totalStockItems || 0));
    updateStatCard('dash-total-managers', stats.totalManagers || 0);
    updateStatCard('dash-managers-active', stats.activeManagers || 0);
    updateStatCard('dash-total-users', stats.totalUsers || 0);
    updateStatCard('dash-users-active', stats.activeUsers || 0);
    updateStatCard('dash-serial-products', stats.serialEnabledProducts || 0);
    updateStatCard('dash-stock-in-today', stats.stockInToday || 0);
    updateStatCard('dash-stock-out-today', stats.stockOutToday || 0);
    
    // ========== INITIALIZE CHARTS ==========
    initAdminDashboardCharts(charts);
    
    // ========== LOW STOCK ALERTS ==========
    renderLowStockAlerts(lowStockAlerts);
    
    // ========== RECENT ACTIVITY ==========
    renderRecentActivity(recentActivity);
    
    // ========== TOP PERFORMERS ==========
    renderTopPerformers(topPerformers);
    
    // ========== QUICK ACTIONS ==========
    setupQuickActions();
    
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    // Set fallback values on error
    const statCards = [
      'dash-total-products', 'dash-products-active', 'dash-total-companies', 
      'dash-total-stock', 'dash-total-managers', 'dash-managers-active',
      'dash-total-users', 'dash-users-active', 'dash-serial-products',
      'dash-stock-in-today', 'dash-stock-out-today'
    ];
    statCards.forEach(id => updateStatCard(id, '-'));
    showToast(`Failed to load dashboard data: ${error.message}`, 'error');
  }
}

// Helper to update stat card with animation
function updateStatCard(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
    el.classList.add('stat-updated');
    setTimeout(() => el.classList.remove('stat-updated'), 500);
  }
}

// Format large numbers with commas
function formatNumber(num) {
  if (typeof num !== 'number') return num;
  return num.toLocaleString('en-IN');
}

function setupQuickActions() {
  document.querySelectorAll('.quick-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      if (section) loadSection(section);
    });
  });
}

// Flag to track if dashboard needs refresh after data modification
let dashboardNeedsRefresh = false;

// Mark dashboard for refresh after any data modification
function markDashboardForRefresh() {
  dashboardNeedsRefresh = true;
}

// Refresh dashboard data if needed (called when navigating to dashboard)
async function refreshDashboardIfNeeded() {
  if (dashboardNeedsRefresh) {
    dashboardNeedsRefresh = false;
    await initDashboard();
  }
}

// Store chart instances to destroy before re-creating
let dashboardCharts = {};

function initAdminDashboardCharts(chartsData) {
  // Check if Chart.js is loaded
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  // Destroy existing charts to prevent memory leaks
  Object.values(dashboardCharts).forEach(chart => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });
  dashboardCharts = {};

  // Color palette
  const colors = {
    primary: '#1F3C88',
    secondary: '#C8A35A',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    purple: '#8B5CF6',
    pink: '#EC4899'
  };

  // Default chart options
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#6B7280',
          font: { size: 12 }
        }
      }
    }
  };

  // ========== 1. Stock Movement Chart (Line Chart - Last 30 days) ==========
  const stockMovementCtx = document.getElementById('stockMovementChart');
  if (stockMovementCtx && chartsData.stockMovement) {
    const { labels, stockIn, stockOut } = chartsData.stockMovement;
    
    // Format labels to show shorter date format
    const formattedLabels = labels.map(l => {
      const d = new Date(l);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    
    dashboardCharts.stockMovement = new Chart(stockMovementCtx, {
      type: 'line',
      data: {
        labels: formattedLabels,
        datasets: [
          {
            label: 'Stock In',
            data: stockIn,
            borderColor: colors.success,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 5
          },
          {
            label: 'Stock Out',
            data: stockOut,
            borderColor: colors.danger,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        ...defaultOptions,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#6B7280' },
            grid: { color: 'rgba(107, 114, 128, 0.1)' }
          },
          x: {
            ticks: { 
              color: '#6B7280',
              maxTicksLimit: 10 // Limit number of x-axis labels
            },
            grid: { display: false }
          }
        }
      }
    });
  }

  // ========== 2. Product-wise Stock Chart (Doughnut/Bar Chart) ==========
  const productWiseCtx = document.getElementById('productWiseStockChart');
  if (productWiseCtx && chartsData.productWise) {
    const { labels, data } = chartsData.productWise;
    
    dashboardCharts.productWise = new Chart(productWiseCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            colors.primary,
            colors.secondary,
            colors.success,
            colors.warning,
            colors.info,
            colors.purple,
            colors.pink,
            colors.danger,
            '#6366F1',
            '#14B8A6'
          ],
          borderWidth: 0,
          hoverOffset: 10
        }]
      },
      options: {
        ...defaultOptions,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#6B7280',
              font: { size: 11 },
              boxWidth: 12,
              padding: 8
            }
          }
        }
      }
    });
  }
}

// ========== Render Low Stock Alerts ==========
function renderLowStockAlerts(alerts) {
  const container = document.getElementById('low-stock-alerts');
  if (!container) return;
  
  if (!alerts || alerts.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4">
        <span class="text-success">✓</span> All products have adequate stock levels
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Product</th>
            <th>Current</th>
            <th>Reorder</th>
            <th>Unit</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${alerts.map(item => `
            <tr class="${item.currentStock <= 0 ? 'table-danger' : item.currentStock <= item.reorderLevel / 2 ? 'table-warning' : ''}">
              <td>
                <strong>${escapeHtml(item.productName)}</strong>
                ${item.shortName ? `<br><small class="text-muted">${escapeHtml(item.shortName)}</small>` : ''}
              </td>
              <td>
                <span class="badge ${item.currentStock <= 0 ? 'bg-danger' : 'bg-warning'}">${item.currentStock}</span>
              </td>
              <td>${item.reorderLevel}</td>
              <td>${item.unit || 'pcs'}</td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="quickStockIn('${item.productId}')">
                  ➕ Stock In
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ========== Render Recent Activity ==========
function renderRecentActivity(activities) {
  const container = document.getElementById('recent-activity');
  if (!container) return;
  
  if (!activities || activities.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4">
        📋 No recent activity
      </div>
    `;
    return;
  }
  
  container.innerHTML = `<div class="activity-list">` + activities.map(a => {
    const isIn = a.type === 'IN';
    const icon = isIn ? '📥' : '📤';
    const badgeClass = isIn ? 'badge-success' : 'badge-danger';
    const timeAgo = getTimeAgo(new Date(a.timestamp));
    
    return `
      <div class="activity-item" style="padding: 10px; border-bottom: 1px solid #eee;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span>${icon}</span>
            <strong>${escapeHtml(a.productName)}</strong>
            <span class="badge ${badgeClass}">${a.type} ${a.quantity}</span>
          </div>
          <small class="text-muted">${timeAgo}</small>
        </div>
        <div style="margin-top: 4px;">
          <small class="text-muted">
            by <strong>${escapeHtml(a.userName)}</strong> 
            <span class="badge badge-secondary">${a.userRole}</span>
            ${a.companyName ? ` • ${escapeHtml(a.companyName)}` : ''}
          </small>
        </div>
        ${a.serialNumbers?.length ? `
          <div style="margin-top: 4px;">
            <small style="color: #0d6efd;">🔢 S/N: ${a.serialNumbers.join(', ')}${a.serialNumbers.length < a.quantity ? '...' : ''}</small>
          </div>
        ` : ''}
      </div>
    `;
  }).join('') + `</div>`;
}

// ========== Render Top Performers ==========
function renderTopPerformers(performers) {
  const container = document.getElementById('top-performers-list');
  if (!container) return;
  
  if (!performers || performers.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted" style="padding: 20px;">
        No activity data yet
      </div>
    `;
    return;
  }
  
  container.innerHTML = performers.map((p, index) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[index] || `${index + 1}.`;
    const roleBadge = p.role === 'MANAGER' ? 'badge-primary' : 'badge-info';
    
    return `
      <div class="performer-item" style="display: flex; align-items: center; gap: 12px; padding: 8px 0; ${index < performers.length - 1 ? 'border-bottom: 1px solid #eee;' : ''}">
        <div class="performer-rank" style="font-size: 1.2rem;">${medal}</div>
        <div style="flex-grow: 1;">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="badge ${roleBadge}" style="margin-left: 4px;">${p.role}</span>
          <div class="small text-muted">
            ${p.transactions} transactions • ${formatNumber(p.totalQuantity)} units
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Helper: Time ago format
function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN');
}

// Quick Stock In action from low stock alerts
function quickStockIn(productId) {
  loadSection('stock-supplier');
  // Pre-select the product after section loads
  setTimeout(() => {
    const productSelect = document.getElementById('stock-in-product');
    if (productSelect) {
      productSelect.value = productId;
    }
  }, 300);
}

// ============================================================
// LIST INITIALIZERS
// ============================================================

async function initCompanyList() {
  const tbody = document.querySelector('#company-table tbody');
  const searchInput = document.getElementById('company-search');
  const prevBtn = document.getElementById('company-prev');
  const nextBtn = document.getElementById('company-next');
  const pageInfo = document.getElementById('company-page-info');
  
  let currentPage = 1;
  let totalPages = 1;
  
  async function loadCompanies(page = 1, search = '') {
    try {
      const data = await fetchAPI(`/companies?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      const companies = data.companies || [];
      totalPages = data.totalPages || 1;
      currentPage = page;
      
      if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
      
      if (!tbody) return;
      
      if (companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No companies found. <a href="#" onclick="loadSection(\'company-add\')">Add your first company</a></td></tr>';
        return;
      }
      
      tbody.innerHTML = companies.map(c => `
        <tr data-id="${c._id}">
          <td>${escapeHtml(c.name || '')}</td>
          <td>${escapeHtml(c.industry || '')}</td>
          <td>${escapeHtml(c.phone || '')}</td>
          <td>${escapeHtml(c.email || '')}</td>
          <td>${escapeHtml(c.address?.city || '')}</td>
          <td>${escapeHtml(c.address?.state || '')}</td>
          <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
          <td class="actions">
            <button class="btn ghost btn-sm" onclick="editCompany('${c._id}')" title="Edit">✏️</button>
            <button class="btn ghost btn-sm" onclick="deleteCompany('${c._id}')" title="Delete">🗑️</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error fetching companies:', error);
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="error-state">Failed to load companies</td></tr>';
    }
  }
  
  // Initial load
  await loadCompanies();
  
  // Search handler
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadCompanies(1, searchInput.value), 300);
    });
  }
  
  // Pagination handlers
  if (prevBtn) prevBtn.addEventListener('click', () => loadCompanies(currentPage - 1, searchInput?.value || ''));
  if (nextBtn) nextBtn.addEventListener('click', () => loadCompanies(currentPage + 1, searchInput?.value || ''));
}

// Global functions for company actions
window.editCompany = function(id) {
  window.editingCompanyId = id;
  loadSection('company-modify').then(() => {
    const select = document.getElementById('modify-company-select');
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
  });
};

window.deleteCompany = async function(id) {
  if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;
  
  try {
    await fetchAPI(`/companies/${id}`, { method: 'DELETE' });
    showToast('Company deleted successfully', 'success');
    markDashboardForRefresh();
    loadSection('company-list');
  } catch (err) {
    showToast(err.message || 'Failed to delete company', 'error');
  }
};

async function initItemList() {
  const tbody = document.querySelector('#item-table tbody');
  const searchInput = document.getElementById('item-search');
  
  async function loadItems(search = '') {
    try {
      const items = await fetchAPI('/items');
      const filtered = search 
        ? items.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()) || 
                           i.shortName?.toLowerCase().includes(search.toLowerCase()))
        : items;
      
      if (!tbody) return;
      
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No products found. <a href="#" onclick="loadSection(\'item-add\')">Add your first product</a></td></tr>';
        return;
      }
      
      tbody.innerHTML = filtered.map(item => `
        <tr data-id="${item._id}">
          <td>${escapeHtml(item.name || '')}</td>
          <td>${escapeHtml(item.shortName || '')}</td>
          <td>${escapeHtml(item.hsn || '')}</td>
          <td>${item.quantity || 0}</td>
          <td>₹${(item.salesPrice || 0).toFixed(2)}</td>
          <td>₹${(item.purchasePrice || 0).toFixed(2)}</td>
          <td class="actions">
            <button class="btn ghost btn-sm" onclick="editItem('${item._id}')" title="Edit">✏️</button>
            <button class="btn ghost btn-sm" onclick="deleteItem('${item._id}')" title="Delete">🗑️</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error fetching items:', error);
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error-state">Failed to load products</td></tr>';
    }
  }
  
  await loadItems();
  
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadItems(searchInput.value), 300);
    });
  }
  
  // ============================================================
  // BULK IMPORT FUNCTIONALITY
  // ============================================================
  const bulkImportBtn = document.getElementById('bulk-import-btn');
  const bulkImportPanel = document.getElementById('bulk-import-panel');
  const csvFileInput = document.getElementById('csv-file-input');
  const csvFileName = document.getElementById('csv-file-name');
  const csvPreview = document.getElementById('csv-preview');
  const csvPreviewTable = document.getElementById('csv-preview-table');
  const cancelBulkImport = document.getElementById('cancel-bulk-import');
  const confirmBulkImport = document.getElementById('confirm-bulk-import');
  const downloadTemplate = document.getElementById('download-csv-template');
  const importProgress = document.getElementById('import-progress');
  const importProgressBar = document.getElementById('import-progress-bar');
  const importStatus = document.getElementById('import-status');
  
  let selectedFile = null;
  let parsedData = [];
  
  // Toggle bulk import panel
  if (bulkImportBtn) {
    bulkImportBtn.addEventListener('click', () => {
      bulkImportPanel.style.display = bulkImportPanel.style.display === 'none' ? 'block' : 'none';
      resetBulkImport();
    });
  }
  
  // Download CSV template
  if (downloadTemplate) {
    downloadTemplate.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const response = await fetch(`${API_URL}/items/bulk-upload/template`, {
          credentials: 'include'
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'product-upload-template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('Template downloaded!', 'success');
      } catch (error) {
        showToast('Failed to download template', 'error');
      }
    });
  }
  
  // Handle file selection
  if (csvFileInput) {
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('Please select a CSV file', 'error');
        return;
      }
      
      selectedFile = file;
      csvFileName.textContent = `📄 Selected: ${file.name}`;
      csvFileName.style.display = 'block';
      
      // Parse and preview CSV
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        parsedData = parseCSV(text);
        
        if (parsedData.length === 0) {
          showToast('CSV file is empty or invalid', 'error');
          confirmBulkImport.disabled = true;
          return;
        }
        
        // Show preview (first 5 rows)
        const previewRows = parsedData.slice(0, 5);
        const headers = Object.keys(parsedData[0]);
        
        csvPreviewTable.innerHTML = `
          <thead>
            <tr>${headers.map(h => `<th style="padding: 6px 10px; background: #f1f5f9; font-size: 0.8rem;">${escapeHtml(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${previewRows.map(row => `
              <tr>${headers.map(h => `<td style="padding: 6px 10px; font-size: 0.8rem;">${escapeHtml(row[h] || '')}</td>`).join('')}</tr>
            `).join('')}
            ${parsedData.length > 5 ? `<tr><td colspan="${headers.length}" style="text-align: center; color: #64748b; font-size: 0.8rem;">... and ${parsedData.length - 5} more rows</td></tr>` : ''}
          </tbody>
        `;
        
        csvPreview.style.display = 'block';
        confirmBulkImport.disabled = false;
      };
      reader.readAsText(file);
    });
  }
  
  // Cancel bulk import
  if (cancelBulkImport) {
    cancelBulkImport.addEventListener('click', () => {
      bulkImportPanel.style.display = 'none';
      resetBulkImport();
    });
  }
  
  // Confirm and upload
  if (confirmBulkImport) {
    confirmBulkImport.addEventListener('click', async () => {
      if (!selectedFile) {
        showToast('Please select a CSV file first', 'error');
        return;
      }
      
      // Show progress
      importProgress.style.display = 'block';
      confirmBulkImport.disabled = true;
      importProgressBar.style.width = '30%';
      importStatus.textContent = 'Uploading file...';
      
      try {
        const formData = new FormData();
        formData.append('csvFile', selectedFile);
        
        importProgressBar.style.width = '60%';
        importStatus.textContent = 'Processing products...';
        
        const response = await fetch(`${API_URL}/items/bulk-upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        const result = await response.json();
        
        importProgressBar.style.width = '100%';
        
        if (!response.ok) {
          throw new Error(result.message || 'Upload failed');
        }
        
        importStatus.textContent = `✅ Successfully imported ${result.count} products!`;
        showToast(`Successfully imported ${result.count} products!`, 'success');
        
        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
          console.warn('Import warnings:', result.warnings);
        }
        
        // Refresh the list after a short delay
        setTimeout(() => {
          bulkImportPanel.style.display = 'none';
          resetBulkImport();
          loadItems();
          markDashboardForRefresh();
        }, 1500);
        
      } catch (error) {
        importProgressBar.style.width = '0%';
        importStatus.textContent = `❌ ${error.message}`;
        showToast(error.message || 'Failed to import products', 'error');
        confirmBulkImport.disabled = false;
      }
    });
  }
  
  // Helper function to parse CSV
  function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx];
        });
        data.push(row);
      }
    }
    
    return data;
  }
  
  // Helper to parse a single CSV line (handles quoted values)
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  }
  
  // Reset bulk import state
  function resetBulkImport() {
    selectedFile = null;
    parsedData = [];
    if (csvFileInput) csvFileInput.value = '';
    if (csvFileName) csvFileName.style.display = 'none';
    if (csvPreview) csvPreview.style.display = 'none';
    if (confirmBulkImport) confirmBulkImport.disabled = true;
    if (importProgress) importProgress.style.display = 'none';
    if (importProgressBar) importProgressBar.style.width = '0%';
    if (importStatus) importStatus.textContent = 'Processing...';
  }
}

// Global item action functions
window.editItem = function(id) {
  window.editingItemId = id;
  loadSection('item-modify').then(() => {
    const select = document.getElementById('modify-item-select');
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
  });
};

window.deleteItem = async function(id) {
  if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) return;
  
  try {
    await fetchAPI(`/items/${id}`, { method: 'DELETE' });
    showToast('Product deleted successfully', 'success');
    markDashboardForRefresh();
    loadSection('item-list');
  } catch (err) {
    showToast(err.message || 'Failed to delete product', 'error');
  }
};

async function initUserList() {
  const tbody = document.querySelector('#user-table tbody');
  const searchInput = document.getElementById('user-search');
  const roleFilter = document.getElementById('user-role-filter');

  const loggedInUser = auth.getUser();
  const roleRank = (r) => {
    switch ((r || '').toUpperCase()) {
      case 'SUPER_ADMIN': return 4;
      case 'ADMIN': return 3;
      case 'MANAGER': return 2;
      case 'USER': return 1;
      default: return 0;
    }
  };
  const canManageTarget = (targetUser) => {
    if (!loggedInUser || !targetUser) return false;
    if (String(targetUser._id) === String(loggedInUser._id)) return false; // never self-manage
    // only allow if your role outranks the target
    return roleRank(loggedInUser.role) > roleRank(targetUser.role);
  };
  
  async function loadUsers(search = '', role = 'ALL') {
    try {
      const users = await fetchAPI('/users');
      const searchLower = (search || '').toLowerCase();
      const filtered = users
        .filter(u => u.role !== 'SUPER_ADMIN')
        .filter(u => role === 'ALL' ? true : u.role === role)
        .filter(u => {
          if (!searchLower) return true;
          const name = (u.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          const phone = (u.phone || '');
          return name.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
        });
      
      if (!tbody) return;
      
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No users found.</td></tr>';
        return;
      }
      
      tbody.innerHTML = filtered.map(user => `
        <tr data-id="${user._id}">
          <td>${escapeHtml(user.name || '')}</td>
          <td>${escapeHtml(user.phone || '')}</td>
          <td>${escapeHtml(user.email || '-')}</td>
          <td><span class="role-badge ${(user.role || '').toLowerCase()}">${escapeHtml(user.role || '')}</span></td>
          <td class="created-by-cell">${user.createdBy ? `${escapeHtml(user.createdBy.role || '')}<br><span class="muted">${escapeHtml(user.createdBy.name || user.createdBy.email || '')}</span>` : 'System'}</td>
          <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
          <td class="actions">
            ${canManageTarget(user)
              ? `<button class="btn ghost btn-sm" onclick="viewUser('${user._id}')" title="View">👁️</button>
                 <button class="btn ghost btn-sm" onclick="editUser('${user._id}')" title="Edit">✏️</button>
                 <button class="btn ghost btn-sm" onclick="toggleUserStatus('${user._id}', ${!user.isActive})" title="${user.isActive ? 'Deactivate' : 'Activate'}">${user.isActive ? '🔒' : '🔓'}</button>`
              : `<button class="btn ghost btn-sm" onclick="viewUser('${user._id}')" title="View">👁️</button>
                 <button class="btn ghost btn-sm" disabled title="Not allowed">✏️</button>
                 <button class="btn ghost btn-sm" disabled title="Not allowed">${user.isActive ? '🔒' : '🔓'}</button>`}
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error fetching users:', error);
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="error-state">Failed to load users</td></tr>';
    }
  }
  
  await loadUsers();
  
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadUsers(searchInput.value, roleFilter?.value || 'ALL'), 300);
    });
  }

  if (roleFilter) {
    roleFilter.addEventListener('change', () => {
      loadUsers(searchInput?.value || '', roleFilter.value || 'ALL');
    });
  }
}

// Global user action functions
window.editUser = function(id) {
  window.editingUserId = id;
  loadSection('user-modify').then(() => {
    const select = document.getElementById('modify-user-select');
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
  });
};

window.toggleUserStatus = async function(id, isActive) {
  try {
    // Use the dedicated users route so it invalidates sessions via tokenVersion bump
    await fetchAPI(`/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });
    showToast(`User ${isActive ? 'activated' : 'deactivated'} successfully`, 'success');
    loadSection('user-list');
  } catch (err) {
    showToast(err.message || 'Failed to update user status', 'error');
  }
};

// User details modal
window.viewUser = async function(id) {
  const modal = document.getElementById('user-detail-modal');
  const content = document.getElementById('user-detail-content');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  content.innerHTML = '<p class="muted" style="padding:8px 0;">Loading…</p>';

  try {
    const u = await fetchAPI(`/users/${id}`);
    const createdBy = u.createdBy
      ? `${escapeHtml(u.createdBy.role || '')} • ${escapeHtml(u.createdBy.name || u.createdBy.email || '')}`
      : 'System';

    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div><div class="muted" style="font-size:.8rem;">Name</div><div style="font-weight:700;">${escapeHtml(u.name || '—')}</div></div>
        <div><div class="muted" style="font-size:.8rem;">Role</div><div><span class="role-badge ${(u.role || '').toLowerCase()}">${escapeHtml(u.role || '—')}</span></div></div>

        <div><div class="muted" style="font-size:.8rem;">Email</div><div>${escapeHtml(u.email || '—')}</div></div>
        <div><div class="muted" style="font-size:.8rem;">Phone</div><div>${escapeHtml(u.phone || '—')}</div></div>

        <div><div class="muted" style="font-size:.8rem;">Status</div><div><span class="status-badge ${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span></div></div>
        <div><div class="muted" style="font-size:.8rem;">Last Login</div><div>${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</div></div>

        <div style="grid-column:1/-1;"><div class="muted" style="font-size:.8rem;">Created By</div><div>${createdBy}</div></div>
        ${u.createdAt ? `<div style="grid-column:1/-1;"><div class="muted" style="font-size:.8rem;">Created At</div><div>${new Date(u.createdAt).toLocaleString()}</div></div>` : ''}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<p style="color:#ef4444;">Failed to load user: ${escapeHtml(err.message || 'Unknown error')}</p>`;
  }
};

window.closeUserDetailModal = function() {
  const modal = document.getElementById('user-detail-modal');
  if (modal) modal.style.display = 'none';
};

// ============================================================
// INVITE SYSTEM
// ============================================================

const ROLE_LABELS = { ADMIN: '🛡️ Admin', MANAGER: '📋 Manager', USER: '👤 User' };

window.openInviteModal = function (defaultRole = 'MANAGER') {
  const modal    = document.getElementById('invite-modal');
  const roleEl   = document.getElementById('invite-modal-role');
  const emailEl  = document.getElementById('invite-modal-email');
  const alertEl  = document.getElementById('invite-modal-alert');
  const errEl    = document.getElementById('invite-modal-email-error');
  if (!modal) return;

  // Reset form
  if (emailEl)  emailEl.value = '';
  if (roleEl)   roleEl.value  = defaultRole;
  if (alertEl)  { alertEl.style.display = 'none'; alertEl.textContent = ''; }
  if (errEl)    { errEl.textContent = ''; errEl.style.display = 'none'; }

  // Hide ADMIN option if current user is not SUPER_ADMIN
  if (roleEl) {
    const adminOption = roleEl.querySelector('option[value="ADMIN"]');
    const loggedInUser = auth.getUser();
    if (adminOption) adminOption.hidden = (loggedInUser?.role !== 'SUPER_ADMIN');
  }

  // Reset button state
  _setInviteBtnLoading(false);
  modal.style.display = 'flex';
};

window.closeInviteModal = function () {
  const modal = document.getElementById('invite-modal');
  if (modal) modal.style.display = 'none';
};

function _setInviteBtnLoading(loading) {
  const btn    = document.getElementById('invite-modal-send-btn');
  if (!btn) return;
  const text   = btn.querySelector('.invite-btn-text');
  const loader = btn.querySelector('.invite-btn-loader');
  btn.disabled = loading;
  if (text)   text.hidden   = loading;
  if (loader) loader.hidden = !loading;
}

window.submitInvite = async function () {
  const emailEl  = document.getElementById('invite-modal-email');
  const roleEl   = document.getElementById('invite-modal-role');
  const alertEl  = document.getElementById('invite-modal-alert');
  const errEl    = document.getElementById('invite-modal-email-error');

  const email = emailEl ? emailEl.value.trim() : '';
  const role  = roleEl  ? roleEl.value         : 'MANAGER';

  // Reset errors
  if (alertEl)  { alertEl.style.display = 'none'; alertEl.className = 'alert'; alertEl.textContent = ''; }
  if (errEl)    { errEl.textContent = ''; errEl.style.display = 'none'; }

  // Validate
  if (!email) {
    if (errEl) { errEl.textContent = 'Email is required'; errEl.style.display = 'block'; }
    return;
  }
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRx.test(email)) {
    if (errEl) { errEl.textContent = 'Please enter a valid email address'; errEl.style.display = 'block'; }
    return;
  }

  _setInviteBtnLoading(true);

  try {
    const data = await fetchAPI('/invites', {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });

    // Success
    window.closeInviteModal();
    if (data.emailDelivered === false && data.inviteUrl) {
      // Email failed — show manual link
      showToast(`Invite created but email failed. Share manually: ${data.inviteUrl}`, 'warning', '📬 Email Not Sent');
    } else {
      showToast(`Invite sent to ${email} as ${ROLE_LABELS[role] || role}`, 'success', '📬 Invite Sent');
    }
    // Refresh invite list if visible
    if (currentSection === 'invite-list') initInviteList();
  } catch (err) {
    if (alertEl) {
      alertEl.textContent  = err.message || 'Failed to send invite. Please try again.';
      alertEl.className    = 'alert';
      alertEl.style.display = 'block';
    }
    _setInviteBtnLoading(false);
  }
};

async function initInviteList() {
  const tbody = document.querySelector('#invite-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';

  try {
    const invites = await fetchAPI('/invites');

    if (!invites.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No pending invites. <a href="#" onclick="openInviteModal()">Send your first invite</a></td></tr>';
      return;
    }

    tbody.innerHTML = invites.map(inv => {
      const expired   = new Date(inv.expiresAt) < new Date();
      const expiresAt = new Date(inv.expiresAt).toLocaleString();
      const sentAt    = new Date(inv.createdAt).toLocaleDateString();
      const invBy     = inv.invitedBy ? (inv.invitedBy.name || inv.invitedBy.email) : '—';
      return `
        <tr data-id="${inv._id}">
          <td>${escapeHtml(inv.email)}</td>
          <td>${ROLE_LABELS[inv.role] || inv.role}</td>
          <td>${escapeHtml(invBy)}</td>
          <td>${sentAt}</td>
          <td><span class="${expired ? 'status-badge inactive' : 'status-badge active'}">${expired ? '⏰ Expired' : expiresAt}</span></td>
          <td class="actions">
            <button class="btn ghost btn-sm" title="Resend" onclick="resendInvite('${inv._id}')">🔄 Resend</button>
            <button class="btn ghost btn-sm" title="Revoke" onclick="revokeInvite('${inv._id}', '${escapeHtml(inv.email)}')">🗑️ Revoke</button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="error-state">Failed to load invites: ${escapeHtml(err.message)}</td></tr>`;
  }
}

window.revokeInvite = async function (id, email) {
  if (!confirm(`Revoke the invite sent to ${email}? They will no longer be able to use the link.`)) return;
  try {
    await fetchAPI(`/invites/${id}`, { method: 'DELETE' });
    showToast('Invite revoked', 'success');
    initInviteList();
  } catch (err) {
    showToast(err.message || 'Failed to revoke invite', 'error');
  }
};

window.resendInvite = async function (id) {
  try {
    const data = await fetchAPI(`/invites/${id}/resend`, { method: 'POST' });
    if (data.emailDelivered === false && data.inviteUrl) {
      showToast(`Email failed. Share manually: ${data.inviteUrl}`, 'warning', '📬 Resend Failed');
    } else {
      showToast('Invite resent with a fresh link', 'success', '📬 Resent');
    }
    initInviteList();
  } catch (err) {
    showToast(err.message || 'Failed to resend invite', 'error');
  }
};

// Close invite modal on backdrop click
document.addEventListener('click', function (e) {
  const modal = document.getElementById('invite-modal');
  if (modal && e.target === modal) window.closeInviteModal();
});

async function initManagerList() {
  const tbody = document.querySelector('#manager-table tbody');
  const searchInput = document.getElementById('manager-search');
  
  async function loadManagers(search = '') {
    try {
      const managers = await fetchAPI('/managers');
      const filtered = search 
        ? managers.filter(m => m.name?.toLowerCase().includes(search.toLowerCase()) || 
                              m.email?.toLowerCase().includes(search.toLowerCase()))
        : managers;
      
      if (!tbody) return;
      
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No managers found. <a href="#" onclick="loadSection(\'manager-add\')">Add your first manager</a></td></tr>';
        return;
      }
      
      tbody.innerHTML = filtered.map(manager => {
        const editBtn = canEdit() 
          ? `<button class="btn ghost btn-sm" onclick="editManager('${manager._id}')" title="Edit">✏️</button>`
          : `<button class="btn ghost btn-sm" disabled title="No edit permission">✏️</button>`;
        
        const deleteBtn = canDelete()
          ? `<button class="btn ghost btn-sm btn-danger" onclick="deleteManager('${manager._id}', '${escapeHtml(manager.name || '')}')" title="Delete">�️</button>`
          : `<button class="btn ghost btn-sm" disabled title="Only Admin can delete">🗑️</button>`;
        
        const toggleBtn = canEdit()
          ? `<button class="btn ghost btn-sm" onclick="toggleManagerStatus('${manager._id}', ${!manager.isActive})" title="${manager.isActive ? 'Deactivate' : 'Activate'}">${manager.isActive ? '🔒' : '🔓'}</button>`
          : `<button class="btn ghost btn-sm" disabled title="No permission">${manager.isActive ? '🔒' : '🔓'}</button>`;
        
        return `
        <tr data-id="${manager._id}">
          <td>${escapeHtml(manager.name || '')}</td>
          <td>${escapeHtml(manager.email || '')}</td>
          <td><span class="status-badge ${manager.isActive ? 'active' : 'inactive'}">${manager.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${manager.lastLogin ? new Date(manager.lastLogin).toLocaleDateString() : 'Never'}</td>
          <td class="actions">
            <button class="btn ghost btn-sm" onclick="viewManagerDetails('${manager._id}')" title="View Details">�️</button>
            ${editBtn}
            ${toggleBtn}
            ${deleteBtn}
          </td>
        </tr>
      `}).join('');
    } catch (error) {
      console.error('Error fetching managers:', error);
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="error-state">Failed to load managers</td></tr>';
    }
  }
  
  await loadManagers();
  
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadManagers(searchInput.value), 300);
    });
  }
}

// Global manager action functions
window.editManager = function(id) {
  window.editingManagerId = id;
  loadSection('manager-modify').then(() => {
    const select = document.getElementById('modify-manager-select');
    if (select) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
  });
};

window.toggleManagerStatus = async function(id, isActive) {
  try {
    await fetchAPI(`/settings/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    });
    showToast(`Manager ${isActive ? 'activated' : 'deactivated'} successfully`, 'success');
    loadSection('manager-list');
  } catch (err) {
    showToast(err.message || 'Failed to update manager status', 'error');
  }
};

// View Manager Details
window.viewManagerDetails = async function(id) {
  try {
    // Try to get the specific manager first
    let manager;
    try {
      manager = await fetchAPI(`/managers/${id}`);
    } catch (e) {
      // Fallback to getting all managers
      const managers = await fetchAPI('/managers');
      const managerList = Array.isArray(managers) ? managers : [];
      manager = managerList.find(m => m._id === id);
    }
    
    if (!manager) {
      showToast('Manager not found', 'error');
      return;
    }
    
    // Create modal if doesn't exist
    let modal = document.getElementById('manager-details-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'manager-details-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
      
      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeManagerDetailsModal();
      });
    }

    // Always reset inner HTML to ensure manager-modal-content exists
    modal.innerHTML = `<div class="profile-modal" id="manager-modal-content"></div>`;
    
    const content = document.getElementById('manager-modal-content');
    window.currentManagerId = id;
    
    const initials = (manager.name || 'M').charAt(0).toUpperCase();
    
    content.innerHTML = `
      <button class="profile-modal-close" onclick="closeManagerDetailsModal()">&times;</button>
      
      <div class="profile-modal-header">
        <div class="profile-modal-avatar">${initials}</div>
        <h2 class="profile-modal-name">${escapeHtml(manager.name || 'Unknown')}</h2>
        <p class="profile-modal-email">${escapeHtml(manager.email || 'No email')}</p>
        <span class="profile-modal-role">${manager.role || 'MANAGER'}</span>
      </div>
      
      <div class="profile-modal-body">
        <div class="profile-modal-item">
          <span class="profile-modal-label">
            <span class="profile-item-icon">✅</span>
            Status
          </span>
          <span class="status-badge ${manager.isActive ? 'active' : 'inactive'}">
            ${manager.isActive ? '● Active' : '● Inactive'}
          </span>
        </div>
        
        <div class="profile-modal-item">
          <span class="profile-modal-label">
            <span class="profile-item-icon">📅</span>
            Member Since
          </span>
          <span class="profile-modal-value">${manager.createdAt ? new Date(manager.createdAt).toLocaleDateString() : 'N/A'}</span>
        </div>
        
        <div class="profile-modal-item">
          <span class="profile-modal-label">
            <span class="profile-item-icon">🕐</span>
            Last Login
          </span>
          <span class="profile-modal-value">${manager.lastLogin ? new Date(manager.lastLogin).toLocaleDateString() : 'Never'}</span>
        </div>
        
        <div class="profile-modal-item">
          <span class="profile-modal-label">
            <span class="profile-item-icon">📞</span>
            Phone
          </span>
          <span class="profile-modal-value">${escapeHtml(manager.phone || 'N/A')}</span>
        </div>
        
        <div class="profile-modal-item">
          <span class="profile-modal-label">
            <span class="profile-item-icon">🎭</span>
            Account Type
          </span>
          <span class="profile-modal-value">${manager.role || 'MANAGER'}</span>
        </div>
      </div>
      
      <div class="profile-modal-footer">
        <button class="btn secondary" onclick="closeManagerDetailsModal()">Close</button>
        ${canEdit() ? `<button class="btn primary" onclick="editManager('${manager._id}'); closeManagerDetailsModal();">✏️ Edit</button>` : ''}
      </div>
    `;
    
    modal.style.display = 'flex';
  } catch (error) {
    console.error('Error viewing manager:', error);
    showToast('Failed to load manager details', 'error');
  }
};

// Close Manager Details Modal
window.closeManagerDetailsModal = function() {
  const modal = document.getElementById('manager-details-modal');
  if (modal) modal.style.display = 'none';
  window.currentManagerId = null;
};

// Delete Manager
window.deleteManager = async function(id, name) {
  if (!confirm(`Are you sure you want to delete manager "${name}"? This action cannot be undone.`)) {
    return;
  }
  
  try {
    await fetchAPI(`/settings/users/${id}`, {
      method: 'DELETE'
    });
    showToast(`Manager "${name}" deleted successfully`, 'success');
    loadSection('manager-list');
  } catch (err) {
    showToast(err.message || 'Failed to delete manager', 'error');
  }
};

async function initStockList() {
  try {
    // Load Supplier Stock (IN entries)
    await loadSupplierStock();
    
    // Load Buyer Stock (OUT entries)
    await loadBuyerStock();
    
    // Search handlers
    const supplierSearch = document.getElementById('supplier-stock-search');
    const buyerSearch = document.getElementById('buyer-stock-search');
    
    let supplierTimeout, buyerTimeout;
    
    if (supplierSearch) {
      supplierSearch.addEventListener('input', () => {
        clearTimeout(supplierTimeout);
        supplierTimeout = setTimeout(() => loadSupplierStock(supplierSearch.value), 300);
      });
    }
    
    if (buyerSearch) {
      buyerSearch.addEventListener('input', () => {
        clearTimeout(buyerTimeout);
        buyerTimeout = setTimeout(() => loadBuyerStock(buyerSearch.value), 300);
      });
    }
  } catch (error) {
    console.error('Error initializing stock list:', error);
  }
}

// ============================================================
// REMAINING STOCK
// ============================================================

let _remainingStockData = [];

async function initRemainingStock() {
  await loadRemainingStockAdmin();

  const searchEl  = document.getElementById('rs-search');
  const filterEl  = document.getElementById('rs-status-filter');
  const exportBtn = document.getElementById('rs-export-btn');
  const refreshBtn = document.getElementById('rs-refresh-btn');

  if (searchEl)  searchEl.addEventListener('input',  () => renderRemainingStockTable(_remainingStockData));
  if (filterEl)  filterEl.addEventListener('change', () => renderRemainingStockTable(_remainingStockData));
  if (exportBtn) exportBtn.addEventListener('click',  () => exportRemainingStockCSV(_remainingStockData));
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadRemainingStockAdmin());
}

async function loadRemainingStockAdmin() {
  const tbody = document.getElementById('rs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="rs-loading">Loading…</td></tr>';

  try {
    const res = await fetchAPI('/stock/summary');
    _remainingStockData = (res.items || []).map(item => ({
      ...item,
      remaining: (item.totalIn || 0) - (item.totalOut || 0)
    }));
    renderRemainingStockTable(_remainingStockData);
  } catch (err) {
    console.error('Failed to load remaining stock:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error-state">Failed to load data</td></tr>';
  }
}

function renderRemainingStockTable(data) {
  const tbody     = document.getElementById('rs-tbody');
  const searchEl  = document.getElementById('rs-search');
  const filterEl  = document.getElementById('rs-status-filter');
  const countEl   = document.getElementById('rs-row-count');
  if (!tbody) return;

  const query  = (searchEl  ? searchEl.value.trim().toLowerCase()  : '');
  const status = (filterEl  ? filterEl.value                       : 'all');

  const LOW_THRESHOLD = 10;

  const getStatus = (rem) => {
    if (rem <= 0)              return 'out-of-stock';
    if (rem <= LOW_THRESHOLD)  return 'low-stock';
    return 'in-stock';
  };

  const statusLabel = {
    'in-stock':     '<span class="rs-badge rs-badge-in">✅ In Stock</span>',
    'low-stock':    '<span class="rs-badge rs-badge-low">⚠️ Low Stock</span>',
    'out-of-stock': '<span class="rs-badge rs-badge-out">❌ Out of Stock</span>',
  };

  let filtered = data.filter(item => {
    const matchQuery  = !query || item.name.toLowerCase().includes(query) || (item.shortName || '').toLowerCase().includes(query);
    const itemStatus  = getStatus(item.remaining);
    const matchStatus = status === 'all' || itemStatus === status;
    return matchQuery && matchStatus;
  });

  // Update summary cards
  const totalIn        = data.reduce((s, i) => s + (i.totalIn  || 0), 0);
  const totalOut       = data.reduce((s, i) => s + (i.totalOut || 0), 0);
  const totalRemaining = data.reduce((s, i) => s + i.remaining,        0);
  const lowOrOut       = data.filter(i => getStatus(i.remaining) !== 'in-stock').length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('rs-total-in',        totalIn);
  setEl('rs-total-out',       totalOut);
  setEl('rs-total-remaining', totalRemaining);
  setEl('rs-low-stock',       lowOrOut);

  // Update last-updated timestamp
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
        <td style="color:var(--muted);font-size:.85rem;">${idx + 1}</td>
        <td><strong>${escapeHtml(item.name || '—')}</strong></td>
        <td style="color:var(--muted);">${escapeHtml(item.shortName || '—')}</td>
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
  if (!data || data.length === 0) { showToast('No data to export.', 'warning'); return; }
  const LOW_THRESHOLD = 10;
  const getStatus = (rem) => rem <= 0 ? 'Out of Stock' : rem <= LOW_THRESHOLD ? 'Low Stock' : 'In Stock';

  const rows = [
    ['#', 'Product Name', 'Short Name', 'Total IN', 'Total OUT', 'Remaining', 'Status'],
    ...data.map((item, idx) => [
      idx + 1,
      item.name || '',
      item.shortName || '',
      item.totalIn  || 0,
      item.totalOut || 0,
      item.remaining,
      getStatus(item.remaining)
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `remaining-stock-${new Date().toISOString().slice(0,10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function loadSupplierStock(search = '') {
  const tbody = document.querySelector('#supplier-stock-table tbody');
  if (!tbody) return;
  
  try {
    let endpoint = '/stock/ledger?type=IN&limit=50';
    if (search) endpoint += `&search=${encodeURIComponent(search)}`;
    
    const res = await fetchAPI(endpoint);
    const entries = res.entries || [];
    
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="rs-loading">No supplier stock entries found</td></tr>';
      return;
    }
    
    tbody.innerHTML = entries.map(entry => {
      const serials = entry.serialNumbers || [];
      const serialsDisplay = serials.length > 0 
        ? `<span class="serial-badge">${serials.length} serials</span>`
        : '-';
      
      // Role-based action buttons
      const editBtn = canEdit() 
        ? `<button class="action-btn edit" onclick="editStockEntry('${entry._id}')" title="Edit">✏️</button>`
        : `<button class="action-btn edit" disabled title="No edit permission">✏️</button>`;
      
      const deleteBtn = canDelete()
        ? `<button class="action-btn delete" onclick="deleteStockEntry('${entry._id}')" title="Delete">🗑️</button>`
        : `<button class="action-btn delete" disabled title="Only Admin can delete">🗑️</button>`;
      
      return `
        <tr class="sd-clickable-row" onclick="viewStockDetails('${entry._id}')" title="Click to view details">
          <td><strong>${escapeHtml(entry.productId?.name || 'Unknown')}</strong></td>
          <td>${escapeHtml(entry.transactionDetails?.modelVariant || entry.productId?.shortName || '-')}</td>
          <td><span class="text-success text-lg">+${Math.abs(entry.quantity)}</span></td>
          <td>${escapeHtml(entry.partyDetails?.companyName || '-')}</td>
          <td>${escapeHtml(entry.transactionDetails?.supplierType || '-')}</td>
          <td>${formatDate(entry.createdAt)}</td>
          <td>${serialsDisplay}</td>
          <td>
            <div class="action-buttons" onclick="event.stopPropagation()">
              <button class="action-btn view" onclick="viewStockDetails('${entry._id}')" title="View Details">👁️</button>
              ${editBtn}
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load supplier stock:', error);
    tbody.innerHTML = '<tr><td colspan="8" class="error-state">Failed to load supplier stock</td></tr>';
  }
}

async function loadBuyerStock(search = '') {
  const tbody = document.querySelector('#buyer-stock-table tbody');
  if (!tbody) return;
  
  try {
    let endpoint = '/stock/ledger?type=OUT&limit=50';
    if (search) endpoint += `&search=${encodeURIComponent(search)}`;
    
    const res = await fetchAPI(endpoint);
    const entries = res.entries || [];
    
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="rs-loading">No buyer stock entries found</td></tr>';
      return;
    }
    
    tbody.innerHTML = entries.map(entry => {
      const serials = entry.serialNumbers || [];
      const serialsDisplay = serials.length > 0 
        ? `<span class="serial-badge">${serials.length} serials</span>`
        : '-';
      
      // Role-based action buttons
      const editBtn = canEdit() 
        ? `<button class="action-btn edit" onclick="editStockEntry('${entry._id}')" title="Edit">✏️</button>`
        : `<button class="action-btn edit" disabled title="No edit permission">✏️</button>`;
      
      const deleteBtn = canDelete()
        ? `<button class="action-btn delete" onclick="deleteStockEntry('${entry._id}')" title="Delete">🗑️</button>`
        : `<button class="action-btn delete" disabled title="Only Admin can delete">🗑️</button>`;
      
      return `
        <tr class="sd-clickable-row" onclick="viewStockDetails('${entry._id}')" title="Click to view details">
          <td><strong>${escapeHtml(entry.productId?.name || 'Unknown')}</strong></td>
          <td>${escapeHtml(entry.transactionDetails?.modelVariant || entry.productId?.shortName || '-')}</td>
          <td><span class="text-error text-lg">-${Math.abs(entry.quantity)}</span></td>
          <td>${escapeHtml(entry.partyDetails?.companyName || '-')}</td>
          <td>${escapeHtml(entry.transactionDetails?.buyerType || '-')}</td>
          <td>${formatDate(entry.createdAt)}</td>
          <td>${serialsDisplay}</td>
          <td>
            <div class="action-buttons" onclick="event.stopPropagation()">
              <button class="action-btn view" onclick="viewStockDetails('${entry._id}')" title="View Details">👁️</button>
              ${editBtn}
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load buyer stock:', error);
    tbody.innerHTML = '<tr><td colspan="8" class="error-state">Failed to load buyer stock</td></tr>';
  }
}

function viewStockDetails(entryId) {
  showStockDetailsModal(entryId);
}

async function showStockDetailsModal(entryId) {
  // Create or reuse modal
  let modal = document.getElementById('stock-details-modal-dynamic');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stock-details-modal-dynamic';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeStockDetailsModal(); });
  }

  // Always reset inner HTML to ensure stock-modal-content exists
  modal.innerHTML = `<div class="sd-modal" id="stock-modal-content"></div>`;

  const content = document.getElementById('stock-modal-content');
  window.currentStockEntryId = entryId;

  // Loading state
  content.innerHTML = `
    <button class="sd-close" onclick="closeStockDetailsModal()">✕</button>
    <div class="sd-loading"><div class="spinner"></div><p>Loading entry…</p></div>
  `;
  modal.style.display = 'flex';

  try {
    // Backend route: GET /api/stock/ledger/:id
    const res = await fetchAPI(`/stock/ledger/${encodeURIComponent(entryId)}`);
    const entry = res.entry;
    if (!entry) throw new Error('Entry not found');

    const isIN       = entry.type === 'IN';
    const serials    = entry.serialNumbers || [];
    const party      = entry.partyDetails  || {};
    const tx         = entry.transactionDetails || {};
    const product    = entry.productId    || {};
    const actor      = entry.createdBy    || {};

    const typeColor  = isIN ? 'var(--success,#10B981)' : 'var(--error,#EF4444)';
    const typeBadge  = isIN
      ? '<span class="sd-badge sd-badge-in">📥 Stock IN</span>'
      : '<span class="sd-badge sd-badge-out">📤 Stock OUT</span>';

    const formatVal = (v) => v || '<span style="color:var(--muted)">—</span>';

    // Build serial chips
    const serialHtml = serials.length
      ? `<div class="sd-serials">${serials.map(s => `<span class="serial-tag">${escapeHtml(s)}</span>`).join('')}</div>`
      : '<span style="color:var(--muted);font-size:.85rem;">No serials recorded</span>';

    content.innerHTML = `
      <button class="sd-close" onclick="closeStockDetailsModal()">✕</button>

      <!-- Header -->
      <div class="sd-header">
        <div class="sd-header-icon" style="background:${isIN ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)'};">
          <span style="font-size:2rem;">${isIN ? '📥' : '📤'}</span>
        </div>
        <div class="sd-header-info">
          <h2>${escapeHtml(product.name || 'Unknown Product')}</h2>
          <p>${escapeHtml(product.shortName || '')}${product.shortName ? ' · ' : ''}${formatDate(entry.createdAt)}</p>
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
            ${typeBadge}
            <span class="sd-badge sd-badge-neutral">${escapeHtml(entry.condition || 'new')}</span>
            <span class="sd-badge sd-badge-neutral">${escapeHtml(entry.role || '—')}</span>
          </div>
        </div>
        <div class="sd-qty" style="color:${typeColor};">
          ${isIN ? '+' : '−'}${Math.abs(entry.quantity)}
          <small>units</small>
        </div>
      </div>

      <!-- Body grid -->
      <div class="sd-body">

        <!-- Party details -->
        <div class="sd-section">
          <div class="sd-section-title">${isIN ? '🚚 Supplier Details' : '🛒 Buyer Details'}</div>
          <div class="sd-grid">
            <div class="sd-field"><span class="sd-label">Company</span><span class="sd-value">${formatVal(escapeHtml(party.companyName))}</span></div>
            <div class="sd-field"><span class="sd-label">Contact</span><span class="sd-value">${formatVal(escapeHtml(party.customerName))}</span></div>
            <div class="sd-field"><span class="sd-label">Phone</span><span class="sd-value">${formatVal(escapeHtml(party.customerPhone))}</span></div>
            <div class="sd-field"><span class="sd-label">Email</span><span class="sd-value">${formatVal(escapeHtml(party.customerEmail))}</span></div>
            <div class="sd-field"><span class="sd-label">Address</span><span class="sd-value">${formatVal(escapeHtml(party.customerAddress))}</span></div>
            <div class="sd-field"><span class="sd-label">City / State</span><span class="sd-value">${[party.city, party.state].filter(Boolean).map(escapeHtml).join(', ') || '—'}</span></div>
          </div>
        </div>

        <!-- Transaction details -->
        <div class="sd-section">
          <div class="sd-section-title">💳 Transaction Details</div>
          <div class="sd-grid">
            <div class="sd-field"><span class="sd-label">${isIN ? 'Supplier Type' : 'Buyer Type'}</span><span class="sd-value">${formatVal(escapeHtml(isIN ? tx.supplierType : tx.buyerType))}</span></div>
            <div class="sd-field"><span class="sd-label">Payment</span><span class="sd-value">${formatVal(escapeHtml(tx.paymentMethod))}</span></div>
            <div class="sd-field"><span class="sd-label">Transaction ID</span><span class="sd-value" style="font-family:monospace;">${formatVal(escapeHtml(tx.transactionId))}</span></div>
            <div class="sd-field"><span class="sd-label">Date</span><span class="sd-value">${formatVal(tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : null)}</span></div>
            <div class="sd-field"><span class="sd-label">Warranty</span><span class="sd-value">${formatVal(escapeHtml(tx.warrantyPeriod))}</span></div>
            <div class="sd-field"><span class="sd-label">${isIN ? 'Delivered By' : 'Received By'}</span><span class="sd-value">${formatVal(escapeHtml(isIN ? tx.deliveredBy : tx.receivedBy))}</span></div>
          </div>
        </div>

        <!-- Serial numbers -->
        <div class="sd-section sd-section-full">
          <div class="sd-section-title">🔢 Serial Numbers ${serials.length ? `<span class="sd-count">${serials.length}</span>` : ''}</div>
          ${serialHtml}
        </div>

        <!-- Meta -->
        <div class="sd-section sd-section-full">
          <div class="sd-section-title">📋 Entry Info</div>
          <div class="sd-grid">
            <div class="sd-field"><span class="sd-label">Entry ID</span><span class="sd-value" style="font-family:monospace;font-size:.8rem;">${entry._id}</span></div>
            <div class="sd-field"><span class="sd-label">Recorded By</span><span class="sd-value">${formatVal(escapeHtml(actor.name || actor.email))}</span></div>
            <div class="sd-field"><span class="sd-label">Recorded At</span><span class="sd-value">${formatDate(entry.createdAt)}</span></div>
            ${entry.editHistory?.length ? `<div class="sd-field"><span class="sd-label">Edits</span><span class="sd-value">${entry.editHistory.length} edit${entry.editHistory.length !== 1 ? 's' : ''}</span></div>` : ''}
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="sd-footer">
        <button class="btn secondary" onclick="closeStockDetailsModal()">Close</button>
        ${canEdit() ? `<button class="btn primary" onclick="editStockEntry('${entry._id}'); closeStockDetailsModal();">✏️ Edit Entry</button>` : ''}
        ${canDelete() ? `<button class="btn danger" onclick="deleteStockEntry('${entry._id}'); closeStockDetailsModal();">🗑️ Delete</button>` : ''}
      </div>
    `;

  } catch (error) {
    console.error('Failed to load stock details:', error);
    content.innerHTML = `
      <button class="sd-close" onclick="closeStockDetailsModal()">✕</button>
      <div class="sd-loading" style="color:var(--error);">
        <p>❌ Failed to load details</p>
        <p style="font-size:.85rem;color:var(--muted);margin-top:6px;">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function closeStockDetailsModal() {
  const modal = document.getElementById('stock-details-modal-dynamic');
  if (modal) {
    modal.style.display = 'none';
  }
  // Also close old modal if exists
  const oldModal = document.getElementById('stock-details-modal');
  if (oldModal) oldModal.style.display = 'none';
}

// Edit Stock Entry (Admin & Manager only)
window.editStockEntry = async function(entryId) {
  if (!canEdit()) {
    showToast('You do not have permission to edit stock entries', 'error');
    return;
  }
  
  try {
    // Fetch entry directly by ID (fast single lookup)
    const res = await fetchAPI(`/stock/ledger/${encodeURIComponent(entryId)}`);
    const entry = res.entry;

    if (!entry) {
      showToast('Stock entry not found', 'error');
      return;
    }

    // Open edit modal
    showStockEditModal(entry);
  } catch (err) {
    showToast('Failed to load stock entry for editing', 'error');
  }
};

// Show Stock Edit Modal
window.showStockEditModal = function(entry) {
  const old = document.getElementById('stock-edit-modal');
  if (old) old.remove();

  window.currentEditEntryId = entry._id;

  const isIn       = entry.type === 'IN';
  const party      = entry.partyDetails       || {};
  const tx         = entry.transactionDetails  || {};
  const product    = entry.productId           || {};
  const initials   = (product.name || '?').charAt(0).toUpperCase();
  const typeBadge  = isIn
    ? `<span class="se-badge se-badge-in">▲ Stock IN</span>`
    : `<span class="se-badge se-badge-out">▼ Stock OUT</span>`;
  const partyLabel = isIn ? 'Supplier' : 'Buyer';

  const opt = (val, cur, label) =>
    `<option value="${val}" ${(cur || '') === val ? 'selected' : ''}>${label}</option>`;

  const fmtDate = d => {
    if (!d) return '';
    try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; }
  };

  const modal = document.createElement('div');
  modal.id        = 'stock-edit-modal';
  modal.className = 'se-overlay';
  modal.innerHTML = `
    <div class="se-modal" role="dialog" aria-modal="true" aria-label="Edit Stock Entry">

      <!-- HEADER -->
      <div class="se-header">
        <div class="se-header-left">
          <div class="se-product-icon">${initials}</div>
          <div>
            <div class="se-product-name">${escapeHtml(product.name || 'Unknown Product')}</div>
            <div class="se-header-meta">
              ${typeBadge}
              <span class="se-badge se-badge-neutral">Qty&nbsp;${Math.abs(entry.quantity)}</span>
              ${entry.condition ? `<span class="se-badge se-badge-neutral">${entry.condition}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="se-close-btn" onclick="closeStockEditModal()" aria-label="Close">&times;</button>
      </div>

      <!-- BODY -->
      <div class="se-body">
        <form id="stock-edit-form" autocomplete="off">

          <!-- 1. Core -->
          <div class="se-section">
            <div class="se-section-title">Core Details</div>
            <div class="se-grid se-grid-3">
              <div class="se-form-group">
                <label class="se-label" for="edit-quantity">Quantity <span class="se-required">*</span></label>
                <input class="se-input" type="number" id="edit-quantity" min="1"
                       value="${Math.abs(entry.quantity)}" required>
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-condition">Condition</label>
                <select class="se-input" id="edit-condition">
                  ${opt('New',         entry.condition, 'New')}
                  ${opt('Repair',      entry.condition, 'Repair')}
                  ${opt('Demo',        entry.condition, 'Demo')}
                  ${opt('refurbished', entry.condition, 'Refurbished')}
                  ${opt('used',        entry.condition, 'Used')}
                  ${opt('damaged',     entry.condition, 'Damaged')}
                </select>
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-transaction-date">Transaction Date</label>
                <input class="se-input" type="date" id="edit-transaction-date"
                       value="${fmtDate(tx.transactionDate)}">
              </div>
            </div>
          </div>

          <!-- 2. Party -->
          <div class="se-section">
            <div class="se-section-title">${partyLabel} Details</div>
            <div class="se-grid se-grid-2">
              <div class="se-form-group">
                <label class="se-label" for="edit-company">Company / Organisation</label>
                <input class="se-input" type="text" id="edit-company"
                       value="${escapeHtml(party.companyName || '')}"
                       placeholder="${partyLabel} company name">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-contact">Contact Person</label>
                <input class="se-input" type="text" id="edit-contact"
                       value="${escapeHtml(party.customerName || '')}"
                       placeholder="Full name">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-phone">Phone</label>
                <input class="se-input" type="tel" id="edit-phone"
                       value="${escapeHtml(party.customerPhone || '')}"
                       placeholder="+91 …">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-email">Email</label>
                <input class="se-input" type="email" id="edit-email"
                       value="${escapeHtml(party.customerEmail || '')}"
                       placeholder="email@example.com">
              </div>
              <div class="se-form-group se-span-2">
                <label class="se-label" for="edit-address">Address</label>
                <input class="se-input" type="text" id="edit-address"
                       value="${escapeHtml(party.customerAddress || '')}"
                       placeholder="Street / building">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-city">City</label>
                <input class="se-input" type="text" id="edit-city"
                       value="${escapeHtml(party.city || '')}"
                       placeholder="City">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-state">State</label>
                <input class="se-input" type="text" id="edit-state"
                       value="${escapeHtml(party.state || '')}"
                       placeholder="State">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-pincode">Pincode</label>
                <input class="se-input" type="text" id="edit-pincode"
                       value="${escapeHtml(party.pincode || '')}"
                       placeholder="PIN code">
              </div>
            </div>
          </div>

          <!-- 3. Transaction -->
          <div class="se-section">
            <div class="se-section-title">Transaction Details</div>
            <div class="se-grid se-grid-2">
              <div class="se-form-group">
                <label class="se-label" for="edit-payment-method">Payment Method</label>
                <select class="se-input" id="edit-payment-method">
                  ${opt('',        tx.paymentMethod, '— select —')}
                  ${opt('cash',    tx.paymentMethod, 'Cash')}
                  ${opt('bank',    tx.paymentMethod, 'Bank Transfer')}
                  ${opt('upi',     tx.paymentMethod, 'UPI')}
                  ${opt('cheque',  tx.paymentMethod, 'Cheque')}
                  ${opt('credit',  tx.paymentMethod, 'Credit')}
                  ${opt('other',   tx.paymentMethod, 'Other')}
                </select>
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-transaction-id">Transaction / Invoice ID</label>
                <input class="se-input" type="text" id="edit-transaction-id"
                       value="${escapeHtml(tx.transactionId || '')}"
                       placeholder="TXN-XXXX / INV-XXXX">
              </div>
              ${isIn ? `
              <div class="se-form-group">
                <label class="se-label" for="edit-supplier-type">Supplier Type</label>
                <select class="se-input" id="edit-supplier-type">
                  ${opt('',             tx.supplierType, '— select —')}
                  ${opt('manufacturer', tx.supplierType, 'Manufacturer')}
                  ${opt('distributor',  tx.supplierType, 'Distributor')}
                  ${opt('retailer',     tx.supplierType, 'Retailer')}
                  ${opt('other',        tx.supplierType, 'Other')}
                </select>
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-warranty-period">Warranty Period</label>
                <input class="se-input" type="text" id="edit-warranty-period"
                       value="${escapeHtml(tx.warrantyPeriod || '')}"
                       placeholder="e.g. 12 months">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-delivered-by">Delivered By</label>
                <input class="se-input" type="text" id="edit-delivered-by"
                       value="${escapeHtml(tx.deliveredBy || '')}"
                       placeholder="Courier / delivery person">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-received-by">Received By</label>
                <input class="se-input" type="text" id="edit-received-by"
                       value="${escapeHtml(tx.receivedBy || '')}"
                       placeholder="Staff name">
              </div>` : `
              <div class="se-form-group">
                <label class="se-label" for="edit-delivered-by">Dispatched By</label>
                <input class="se-input" type="text" id="edit-delivered-by"
                       value="${escapeHtml(tx.deliveredBy || '')}"
                       placeholder="Staff name">
              </div>
              <div class="se-form-group">
                <label class="se-label" for="edit-received-by">Received By (Buyer)</label>
                <input class="se-input" type="text" id="edit-received-by"
                       value="${escapeHtml(tx.receivedBy || '')}"
                       placeholder="Buyer's contact name">
              </div>`}
            </div>
          </div>

          <!-- 4. Notes -->
          <div class="se-section se-section-last">
            <div class="se-section-title">Additional Notes</div>
            <div class="se-form-group">
              <textarea class="se-input se-textarea" id="edit-notes"
                        rows="3"
                        placeholder="Internal remarks, special instructions…">${escapeHtml(entry.notes || '')}</textarea>
            </div>
          </div>

        </form>
      </div>

      <!-- FOOTER -->
      <div class="se-footer">
        <button type="button" class="se-btn se-btn-secondary" onclick="closeStockEditModal()">Cancel</button>
        <button type="button" class="se-btn se-btn-primary" id="se-save-btn" onclick="saveStockEntry()">
          <span id="se-save-text">💾 Save Changes</span>
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('se-overlay-visible'));
  modal.addEventListener('click', e => { if (e.target === modal) closeStockEditModal(); });
};

// Close Stock Edit Modal
window.closeStockEditModal = function() {
  const modal = document.getElementById('stock-edit-modal');
  if (!modal) return;
  modal.classList.remove('se-overlay-visible');
  modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  window.currentEditEntryId = null;
};

// Save Stock Entry
window.saveStockEntry = async function() {
  const entryId = window.currentEditEntryId;
  if (!entryId) { showToast('No entry selected', 'error'); return; }

  const quantityEl = document.getElementById('edit-quantity');
  const quantity   = parseInt(quantityEl?.value, 10);
  if (!quantity || quantity <= 0) {
    showToast('Please enter a valid quantity', 'error');
    quantityEl?.focus();
    return;
  }

  const saveBtn  = document.getElementById('se-save-btn');
  const saveText = document.getElementById('se-save-text');
  if (saveBtn) { saveBtn.disabled = true; saveText.textContent = 'Saving…'; }

  const v  = id => document.getElementById(id)?.value?.trim() ?? '';

  const txDate = v('edit-transaction-date');

  const body = {
    quantity,
    condition: v('edit-condition'),
    notes:     v('edit-notes'),
    partyDetails: {
      companyName:     v('edit-company'),
      customerName:    v('edit-contact'),
      customerPhone:   v('edit-phone'),
      customerEmail:   v('edit-email'),
      customerAddress: v('edit-address'),
      city:            v('edit-city'),
      state:           v('edit-state'),
      pincode:         v('edit-pincode'),
    },
    transactionDetails: {
      paymentMethod:  v('edit-payment-method')  || undefined,
      transactionId:  v('edit-transaction-id')  || undefined,
      supplierType:   v('edit-supplier-type')   || undefined,
      warrantyPeriod: v('edit-warranty-period') || undefined,
      deliveredBy:    v('edit-delivered-by')    || undefined,
      receivedBy:     v('edit-received-by')     || undefined,
      transactionDate: txDate ? new Date(txDate).toISOString() : undefined,
    },
  };

  try {
    await fetchAPI(`/stock/ledger/${encodeURIComponent(entryId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    showToast('Stock entry updated successfully', 'success');
    closeStockEditModal();
    await loadSupplierStock();
    await loadBuyerStock();
  } catch (err) {
    showToast(err.message || 'Failed to update stock entry', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveText.textContent = '💾 Save Changes'; }
  }
};

// Delete Stock Entry (Admin only)
window.deleteStockEntry = async function(entryId) {
  if (!canDelete()) {
    showToast('Only Admin can delete stock entries', 'error');
    return;
  }
  
  if (!confirm('Are you sure you want to delete this stock entry? This action cannot be undone and may affect inventory counts.')) {
    return;
  }
  
  try {
    await fetchAPI(`/stock/ledger/${encodeURIComponent(entryId)}`, {
      method: 'DELETE'
    });
    showToast('Stock entry deleted successfully', 'success');
    // Refresh the stock list
    await loadSupplierStock();
    await loadBuyerStock();
  } catch (err) {
    showToast(err.message || 'Failed to delete stock entry', 'error');
  }
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('stock-details-modal');
  if (modal && e.target === modal) {
    closeStockDetailsModal();
  }
});

async function initSettings() {
  // Initialize Settings Tabs
  const tabs = document.querySelectorAll('.settings-tab');
  const panels = document.querySelectorAll('.settings-panel');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs and panels
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      // Add active to clicked tab and corresponding panel
      tab.classList.add('active');
      const panelId = tab.dataset.tab + '-panel';
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    });
  });
  
  // Initialize each settings section
  initSerialPolicySettings();
  initRolePermissionSettings();
  initAccountControlSettings();
  initAdminProfileSettings();
}

// ============================================================
// SERIAL POLICY SETTINGS
// ============================================================
async function initSerialPolicySettings() {
  const productSelect = document.getElementById('serial-product-select');
  const policyFields = document.getElementById('serial-policy-fields');
  const saveBtn = document.getElementById('serial-policy-save');
  const resetBtn = document.getElementById('serial-policy-reset');
  const lockWarning = document.getElementById('policy-lock-warning');
  
  if (!productSelect) return;
  
  // Load products
  try {
    const products = await fetchAPI('/items');
    productSelect.innerHTML = '<option value="">-- Select a product first --</option>' +
      products.map(p => `<option value="${p._id}">${escapeHtml(p.name)} (${escapeHtml(p.shortName || '')})</option>`).join('');
  } catch (err) {
    showToast('Failed to load products', 'error');
  }
  
  // Product selection handler
  productSelect.addEventListener('change', async () => {
    const productId = productSelect.value;
    
    if (!productId) {
      policyFields.style.opacity = '0.5';
      policyFields.style.pointerEvents = 'none';
      saveBtn.disabled = true;
      return;
    }
    
    // Enable fields
    policyFields.style.opacity = '1';
    policyFields.style.pointerEvents = 'auto';
    saveBtn.disabled = false;
    
    // Load policy for selected product
    try {
      const policy = await fetchAPI(`/settings/serial-policies/${productId}`);
      document.getElementById('serial-enable').checked = policy.serialEnabled || false;
      document.getElementById('serial-in').checked = policy.requireSerialIn || false;
      document.getElementById('serial-out').checked = policy.requireSerialOut || false;
      
      // Check if locked
      if (policy.locked) {
        lockWarning.style.display = 'block';
        policyFields.querySelectorAll('input').forEach(i => i.disabled = true);
        saveBtn.disabled = true;
      } else {
        lockWarning.style.display = 'none';
        policyFields.querySelectorAll('input').forEach(i => i.disabled = false);
      }
    } catch (err) {
      console.error('Failed to load policy:', err);
    }
  });
  
  // Save policy
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const productId = productSelect.value;
      if (!productId) {
        showToast('Please select a product first', 'error');
        return;
      }
      
      const data = {
        productId,
        serialEnabled: document.getElementById('serial-enable').checked,
        requireSerialIn: document.getElementById('serial-in').checked,
        requireSerialOut: document.getElementById('serial-out').checked
      };
      
      try {
        await fetchAPI('/settings/serial-policies', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        showToast('Serial policy saved successfully!', 'success');
      } catch (err) {
        if (err.message?.includes('POLICY_LOCKED')) {
          showToast('Policy is locked and cannot be modified', 'error');
        } else {
          showToast(err.message || 'Failed to save policy', 'error');
        }
      }
    });
  }
  
  // Reset handler
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      productSelect.value = '';
      document.getElementById('serial-enable').checked = false;
      document.getElementById('serial-in').checked = false;
      document.getElementById('serial-out').checked = false;
      policyFields.style.opacity = '0.5';
      policyFields.style.pointerEvents = 'none';
      saveBtn.disabled = true;
    });
  }
}

// ============================================================
// ROLE PERMISSION SETTINGS
// ============================================================
async function initRolePermissionSettings() {
  // Load Manager Permissions
  try {
    const managerPerms = await fetchAPI('/settings/permissions/MANAGER');
    document.getElementById('perm-mgr-add-product').checked = managerPerms.canAddProduct || false;
    document.getElementById('perm-mgr-edit-product').checked = managerPerms.canEditProduct || false;
    document.getElementById('perm-mgr-stock-in').checked = managerPerms.canStockIn || false;
    document.getElementById('perm-mgr-stock-out').checked = managerPerms.canStockOut || false;
    document.getElementById('perm-mgr-view-ledger').checked = managerPerms.canViewStockLedger !== false; // Default true
    document.getElementById('perm-mgr-edit-stock').checked = managerPerms.canEditStock || false;
    document.getElementById('perm-mgr-reports').checked = managerPerms.canViewAllReports || false;
    document.getElementById('perm-mgr-manage-users').checked = managerPerms.canManageUsers || false;
    document.getElementById('perm-mgr-manage-companies').checked = managerPerms.canManageCompanies !== false; // Default true
    document.getElementById('perm-mgr-add-logistics').checked = managerPerms.canAddLogistics !== false; // Default true
  } catch (err) {
    console.error('Failed to load manager permissions:', err);
  }
  
  // Load User Permissions
  try {
    const userPerms = await fetchAPI('/settings/permissions/USER');
    document.getElementById('perm-user-stock-in').checked = userPerms.canStockIn || false;
    document.getElementById('perm-user-stock-out').checked = userPerms.canStockOut || false;
    document.getElementById('perm-user-view-ledger').checked = userPerms.canViewStockLedger !== false; // Default true
    document.getElementById('perm-user-own-reports').checked = userPerms.canViewOwnReports || false;
  } catch (err) {
    console.error('Failed to load user permissions:', err);
  }
  
  // Save Manager Permissions
  const saveManagerBtn = document.getElementById('save-manager-perms');
  if (saveManagerBtn) {
    saveManagerBtn.addEventListener('click', async () => {
      const data = {
        canAddProduct: document.getElementById('perm-mgr-add-product').checked,
        canEditProduct: document.getElementById('perm-mgr-edit-product').checked,
        canStockIn: document.getElementById('perm-mgr-stock-in').checked,
        canStockOut: document.getElementById('perm-mgr-stock-out').checked,
        canViewStockLedger: document.getElementById('perm-mgr-view-ledger').checked,
        canEditStock: document.getElementById('perm-mgr-edit-stock').checked,
        canViewAllReports: document.getElementById('perm-mgr-reports').checked,
        canManageUsers: document.getElementById('perm-mgr-manage-users').checked,
        canManageCompanies: document.getElementById('perm-mgr-manage-companies').checked,
        canAddLogistics: document.getElementById('perm-mgr-add-logistics').checked
      };
      
      try {
        await fetchAPI('/settings/permissions/MANAGER', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        showToast('Manager permissions saved!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save permissions', 'error');
      }
    });
  }
  
  // Save User Permissions
  const saveUserBtn = document.getElementById('save-user-perms');
  if (saveUserBtn) {
    saveUserBtn.addEventListener('click', async () => {
      const data = {
        canStockIn: document.getElementById('perm-user-stock-in').checked,
        canStockOut: document.getElementById('perm-user-stock-out').checked,
        canViewStockLedger: document.getElementById('perm-user-view-ledger').checked,
        canViewOwnReports: document.getElementById('perm-user-own-reports').checked
      };
      
      try {
        await fetchAPI('/settings/permissions/USER', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        showToast('User permissions saved!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save permissions', 'error');
      }
    });
  }
}

// ============================================================
// ACCOUNT CONTROL SETTINGS
// ============================================================
async function initAccountControlSettings() {
  const userSelect = document.getElementById('account-user-select');
  const accountActions = document.getElementById('account-actions');
  let selectedUser = null;
  
  // Load account stats
  try {
    const stats = await fetchAPI('/settings/account-stats');
    document.getElementById('stat-managers-active').textContent = stats.managers?.active || 0;
    document.getElementById('stat-users-active').textContent = stats.users?.active || 0;
    document.getElementById('stat-inactive').textContent = (stats.managers?.inactive || 0) + (stats.users?.inactive || 0);
  } catch (err) {
    console.error('Failed to load account stats:', err);
  }
  
  // Load users and managers
  if (userSelect) {
    try {
      const users = await fetchAPI('/users');
      userSelect.innerHTML = '<option value="">-- Select a user or manager --</option>';
      
      // Add managers
      const managers = users.filter(u => u.role === 'MANAGER');
      if (managers.length > 0) {
        userSelect.innerHTML += '<optgroup label="Managers">' +
          managers.map(m => `<option value="${m._id}">[MGR] ${escapeHtml(m.name)} - ${escapeHtml(m.email)}</option>`).join('') +
          '</optgroup>';
      }
      
      // Add users
      const regularUsers = users.filter(u => u.role === 'USER');
      if (regularUsers.length > 0) {
        userSelect.innerHTML += '<optgroup label="Users">' +
          regularUsers.map(u => `<option value="${u._id}">[USR] ${escapeHtml(u.name)} - ${escapeHtml(u.phone || u.email)}</option>`).join('') +
          '</optgroup>';
      }
    } catch (err) {
      showToast('Failed to load users', 'error');
    }
    
    // Selection handler
    userSelect.addEventListener('change', async () => {
      const userId = userSelect.value;
      
      if (!userId) {
        accountActions.style.opacity = '0.5';
        accountActions.style.pointerEvents = 'none';
        selectedUser = null;
        return;
      }
      
      accountActions.style.opacity = '1';
      accountActions.style.pointerEvents = 'auto';
      
      // Load user details with password info
      try {
        selectedUser = await fetchAPI(`/users/${userId}`);
        
        // Also fetch password metadata
        const passwordInfo = await fetchAPI(`/settings/users/${userId}/password-info`);
        
        document.getElementById('account-name').textContent = selectedUser.name || '-';
        document.getElementById('account-email').textContent = selectedUser.email || selectedUser.phone || '-';
        
        const roleEl = document.getElementById('account-role');
        roleEl.textContent = selectedUser.role;
        roleEl.className = 'badge ' + selectedUser.role.toLowerCase();
        
        const statusEl = document.getElementById('account-status');
        statusEl.textContent = selectedUser.isActive ? 'Active' : 'Inactive';
        statusEl.className = 'badge ' + (selectedUser.isActive ? 'active' : 'inactive');
        
        document.getElementById('toggle-status-text').textContent = selectedUser.isActive ? '🔴 Deactivate' : '🟢 Activate';
        
        // Update password info display (if elements exist)
        const passwordInfoEl = document.getElementById('password-info-section');
        if (passwordInfoEl) {
          const lastChanged = passwordInfo.passwordChangedAt 
            ? new Date(passwordInfo.passwordChangedAt).toLocaleString() 
            : 'Never';
          const changedBy = passwordInfo.passwordChangedBy || 'SYSTEM';
          const forceReset = passwordInfo.forcePasswordReset ? 'Yes' : 'No';
          
          passwordInfoEl.innerHTML = `
            <div class="password-info-grid">
              <div class="info-item">
                <span class="info-label">Last Password Change:</span>
                <span class="info-value">${lastChanged}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Changed By:</span>
                <span class="info-value badge ${changedBy.toLowerCase()}">${changedBy}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Reset Required:</span>
                <span class="info-value ${passwordInfo.forcePasswordReset ? 'text-warning' : ''}">${forceReset}</span>
              </div>
              ${passwordInfo.failedLoginAttempts > 0 ? `
              <div class="info-item">
                <span class="info-label">Failed Attempts:</span>
                <span class="info-value text-warning">${passwordInfo.failedLoginAttempts}</span>
              </div>
              ` : ''}
            </div>
          `;
          passwordInfoEl.style.display = 'block';
        }
        
      } catch (err) {
        showToast('Failed to load user details', 'error');
      }
    });
  }
  
  // Toggle Status Button
  const toggleStatusBtn = document.getElementById('btn-toggle-status');
  if (toggleStatusBtn) {
    toggleStatusBtn.addEventListener('click', async () => {
      if (!selectedUser) return;
      
      const newStatus = !selectedUser.isActive;
      const action = newStatus ? 'activate' : 'deactivate';
      
      if (!confirm(`Are you sure you want to ${action} this account?`)) return;
      
      try {
        await fetchAPI(`/settings/users/${selectedUser._id}/status`, {
          method: 'PUT',
          body: JSON.stringify({ isActive: newStatus })
        });
        showToast(`Account ${newStatus ? 'activated' : 'deactivated'} successfully!`, 'success');
        userSelect.dispatchEvent(new Event('change')); // Refresh
        
        // Refresh stats
        const stats = await fetchAPI('/settings/account-stats');
        document.getElementById('stat-managers-active').textContent = stats.managers?.active || 0;
        document.getElementById('stat-users-active').textContent = stats.users?.active || 0;
        document.getElementById('stat-inactive').textContent = (stats.managers?.inactive || 0) + (stats.users?.inactive || 0);
      } catch (err) {
        showToast(err.message || 'Failed to update status', 'error');
      }
    });
  }
  
  // Reset Password Button
  const resetPasswordBtn = document.getElementById('btn-reset-password');
  const resetPasswordModal = document.getElementById('reset-password-modal');
  const cancelResetBtn = document.getElementById('cancel-reset-password');
  const confirmResetBtn = document.getElementById('confirm-reset-password');
  const generateTempBtn = document.getElementById('generate-temp-password');
  
  if (resetPasswordBtn && resetPasswordModal) {
    resetPasswordBtn.addEventListener('click', () => {
      if (!selectedUser) return;
      document.getElementById('reset-password-user').textContent = `Reset password for: ${selectedUser.name}`;
      document.getElementById('new-password-input').value = '';
      resetPasswordModal.style.display = 'flex';
    });
    
    cancelResetBtn?.addEventListener('click', () => {
      resetPasswordModal.style.display = 'none';
    });
    
    // Generate temporary password
    generateTempBtn?.addEventListener('click', async () => {
      if (!selectedUser) return;
      
      if (!confirm('This will generate a temporary password. The user must change it on next login. Continue?')) return;
      
      try {
        const result = await fetchAPI(`/settings/users/${selectedUser._id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ generateTemporary: true })
        });
        
        // Show the temporary password
        if (result.temporaryPassword) {
          showToast('Password reset! Temporary password shown below.', 'success');
          document.getElementById('new-password-input').value = result.temporaryPassword;
          
          // Show notice
          const noticeEl = document.getElementById('temp-password-notice');
          if (noticeEl) {
            noticeEl.innerHTML = `
              <div class="alert alert-warning">
                <strong>⚠️ Temporary Password:</strong> <code>${result.temporaryPassword}</code><br>
                <small>Share this securely with the user. They must change it on next login.</small>
              </div>
            `;
            noticeEl.style.display = 'block';
          }
        }
      } catch (err) {
        showToast(err.message || 'Failed to generate temporary password', 'error');
      }
    });
    
    confirmResetBtn?.addEventListener('click', async () => {
      const newPassword = document.getElementById('new-password-input').value;
      
      if (!newPassword || newPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }
      
      try {
        await fetchAPI(`/settings/users/${selectedUser._id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ newPassword })
        });
        showToast('Password reset successfully! User must change it on next login.', 'success');
        resetPasswordModal.style.display = 'none';
        userSelect.dispatchEvent(new Event('change')); // Refresh to show updated info
      } catch (err) {
        showToast(err.message || 'Failed to reset password', 'error');
      }
    });
  }
  
  // Force Logout Button
  const forceLogoutBtn = document.getElementById('btn-force-logout');
  if (forceLogoutBtn) {
    forceLogoutBtn.addEventListener('click', async () => {
      if (!selectedUser) return;
      
      if (!confirm('This will log out the user from all sessions. Continue?')) return;
      
      try {
        await fetchAPI(`/settings/users/${selectedUser._id}/force-logout`, {
          method: 'POST'
        });
        showToast('User logged out from all sessions!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to force logout', 'error');
      }
    });
  }
}

// ============================================================
// ADMIN PROFILE SETTINGS
// ============================================================
async function initAdminProfileSettings() {
  // Load profile
  try {
    const profile = await fetchAPI('/settings/profile');
    document.getElementById('admin-name').value = profile.name || '';
    document.getElementById('admin-email').value = profile.email || '';
    document.getElementById('enable-2fa').checked = profile.twoFactorEnabled || false;
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
  
  // Save profile form
  const profileForm = document.getElementById('admin-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const data = {
        name: document.getElementById('admin-name').value,
        email: document.getElementById('admin-email').value
      };
      
      try {
        await fetchAPI('/settings/profile', {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        showToast('Profile updated!', 'success');
        
        // Update sidebar name
        const sidebarName = document.getElementById('sidebar-user-name');
        if (sidebarName) sidebarName.textContent = data.name;
      } catch (err) {
        showToast(err.message || 'Failed to update profile', 'error');
      }
    });
  }
  
  // Change password form
  const passwordForm = document.getElementById('change-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      
      if (!currentPassword || !newPassword) {
        showToast('Please fill in both fields', 'error');
        return;
      }
      
      if (newPassword.length < 8) {
        showToast('New password must be at least 8 characters', 'error');
        return;
      }
      
      try {
        await fetchAPI('/settings/profile/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        showToast('Password changed! Please login again.', 'success');
        setTimeout(() => {
          sessionStorage.clear();
          window.location.href = 'login.html';
        }, 2000);
      } catch (err) {
        showToast(err.message || 'Failed to change password', 'error');
      }
    });
  }
  
  // Logout all sessions
  const logoutAllBtn = document.getElementById('logout-all-sessions');
  if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', async () => {
      if (!confirm('This will log you out from all other devices. Continue?')) return;
      
      try {
        const user = auth.getUser() || JSON.parse(sessionStorage.getItem('user') || '{}');
        const userId = user._id;
        if (!userId) { showToast('Unable to identify session. Please refresh.', 'error'); return; }
        await fetchAPI(`/settings/users/${userId}/force-logout`, {
          method: 'POST'
        });
        showToast('Logged out from all other sessions', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to logout sessions', 'error');
      }
    });
  }
  
  // Load active sessions (placeholder)
  const sessionsList = document.getElementById('active-sessions-list');
  if (sessionsList) {
    sessionsList.innerHTML = `
      <div class="session-item current">
        <div class="session-info">
          <strong>Current Session</strong>
          <small>This browser • Active now</small>
        </div>
        <span class="badge active">Current</span>
      </div>
    `;
  }
}

function renderTable(tableId, data, columns) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" class="empty-state">No data available</td></tr>`;
    return;
  }

  data.forEach(item => {
    const row = document.createElement('tr');
    columns.forEach(column => {
      const cell = document.createElement('td');
      let value = item;
      for (const key of column.split('.')) {
        value = value ? value[key] : '';
      }
      cell.textContent = value;
      row.appendChild(cell);
    });
    // Add actions cell
    const actionsCell = document.createElement('td');
    actionsCell.innerHTML = `<button class="btn ghost btn-sm">Edit</button> <button class="btn ghost btn-sm">Delete</button>`;
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
  
  // Add click handler for table actions
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit') {
      loadSection('unit-modify');
      setTimeout(() => {
        const select = document.getElementById('modify-unit-select');
        if (select) {
          select.value = id;
          select.dispatchEvent(new Event('change'));
        }
      }, 100);
    } else if (action === 'toggle-status') {
      toggleUnitStatus(id);
    }
  });
}


// ============================================================
// UNITS MODULE (API Integration)
// ============================================================

async function initUnitAdd() {
  const form = document.getElementById('unit-add-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const formData = new FormData(form);
    const data = {
      name: formData.get('unitName'),
      shortName: formData.get('unitShort')
    };

    if (!data.name) {
      showToast('Unit name is required', 'error');
      return;
    }

    if (!data.shortName) {
      showToast('Short name is required', 'error');
      return;
    }

    try {
      await fetchAPI('/units', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Unit added successfully', 'success');
      loadSection('unit-list');
    } catch (err) {
      showToast(err.message || 'Failed to add unit', 'error');
    }
  });

  const cancelBtn = document.getElementById('unit-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('unit-list'));
  }
}

async function initUnitModify() {
  const form = document.getElementById('unit-modify-form');
  const select = document.getElementById('modify-unit-select');

  if (!form || !select) return;

  // Load units from API
  try {
    const res = await fetchAPI('/units');
    const units = res.units || [];
    
    select.innerHTML = '<option value="">-- Select a unit --</option>' +
      units.map(u => `<option value="${u._id}">${escapeHtml(u.name)} (${escapeHtml(u.shortName)})</option>`).join('');

    // Store units for form population
    select._units = units;
  } catch (err) {
    showToast('Failed to load units', 'error');
    return;
  }

  select.addEventListener('change', () => {
    const units = select._units || [];
    const unit = units.find(u => u._id === select.value);
    if (unit) {
      document.getElementById('modify-unitName').value = unit.name || '';
      document.getElementById('modify-unitShort').value = unit.shortName || '';
    } else {
      document.getElementById('modify-unitName').value = '';
      document.getElementById('modify-unitShort').value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const unitId = select.value;
    if (!unitId) {
      showToast('Please select a unit', 'error');
      return;
    }

    const data = {
      name: document.getElementById('modify-unitName').value,
      shortName: document.getElementById('modify-unitShort').value
    };

    try {
      await fetchAPI(`/units/${unitId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Unit updated successfully', 'success');
      loadSection('unit-list');
    } catch (err) {
      showToast(err.message || 'Failed to update unit', 'error');
    }
  });

  const cancelBtn = document.getElementById('unit-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('unit-list'));
  }
}

async function initUnitList() {
  await renderUnitTable();

  // Search functionality
  const searchInput = document.getElementById('unit-search');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => renderUnitTable(searchInput.value), 300);
    });
  }
}

async function renderUnitTable(search = '') {
  const tbody = document.querySelector('#unit-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="3" class="loading">Loading units...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    
    const res = await fetchAPI(`/units?${params.toString()}`);
    const units = res.units || [];

    if (units.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No units found. <a href="#" onclick="loadSection('unit-add')">Add your first unit</a></td></tr>`;
      return;
    }

    tbody.innerHTML = units.map(unit => `
      <tr>
        <td>${escapeHtml(unit.name)}</td>
        <td>${escapeHtml(unit.shortName)}</td>
        <td class="actions">
          <button class="btn ghost btn-sm" data-action="edit" data-id="${unit._id}">Edit</button>
          <button class="btn ghost btn-sm ${unit.isActive ? 'danger' : 'success'}" data-action="toggle-status" data-id="${unit._id}">
            ${unit.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn ghost btn-sm danger" data-action="delete" data-id="${unit._id}">Delete</button>
        </td>
      </tr>
    `).join('');

    // Add click handlers
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'edit') {
        loadSection('unit-modify');
        setTimeout(() => {
          const select = document.getElementById('modify-unit-select');
          if (select) {
            select.value = id;
            select.dispatchEvent(new Event('change'));
          }
        }, 100);
      } else if (action === 'toggle-status') {
        await toggleUnitStatus(id);
      } else if (action === 'delete') {
        if (confirm('Are you sure you want to delete this unit?')) {
          await deleteUnit(id);
        }
      }
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="error">Failed to load units: ${err.message}</td></tr>`;
  }
}

async function toggleUnitStatus(id) {
  try {
    await fetchAPI(`/units/${id}/status`, { method: 'PUT' });
    showToast('Unit status updated', 'success');
    await renderUnitTable();
  } catch (err) {
    showToast(err.message || 'Failed to update unit status', 'error');
  }
}

async function deleteUnit(id) {
  try {
    await fetchAPI(`/units/${id}`, { method: 'DELETE' });
    showToast('Unit deleted successfully', 'success');
    await renderUnitTable();
  } catch (err) {
    showToast(err.message || 'Failed to delete unit', 'error');
  }
}

// ============================================================
// LOGISTICS/TRANSPORTER MODULE (API Integration)
// ============================================================

async function initLogisticsAdd() {
  const form = document.getElementById('logistics-add-form');
  const saveBtn = document.getElementById('logistics-add-save');
  
  if (!form) {
    return;
  }

  // Use button click instead of form submit to avoid browser caching issues
  async function handleSave() {
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

    try {
      const result = await fetchAPI('/logistics', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Transporter added successfully', 'success');
      loadSection('logistics-list');
    } catch (err) {
      showToast(err.message || 'Failed to add transporter', 'error');
    }
  }

  // Attach to save button click
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  const cancelBtn = document.getElementById('logistics-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('logistics-list'));
  }
}

async function initLogisticsModify() {
  const form = document.getElementById('logistics-modify-form');
  const select = document.getElementById('modify-trans-select');

  if (!form || !select) return;

  // Load transporters from API
  try {
    const res = await fetchAPI('/logistics');
    const transporters = res.transporters || [];
    
    select.innerHTML = '<option value="">-- Select a transporter --</option>' +
      transporters.map(t => `<option value="${t._id}">${escapeHtml(t.name)}</option>`).join('');

    // Store transporters for form population
    select._transporters = transporters;
  } catch (err) {
    showToast('Failed to load transporters', 'error');
    return;
  }

  select.addEventListener('change', () => {
    const transporters = select._transporters || [];
    const trans = transporters.find(t => t._id === select.value);
    if (!trans) return;

    form.querySelector('#modify-trans-name').value = trans.name || '';
    form.querySelector('#modify-trans-gstin').value = trans.gstin || '';
    form.querySelector('#modify-trans-contact').value = trans.phone || trans.contactPerson || '';
    form.querySelector('#modify-trans-email').value = trans.email || '';
    form.querySelector('#modify-trans-city').value = trans.address?.city || '';
    form.querySelector('#modify-trans-state').value = trans.address?.state || '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!select.value) {
      showToast('Please select a transporter', 'error');
      return;
    }

    const formData = new FormData(form);
    const data = {
      name: formData.get('transporterName'),
      contactPerson: formData.get('contact'),
      phone: formData.get('contact'),
      email: formData.get('email'),
      gstin: formData.get('gstin'),
      address: {
        city: formData.get('city'),
        state: formData.get('state')
      }
    };

    try {
      await fetchAPI(`/logistics/${select.value}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Transporter updated successfully', 'success');
      loadSection('logistics-list');
    } catch (err) {
      showToast(err.message || 'Failed to update transporter', 'error');
    }
  });

  const cancelBtn = document.getElementById('logistics-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('logistics-list'));
  }
}

async function initLogisticsList() {
  await renderTransporterTable();

  const searchInput = document.getElementById('trans-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      renderTransporterTable(searchInput.value.trim());
    }, 300));
  }
}

async function renderTransporterTable(searchQuery = '') {
  const tbody = document.querySelector('#trans-table tbody');
  if (!tbody) return;

  try {
    const res = await fetchAPI(`/logistics?search=${encodeURIComponent(searchQuery)}`);
    const transporters = res.transporters || [];

    if (transporters.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No transporters found</td></tr>';
      return;
    }

    tbody.innerHTML = transporters.map(t => `
      <tr class="${!t.isActive ? 'inactive-row' : ''}">
        <td>${escapeHtml(t.name)}</td>
        <td>${escapeHtml(t.contactPerson || t.phone || '')}</td>
        <td>${escapeHtml(t.email || '')}</td>
        <td>${escapeHtml(t.address?.city || '')}</td>
        <td>${escapeHtml(t.address?.pincode || '')}</td>
        <td>${escapeHtml(t.gstin || '')}</td>
        <td style="white-space:nowrap">
          <button class="action-btn edit" data-action="edit" data-id="${t._id}">Edit</button>
          <button class="action-btn ${t.isActive ? 'delete' : 'view'}" 
                  data-action="toggle-status" data-id="${t._id}" data-active="${t.isActive}">
            ${t.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');

    // Remove existing listener and add new one
    const newTbody = tbody.cloneNode(true);
    tbody.parentNode.replaceChild(newTbody, tbody);
    
    newTbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'edit') {
        loadSection('logistics-modify');
        setTimeout(() => {
          const select = document.getElementById('modify-trans-select');
          if (select) {
            select.value = id;
            select.dispatchEvent(new Event('change'));
          }
        }, 200);
      } else if (action === 'toggle-status') {
        const isActive = btn.dataset.active === 'true';
        await toggleTransporterStatus(id, !isActive);
      }
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--error)">Failed to load transporters</td></tr>';
  }
}

async function toggleTransporterStatus(id, newStatus) {
  try {
    await fetchAPI(`/logistics/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: newStatus })
    });
    showToast(`Transporter ${newStatus ? 'activated' : 'deactivated'}`, 'success');
    renderTransporterTable();
  } catch (err) {
    showToast(err.message || 'Failed to update status', 'error');
  }
}

// ============================================================
// STOCK MANAGEMENT (Production-Ready API Integration)
// ============================================================

// Helper function to generate serial inputs based on quantity
function generateSerialInputs(container, quantity, prefix = 'SN') {
  if (!container) return;
  
  container.innerHTML = '';
  
  for (let i = 0; i < quantity; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'serial-input-wrapper';
    wrapper.innerHTML = `
      <span class="serial-number">#${i + 1}</span>
      <input type="text" 
             class="serial-input" 
             name="serials[]" 
             placeholder="Enter serial number ${i + 1}"
             data-index="${i}"
             autocomplete="off" />
      <span class="serial-status-icon"></span>
    `;
    container.appendChild(wrapper);
  }
  
  // Add input event listeners for validation
  container.querySelectorAll('.serial-input').forEach(input => {
    input.addEventListener('input', () => validateSerialInputs(container));
    input.addEventListener('blur', () => {
      input.value = input.value.trim().toUpperCase();
      validateSerialInputs(container);
    });
  });
}

// Validate serial inputs for duplicates and completeness
function validateSerialInputs(container) {
  if (!container) return { valid: false, count: 0, filled: 0 };
  
  const inputs = container.querySelectorAll('.serial-input');
  const values = [];
  let filled = 0;
  let hasDuplicates = false;
  
  inputs.forEach(input => {
    const value = input.value.trim().toUpperCase();
    const wrapper = input.closest('.serial-input-wrapper');
    const statusIcon = wrapper?.querySelector('.serial-status-icon');
    
    // Reset classes
    input.classList.remove('filled', 'duplicate');
    if (statusIcon) statusIcon.textContent = '';
    
    if (value) {
      filled++;
      
      // Check for duplicate
      if (values.includes(value)) {
        input.classList.add('duplicate');
        if (statusIcon) statusIcon.textContent = '⚠️';
        hasDuplicates = true;
      } else {
        input.classList.add('filled');
        if (statusIcon) statusIcon.textContent = '✓';
      }
      values.push(value);
    }
  });
  
  // Update status badge
  const statusBadge = container.closest('.serial-number-section')?.querySelector('[id$="-serial-status"]');
  if (statusBadge) {
    statusBadge.textContent = `${filled} / ${inputs.length} filled`;
    statusBadge.className = 'badge ' + (filled === inputs.length && !hasDuplicates ? 'complete' : 'incomplete');
  }
  
  return { valid: filled === inputs.length && !hasDuplicates, count: inputs.length, filled, hasDuplicates };
}

// Get all serial numbers from inputs
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
  
  // Parse serials (support comma, newline, semicolon separation)
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

  // Get form elements - Updated for cascading dropdown
  const productNameSelect = form.querySelector('#sp-productName');
  const productSelect = form.querySelector('#sp-productId'); // Now the model/variant dropdown
  const serialSection = document.getElementById('supplier-serial-section');
  const serialInputsContainer = document.getElementById('supplier-serial-inputs');
  const quantityInput = form.querySelector('#sp-quantity');
  const serialCountEl = document.getElementById('supplier-serial-count');
  const serialHintEl = document.querySelector('#sp-serial-hint');
  const serialStatusEl = document.getElementById('supplier-serial-status');

  // Company dropdown and auto-fill elements
  const companySelect = form.querySelector('#sp-companySelect');
  const companyNameInput = form.querySelector('#sp-companyName');
  const customerPhoneInput = form.querySelector('#sp-customerPhone');
  const customerEmailInput = form.querySelector('#sp-customerEmail');
  const customerAddressInput = form.querySelector('#sp-customerAddress');
  const cityInput = form.querySelector('#sp-city');
  const stateInput = form.querySelector('#sp-state');
  const pincodeInput = form.querySelector('#sp-pincode');

  let currentPolicy = null; // Store current product's serial policy
  let companiesCache = []; // Cache loaded companies

  // Load companies and populate dropdown
  async function loadCompanies() {
    try {
      const response = await fetchAPI('/companies?limit=100');
      companiesCache = response.companies || [];
      if (companySelect) {
        companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
          companiesCache.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
      // Don't show error toast - companies are optional
    }
  }

  // Auto-fill company details when a company is selected
  function handleCompanySelect() {
    if (!companySelect) return;

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

  // Initialize company dropdown
  await loadCompanies();
  handleCompanySelect();

  // ==========================================
  // CASCADING DROPDOWN: Product Name → Model
  // ==========================================
  
  // Load unique product names into the first dropdown
  async function loadProductNames() {
    try {
      const productNames = await fetchAPI('/items/product-names');
      if (productNameSelect) {
        productNameSelect.innerHTML = '<option value="">-- Select Product Name --</option>' +
          productNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        _initTomSelect(productNameSelect, 'Type product name…');
      }
    } catch (err) {
      console.error('Failed to load product names:', err);
      showToast('Failed to load products', 'error');
    }
  }
  
  // Load models/variants for selected product name
  async function loadModelsForProduct(productName) {
    if (!productSelect) return;
    
    if (!productName) {
      productSelect.innerHTML = '<option value="">-- Select Product Name First --</option>';
      productSelect.disabled = true;
      _initTomSelect(productSelect, 'Select model / short name…');
      return;
    }
    
    try {
      productSelect.innerHTML = '<option value="">Loading models...</option>';
      productSelect.disabled = true;
      
      const models = await fetchAPI(`/items/models-by-name/${encodeURIComponent(productName)}`);
      
      if (models.length === 0) {
        productSelect.innerHTML = '<option value="">-- No models found --</option>';
        productSelect.disabled = true;
        _initTomSelect(productSelect, 'Select model / short name…');
        return;
      }
      
      productSelect.innerHTML = '<option value="">-- Select Model --</option>' +
        models.map(m => `<option value="${m._id}" 
          data-serial-policy='${JSON.stringify(m.serialPolicy || { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false })}'
          data-product-name="${escapeHtml(m.name)}"
          data-short-name="${escapeHtml(m.shortName || '')}"
          data-warranty="${escapeHtml(m.warranty || '')}"
          data-seller-warranty="${escapeHtml(m.defaultSellerWarranty || '')}"
        >${escapeHtml(m.shortName || m.name)}${m.shortName ? ` (${escapeHtml(m.name)})` : ''}</option>`).join('');
      
      productSelect.disabled = false;
      _initTomSelect(productSelect, 'Select model / short name…');
    } catch (err) {
      console.error('Failed to load models:', err);
      productSelect.innerHTML = '<option value="">-- Error loading models --</option>';
      productSelect.disabled = true;
    }
  }
  
  // Initialize product name dropdown
  await loadProductNames();
  
  // Handle product name selection to load models
  if (productNameSelect) {
    productNameSelect.addEventListener('change', async () => {
      const selectedName = productNameSelect.value;
      await loadModelsForProduct(selectedName);
      
      // Reset quantity and serial fields when product name changes
      if (quantityInput) quantityInput.value = '';
      if (serialSection) serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
    });
  }
  // ==========================================
  // END CASCADING DROPDOWN
  // ==========================================

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

  // Dynamic serial fields based on serialPolicy and quantity
  function updateSerialFields() {
    if (!serialSection || !productSelect || !quantityInput) return;

    const selectedOption = productSelect.selectedOptions[0];
    currentPolicy = selectedOption?.dataset?.serialPolicy 
      ? JSON.parse(selectedOption.dataset.serialPolicy) 
      : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };
    
    const qty = parseInt(quantityInput.value) || 0;

    // Update hint
    updateSerialHint(currentPolicy);

    // Update count display
    if (serialCountEl) {
      serialCountEl.innerHTML = `Enter <strong>${qty}</strong> serial number${qty !== 1 ? 's' : ''}`;
    }

    // RULE: Hide serial section if serial NOT enabled OR quantity is 0/invalid
    if (!currentPolicy.enableSerial) {
      serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      return;
    }

    // RULE: Quantity must be positive integer
    if (qty <= 0 || !Number.isInteger(qty)) {
      serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      return;
    }

    // Show serial section
    serialSection.style.display = 'block';

    // RULE: Generate exactly 'qty' serial input fields
    const productName = selectedOption?.dataset?.productName || 'SN';
    const prefix = productName.substring(0, 3).toUpperCase();
    generateSerialInputs(serialInputsContainer, qty, prefix);
    
    // Update initial status
    if (serialStatusEl) {
      serialStatusEl.textContent = `0 / ${qty} filled`;
      serialStatusEl.className = 'badge incomplete';
    }
  }

  // Listen for product selection and quantity changes
  if (productSelect) {
    productSelect.addEventListener('change', () => {
      // Reset quantity when product changes
      if (quantityInput) quantityInput.value = '';
      // Auto-fill purchase warranty from product default
      const opt = productSelect.selectedOptions[0];
      const warrantyEl = form.querySelector('#sp-warrantyPeriod');
      if (warrantyEl && opt) warrantyEl.value = opt.dataset.warranty || '';
      updateSerialFields();
    });
  }
  
  if (quantityInput) {
    quantityInput.addEventListener('input', updateSerialFields);
    // Prevent non-integer input
    quantityInput.addEventListener('change', () => {
      const val = parseInt(quantityInput.value);
      if (val <= 0 || isNaN(val)) {
        quantityInput.value = '';
      } else {
        quantityInput.value = Math.floor(val); // Ensure integer
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

  // Form submission with full validation
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const productId = productSelect?.value;
    const quantity = parseInt(quantityInput?.value);
    const serialNumbers = getSerialNumbers(serialInputsContainer);

    // RULE: Product is required
    if (!productId) {
      showToast('Please select a product', 'error');
      return;
    }

    // RULE: Quantity must be a positive integer
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
      showToast('Quantity must be a positive whole number', 'error');
      return;
    }

    // Get serial policy
    const selectedOption = productSelect?.querySelector(`option[value="${productId}"]`);
    const policy = selectedOption?.dataset?.serialPolicy 
      ? JSON.parse(selectedOption.dataset.serialPolicy) 
      : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };

    // RULE: If serials enabled and required, validate
    if (policy.enableSerial && policy.requireSerialOnIN) {
      // RULE: Serial count must exactly equal quantity
      if (serialNumbers.length !== quantity) {
        showToast(`You must enter exactly ${quantity} serial number${quantity !== 1 ? 's' : ''}`, 'error');
        return;
      }

      // RULE: No empty serial fields
      const validation = validateSerialInputs(serialInputsContainer);
      if (!validation.valid) {
        if (validation.hasDuplicates) {
          showToast('Duplicate serial numbers found! Each serial must be unique.', 'error');
        } else {
          showToast(`Please fill all ${quantity} serial number fields`, 'error');
        }
        return;
      }

      // RULE: Pre-validate serials against backend (check if already exist globally)
      try {
        const validateResult = await fetchAPI('/stock/validate-serials', {
          method: 'POST',
          body: JSON.stringify({ serialNumbers, productId, action: 'IN' })
        });
        
        if (!validateResult.valid) {
          if (validateResult.alreadyUsed?.length > 0) {
            showToast(`Serial number(s) already exist in system: ${validateResult.alreadyUsed.join(', ')}`, 'error');
          } else if (validateResult.internalDuplicates?.length > 0) {
            showToast(`Duplicate serial(s) in your entry: ${validateResult.internalDuplicates.join(', ')}`, 'error');
          }
          return;
        }
      } catch (err) {
        console.error('Serial validation error:', err);
        // Continue anyway - backend will validate
      }
    }

    // Collect supplier data
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

    // Submit to backend API
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
          transaction: {
            supplierType:  formData.get('supplierType'),
            paymentMethod: formData.get('paymentMethod'),
            transactionId: formData.get('transactionId'),
            transactionDate: formData.get('supplyDate'),
            warrantyPeriod: formData.get('warrantyPeriod') || undefined,
            deliveredBy:   formData.get('deliveredBy')
          },
          condition: formData.get('condition'),
          modelVariant: shortName // Send shortName as modelVariant
        })
      });
      
      showToast('Stock IN recorded successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      if (serialSection) serialSection.style.display = 'none';
      if (serialHintEl) serialHintEl.style.display = 'none';
      loadSection('stock-list');
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
    cancelBtn.addEventListener('click', () => loadSection('stock-list'));
  }
}

async function initStockBuyer() {
  const form = document.getElementById('stock-Buyer-form') || document.getElementById('stock-buyer-form');
  if (!form) return;

  // Get form elements - Updated for cascading dropdown
  const productNameSelect = form.querySelector('#by-productName');
  const productSelect = form.querySelector('#by-productId'); // Now the model/variant dropdown
  const serialSection = document.getElementById('buyer-serial-section');
  const serialInputsContainer = document.getElementById('buyer-serial-inputs');
  const availableSerialsContainer = document.getElementById('buyer-serials-list');
  const quantityInput = form.querySelector('#by-quantity');
  const serialCountEl = document.getElementById('buyer-serial-count');
  const serialHintEl = form.querySelector('#by-serial-hint');
  const stockInfoEl = form.querySelector('#by-stock-info');
  const serialStatusEl = document.getElementById('buyer-serial-status');

  // Company dropdown and auto-fill elements
  const companySelect = form.querySelector('#by-companySelect');
  const companyNameInput = form.querySelector('#by-companyName');
  const customerPhoneInput = form.querySelector('#by-customerPhone');
  const customerEmailInput = form.querySelector('#by-customerEmail');
  const customerAddressInput = form.querySelector('#by-customerAddress');
  const cityInput = form.querySelector('#by-city');
  const stateInput = form.querySelector('#by-state');
  const pincodeInput = form.querySelector('#by-pincode');

  let availableSerials = []; // Store available serials for the selected product
  let selectedSerials = new Set(); // Track selected serials
  let currentPolicy = null; // Store current product's serial policy
  let currentStock = 0; // Store current product stock
  let companiesCache = []; // Cache loaded companies

  // Load companies and populate dropdown
  async function loadCompanies() {
    try {
      const response = await fetchAPI('/companies?limit=100');
      companiesCache = response.companies || [];
      if (companySelect) {
        companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
          companiesCache.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
      // Don't show error toast - companies are optional
    }
  }

  // Auto-fill company details when a company is selected
  function handleCompanySelect() {
    if (!companySelect) return;

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

  // Initialize company dropdown
  await loadCompanies();
  handleCompanySelect();

  // ==========================================
  // CASCADING DROPDOWN: Product Name → Model
  // ==========================================
  
  // Load unique product names into the first dropdown
  async function loadProductNames() {
    try {
      const productNames = await fetchAPI('/items/product-names');
      if (productNameSelect) {
        productNameSelect.innerHTML = '<option value="">-- Select Product Name --</option>' +
          productNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        _initTomSelect(productNameSelect, 'Type product name…');
      }
    } catch (err) {
      console.error('Failed to load product names:', err);
      showToast('Failed to load products', 'error');
    }
  }
  
  // Load models/variants for selected product name (with stock info)
  async function loadModelsForProduct(productName) {
    if (!productSelect) return;
    
    if (!productName) {
      productSelect.innerHTML = '<option value="">-- Select Product Name First --</option>';
      productSelect.disabled = true;
      if (stockInfoEl) stockInfoEl.style.display = 'none';
      _initTomSelect(productSelect, 'Select model / short name…');
      return;
    }
    
    try {
      productSelect.innerHTML = '<option value="">Loading models...</option>';
      productSelect.disabled = true;
      
      const models = await fetchAPI(`/items/models-by-name/${encodeURIComponent(productName)}`);
      
      if (models.length === 0) {
        productSelect.innerHTML = '<option value="">-- No models found --</option>';
        productSelect.disabled = true;
        _initTomSelect(productSelect, 'Select model / short name…');
        return;
      }
      
      productSelect.innerHTML = '<option value="">-- Select Model --</option>' +
        models.map(m => `<option value="${m._id}" 
          data-serial-policy='${JSON.stringify(m.serialPolicy || { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false })}'
          data-stock="${m.quantity || 0}"
          data-product-name="${escapeHtml(m.name)}"
          data-short-name="${escapeHtml(m.shortName || '')}"
          data-warranty="${escapeHtml(m.warranty || '')}"
          data-seller-warranty="${escapeHtml(m.defaultSellerWarranty || '')}"
        >${escapeHtml(m.shortName || m.name)}${m.shortName ? ` (${escapeHtml(m.name)})` : ''} - Stock: ${m.quantity || 0}</option>`).join('');
      
      productSelect.disabled = false;
      _initTomSelect(productSelect, 'Select model / short name…');
    } catch (err) {
      console.error('Failed to load models:', err);
      productSelect.innerHTML = '<option value="">-- Error loading models --</option>';
      productSelect.disabled = true;
    }
  }
  
  // Initialize product name dropdown
  await loadProductNames();
  
  // Handle product name selection to load models
  if (productNameSelect) {
    productNameSelect.addEventListener('change', async () => {
      const selectedName = productNameSelect.value;
      await loadModelsForProduct(selectedName);
      
      // Reset quantity and serial fields when product name changes
      if (quantityInput) quantityInput.value = '';
      if (serialSection) serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      if (availableSerialsContainer) availableSerialsContainer.innerHTML = '';
      if (stockInfoEl) stockInfoEl.style.display = 'none';
      selectedSerials.clear();
      availableSerials = [];
    });
  }
  // ==========================================
  // END CASCADING DROPDOWN
  // ==========================================

  // Update serial hint based on policy
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

  // Load available serials for a product (serials currently IN stock)
  async function loadAvailableSerials(productId) {
    if (!productId || !availableSerialsContainer) return;
    
    try {
      const data = await fetchAPI(`/stock/serials/${productId}?status=available`);
      availableSerials = data.serials || [];
      
      if (availableSerials.length === 0) {
        availableSerialsContainer.innerHTML = '<p class="text-muted" style="padding: 10px; color: #6b7280;">No serial numbers available for this product. Serials may not have been recorded during Stock IN.</p>';
        return;
      }
      
      availableSerialsContainer.innerHTML = `
        <div class="available-serials-header" style="margin-bottom: 8px; font-size: 0.85rem; color: #4b5563;">
          <strong>${availableSerials.length}</strong> serial(s) available in stock. Click to select:
        </div>
        <div class="available-serials-grid" style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${availableSerials.map(serial => `
            <span class="available-serial-item ${selectedSerials.has(serial) ? 'selected' : ''}" data-serial="${serial}">
              <span class="serial-check">✓</span>
              ${escapeHtml(serial)}
            </span>
          `).join('')}
        </div>
      `;
      
      // Add click handlers for serial selection
      availableSerialsContainer.querySelectorAll('.available-serial-item').forEach(item => {
        item.addEventListener('click', () => {
          const serial = item.dataset.serial;
          const qty = parseInt(quantityInput?.value) || 0;
          
          if (selectedSerials.has(serial)) {
            // Deselect
            selectedSerials.delete(serial);
            item.classList.remove('selected');
          } else if (selectedSerials.size < qty) {
            // Select if within limit
            selectedSerials.add(serial);
            item.classList.add('selected');
          } else {
            showToast(`Can only select ${qty} serial number${qty !== 1 ? 's' : ''}. Change quantity to select more.`, 'warning');
            return;
          }
          
          // Update input fields with selected serials
          updateInputsFromSelection();
        });
      });
    } catch (err) {
      console.error('Failed to load available serials:', err);
      availableSerialsContainer.innerHTML = '<p class="text-muted" style="padding: 10px; color: #dc2626;">Could not load available serials. Check console for details.</p>';
    }
  }
  
  // Update input fields from selected serials
  function updateInputsFromSelection() {
    if (!serialInputsContainer) return;
    
    const inputs = serialInputsContainer.querySelectorAll('.serial-input');
    const serialsArray = Array.from(selectedSerials);
    
    inputs.forEach((input, index) => {
      input.value = serialsArray[index] || '';
    });
    
    validateSerialInputs(serialInputsContainer);
  }

  // Dynamic serial fields based on serialPolicy and quantity
  async function updateSerialFields() {
    if (!serialSection || !productSelect || !quantityInput) return;

    const selectedOption = productSelect.selectedOptions[0];
    currentPolicy = selectedOption?.dataset?.serialPolicy 
      ? JSON.parse(selectedOption.dataset.serialPolicy) 
      : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };
    
    currentStock = parseInt(selectedOption?.dataset?.stock) || 0;
    const qty = parseInt(quantityInput.value) || 0;
    const productId = selectedOption?.value;

    // Update hint
    updateSerialHint(currentPolicy);

    // Update stock info
    if (stockInfoEl && productId) {
      stockInfoEl.style.display = 'block';
      stockInfoEl.innerHTML = `📊 Available Stock: <strong>${currentStock}</strong> units`;
      stockInfoEl.style.color = currentStock > 0 ? '#059669' : '#dc2626';
    }

    // Update count display
    if (serialCountEl) {
      serialCountEl.innerHTML = `Enter <strong>${qty}</strong> serial number${qty !== 1 ? 's' : ''}`;
    }

    // Reset selected serials when quantity changes
    selectedSerials.clear();
    
    // Update available serials list to reflect cleared selection
    if (availableSerialsContainer) {
      availableSerialsContainer.querySelectorAll('.available-serial-item').forEach(item => {
        item.classList.remove('selected');
      });
    }

    // RULE: Hide serial section if serial NOT enabled OR quantity is 0/invalid
    if (!currentPolicy.enableSerial) {
      serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      return;
    }

    // RULE: Quantity must be positive integer
    if (qty <= 0 || !Number.isInteger(qty)) {
      serialSection.style.display = 'none';
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      return;
    }

    // RULE: Quantity cannot exceed available stock
    if (qty > currentStock) {
      showToast(`Quantity (${qty}) exceeds available stock (${currentStock})`, 'warning');
    }

    // Show serial section
    serialSection.style.display = 'block';

    // RULE: Generate exactly 'qty' serial input fields
    generateSerialInputs(serialInputsContainer, qty, 'SN');
    
    // Update initial status
    if (serialStatusEl) {
      serialStatusEl.textContent = `0 / ${qty} filled`;
      serialStatusEl.className = 'badge incomplete';
    }
    
    // Load available serials for selection (only for Stock OUT)
    if (productId) {
      await loadAvailableSerials(productId);
    }
  }

  // Listen for product selection and quantity changes
  if (productSelect) {
    productSelect.addEventListener('change', () => {
      // Reset quantity when product changes
      if (quantityInput) quantityInput.value = '';
      selectedSerials.clear();
      // Auto-fill seller warranty from product default
      const opt = productSelect.selectedOptions[0];
      const sellerWarrantyEl = form.querySelector('#by-sellerWarrantyPeriod');
      if (sellerWarrantyEl && opt) sellerWarrantyEl.value = opt.dataset.sellerWarranty || '';
      updateSerialFields();
    });
  }
  
  if (quantityInput) {
    quantityInput.addEventListener('input', updateSerialFields);
    // Prevent non-integer and excessive input
    quantityInput.addEventListener('change', () => {
      const val = parseInt(quantityInput.value);
      if (val <= 0 || isNaN(val)) {
        quantityInput.value = '';
      } else {
        quantityInput.value = Math.floor(val); // Ensure integer
        // Warn if exceeds stock
        if (val > currentStock && currentStock > 0) {
          showToast(`Warning: Quantity exceeds available stock (${currentStock})`, 'warning');
        }
      }
      updateSerialFields();
    });
  }

  // Clear all button
  const clearBtn = document.getElementById('buyer-clear-serials');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectedSerials.clear();
      serialInputsContainer?.querySelectorAll('.serial-input').forEach(input => {
        input.value = '';
        input.classList.remove('filled', 'duplicate', 'error');
      });
      availableSerialsContainer?.querySelectorAll('.available-serial-item').forEach(item => {
        item.classList.remove('selected');
      });
      validateSerialInputs(serialInputsContainer);
    });
  }

  // Form submission with full validation
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productId = productSelect?.value;
    const quantity = parseInt(quantityInput?.value);
    const serialNumbers = getSerialNumbers(serialInputsContainer);

    // RULE: Product is required
    if (!productId) {
      showToast('Please select a product', 'error');
      return;
    }

    // RULE: Quantity must be a positive integer
    if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
      showToast('Quantity must be a positive whole number', 'error');
      return;
    }

    // RULE: Quantity cannot exceed stock
    if (quantity > currentStock) {
      showToast(`Insufficient stock. Available: ${currentStock}, Requested: ${quantity}`, 'error');
      return;
    }

    // Get serial policy
    const selectedOption = productSelect?.querySelector(`option[value="${productId}"]`);
    const policy = selectedOption?.dataset?.serialPolicy 
      ? JSON.parse(selectedOption.dataset.serialPolicy) 
      : { enableSerial: false, requireSerialOnIN: false, requireSerialOnOUT: false };

    // RULE: If serials enabled and required, validate
    if (policy.enableSerial && policy.requireSerialOnOUT) {
      // RULE: Serial count must exactly equal quantity
      if (serialNumbers.length !== quantity) {
        showToast(`You must enter exactly ${quantity} serial number${quantity !== 1 ? 's' : ''}`, 'error');
        return;
      }

      // RULE: No empty serial fields and no duplicates
      const validation = validateSerialInputs(serialInputsContainer);
      if (!validation.valid) {
        if (validation.hasDuplicates) {
          showToast('Duplicate serial numbers found! Each serial must be unique.', 'error');
        } else {
          showToast(`Please fill all ${quantity} serial number fields`, 'error');
        }
        return;
      }

      // RULE: Pre-validate serials against backend (check if available for OUT)
      try {
        const validateResult = await fetchAPI('/stock/validate-serials', {
          method: 'POST',
          body: JSON.stringify({ serialNumbers, productId, action: 'OUT' })
        });
        
        if (!validateResult.valid) {
          if (validateResult.notInSystem?.length > 0) {
            showToast(`Serial(s) not found in system: ${validateResult.notInSystem.join(', ')}`, 'error');
          } else if (validateResult.notAvailable?.length > 0) {
            showToast(`Serial(s) already out of stock: ${validateResult.notAvailable.join(', ')}`, 'error');
          } else if (validateResult.internalDuplicates?.length > 0) {
            showToast(`Duplicate serial(s): ${validateResult.internalDuplicates.join(', ')}`, 'error');
          }
          return;
        }
      } catch (err) {
        console.error('Serial validation error:', err);
        // Continue anyway - backend will validate
      }
    }

    // Collect buyer form data
    const formData = new FormData(form);
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

    // Submit to backend API
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
          transaction: {
            paymentMethod: formData.get('paymentMethod'),
            transactionId: formData.get('transactionId'),
            transactionDate: formData.get('purchaseDate'),
            sellerWarrantyPeriod: formData.get('sellerWarrantyPeriod') || undefined,
            receivedBy:  formData.get('receivedBy')
          },
          condition: formData.get('condition'),
          modelVariant: shortName // Send shortName as modelVariant
        })
      });
      
      showToast('Stock OUT recorded successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      if (serialInputsContainer) serialInputsContainer.innerHTML = '';
      if (serialSection) serialSection.style.display = 'none';
      if (serialHintEl) serialHintEl.style.display = 'none';
      if (stockInfoEl) stockInfoEl.style.display = 'none';
      selectedSerials.clear();
      loadSection('stock-list');
    } catch (err) {
      showToast(err.message || 'Failed to record stock out', 'error');
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
    cancelBtn.addEventListener('click', () => loadSection('stock-list'));
  }
}

// Legacy function kept for compatibility but no longer needed
function setupSerialNumbersForStock(form, quantitySelector, serialContainerSelector) {
  // Now handled by initStockSupplier and initStockBuyer directly
}

// ============================================================
// COMPANY HANDLERS
// ============================================================

async function initCompanyAdd() {
  const form = document.getElementById('company-add-form');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      industry: formData.get('industry'),
      address: {
        street: formData.get('street'),
        city: formData.get('city'),
        state: formData.get('state'),
        zipCode: formData.get('zipCode'),
        country: formData.get('country')
      },
      website: formData.get('website') || undefined,
      taxId: formData.get('taxId') || undefined
    };
    
    try {
      await fetchAPI('/companies', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Company added successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      loadSection('company-list');
    } catch (err) {
      showToast(err.message || 'Failed to add company', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('company-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('company-list'));
  }
}

async function initCompanyModify() {
  const select = document.getElementById('modify-company-select');
  const form = document.getElementById('company-modify-form');
  if (!select || !form) return;
  
  // Load companies into dropdown
  try {
    const response = await fetchAPI('/companies');
    const companies = response.companies || response;
    select.innerHTML = '<option value="">-- Select a company --</option>' +
      companies.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  } catch (err) {
    showToast('Failed to load companies', 'error');
  }
  
  // When company is selected, populate fields
  select.addEventListener('change', async () => {
    const id = select.value;
    if (!id) return;
    
    try {
      const company = await fetchAPI(`/companies/${id}`);
      document.getElementById('modify-company-name').value = company.name || '';
      document.getElementById('modify-company-email').value = company.email || '';
      document.getElementById('modify-company-phone').value = company.phone || '';
      document.getElementById('modify-company-industry').value = company.industry || '';
      document.getElementById('modify-company-street').value = company.address?.street || '';
      document.getElementById('modify-company-city').value = company.address?.city || '';
      document.getElementById('modify-company-state').value = company.address?.state || '';
      document.getElementById('modify-company-zipcode').value = company.address?.zipCode || '';
      document.getElementById('modify-company-country').value = company.address?.country || 'India';
      document.getElementById('modify-company-website').value = company.website || '';
      document.getElementById('modify-company-taxid').value = company.taxId || '';
    } catch (err) {
      showToast('Failed to load company details', 'error');
    }
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = select.value;
    if (!id) {
      showToast('Select a company first', 'error');
      return;
    }
    
    const data = {
      name: document.getElementById('modify-company-name').value,
      email: document.getElementById('modify-company-email').value,
      phone: document.getElementById('modify-company-phone').value,
      industry: document.getElementById('modify-company-industry').value,
      address: {
        street: document.getElementById('modify-company-street').value,
        city: document.getElementById('modify-company-city').value,
        state: document.getElementById('modify-company-state').value,
        zipCode: document.getElementById('modify-company-zipcode').value,
        country: document.getElementById('modify-company-country').value
      },
      website: document.getElementById('modify-company-website').value || undefined,
      taxId: document.getElementById('modify-company-taxid').value || undefined
    };
    
    try {
      await fetchAPI(`/companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Company updated successfully!', 'success');
      markDashboardForRefresh();
      loadSection('company-list');
    } catch (err) {
      showToast(err.message || 'Failed to update company', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('company-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('company-list'));
  }
}

// ============================================================
// MANAGER HANDLERS
// ============================================================

async function initManagerAdd() {
  const form = document.getElementById('manager-add-form');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('mname')?.value;
    const email = document.getElementById('mmail')?.value;
    const password = document.getElementById('mpass')?.value;
    
    if (!name || !email) {
      showToast('Name and email are required', 'error');
      return;
    }
    
    // Use a default password if not provided
    const finalPassword = password || 'Manager@123';
    
    if (finalPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    try {
      await fetchAPI('/auth/register-manager', {
        method: 'POST',
        body: JSON.stringify({ name, email, password: finalPassword })
      });
      showToast('Manager created successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      loadSection('manager-list');
    } catch (err) {
      showToast(err.message || 'Failed to create manager', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('manager-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('manager-list'));
  }
}

async function initManagerModify() {
  const select = document.getElementById('modify-manager-select');
  const form = document.getElementById('manager-modify-form');
  if (!select || !form) return;
  
  // Load managers into dropdown
  try {
  const users = await fetchAPI('/users');
  const managers = users.filter(u => u.role === 'MANAGER');
    select.innerHTML = '<option value="">-- Select a manager --</option>' +
      managers.map(m => `<option value="${m._id}">${escapeHtml(m.name)} (${escapeHtml(m.email)})</option>`).join('');
  } catch (err) {
    showToast('Failed to load managers', 'error');
  }
  
  // When manager is selected, populate fields
  select.addEventListener('change', async () => {
    const id = select.value;
    if (!id) return;
    
    try {
      const manager = await fetchAPI(`/users/${id}`);
      document.getElementById('modify-mname').value = manager.name || '';
      document.getElementById('modify-mmail').value = manager.email || '';
      const phoneEl = document.getElementById('modify-mphone');
      if (phoneEl) phoneEl.value = manager.phone || '';
      const statusEl = document.getElementById('modify-mstatus');
      if (statusEl) statusEl.value = manager.isActive !== false ? 'Active' : 'Inactive';
    } catch (err) {
      showToast('Failed to load manager details', 'error');
    }
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = select.value;
    if (!id) {
      showToast('Select a manager first', 'error');
      return;
    }
    
    const statusEl = document.getElementById('modify-mstatus');
    const data = {
      name: document.getElementById('modify-mname')?.value,
      email: document.getElementById('modify-mmail')?.value,
      isActive: statusEl?.value === 'Active'
    };
    
    try {
      await fetchAPI(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Manager updated successfully!', 'success');
      markDashboardForRefresh();
      loadSection('manager-list');
    } catch (err) {
      showToast(err.message || 'Failed to update manager', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('manager-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('manager-list'));
  }
}

// ============================================================
// USER HANDLERS
// ============================================================

async function initUserAdd() {
  const form = document.getElementById('user-add-form');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('uname')?.value;
    const phone = document.getElementById('uphone')?.value;
    const email = document.getElementById('umail')?.value;
    const password = document.getElementById('upass')?.value;
    
    if (!name || !phone || !password) {
      showToast('Name, phone, and password are required', 'error');
      return;
    }
    
    if (!/^\d{10,15}$/.test(phone)) {
      showToast('Invalid phone number (10-15 digits required)', 'error');
      return;
    }
    
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    try {
      await fetchAPI('/auth/register-user', {
        method: 'POST',
        body: JSON.stringify({ name, phone, email, password })
      });
      showToast('User created successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      loadSection('user-list');
    } catch (err) {
      showToast(err.message || 'Failed to create user', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('user-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('user-list'));
  }
}

async function initUserModify() {
  const select = document.getElementById('modify-user-select');
  const form = document.getElementById('user-modify-form');
  if (!select || !form) return;
  
  // Load users into dropdown
  try {
  const users = await fetchAPI('/users');
  const userList = users.filter(u => u.role === 'USER');
    select.innerHTML = '<option value="">-- Select a user --</option>' +
      userList.map(u => `<option value="${u._id}">${escapeHtml(u.name)} (${escapeHtml(u.phone || u.email)})</option>`).join('');
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
  
  // When user is selected, populate fields
  select.addEventListener('change', async () => {
    const id = select.value;
    if (!id) return;
    
    try {
      const user = await fetchAPI(`/users/${id}`);
      document.getElementById('modify-uname').value = user.name || '';
      document.getElementById('modify-uphone').value = user.phone || '';
      document.getElementById('modify-umail').value = user.email || '';
      document.getElementById('modify-upass').value = ''; // Always empty for security
      const roleEl = document.getElementById('modify-urole');
      if (roleEl) {
        // Map backend role to select value
        const roleMap = { 'USER': 'User', 'MANAGER': 'Manager', 'ADMIN': 'Admin' };
        roleEl.value = roleMap[user.role] || 'User';
      }
    } catch (err) {
      showToast('Failed to load user details', 'error');
    }
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = select.value;
    if (!id) {
      showToast('Select a user first', 'error');
      return;
    }
    
    const data = {
      name: document.getElementById('modify-uname')?.value,
      phone: document.getElementById('modify-uphone')?.value,
      email: document.getElementById('modify-umail')?.value
    };
    
    // Only include password if provided
    const password = document.getElementById('modify-upass')?.value;
    if (password) {
      data.password = password;
    }
    
    // Include role
    const roleEl = document.getElementById('modify-urole');
    if (roleEl) {
      const roleMap = { 'User': 'USER', 'Manager': 'MANAGER', 'Admin': 'ADMIN' };
      data.role = roleMap[roleEl.value] || 'USER';
    }
    
    try {
      await fetchAPI(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('User updated successfully!', 'success');
      markDashboardForRefresh();
      loadSection('user-list');
    } catch (err) {
      showToast(err.message || 'Failed to update user', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('user-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('user-list'));
  }
}

// ============================================================
// USER ROLE ASSIGNMENT (Admin Only)
// ============================================================

async function initUserAssign() {
  const select = document.getElementById('assign-user-select');
  const currentRoleInput = document.getElementById('current-role');
  const newRoleSelect = document.getElementById('assign-role-select');
  const form = document.getElementById('user-assign-form');
  
  if (!select || !form) return;
  
  // Load all users (managers and users, not admins unless you want)
  try {
    const users = await fetchAPI('/users');
    // Filter out the current admin (can't change your own role)
    const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
    const filteredUsers = users
      .filter(u => u.role !== 'SUPER_ADMIN')
      .filter(u => u._id !== currentUser._id);
    
    select.innerHTML = '<option value="">-- Select a user --</option>';
    
    // Group by role
    const admins = filteredUsers.filter(u => u.role === 'ADMIN');
    const managers = filteredUsers.filter(u => u.role === 'MANAGER');
    const regularUsers = filteredUsers.filter(u => u.role === 'USER');
    
    if (admins.length > 0) {
      select.innerHTML += '<optgroup label="👑 Admins">' +
        admins.map(u => `<option value="${u._id}" data-role="${u.role}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join('') +
        '</optgroup>';
    }
    
    if (managers.length > 0) {
      select.innerHTML += '<optgroup label="👔 Managers">' +
        managers.map(u => `<option value="${u._id}" data-role="${u.role}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join('') +
        '</optgroup>';
    }
    
    if (regularUsers.length > 0) {
      select.innerHTML += '<optgroup label="👤 Users">' +
        regularUsers.map(u => `<option value="${u._id}" data-role="${u.role}">${escapeHtml(u.name)} (${escapeHtml(u.phone || u.email)})</option>`).join('') +
        '</optgroup>';
    }
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
  
  // When user is selected, show current role
  select.addEventListener('change', () => {
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.dataset.role) {
      const roleLabels = { 'ADMIN': 'Admin', 'MANAGER': 'Manager', 'USER': 'User' };
      currentRoleInput.value = roleLabels[selectedOption.dataset.role] || selectedOption.dataset.role;
      newRoleSelect.value = ''; // Reset new role selection
    } else {
      currentRoleInput.value = '';
    }
  });
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = select.value;
    const newRole = newRoleSelect.value;
    
    if (!userId) {
      showToast('Please select a user', 'error');
      return;
    }
    
    if (!newRole) {
      showToast('Please select a new role', 'error');
      return;
    }
    
    const selectedOption = select.options[select.selectedIndex];
    const currentRole = selectedOption.dataset.role;
    
    if (currentRole === newRole) {
      showToast('New role is the same as current role', 'warning');
      return;
    }
    
    // Confirm role change with detailed message
    const userName = selectedOption.text.split(' (')[0];
    const roleLabels = { 'ADMIN': 'Admin', 'MANAGER': 'Manager', 'USER': 'User' };
    const dashboardMap = { 'ADMIN': 'Admin Dashboard', 'MANAGER': 'Manager Dashboard', 'USER': 'User Dashboard' };
    
    const confirmMessage = `Are you sure you want to change ${userName}'s role from ${roleLabels[currentRole]} to ${roleLabels[newRole]}?\n\n` +
      `⚠️ Important:\n` +
      `• The user will be logged out immediately\n` +
      `• They will need to log in again\n` +
      `• They will now access: ${dashboardMap[newRole]}\n` +
      `• They will NO LONGER have access to: ${dashboardMap[currentRole]}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      const response = await fetchAPI(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      
      // Show detailed success message
      let successMessage = `Role updated to ${roleLabels[newRole]} successfully!`;
      if (response.roleChanged) {
        successMessage = `${userName}'s role changed from ${roleLabels[response.previousRole]} to ${roleLabels[newRole]}.\n\nThe user's session has been invalidated. They must log in again to access the ${dashboardMap[newRole]}.`;
      }
      
      showToast(successMessage, 'success');
      
      // Update the dropdown to reflect new role
      selectedOption.dataset.role = newRole;
      currentRoleInput.value = roleLabels[newRole];
      newRoleSelect.value = '';
      
      // Reload to refresh the list with updated groupings
      loadSection('user-assign');
    } catch (err) {
      showToast(err.message || 'Failed to update role', 'error');
    }
  });
  
  // Cancel button
  const cancelBtn = document.getElementById('assign-role-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('user-list'));
  }
}

// ============================================================
// ITEM/PRODUCT HANDLERS
// ============================================================

async function initItemAdd() {
  const form = document.getElementById('item-add-form');
  if (!form) return;
  
  // Serial policy toggle handlers
  const enableSerialCheckbox = document.getElementById('enableSerial');
  const serialOptions = document.getElementById('serial-options');
  
  if (enableSerialCheckbox && serialOptions) {
    enableSerialCheckbox.addEventListener('change', () => {
      serialOptions.style.display = enableSerialCheckbox.checked ? 'block' : 'none';
      // Reset child checkboxes when disabled
      if (!enableSerialCheckbox.checked) {
        document.getElementById('requireSerialOnIN').checked = false;
        document.getElementById('requireSerialOnOUT').checked = false;
      }
    });
  }
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
      name: document.getElementById('productName')?.value,
      shortName: document.getElementById('shortName')?.value,
      hsn: document.getElementById('hsn')?.value,
      salesPrice: parseFloat(document.getElementById('salesPrice')?.value) || 0,
      purchasePrice: parseFloat(document.getElementById('purchasePrice')?.value) || 0,
      mrp: parseFloat(document.getElementById('mrp')?.value) || 0,
      warranty: document.getElementById('warranty')?.value || undefined,
      defaultSellerWarranty: document.getElementById('defaultSellerWarranty')?.value || undefined,
      serialPolicy: {
        enableSerial: document.getElementById('enableSerial')?.checked || false,
        requireSerialOnIN: document.getElementById('requireSerialOnIN')?.checked || false,
        requireSerialOnOUT: document.getElementById('requireSerialOnOUT')?.checked || false
      }
    };
    
    if (!data.name) {
      showToast('Product name is required', 'error');
      return;
    }
    
    if (!data.salesPrice || !data.purchasePrice) {
      showToast('Sales price and purchase price are required', 'error');
      return;
    }
    
    try {
      await fetchAPI('/items', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('Product added successfully!', 'success');
      markDashboardForRefresh();
      form.reset();
      if (serialOptions) serialOptions.style.display = 'none';
      loadSection('item-list');
    } catch (err) {
      showToast(err.message || 'Failed to add product', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('item-add-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('item-list'));
  }
}

async function initItemModify() {
  const select = document.getElementById('modify-item-select');
  const form = document.getElementById('item-modify-form');
  
  if (!select || !form) return;
  
  // Serial policy toggle handlers
  const enableSerialCheckbox = document.getElementById('modify-enableSerial');
  const serialOptions = document.getElementById('modify-serial-options');
  
  if (enableSerialCheckbox && serialOptions) {
    enableSerialCheckbox.addEventListener('change', () => {
      serialOptions.style.display = enableSerialCheckbox.checked ? 'block' : 'none';
      // Reset child checkboxes when disabled
      if (!enableSerialCheckbox.checked) {
        document.getElementById('modify-requireSerialOnIN').checked = false;
        document.getElementById('modify-requireSerialOnOUT').checked = false;
      }
    });
  }
  
  // Load items into dropdown
  try {
    const items = await fetchAPI('/items');
    select.innerHTML = '<option value="">-- Select a product --</option>' +
      items.map(i => `<option value="${i._id}">${escapeHtml(i.name)} (${escapeHtml(i.shortName || '')})</option>`).join('');
  } catch (err) {
    showToast('Failed to load products', 'error');
  }
  
  // When item is selected, populate fields including serial policy
  select.addEventListener('change', async () => {
    const id = select.value;
    if (!id) return;
    
    try {
      const item = await fetchAPI(`/items/${id}`);
      document.getElementById('modify-productName').value = item.name || '';
      document.getElementById('modify-shortName').value = item.shortName || '';
      document.getElementById('modify-hsn').value = item.hsn || '';
      document.getElementById('modify-salesPrice').value = item.salesPrice || '';
      document.getElementById('modify-purchasePrice').value = item.purchasePrice || '';
      document.getElementById('modify-mrp').value = item.mrp || '';
      document.getElementById('modify-warranty').value = item.warranty || '';
      document.getElementById('modify-defaultSellerWarranty').value = item.defaultSellerWarranty || '';
      
      // Populate serial policy
      const policy = item.serialPolicy || {};
      if (enableSerialCheckbox) {
        enableSerialCheckbox.checked = policy.enableSerial || false;
        if (serialOptions) {
          serialOptions.style.display = policy.enableSerial ? 'block' : 'none';
        }
      }
      const requireINCheckbox = document.getElementById('modify-requireSerialOnIN');
      const requireOUTCheckbox = document.getElementById('modify-requireSerialOnOUT');
      if (requireINCheckbox) requireINCheckbox.checked = policy.requireSerialOnIN || false;
      if (requireOUTCheckbox) requireOUTCheckbox.checked = policy.requireSerialOnOUT || false;
    } catch (err) {
      showToast('Failed to load product details', 'error');
    }
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = select.value;
    if (!id) {
      showToast('Select a product first', 'error');
      return;
    }
    
    const data = {
      name: document.getElementById('modify-productName')?.value,
      shortName: document.getElementById('modify-shortName')?.value,
      hsn: document.getElementById('modify-hsn')?.value,
      salesPrice: parseFloat(document.getElementById('modify-salesPrice')?.value) || 0,
      purchasePrice: parseFloat(document.getElementById('modify-purchasePrice')?.value) || 0,
      mrp: parseFloat(document.getElementById('modify-mrp')?.value) || 0,
      warranty: document.getElementById('modify-warranty')?.value || undefined,
      defaultSellerWarranty: document.getElementById('modify-defaultSellerWarranty')?.value || undefined,
      serialPolicy: {
        enableSerial: document.getElementById('modify-enableSerial')?.checked || false,
        requireSerialOnIN: document.getElementById('modify-requireSerialOnIN')?.checked || false,
        requireSerialOnOUT: document.getElementById('modify-requireSerialOnOUT')?.checked || false
      }
    };
    
    try {
      await fetchAPI(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('Product updated successfully!', 'success');
      markDashboardForRefresh();
      loadSection('item-list');
    } catch (err) {
      showToast(err.message || 'Failed to update product', 'error');
    }
  });
  
  const cancelBtn = document.getElementById('item-modify-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => loadSection('item-list'));
  }
}

// ============================================================
// USER ACTIVITY REPORT (Admin Only)
// ============================================================

async function initReportUserActivity() {
  const userSelect = document.getElementById('activity-user-select');
  const filterBtn = document.getElementById('activity-filter-btn');
  const userInfo = document.getElementById('activity-user-info');
  const exportBtns = document.getElementById('activity-export-btns');
  
  if (!userSelect) return;
  
  // Load users and managers
  try {
    const users = (await fetchAPI('/users')).filter(u => u.role !== 'SUPER_ADMIN');
    userSelect.innerHTML = '<option value="">-- Select a user or manager --</option>';
    
    // Add managers
    const managers = users.filter(u => u.role === 'MANAGER');
    if (managers.length > 0) {
      userSelect.innerHTML += '<optgroup label="👔 Managers">' +
        managers.map(m => `<option value="${m._id}">[MGR] ${escapeHtml(m.name)} - ${escapeHtml(m.email || '')}</option>`).join('') +
        '</optgroup>';
    }
    
    // Add users
    const regularUsers = users.filter(u => u.role === 'USER');
    if (regularUsers.length > 0) {
      userSelect.innerHTML += '<optgroup label="👤 Users">' +
        regularUsers.map(u => `<option value="${u._id}">[USR] ${escapeHtml(u.name)} - ${escapeHtml(u.phone || u.email || '')}</option>`).join('') +
        '</optgroup>';
    }
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
  
  // Filter button click
  if (filterBtn) {
    filterBtn.addEventListener('click', async () => {
      const userId = userSelect.value;
      if (!userId) {
        showToast('Please select a user or manager', 'error');
        return;
      }
      
      const type = document.getElementById('activity-type-filter')?.value;
      const startDate = document.getElementById('activity-date-from')?.value;
      const endDate = document.getElementById('activity-date-to')?.value;
      
      // Build query params
      const params = new URLSearchParams();
      if (type) params.append('type', type);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      try {
        const report = await fetchAPI(`/reports/user-activity/${userId}?${params.toString()}`);
        
        // Show user info
        if (userInfo) {
          userInfo.style.display = 'flex';
          document.getElementById('activity-user-name').textContent = report.user?.name || '-';
          document.getElementById('activity-user-contact').textContent = report.user?.email || report.user?.phone || '-';
          
          const roleEl = document.getElementById('activity-user-role');
          roleEl.textContent = report.user?.role || '-';
          roleEl.className = 'badge ' + (report.user?.role?.toLowerCase() || '');
          
          document.getElementById('activity-stock-in').textContent = report.summary?.totalStockIn || 0;
          document.getElementById('activity-stock-out').textContent = report.summary?.totalStockOut || 0;
          document.getElementById('activity-net-change').textContent = report.summary?.netChange || 0;
          document.getElementById('activity-total-txn').textContent = 
            (report.summary?.stockInCount || 0) + (report.summary?.stockOutCount || 0);
        }
        
        // Render table
        const tbody = document.querySelector('#activity-table tbody');
        if (tbody) {
          if (!report.entries || report.entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;"><p class="muted">No activity found for this user.</p></td></tr>';
          } else {
            tbody.innerHTML = report.entries.map(entry => `
              <tr>
                <td>${new Date(entry.createdAt).toLocaleString()}</td>
                <td>${escapeHtml(entry.productId?.name || '-')} <small class="muted">(${escapeHtml(entry.productId?.shortName || '')})</small></td>
                <td><span class="badge ${entry.type === 'IN' ? 'active' : 'inactive'}">${entry.type}</span></td>
                <td>${entry.quantity}</td>
                <td>${entry.serialNumbers?.length ? entry.serialNumbers.join(', ') : '-'}</td>
              </tr>
            `).join('');
          }
        }
        
        // Show export buttons
        if (exportBtns) exportBtns.style.display = 'flex';
        
        // Store data for export
        window._activityReportData = report;
        
      } catch (err) {
        showToast(err.message || 'Failed to load report', 'error');
      }
    });
  }
}

// Export activity to CSV
function exportActivityToCSV() {
  const report = window._activityReportData;
  if (!report || !report.entries) {
    showToast('No data to export', 'error');
    return;
  }
  
  const headers = ['Date', 'Product', 'Type', 'Quantity', 'Serial Numbers'];
  const rows = report.entries.map(e => [
    new Date(e.createdAt).toLocaleString(),
    e.productId?.name || '-',
    e.type,
    e.quantity,
    e.serialNumbers?.join('; ') || ''
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  downloadCSV(csv, `activity-report-${report.user?.name || 'user'}.csv`);
}

// Print activity report
function printActivityReport() {
  window.print();
}

// ============================================================
// USER SUMMARY REPORT (Admin Only)
// ============================================================

async function initReportUserSummary() {
  const filterBtn = document.getElementById('summary-filter-btn');
  const exportBtn = document.getElementById('export-summary-csv');
  
  // Load summary on init
  loadUserSummary();
  
  if (filterBtn) {
    filterBtn.addEventListener('click', loadUserSummary);
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSummaryToCSV);
  }
}

async function loadUserSummary() {
  const role = document.getElementById('summary-role-filter')?.value;
  const startDate = document.getElementById('summary-date-from')?.value;
  const endDate = document.getElementById('summary-date-to')?.value;
  
  const params = new URLSearchParams();
  if (role) params.append('role', role);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  try {
    const summaries = await fetchAPI(`/reports/user-summary?${params.toString()}`);
    
    const tbody = document.querySelector('#summary-table tbody');
    if (!tbody) return;
    
    if (!summaries || summaries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;"><p class="muted">No users found.</p></td></tr>';
      return;
    }
    
    tbody.innerHTML = summaries.map(user => `
      <tr>
        <td><strong>${escapeHtml(user.name)}</strong></td>
        <td><span class="badge ${user.role.toLowerCase()}">${user.role}</span></td>
        <td>${escapeHtml(user.email || user.phone || '-')}</td>
        <td class="positive">${user.stockIn}</td>
        <td class="negative">${user.stockOut}</td>
        <td>${user.totalTransactions}</td>
        <td>${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
        <td>
          <button class="btn ghost btn-sm" onclick="viewUserActivity('${user._id}')">View Details</button>
        </td>
      </tr>
    `).join('');
    
    // Store for export
    window._userSummaryData = summaries;
    
  } catch (err) {
    showToast(err.message || 'Failed to load summary', 'error');
  }
}

function viewUserActivity(userId) {
  loadSection('report-user-activity');
  setTimeout(() => {
    const select = document.getElementById('activity-user-select');
    if (select) {
      select.value = userId;
      document.getElementById('activity-filter-btn')?.click();
    }
  }, 100);
}

function exportSummaryToCSV() {
  const data = window._userSummaryData;
  if (!data || data.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  
  const headers = ['Name', 'Role', 'Contact', 'Stock IN', 'Stock OUT', 'Total Transactions', 'Last Login'];
  const rows = data.map(u => [
    u.name,
    u.role,
    u.email || u.phone || '-',
    u.stockIn,
    u.stockOut,
    u.totalTransactions,
    u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  downloadCSV(csv, 'user-summary-report.csv');
}

// Helper to download CSV
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ============================================================
// WARRANTY
// ============================================================

let _warrantyPage       = 1;
let _warrantyTotalPages = 1;
const WARRANTY_PAGE_LIMIT = 20;

async function initWarrantyList() {
  const role = getCurrentUserRole(); // 'ADMIN' | 'MANAGER' | 'USER'

  // Hide purchase warranty columns + stat cards for USER role
  if (role === 'USER') {
    document.querySelectorAll('.warranty-col-purchase').forEach(el => el.style.display = 'none');
    ['ws-pw-active-card','ws-pw-expiring-card','ws-pw-expired-card'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Also hide the type filter "Purchase Warranty" option
    const typeFilter = document.getElementById('warranty-type-filter');
    if (typeFilter) {
      Array.from(typeFilter.options).forEach(o => {
        if (o.value === 'purchase') o.style.display = 'none';
      });
    }
  }

  // Load stats
  await _loadWarrantyStats(role);

  // Initial table load
  _warrantyPage = 1;
  await _loadWarranties(role);

  // Search (debounced)
  let _wTimer;
  document.getElementById('warranty-search')?.addEventListener('input', () => {
    clearTimeout(_wTimer);
    _wTimer = setTimeout(() => { _warrantyPage = 1; _loadWarranties(role); }, 350);
  });

  // Filters
  document.getElementById('warranty-type-filter')?.addEventListener('change',   () => { _warrantyPage = 1; _loadWarranties(role); });
  document.getElementById('warranty-status-filter')?.addEventListener('change', () => { _warrantyPage = 1; _loadWarranties(role); });

  // Pagination
  document.getElementById('warranty-prev')?.addEventListener('click', () => {
    if (_warrantyPage > 1) { _warrantyPage--; _loadWarranties(role); }
  });
  document.getElementById('warranty-next')?.addEventListener('click', () => {
    if (_warrantyPage < _warrantyTotalPages) { _warrantyPage++; _loadWarranties(role); }
  });

  // Export (hidden for USER)
  const exportBtn = document.getElementById('warranty-export-btn');
  if (exportBtn) {
    if (role === 'USER') {
      exportBtn.style.display = 'none';
    } else {
      exportBtn.addEventListener('click', () => _exportWarrantyCSV(role));
    }
  }
}

async function _loadWarrantyStats(role) {
  try {
    const stats = await fetchAPI('/warranty/stats');
    // Seller stats — all roles
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
    setVal('ws-sw-active',   stats.seller?.active);
    setVal('ws-sw-expiring', stats.seller?.expiringSoon);
    setVal('ws-sw-expired',  stats.seller?.expired);
    // Purchase stats — admin + manager only
    if (role !== 'USER') {
      setVal('ws-pw-active',   stats.purchase?.active);
      setVal('ws-pw-expiring', stats.purchase?.expiringSoon);
      setVal('ws-pw-expired',  stats.purchase?.expired);
    }
  } catch (e) { /* silent — stats are nice-to-have */ }
}

async function _loadWarranties(role) {
  const tbody = document.getElementById('warranty-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;" class="muted">Loading…</td></tr>`;

  const search = document.getElementById('warranty-search')?.value?.trim()  || '';
  const type   = document.getElementById('warranty-type-filter')?.value      || '';
  const status = document.getElementById('warranty-status-filter')?.value    || '';

  // Force user role to only see seller warranty type
  const effectiveType = (role === 'USER') ? 'seller' : type;

  const params = new URLSearchParams({ page: _warrantyPage, limit: WARRANTY_PAGE_LIMIT });
  if (search)        params.append('search', search);
  if (effectiveType) params.append('type',   effectiveType);
  if (status)        params.append('status', status);

  try {
    const res  = await fetchAPI(`/warranty?${params}`);
    const list = res.warranties || [];
    _warrantyTotalPages = res.pages || res.totalPages || 1;

    const pageInfo = document.getElementById('warranty-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${_warrantyPage} of ${_warrantyTotalPages}`;
    const prevBtn = document.getElementById('warranty-prev');
    const nextBtn = document.getElementById('warranty-next');
    if (prevBtn) prevBtn.disabled = _warrantyPage <= 1;
    if (nextBtn) nextBtn.disabled = _warrantyPage >= _warrantyTotalPages;

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;" class="muted">No warranties found</td></tr>`;
      return;
    }

    const pwHide = role === 'USER' ? 'style="display:none"' : '';

    tbody.innerHTML = list.map(w => {
      const serial      = escapeHtml(w.serialNumber || '—');
      const productName = escapeHtml(w.productId?.name || '—');

      // Purchase warranty
      const pw       = w.purchaseWarranty || {};
      const pwDays   = w.purchaseDaysLeft ?? 0;
      const pwStatus = pw.status || 'none';
      const pwPeriod = escapeHtml(pw.period || '—');
      const pwExpiry = pw.expiryDate ? new Date(pw.expiryDate).toLocaleDateString('en-IN') : '—';
      const pwColor  = pwStatus === 'active' ? '#22c55e' : pwStatus === 'expiring-soon' ? '#f59e0b' : pwStatus === 'expired' ? '#ef4444' : '#9ca3af';
      const pwIcon   = pwStatus === 'active' ? '✅' : pwStatus === 'expiring-soon' ? '⚠️' : pwStatus === 'expired' ? '❌' : '—';
      const pwBadge  = pwStatus === 'none'
        ? '<span class="muted">—</span>'
        : `<span style="color:${pwColor};font-weight:600;">${pwIcon} ${pwPeriod}</span><br><small class="muted">Exp: ${pwExpiry}</small>`;
      const pwDaysCell  = pwStatus === 'none' ? '—' : `<span style="color:${pwColor};font-weight:700;">${pwDays > 0 ? pwDays + ' days' : 'Expired'}</span>`;
      const pwSupplier  = escapeHtml(pw.supplierName || '—');

      // Seller warranty
      const sw       = w.sellerWarranty || {};
      const swDays   = w.sellerDaysLeft ?? 0;
      const swStatus = sw.status || 'not-sold';
      const swPeriod = escapeHtml(sw.period || '—');
      const swExpiry = sw.expiryDate ? new Date(sw.expiryDate).toLocaleDateString('en-IN') : '—';
      const swColor  = swStatus === 'active' ? '#22c55e' : swStatus === 'expiring-soon' ? '#f59e0b' : swStatus === 'expired' ? '#ef4444' : '#9ca3af';
      const swIcon   = swStatus === 'active' ? '✅' : swStatus === 'expiring-soon' ? '⚠️' : swStatus === 'expired' ? '❌' : '📦';
      const swBadge  = swStatus === 'not-sold'
        ? '<span class="muted">📦 Not Sold</span>'
        : swStatus === 'none'
          ? '<span class="muted">No Warranty</span>'
          : `<span style="color:${swColor};font-weight:600;">${swIcon} ${swPeriod}</span><br><small class="muted">Exp: ${swExpiry}</small>`;
      const swDaysCell = (swStatus === 'not-sold' || swStatus === 'none') ? '—'
        : `<span style="color:${swColor};font-weight:700;">${swDays > 0 ? swDays + ' days' : 'Expired'}</span>`;
      const swBuyer = escapeHtml(sw.buyerName || sw.companyName || '—');

      return `
        <tr>
          <td style="font-family:monospace;font-size:.85rem;">${serial}</td>
          <td><strong>${productName}</strong></td>
          <td class="warranty-col-purchase" ${pwHide}>${pwBadge}</td>
          <td class="warranty-col-purchase" ${pwHide}>${pwDaysCell}</td>
          <td class="warranty-col-purchase" ${pwHide}>${pwSupplier}</td>
          <td>${swBadge}</td>
          <td>${swDaysCell}</td>
          <td>${swBuyer}</td>
          <td>
            <button class="btn secondary btn-sm" onclick="viewWarrantyDetail('${w._id}')">
              👁 View
            </button>
          </td>
        </tr>`;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:#ef4444;">
      Failed to load warranties: ${escapeHtml(err.message)}
    </td></tr>`;
  }
}

async function viewWarrantyDetail(id) {
  const role = getCurrentUserRole();
  try {
    const w           = await fetchAPI(`/warranty/${id}`);
    const modal       = document.getElementById('warranty-detail-modal');
    const content     = document.getElementById('warranty-detail-content');
    if (!modal || !content) return;

    const productName = w.productId?.name || '—';
    const serial      = w.serialNumber    || 'N/A';
    const pwDays      = w.purchaseDaysLeft ?? 0;
    const swDays      = w.sellerDaysLeft   ?? 0;

    const pwStatus = w.purchaseWarranty?.status || 'none';
    const swStatus = w.sellerWarranty?.status   || 'not-sold';
    const pwColor  = pwStatus === 'active' ? '#22c55e' : pwStatus === 'expiring-soon' ? '#f59e0b' : '#ef4444';
    const swColor  = swStatus === 'active' ? '#22c55e' : swStatus === 'expiring-soon' ? '#f59e0b' : swStatus === 'expired' ? '#ef4444' : '#9ca3af';

    // Purchase section — admin + manager only
    const purchaseSection = role !== 'USER' ? `
      <div class="wd-tier-card wd-purchase">
        <div class="wd-tier-title">📦 Purchase Warranty <span class="wd-tier-sub">(from supplier)</span></div>
        <div class="wd-tier-grid">
          <div class="wd-field"><span class="wd-label">Period</span><span class="wd-value">${escapeHtml(w.purchaseWarranty?.period || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Start Date</span><span class="wd-value">${w.purchaseWarranty?.startDate ? new Date(w.purchaseWarranty.startDate).toLocaleDateString('en-IN') : '—'}</span></div>
          <div class="wd-field"><span class="wd-label">Expiry Date</span><span class="wd-value">${w.purchaseWarranty?.expiryDate ? new Date(w.purchaseWarranty.expiryDate).toLocaleDateString('en-IN') : '—'}</span></div>
          <div class="wd-field"><span class="wd-label">Days Left</span>
            <span class="wd-value" style="color:${pwColor};font-weight:700;font-size:1.05rem;">${pwDays > 0 ? pwDays + ' days' : 'Expired'}</span>
          </div>
          <div class="wd-field"><span class="wd-label">Supplier</span><span class="wd-value">${escapeHtml(w.purchaseWarranty?.supplierName || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Status</span>
            <span class="wd-value"><span class="badge" style="background:${pwColor}20;color:${pwColor};border:1px solid ${pwColor}40;">${pwStatus}</span></span>
          </div>
        </div>
      </div>` : '';

    // Seller section — all roles
    const sellerSection = `
      <div class="wd-tier-card wd-seller">
        <div class="wd-tier-title">🏷️ Seller Warranty <span class="wd-tier-sub">(given to customer)</span></div>
        <div class="wd-tier-grid">
          <div class="wd-field"><span class="wd-label">Period</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.period || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Start Date</span><span class="wd-value">${w.sellerWarranty?.startDate ? new Date(w.sellerWarranty.startDate).toLocaleDateString('en-IN') : '—'}</span></div>
          <div class="wd-field"><span class="wd-label">Expiry Date</span><span class="wd-value">${w.sellerWarranty?.expiryDate ? new Date(w.sellerWarranty.expiryDate).toLocaleDateString('en-IN') : '—'}</span></div>
          <div class="wd-field"><span class="wd-label">Days Left</span>
            <span class="wd-value" style="color:${swColor};font-weight:700;font-size:1.05rem;">
              ${swStatus === 'not-sold' ? 'Not Sold Yet' : swDays > 0 ? swDays + ' days' : 'Expired'}
            </span>
          </div>
          <div class="wd-field"><span class="wd-label">Buyer</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.buyerName || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Buyer Phone</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.buyerPhone || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Company</span><span class="wd-value">${escapeHtml(w.sellerWarranty?.companyName || '—')}</span></div>
          <div class="wd-field"><span class="wd-label">Status</span>
            <span class="wd-value"><span class="badge" style="background:${swColor}20;color:${swColor};border:1px solid ${swColor}40;">${swStatus}</span></span>
          </div>
        </div>
      </div>`;

    const claimsSection = w.claims?.length ? `
      <div class="wd-claims">
        <h4>📋 Warranty Claims (${w.claims.length})</h4>
        ${w.claims.map(c => `
          <div class="wd-claim-item">
            <span class="badge">${escapeHtml(c.status)}</span>
            <span>${escapeHtml(c.description || '—')}</span>
            <span class="muted" style="font-size:.8rem;">${new Date(c.claimedAt).toLocaleDateString('en-IN')}</span>
          </div>`).join('')}
      </div>` : '';

    content.innerHTML = `
      <div class="wd-header">
        <div class="wd-product-name">${escapeHtml(productName)}</div>
        <div class="wd-serial">🔖 Serial: <code>${escapeHtml(serial)}</code></div>
      </div>
      <div class="wd-tiers">${purchaseSection}${sellerSection}</div>
      ${claimsSection}
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

async function _exportWarrantyCSV(role) {
  try {
    const res  = await fetchAPI('/warranty?limit=1000');
    const list = res.warranties || [];

    const headers = role !== 'USER'
      ? ['Serial','Product','PW Period','PW Expiry','PW Days Left','PW Status','Supplier','SW Period','SW Expiry','SW Days Left','SW Status','Buyer','Buyer Phone']
      : ['Serial','Product','SW Period','SW Expiry','SW Days Left','SW Status','Buyer','Buyer Phone'];

    const rows = list.map(w => {
      const pwDays = w.purchaseDaysLeft ?? 0;
      const swDays = w.sellerDaysLeft   ?? 0;
      const row    = [
        w.serialNumber         || '',
        w.productId?.name      || '',
      ];
      if (role !== 'USER') row.push(
        w.purchaseWarranty?.period      || '',
        w.purchaseWarranty?.expiryDate  ? new Date(w.purchaseWarranty.expiryDate).toLocaleDateString('en-IN') : '',
        pwDays,
        w.purchaseWarranty?.status      || '',
        w.purchaseWarranty?.supplierName || ''
      );
      row.push(
        w.sellerWarranty?.period       || '',
        w.sellerWarranty?.expiryDate   ? new Date(w.sellerWarranty.expiryDate).toLocaleDateString('en-IN') : '',
        swDays,
        w.sellerWarranty?.status       || '',
        w.sellerWarranty?.buyerName    || w.sellerWarranty?.companyName || '',
        w.sellerWarranty?.buyerPhone   || ''
      );
      return row;
    });

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadCSV(csv, `warranties-${new Date().toISOString().slice(0,10)}.csv`);
  } catch (err) {
    showToast('Failed to export warranties', 'error');
  }
}

// ============================================================
// OWNERSHIP — Manage Admins
// ============================================================

async function initOwnershipAdmins() {
  const tbody = document.getElementById('ownership-admins-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;" class="muted">Loading…</td></tr>`;

  try {
    const users = await fetchAPI('/ownership/admins');
    if (!users || !users.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;" class="muted">No admin users found</td></tr>`;
      return;
    }

    const currentUser = auth.getUser();

    tbody.innerHTML = users.map(u => {
      const isSelf    = u._id === currentUser?._id;
      const isSA      = u.role === 'SUPER_ADMIN';
      const isAdmin   = u.role === 'ADMIN';
      const name      = escapeHtml(u.name || u.username || '—');
      const identifier= escapeHtml(u.email || u.username || '—');
      const status    = u.isActive !== false ? '<span style="color:#22c55e;font-weight:600;">✅ Active</span>' : '<span style="color:#ef4444;">❌ Inactive</span>';
      const since     = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—';

      let roleBadge;
      if (isSA) {
        roleBadge = `<span class="ownership-role-badge super-admin">👑 Super Admin</span>`;
      } else if (isAdmin) {
        roleBadge = `<span class="ownership-role-badge admin">🛡️ Admin</span>`;
      } else {
        roleBadge = `<span class="ownership-role-badge manager">👤 Manager</span>`;
      }

      let actions;
      if (isSelf) {
        actions = `<span class="muted" style="font-size:.82rem;">— You —</span>`;
      } else if (isSA) {
        actions = `<span class="muted" style="font-size:.82rem;">Protected</span>`;
      } else if (isAdmin) {
        actions = `<button class="btn secondary btn-sm" onclick="confirmDemoteToManager('${u._id}','${name}')">⬇ Demote to Manager</button>`;
      } else {
        actions = `<button class="btn primary btn-sm" onclick="confirmPromoteToAdmin('${u._id}','${name}')">⬆ Promote to Admin</button>`;
      }

      return `
        <tr>
          <td><strong>${name}</strong>${isSelf ? ' <span class="muted" style="font-size:.78rem;">(you)</span>' : ''}</td>
          <td style="font-size:.85rem;">${identifier}</td>
          <td>${roleBadge}</td>
          <td>${status}</td>
          <td class="muted" style="font-size:.83rem;">${since}</td>
          <td>${actions}</td>
        </tr>`;
    }).join('');

  } catch (err) {
    const tbody2 = document.getElementById('ownership-admins-tbody');
    if (tbody2) tbody2.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">
      Failed to load: ${escapeHtml(err.message)}
    </td></tr>`;
  }
}

function confirmPromoteToAdmin(userId, name) {
  const modal = document.getElementById('ownership-role-modal');
  if (!modal) return;
  document.getElementById('ownership-role-modal-title').textContent = 'Promote to Admin';
  document.getElementById('ownership-role-modal-msg').innerHTML =
    `Are you sure you want to promote <strong>${escapeHtml(name)}</strong> to <span style="color:#a78bfa;font-weight:700;">Admin</span>?<br>
     <span class="muted" style="font-size:.85rem;">They will gain full system access. This can be reversed.</span>`;
  const btn = document.getElementById('ownership-role-modal-confirm');
  btn.textContent = '⬆ Promote';
  btn.onclick = () => _executeRoleChange('/ownership/promote-admin', userId, 'Admin');
  modal.style.display = 'flex';
}

function confirmDemoteToManager(userId, name) {
  const modal = document.getElementById('ownership-role-modal');
  if (!modal) return;
  document.getElementById('ownership-role-modal-title').textContent = 'Demote to Manager';
  document.getElementById('ownership-role-modal-msg').innerHTML =
    `Are you sure you want to demote <strong>${escapeHtml(name)}</strong> to <span style="color:#4ade80;font-weight:700;">Manager</span>?<br>
     <span class="muted" style="font-size:.85rem;">They will lose admin access immediately.</span>`;
  const btn = document.getElementById('ownership-role-modal-confirm');
  btn.textContent = '⬇ Demote';
  btn.onclick = () => _executeRoleChange('/ownership/demote-admin', userId, 'Manager');
  modal.style.display = 'flex';
}

async function _executeRoleChange(endpoint, userId, newRole) {
  closeOwnershipRoleModal();
  try {
    await fetchAPI(endpoint, { method: 'POST', body: JSON.stringify({ userId }) });
    showToast(`User successfully changed to ${newRole}`, 'success');
    await initOwnershipAdmins(); // Refresh table
  } catch (err) {
    showToast(err.message || 'Role change failed', 'error');
  }
}

function closeOwnershipRoleModal() {
  const modal = document.getElementById('ownership-role-modal');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// OWNERSHIP — Transfer Ownership
// ============================================================

async function initOwnershipTransfer() {
  const select = document.getElementById('transfer-target-select');
  if (!select) return;

  // Reset form state
  const submitBtn = document.getElementById('transfer-submit-btn');
  const checkbox  = document.getElementById('transfer-confirm-check');
  const pwField   = document.getElementById('transfer-password');
  if (submitBtn) submitBtn.disabled = true;
  if (checkbox)  checkbox.checked = false;
  if (pwField)   pwField.value = '';

  // Hide target preview
  const preview = document.getElementById('transfer-target-preview');
  if (preview) preview.style.display = 'none';

  select.innerHTML = `<option value="">— Loading admins… —</option>`;

  try {
    const users  = await fetchAPI('/ownership/admins');
    const admins = (users || []).filter(u => u.role === 'ADMIN');

    if (!admins.length) {
      select.innerHTML = `<option value="">— No admins available. Promote a manager first. —</option>`;
      return;
    }

    select.innerHTML = `<option value="">— Select an Admin to transfer to —</option>` +
      admins.map(u => `<option value="${u._id}" data-name="${escapeHtml(u.name || u.username)}" data-email="${escapeHtml(u.email || u.username)}">
        ${escapeHtml(u.name || u.username)} (${escapeHtml(u.email || u.username)})
      </option>`).join('');

    // Live preview + button enablement
    select.onchange = () => _updateTransferPreview();
  } catch (err) {
    select.innerHTML = `<option value="">— Failed to load admins —</option>`;
    showToast('Failed to load admin list', 'error');
  }

  // Checkbox toggle
  if (checkbox) {
    checkbox.onchange = () => _updateTransferButton();
  }
}

function _updateTransferPreview() {
  const select  = document.getElementById('transfer-target-select');
  const preview = document.getElementById('transfer-target-preview');
  if (!select || !preview) return;

  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.value) {
    preview.style.display = 'none';
    _updateTransferButton();
    return;
  }

  const name  = opt.dataset.name  || opt.text;
  const email = opt.dataset.email || '';
  document.getElementById('transfer-target-name').textContent  = name;
  document.getElementById('transfer-target-email').textContent = email;
  document.getElementById('transfer-target-avatar').textContent = name.charAt(0).toUpperCase();
  preview.style.display = 'flex';
  _updateTransferButton();
}

function _updateTransferButton() {
  const select   = document.getElementById('transfer-target-select');
  const checkbox = document.getElementById('transfer-confirm-check');
  const pw       = document.getElementById('transfer-password');
  const btn      = document.getElementById('transfer-submit-btn');
  if (!btn) return;
  const hasTarget   = select  && select.value;
  const hasChecked  = checkbox && checkbox.checked;
  const hasPassword = pw      && pw.value.trim().length > 0;
  btn.disabled = !(hasTarget && hasChecked && hasPassword);
}

function toggleTransferPassword() {
  const input = document.getElementById('transfer-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Wire password field changes to button state
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'transfer-password') _updateTransferButton();
});

async function submitOwnershipTransfer() {
  const select   = document.getElementById('transfer-target-select');
  const pwField  = document.getElementById('transfer-password');
  const checkbox = document.getElementById('transfer-confirm-check');
  const btn      = document.getElementById('transfer-submit-btn');

  const targetId  = select?.value;
  const password  = pwField?.value?.trim();
  const confirmed = checkbox?.checked;

  if (!targetId || !password || !confirmed) {
    showToast('Please fill all fields and check the confirmation box', 'error');
    return;
  }

  const targetName = document.getElementById('transfer-target-name')?.textContent || 'selected admin';

  if (!confirm(`⚠️ FINAL CONFIRMATION\n\nTransfer Super Admin ownership to "${targetName}"?\n\nYou will become a regular Admin after this. This cannot be undone.`)) return;

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Transferring…'; }

  try {
    await fetchAPI('/ownership/transfer', {
      method: 'POST',
      body: JSON.stringify({ newOwnerUserId: targetId, currentPassword: password })
    });

    showToast('Ownership transferred successfully. You are now an Admin.', 'success');

    // Update local token/user data and redirect after short delay
    setTimeout(() => {
      // Force re-login as the role has changed
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/admin-html/login.html';
    }, 2500);

  } catch (err) {
    showToast(err.message || 'Transfer failed. Check your password.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Transfer Ownership'; }
  }
}