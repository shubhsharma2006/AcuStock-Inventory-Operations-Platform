// user.js

// API_URL: reads from shared config.js (loaded before this script).
// Falls back to localhost for dev if config is not loaded.
const API_URL = (window.AcuStockConfig && window.AcuStockConfig.API_BASE_URL)
  || window.ACUSTOCK_API_URL
  || 'http://127.0.0.1:5001/api';
const LOGIN_PAGE = (window.AcuStockConfig && window.AcuStockConfig.LOGIN_PAGE)
  || '../admin-dashboard/admin-html/login.html';

// ============================================================
// AUTHENTICATION SYSTEM (HTTP-only Cookies - Production Ready)
// Token stored in HTTP-only cookie (secure, not accessible by JS)
// User info cached in memory only (refreshed from API)
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
    // Token now in HTTP-only cookie, cache user for display
    this._user = data.user;
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
    window.location.href = LOGIN_PAGE;
  },

  getUser() {
    return this._user;
  },

  setUser(user) {
    this._user = user;
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
      return user;
    } catch (error) {
      console.error('Session verification failed:', error);
      return null;
    }
  },

  isAuthenticated() {
    return !!this._user;
  }
};

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

// ============================================================
// CASCADING PRODUCT DROPDOWN HELPERS
// ============================================================

// Helper: Load unique product names into a dropdown
async function loadProductNamesDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return [];
  
  try {
    const productNames = await fetchAPI('/items/product-names');
    
    select.innerHTML = '<option value="">-- Select Product Name --</option>' +
      productNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

    // Init Tom Select for typeahead search
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

// ── Tom Select helper ─────────────────────────────────────────────────────────
function _initTomSelect(el, placeholder) {
  if (typeof TomSelect === 'undefined') return;
  if (!el) return;
  // Destroy existing instance before re-init
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

// ============================================================
// STATE MANAGEMENT
// ============================================================

const state = {
  user: null,
  permissions: {}
};

// ============================================================
// PERMISSION UTILITIES
// ============================================================

/**
 * Fetch permissions from backend and store in state
 */
async function fetchPermissions() {
  try {
    const permRes = await fetchAPI('/settings/permissions/USER');
    state.permissions = permRes;
    return state.permissions;
  } catch (e) {
    console.error('Failed to fetch permissions:', e);
    // Default to typical user permissions
    state.permissions = {
      canStockIn: true,
      canStockOut: true,
      canViewStockLedger: true,
      canViewReports: false,
      canManageCompanies: false
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

  // Permission mapping for user dashboard
  const permissionMap = {
    'stock-in': permissions.canStockIn,
    'stock-out': permissions.canStockOut,
    'ledger': permissions.canViewStockLedger,
    'reports': permissions.canViewReports
  };

  // Apply to menu items
  document.querySelectorAll('.sidebar-nav a[data-section], .sidebar-nav button[data-section]').forEach(link => {
    const section = link.getAttribute('data-section');
    const isAllowed = permissionMap[section];
    
    if (isAllowed === false) {
      link.style.display = 'none';
    } else {
      link.style.display = '';
    }
  });
}

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================

let notificationsCache = [];
let unreadCount = 0;

async function loadNotifications() {
  try {
    const response = await fetchAPI('/notifications?limit=20');
    notificationsCache = response.notifications || response || [];
    renderNotifications();
    return notificationsCache;
  } catch (err) {
    console.error('Error loading notifications:', err);
    return [];
  }
}

async function fetchUnreadCount() {
  try {
    const response = await fetchAPI('/notifications/unread-count');
    unreadCount = response.unreadCount || 0;
    updateBadge();
    return unreadCount;
  } catch (err) {
    console.error('Error fetching unread count:', err);
    return 0;
  }
}

function updateBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  
  if (notificationsCache.length === 0) {
    list.innerHTML = '<p class="no-notifications">No notifications</p>';
    return;
  }
  
  list.innerHTML = notificationsCache.map(n => {
    const iconClass = getNotificationIconClass(n.type);
    const icon = getNotificationIcon(n.type);
    const timeAgo = formatTimeAgo(n.createdAt);
    
    return `
      <div class="notification-item ${n.isRead ? '' : 'unread'} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
        <div class="notification-icon ${iconClass}">${icon}</div>
        <div class="notification-content">
          <div class="notification-title">
            <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
            ${escapeHtml(n.title || 'Notification')}
          </div>
          <div class="notification-message">${escapeHtml(n.message || '')}</div>
          <div class="notification-time">${timeAgo}</div>
          ${n.category ? `<span class="notif-category-badge">${getUserNotifCategoryLabel(n.category)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers with deep link navigation
  list.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', () => {
      const notifId = item.dataset.id;
      markAsRead(notifId);
      const notif = notificationsCache.find(n => n._id === notifId);
      if (notif) {
        const deepLink = resolveUserNotifDeepLink(notif);
        if (deepLink) {
          document.getElementById('notification-dropdown').style.display = 'none';
          loadSection(deepLink);
        }
      }
    });
  });
}

function getNotificationIconClass(type) {
  switch (type) {
    case 'STOCK_IN': return 'stock-in';
    case 'STOCK_OUT': return 'stock-out';
    case 'LOW_STOCK':
    case 'ALERT': return 'alert';
    default: return 'info';
  }
}

function getNotificationIcon(type) {
  switch (type) {
    case 'STOCK_IN': return '📥';
    case 'STOCK_OUT': return '📤';
    case 'LOW_STOCK': return '⚠️';
    case 'ALERT': return '🔔';
    default: return 'ℹ️';
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

async function markAsRead(notificationId) {
  try {
    await fetchAPI(`/notifications/${notificationId}/read`, { method: 'PATCH' });
    const notification = notificationsCache.find(n => n._id === notificationId);
    if (notification && !notification.isRead) {
      notification.isRead = true;
      unreadCount = Math.max(0, unreadCount - 1);
      updateBadge();
      renderNotifications();
    }
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
}

async function markAllAsRead() {
  try {
    await fetchAPI('/notifications/read-all', { method: 'PATCH' });
    notificationsCache.forEach(n => n.isRead = true);
    unreadCount = 0;
    updateBadge();
    renderNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (err) {
    console.error('Error marking all as read:', err);
  }
}

function initNotificationUI() {
  const markAllBtn = document.getElementById('mark-all-read');
  
  // Mark all as read
  if (markAllBtn) {
    markAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      markAllAsRead();
    });
  }
  
  // Initial load of unread count
  fetchUnreadCount();

  // Wire "View All Notifications" button
  const viewAll = document.getElementById('view-all-notifications');
  if (viewAll) {
    viewAll.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('notification-dropdown').style.display = 'none';
      loadSection('all-notifications');
    });
  }
}

// ── User Notification Helpers ────────────────────────────────

function getUserNotifCategoryLabel(cat) {
  const labels = {
    STOCK: '📦 Stock', WARRANTY: '🛡️ Warranty', SYSTEM: '⚙️ System',
    USER: '👤 User', SECURITY: '🔒 Security', COMPANY: '🏢 Company',
    SHIPMENT: '🚚 Shipment'
  };
  return labels[cat] || cat;
}

function resolveUserNotifDeepLink(n) {
  if (n.link) return n.link;
  const typeMap = {
    stock_in: 'supply-management', stock_out: 'shipping-management',
    low_stock: 'all-products', stock_deleted: 'all-products',
    user_registered: 'profile', user_deactivated: 'profile', user_activated: 'profile',
    role_changed: 'profile', password_changed: 'profile', password_reset: 'profile',
    'warranty-purchase-expiring': 'warranty-list', 'warranty-purchase-expired': 'warranty-list',
    'warranty-seller-expiring': 'warranty-list', 'warranty-seller-expired': 'warranty-list',
    'warranty-claim': 'warranty-list',
    order_completed: 'shipping-management'
  };
  return typeMap[n.type] || null;
}

function getUserNotifTimeGroup(dateStr) {
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

function getUserNotifIcon(n) {
  if (n.icon && n.icon !== '🔔') return n.icon;
  return getNotificationIcon(n.type);
}

// ── All Notifications Full Page ──────────────────────────────

let userNotifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

async function initAllNotifications() {
  userNotifPageState = { page: 1, limit: 20, category: '', priority: '', readFilter: '' };

  document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#notif-category-tabs .notif-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      userNotifPageState.category = tab.dataset.category === 'ALL' ? '' : tab.dataset.category;
      userNotifPageState.page = 1;
      loadUserNotifPage();
    });
  });

  document.getElementById('notif-priority-filter')?.addEventListener('change', (e) => {
    userNotifPageState.priority = e.target.value;
    userNotifPageState.page = 1;
    loadUserNotifPage();
  });

  document.getElementById('notif-read-filter')?.addEventListener('change', (e) => {
    userNotifPageState.readFilter = e.target.value;
    userNotifPageState.page = 1;
    loadUserNotifPage();
  });

  document.getElementById('notif-mark-all-read')?.addEventListener('click', async () => {
    await markAllAsRead();
    loadUserNotifPage();
  });

  document.getElementById('notif-delete-read')?.addEventListener('click', async () => {
    if (!confirm('Delete all read notifications?')) return;
    try {
      await fetchAPI('/notifications/read', { method: 'DELETE' });
      showToast('Read notifications cleared', 'success');
      loadUserNotifPage();
    } catch (e) {
      showToast('Failed to delete', 'error');
    }
  });

  loadUserNotifPage();
}

async function loadUserNotifPage() {
  const container = document.getElementById('notif-page-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner">Loading notifications...</div>';

  try {
    let url = `/notifications?page=${userNotifPageState.page}&limit=${userNotifPageState.limit}`;
    if (userNotifPageState.category) url += `&category=${userNotifPageState.category}`;
    if (userNotifPageState.priority) url += `&priority=${userNotifPageState.priority}`;

    const data = await fetchAPI(url);
    let notifications = data.notifications || [];

    if (userNotifPageState.readFilter === 'unread') {
      notifications = notifications.filter(n => !n.isRead);
    } else if (userNotifPageState.readFilter === 'read') {
      notifications = notifications.filter(n => n.isRead);
    }

    if (notifications.length === 0) {
      container.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">🔔</div><p>No notifications found</p></div>';
      renderUserNotifPagination(data);
      return;
    }

    const groups = {};
    notifications.forEach(n => {
      const group = getUserNotifTimeGroup(n.createdAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(n);
    });

    let html = '';
    for (const [groupName, items] of Object.entries(groups)) {
      html += `<div class="notif-time-group">${groupName}</div>`;
      items.forEach(n => {
        html += `
          <div class="notification-item ${!n.isRead ? 'unread' : ''} priority-${(n.priority || 'medium').toLowerCase()}" data-id="${n._id}">
            <div class="notification-icon ${getNotificationIconClass(n.type)}">${getUserNotifIcon(n)}</div>
            <div class="notification-content">
              <div class="notification-title">
                <span class="notif-priority-dot ${(n.priority || 'medium').toLowerCase()}"></span>
                ${escapeHtml(n.title || 'Notification')}
              </div>
              <div class="notification-message">${escapeHtml(n.message || '')}</div>
              <div class="notification-time">${formatTimeAgo(n.createdAt)}</div>
              ${n.category ? `<span class="notif-category-badge">${getUserNotifCategoryLabel(n.category)}</span>` : ''}
            </div>
          </div>`;
      });
    }
    container.innerHTML = html;

    container.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifId = item.dataset.id;
        if (item.classList.contains('unread')) {
          await markAsRead(notifId);
        }
        const notif = notifications.find(n => n._id === notifId);
        if (notif) {
          const deepLink = resolveUserNotifDeepLink(notif);
          if (deepLink) loadSection(deepLink);
        }
      });
    });

    renderUserNotifPagination(data);
  } catch (error) {
    console.error('Error loading notifications page:', error);
    container.innerHTML = '<div class="notif-empty"><div class="notif-empty-icon">❌</div><p>Failed to load notifications</p></div>';
  }
}

function renderUserNotifPagination(data) {
  const pag = document.getElementById('notif-pagination');
  if (!pag) return;
  const total = data.total || 0;
  const totalPages = Math.ceil(total / userNotifPageState.limit) || 1;

  pag.innerHTML = `
    <button id="notif-prev" ${userNotifPageState.page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="page-info">Page ${userNotifPageState.page} of ${totalPages} (${total} total)</span>
    <button id="notif-next" ${userNotifPageState.page >= totalPages ? 'disabled' : ''}>Next →</button>
  `;

  document.getElementById('notif-prev')?.addEventListener('click', () => {
    if (userNotifPageState.page > 1) { userNotifPageState.page--; loadUserNotifPage(); }
  });
  document.getElementById('notif-next')?.addEventListener('click', () => {
    if (userNotifPageState.page < totalPages) { userNotifPageState.page++; loadUserNotifPage(); }
  });
}

// ============================================================
// TOPBAR DROPDOWNS (Support, Profile)
// ============================================================

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-panel').forEach(panel => {
    panel.style.display = 'none';
  });
}

function initTopbarDropdowns() {
  const dropdowns = {
    notifications: {
      btn: document.getElementById('notification-btn'),
      panel: document.getElementById('notification-dropdown')
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
            otherPanel.style.display = 'none';
          }
        });
        
        // Toggle this dropdown
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        
        // Load notifications if opening notifications panel
        if (name === 'notifications' && panel.style.display === 'block') {
          loadNotifications();
        }
      });
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    Object.values(dropdowns).forEach(({ btn, panel }) => {
      if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = 'none';
      }
    });
  });

  // Initialize profile info
  initProfileDropdown();
  
  // Initialize support links
  initSupportLinks();
}

function initProfileDropdown() {
  const user = auth.getUser();
  if (!user) return;

  const elements = {
    name: document.getElementById('profile-name'),
    email: document.getElementById('profile-email'),
    role: document.getElementById('profile-role'),
    avatarLarge: document.getElementById('profile-avatar-large'),
    avatarSmall: document.getElementById('header-avatar'),
    topbarName: document.getElementById('header-name')
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
      document.getElementById('profile-panel').style.display = 'none';
      
      switch (action) {
        case 'my-profile':
          loadSection('profile');
          break;
        case 'change-password':
          showChangePasswordModal();
          break;
      }
    });
  });

  // Profile logout
  const logoutBtn = document.getElementById('profile-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  }
}

function showChangePasswordModal() {
  // Create modal for password change
  const existingModal = document.getElementById('change-password-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'change-password-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 420px;">
      <div class="modal-header">
        <h3>🔑 Change Password</h3>
        <button class="modal-close" id="close-pwd-modal">&times;</button>
      </div>
      <div class="modal-body">
        <form id="change-password-form">
          <div class="form-row">
            <label for="current-password">Current Password</label>
            <input type="password" id="current-password" required placeholder="Enter current password" />
          </div>
          <div class="form-row">
            <label for="new-password">New Password</label>
            <input type="password" id="new-password" required minlength="8" placeholder="Minimum 8 characters" />
          </div>
          <div class="form-row">
            <label for="confirm-password">Confirm New Password</label>
            <input type="password" id="confirm-password" required placeholder="Confirm new password" />
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" id="cancel-pwd-modal">Cancel</button>
        <button class="btn primary" id="save-pwd-modal">Update Password</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.classList.remove('hidden');
  
  // Close handlers
  document.getElementById('close-pwd-modal').onclick = () => modal.remove();
  document.getElementById('cancel-pwd-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  // Save handler
  document.getElementById('save-pwd-modal').onclick = async () => {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
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
      showToast('Password changed successfully', 'success');
      modal.remove();
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    }
  };
}

function initSupportLinks() {
  document.querySelectorAll('.support-link[data-action]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const action = link.dataset.action;
      
      // Close support dropdown
      document.getElementById('support-panel').style.display = 'none';
      
      switch (action) {
        case 'docs':
          showToast('Documentation coming soon!', 'info');
          break;
        case 'faq':
          showToast('FAQ coming soon!', 'info');
          break;
        case 'contact':
          showContactSupportModal();
          break;
        case 'feedback':
          showFeedbackModal();
          break;
      }
    });
  });
}

function showContactSupportModal() {
  showToast('📧 Contact support at: support@acustock.com', 'info');
}

function showFeedbackModal() {
  const existingModal = document.getElementById('feedback-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'feedback-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header">
        <h3>💡 Send Feedback</h3>
        <button class="modal-close" id="close-feedback-modal">&times;</button>
      </div>
      <div class="modal-body">
        <form id="feedback-form">
          <div class="form-row">
            <label for="feedback-type">Feedback Type</label>
            <select id="feedback-type" required>
              <option value="">Select type...</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
              <option value="improvement">Improvement Suggestion</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-row">
            <label for="feedback-message">Your Feedback</label>
            <textarea id="feedback-message" rows="5" required placeholder="Tell us what's on your mind..."></textarea>
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn ghost" id="cancel-feedback-modal">Cancel</button>
        <button class="btn primary" id="send-feedback-modal">Send Feedback</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.classList.remove('hidden');
  
  // Close handlers
  document.getElementById('close-feedback-modal').onclick = () => modal.remove();
  document.getElementById('cancel-feedback-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  // Send handler
  document.getElementById('send-feedback-modal').onclick = () => {
    const type = document.getElementById('feedback-type').value;
    const message = document.getElementById('feedback-message').value;
    
    if (!type || !message) {
      showToast('Please fill in all fields', 'error');
      return;
    }
    
    // In production, this would send to an API
    showToast('Thank you for your feedback! 🙏', 'success');
    modal.remove();
  };
}

// ============================================================
// COMPANIES CACHE FOR AUTO-FILL
// ============================================================

let companiesCache = [];

async function loadCompaniesCache() {
  if (companiesCache.length > 0) return companiesCache;
  try {
    const response = await fetchAPI('/companies?limit=100');
    // API returns { companies: [...], total, ... }
    companiesCache = response.companies || response || [];
    return companiesCache;
  } catch (err) {
    console.error('Error loading companies:', err);
    return [];
  }
}

function initShippingCompanyDropdown(form) {
  // For Stock OUT (Buyer) - match manager dashboard
  const companySelect = form.querySelector('#by-companySelect');
  const companyNameInput = form.querySelector('#by-companyName');
  const phoneInput = form.querySelector('#by-customerPhone');
  const emailInput = form.querySelector('#by-customerEmail');
  const addressInput = form.querySelector('#by-customerAddress');
  const cityInput = form.querySelector('#by-city');
  const stateInput = form.querySelector('#by-state');
  const pincodeInput = form.querySelector('#by-pincode');
  const customerNameInput = form.querySelector('#by-customerName');

  if (!companySelect) return;

  // Populate dropdown
  loadCompaniesCache().then(companies => {
    companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
      companies.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  });

  // Auto-fill on selection
  companySelect.addEventListener('change', async () => {
    const companyId = companySelect.value;
    if (!companyId) return;

    // Find in cache
    let company = companiesCache.find(c => c._id === companyId);
    if (!company) {
      try {
        company = await fetchAPI(`/companies/${companyId}`);
      } catch (err) {
        console.error('Error fetching company:', err);
        return;
      }
    }

    // Auto-fill fields
    if (companyNameInput) companyNameInput.value = company.name || '';
    if (customerNameInput) customerNameInput.value = company.contactPerson || '';
    if (phoneInput) phoneInput.value = company.phone || '';
    if (emailInput) emailInput.value = company.email || '';
    if (addressInput) addressInput.value = company.address?.street || '';
    if (cityInput) cityInput.value = company.address?.city || '';
    if (stateInput) stateInput.value = company.address?.state || '';
    if (pincodeInput) pincodeInput.value = company.address?.zipCode || '';
  });
}

function initSupplyCompanyDropdown(form) {
  // For Stock IN (Supplier) - match manager dashboard
  const companySelect = form.querySelector('#sp-companySelect');
  const companyNameInput = form.querySelector('#sp-companyName');
  const phoneInput = form.querySelector('#sp-customerPhone');
  const emailInput = form.querySelector('#sp-customerEmail');
  const addressInput = form.querySelector('#sp-customerAddress');
  const cityInput = form.querySelector('#sp-city');
  const stateInput = form.querySelector('#sp-state');
  const pincodeInput = form.querySelector('#sp-pincode');
  const customerNameInput = form.querySelector('#sp-customerName');

  if (!companySelect) return;

  // Populate dropdown
  loadCompaniesCache().then(companies => {
    companySelect.innerHTML = '<option value="">-- Select Existing Company or Enter New --</option>' +
      companies.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
  });

  // Auto-fill on selection
  companySelect.addEventListener('change', async () => {
    const companyId = companySelect.value;
    if (!companyId) return;

    // Find in cache
    let company = companiesCache.find(c => c._id === companyId);
    if (!company) {
      try {
        company = await fetchAPI(`/companies/${companyId}`);
      } catch (err) {
        console.error('Error fetching company:', err);
        return;
      }
    }

    // Auto-fill fields
    if (companyNameInput) companyNameInput.value = company.name || '';
    if (customerNameInput) customerNameInput.value = company.contactPerson || '';
    if (phoneInput) phoneInput.value = company.phone || '';
    if (emailInput) emailInput.value = company.email || '';
    if (addressInput) addressInput.value = company.address?.street || '';
    if (cityInput) cityInput.value = company.address?.city || '';
    if (stateInput) stateInput.value = company.address?.state || '';
    if (pincodeInput) pincodeInput.value = company.address?.zipCode || '';
  });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', title = '') {
  const container = document.querySelector('.toast-container') || (() => {
    const c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  })();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = title ?
    `<div class="title">${escapeHtml(title)}</div><div class="msg">${escapeHtml(message)}</div>` :
    `<div class="msg">${escapeHtml(message)}</div>`;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3800);

  toast.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  });

  return toast;
}

// ============================================================
// PAGE INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;

  if (page === "user") {
    // Verify session with server (HTTP-only cookie)
    const user = await auth.verifySession();
    
    if (!user) {
      window.location.href = LOGIN_PAGE;
      return;
    }
    
    if (user.role !== 'USER') {
      showToast('Access denied. User role required.', 'error');
      setTimeout(() => auth.logout(), 2000);
      return;
    }
    
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
      return;
    }
    
    initUserDashboard();
  }
});

// Force Password Reset Modal for Users
function showForcePasswordResetModal() {
  // Mark body as loaded so it becomes visible
  document.body.classList.add('loaded');
  
  // Remove existing modal if any
  const existingModal = document.getElementById('force-password-reset-modal');
  if (existingModal) existingModal.remove();
  
  // Create modal
  const modal = document.createElement('div');
  modal.id = 'force-password-reset-modal';
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 10000;';
  modal.innerHTML = `
    <div style="background: #1e293b; border-radius: 16px; padding: 32px; max-width: 420px; width: 90%; box-shadow: 0 25px 80px rgba(0,0,0,0.5);">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: rgba(108, 92, 231, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px;">
          🔐
        </div>
        <h2 style="margin: 0 0 8px 0; color: #e2e8f0;">Password Reset Required</h2>
        <p style="color: #94a3b8; font-size: 0.95rem;">
          Your administrator has requested that you change your password before continuing.
        </p>
      </div>
      
      <form id="force-reset-form" style="margin-top: 20px;">
        <div style="margin-bottom: 16px;">
          <label for="force-new-password" style="display: block; margin-bottom: 8px; color: #94a3b8; font-size: 0.9rem;">New Password</label>
          <div style="position: relative;">
            <input type="password" id="force-new-password" required minlength="8" 
                   placeholder="Minimum 8 characters"
                   style="width: 100%; padding: 14px 50px 14px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #0f172a; color: #ffffff; box-sizing: border-box; font-size: 1rem; outline: none;" 
                   onfocus="this.style.borderColor='#6c5ce7'; this.style.boxShadow='0 0 0 3px rgba(108,92,231,0.2)';"
                   onblur="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.boxShadow='none';" />
            <button type="button" id="toggle-new-password" 
                    style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 4px;"
                    title="Show password">👁️</button>
          </div>
        </div>
        
        <div style="margin-bottom: 24px;">
          <label for="force-confirm-password" style="display: block; margin-bottom: 8px; color: #94a3b8; font-size: 0.9rem;">Confirm Password</label>
          <div style="position: relative;">
            <input type="password" id="force-confirm-password" required minlength="8" 
                   placeholder="Confirm your password"
                   style="width: 100%; padding: 14px 50px 14px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #0f172a; color: #ffffff; box-sizing: border-box; font-size: 1rem; outline: none;"
                   onfocus="this.style.borderColor='#6c5ce7'; this.style.boxShadow='0 0 0 3px rgba(108,92,231,0.2)';"
                   onblur="this.style.borderColor='rgba(255,255,255,0.2)'; this.style.boxShadow='none';" />
            <button type="button" id="toggle-confirm-password" 
                    style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 4px;"
                    title="Show password">👁️</button>
          </div>
        </div>
        
        <div id="force-reset-error" style="display: none; padding: 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #ef4444; margin-bottom: 16px; text-align: center;"></div>
        
        <button type="submit" style="width: 100%; padding: 14px; border-radius: 8px; background: linear-gradient(135deg, #6c5ce7, #a855f7); color: white; border: none; cursor: pointer; font-size: 1rem; font-weight: 600; transition: transform 0.2s, box-shadow 0.2s;"
                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 15px rgba(108,92,231,0.4)';"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
          Change Password & Continue
        </button>
      </form>
      
      <p style="text-align: center; margin-top: 16px; font-size: 0.85rem; color: #64748b;">
        You cannot access the dashboard until you change your password.
      </p>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup show/hide password toggles
  const toggleNewPassword = document.getElementById('toggle-new-password');
  const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
  const newPasswordInput = document.getElementById('force-new-password');
  const confirmPasswordInput = document.getElementById('force-confirm-password');
  
  toggleNewPassword.addEventListener('click', () => {
    const isPassword = newPasswordInput.type === 'password';
    newPasswordInput.type = isPassword ? 'text' : 'password';
    toggleNewPassword.textContent = isPassword ? '🙈' : '👁️';
    toggleNewPassword.title = isPassword ? 'Hide password' : 'Show password';
  });
  
  toggleConfirmPassword.addEventListener('click', () => {
    const isPassword = confirmPasswordInput.type === 'password';
    confirmPasswordInput.type = isPassword ? 'text' : 'password';
    toggleConfirmPassword.textContent = isPassword ? '🙈' : '👁️';
    toggleConfirmPassword.title = isPassword ? 'Hide password' : 'Show password';
  });
  
  // Handle form submission
  document.getElementById('force-reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = document.getElementById('force-new-password').value;
    const confirmPassword = document.getElementById('force-confirm-password').value;
    const errorDiv = document.getElementById('force-reset-error');
    
    errorDiv.style.display = 'none';
    
    // Validate
    if (newPassword.length < 8) {
      errorDiv.textContent = 'Password must be at least 8 characters';
      errorDiv.style.display = 'block';
      return;
    }
    
    if (newPassword !== confirmPassword) {
      errorDiv.textContent = 'Passwords do not match';
      errorDiv.style.display = 'block';
      return;
    }
    
    try {
      const btn = e.target.querySelector('button[type="submit"]');
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
        modal.remove();
        showToast('Password changed successfully!', 'success');
        // Initialize dashboard
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        errorDiv.textContent = data.message || 'Failed to change password';
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Change Password & Continue';
      }
    } catch (error) {
      errorDiv.textContent = 'Network error. Please try again.';
      errorDiv.style.display = 'block';
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = false;
      btn.textContent = 'Change Password & Continue';
    }
  });
}

function initUserDashboard() {
  const user = auth.getUser();
  renderUserInfo(user);
  initSidebar();
  initNavigation();
  initStatusModal();
  initNotificationUI(); // Initialize notification system
  initTopbarDropdowns(); // Initialize support & profile dropdowns
  initRealTimeUpdates(user); // Initialize WebSocket real-time updates
  loadSection('dashboard');
  initLogout();
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
  AcuStockRealtime.connect('USER', user._id);

  // Handle stock updates
  AcuStockRealtime.on('stock-update', (data) => {
    showToast(`Stock ${data.type}: ${data.quantity} units of ${data.productName}`, 'info');
    
    // Refresh dashboard stats
    const currentSection = document.querySelector('.nav-link.active')?.dataset?.section;
    if (currentSection === 'dashboard') {
      loadDashboardData();
    }
  });

  // Handle product updates
  AcuStockRealtime.on('product-update', (data) => {
    showToast(`Product ${data.action}: ${data.product?.name || 'Unknown'}`, 'info');
  });

  // Handle low stock alerts
  AcuStockRealtime.on('low-stock-alert', (data) => {
    showToast(`⚠️ Low Stock: ${data.productName} (${data.currentStock} remaining)`, 'warning');
  });
}

function renderUserInfo(user) {
  if (!user) return;
  
  // Get initials
  const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  
  // Sidebar user info card
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarPhone = document.getElementById('sidebar-user-phone');
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = user.name || 'User';
  if (sidebarPhone) sidebarPhone.textContent = user.phone || user.email || '-';
  
  // Header user profile
  const headerAvatar = document.getElementById('header-avatar');
  const headerName = document.getElementById('header-name');
  if (headerAvatar) headerAvatar.textContent = initials;
  if (headerName) headerName.textContent = user.name || 'User';
  
  // Add loaded class for fade-in
  document.body.classList.add('loaded');
}

function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggle-sidebar");

  function isMobile() {
    return window.innerWidth <= 980;
  }

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle(isMobile() ? "open" : "collapsed");
    });
  }

  document.addEventListener("click", (e) => {
    if (isMobile() && sidebar && sidebar.classList.contains("open") && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });
}

function initNavigation() {
  document.querySelectorAll('[data-section]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const sec = a.dataset.section;
      if (sec) {
        // Update active state
        document.querySelectorAll('[data-section]').forEach(link => link.classList.remove('active'));
        a.classList.add('active');
        loadSection(sec);
      }
    });
  });
}

function initLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
    });
  }
}


function loadSection(name) {
  const tpl = document.getElementById(name);
  const target = document.getElementById('content');

  if (!target) return;
  target.innerHTML = '';

  if (tpl) {
    const clone = tpl.content.cloneNode(true);
    target.appendChild(clone);
    postLoadInit(name);
  } else {
    target.innerHTML = `<div class="card"><h3>Section not found</h3><p>Template "${name}" not found</p></div>`;
  }
}

function postLoadInit(name) {
  const handlers = {
    'dashboard': renderDashboard,
    'all-products': renderAllProducts,
    'shipping-management': initShippingManagement,
    'supply-management': initSupplyManagement,
    'profile': initProfile,
    'warranty-list': initWarrantyList,
    'all-notifications': initAllNotifications,
  };

  if (handlers[name]) {
    handlers[name]();
  }
}

async function renderDashboard() {
  // Set welcome name
  const user = auth.getUser();
  const welcomeName = document.getElementById('welcome-name');
  if (welcomeName && user) {
    welcomeName.textContent = user.name || 'User';
  }
  
  try {
    // Fetch stats from shipments API
    const [products, statsData, pendingData] = await Promise.all([
      fetchAPI('/items').catch(() => []),
      fetchAPI('/shipments/stats').catch(() => ({ totalShipments: 0, totalSupplies: 0, pendingDeliveries: 0 })),
      fetchAPI('/shipments/pending').catch(() => ({ shipments: [], count: 0 }))
    ]);
    
    const totalProducts = document.getElementById('total-products');
    const totalShipments = document.getElementById('total-shipments');
    const totalSupplies = document.getElementById('total-supplies');
    const pendingDeliveries = document.getElementById('pending-deliveries');
    
    if (totalProducts) totalProducts.textContent = Array.isArray(products) ? products.length : 0;
    if (totalShipments) totalShipments.textContent = statsData.totalShipments || 0;
    if (totalSupplies) totalSupplies.textContent = statsData.totalSupplies || 0;
    if (pendingDeliveries) pendingDeliveries.textContent = statsData.pendingDeliveries || 0;
    
    // Render pending deliveries table
    renderPendingDeliveries(pendingData.shipments || []);
    
    // Make pending card clickable
    const pendingCard = document.getElementById('pending-card');
    if (pendingCard) {
      pendingCard.addEventListener('click', () => {
        const section = document.getElementById('pending-deliveries-section');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
    
    // Init status filter
    const statusFilter = document.getElementById('pending-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', async () => {
        const status = statusFilter.value;
        try {
          const data = await fetchAPI(`/shipments/pending${status ? `?status=${status}` : ''}`);
          renderPendingDeliveries(data.shipments || []);
        } catch (error) {
          console.error('Error filtering pending deliveries:', error);
        }
      });
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
  }
}

// Render pending deliveries table
function renderPendingDeliveries(shipments) {
  const tbody = document.getElementById('pending-tbody');
  const emptyState = document.getElementById('pending-empty');
  
  if (!tbody) return;
  
  if (!shipments || shipments.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  
  if (emptyState) emptyState.classList.add('hidden');
  
  tbody.innerHTML = shipments.map(s => `
    <tr data-id="${s._id}">
      <td><span class="ref-badge">${escapeHtml(s.reference)}</span></td>
      <td>${escapeHtml(s.productName || (s.productId?.name) || '-')}</td>
      <td>
        <div class="customer-info">
          <span class="customer-name">${escapeHtml(s.customerName)}</span>
          <span class="customer-phone">${escapeHtml(s.phone || '')}</span>
        </div>
      </td>
      <td>${s.awb ? `<span class="awb-badge">${escapeHtml(s.awb)}</span>` : '<span class="muted">-</span>'}</td>
      <td><span class="status-badge status-${s.status.toLowerCase().replace('_', '-')}">${formatStatus(s.status)}</span></td>
      <td>${s.dispatchDate ? new Date(s.dispatchDate).toLocaleDateString() : '<span class="muted">Not dispatched</span>'}</td>
      <td>
        <div class="action-btns">
          <button class="btn ghost small" onclick="openStatusModal('${s._id}')" title="Update Status">📝</button>
          <button class="btn ghost small" onclick="viewShipmentDetails('${s._id}')" title="View Details">👁️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Format status for display
function formatStatus(status) {
  const statusMap = {
    'PENDING': 'Pending',
    'DISPATCHED': 'Dispatched',
    'IN_TRANSIT': 'In Transit',
    'OUT_FOR_DELIVERY': 'Out for Delivery',
    'DELIVERED': 'Delivered',
    'RETURNED': 'Returned',
    'CANCELLED': 'Cancelled'
  };
  return statusMap[status] || status;
}

// Store current shipment for modal
let currentShipmentId = null;

// Open status update modal
async function openStatusModal(shipmentId) {
  currentShipmentId = shipmentId;
  const modal = document.getElementById('status-modal');
  
  try {
    const shipment = await fetchAPI(`/shipments/${shipmentId}`);
    
    document.getElementById('modal-reference').textContent = shipment.reference;
    document.getElementById('modal-customer').textContent = shipment.customerName;
    document.getElementById('modal-product').textContent = shipment.productName || shipment.productId?.name || '-';
    document.getElementById('modal-status').value = '';
    document.getElementById('modal-notes').value = '';
    document.getElementById('modal-received-by').value = '';
    
    modal.classList.remove('hidden');
    
    // Handle status change to show/hide received by field
    const statusSelect = document.getElementById('modal-status');
    const receivedByRow = document.getElementById('received-by-row');
    statusSelect.addEventListener('change', () => {
      if (statusSelect.value === 'DELIVERED') {
        receivedByRow.style.display = 'block';
      } else {
        receivedByRow.style.display = 'none';
      }
    });
  } catch (error) {
    showToast('Failed to load shipment details', 'error');
  }
}

// Close modal
function closeStatusModal() {
  const modal = document.getElementById('status-modal');
  if (modal) modal.classList.add('hidden');
  currentShipmentId = null;
}

// Save status update
async function saveStatusUpdate() {
  if (!currentShipmentId) return;
  
  const status = document.getElementById('modal-status').value;
  const notes = document.getElementById('modal-notes').value;
  const receivedBy = document.getElementById('modal-received-by').value;
  
  if (!status) {
    showToast('Please select a status', 'warning');
    return;
  }
  
  try {
    await fetchAPI(`/shipments/${currentShipmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes, receivedBy })
    });
    
    showToast('Status updated successfully', 'success');
    closeStatusModal();
    
    // Refresh dashboard
    renderDashboard();
  } catch (error) {
    showToast(error.message || 'Failed to update status', 'error');
  }
}

// View shipment details
async function viewShipmentDetails(shipmentId) {
  try {
    const s = await fetchAPI(`/shipments/${shipmentId}`);

    // Remove any existing detail modal
    document.getElementById('shipment-detail-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'shipment-detail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>📦 Shipment Details</h3>
          <button class="modal-close" id="shipment-detail-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="shipment-info">
            <p><strong>Reference:</strong> ${escapeHtml(s.reference || '—')}</p>
            <p><strong>Product:</strong> ${escapeHtml(s.productName || '—')}</p>
            <p><strong>Quantity:</strong> ${s.quantity ?? '—'}</p>
            <p><strong>Customer:</strong> ${escapeHtml(s.customerName || '—')}</p>
            <p><strong>Phone:</strong> ${escapeHtml(s.phone || '—')}</p>
            <p><strong>Address:</strong> ${escapeHtml([s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ') || '—')}</p>
            <p><strong>Courier:</strong> ${escapeHtml(s.courier || '—')}</p>
            <p><strong>AWB:</strong> ${escapeHtml(s.awb || '—')}</p>
            <p><strong>Status:</strong> ${escapeHtml(formatStatus(s.status))}</p>
            <p><strong>Dispatch Date:</strong> ${s.dispatchDate ? new Date(s.dispatchDate).toLocaleDateString() : '—'}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn ghost" id="shipment-detail-cancel">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#shipment-detail-close').addEventListener('click', close);
    modal.querySelector('#shipment-detail-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  } catch (error) {
    showToast('Failed to load shipment details', 'error');
  }
}

// Initialize modal event listeners
function initStatusModal() {
  const closeBtn = document.getElementById('status-modal-close');
  const cancelBtn = document.getElementById('status-modal-cancel');
  const saveBtn = document.getElementById('status-modal-save');
  const overlay = document.getElementById('status-modal');
  
  if (closeBtn) closeBtn.addEventListener('click', closeStatusModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeStatusModal);
  if (saveBtn) saveBtn.addEventListener('click', saveStatusUpdate);
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeStatusModal();
  });
}

// Make functions globally available
window.openStatusModal = openStatusModal;
window.viewShipmentDetails = viewShipmentDetails;

async function renderAllProducts() {
  let allItems = [];
  let filteredItems = [];
  let currentPage = 1;
  const PAGE_SIZE = 15;

  // Fetch all products once (list endpoint returns quantity)
  try {
    allItems = await fetchAPI('/items');
    filteredItems = allItems;
  } catch (error) {
    console.error('Error fetching items:', error);
    const tbody = document.querySelector('#product-table tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Failed to load products.</td></tr>';
    return;
  }

  function renderPage() {
    const tbody = document.querySelector('#product-table tbody');
    if (!tbody) return;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredItems.slice(start, start + PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

    // Update pagination
    const pageEl = document.getElementById('product-page');
    if (pageEl) pageEl.textContent = `${currentPage} / ${totalPages}`;
    const prevBtn = document.getElementById('product-prev');
    const nextBtn = document.getElementById('product-next');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280;">No products found.</td></tr>';
      return;
    }

    tbody.innerHTML = pageItems.map(item => `
      <tr>
        <td>${escapeHtml(item.name || '—')}</td>
        <td>${escapeHtml(item.shortName || '—')}</td>
        <td>${escapeHtml(item.hsn || '—')}</td>
        <td><strong>${item.quantity ?? 0}</strong></td>
        <td>
          <button class="btn ghost small" onclick="viewProductDetail('${item._id}')" title="View Details">
            👁️ View
          </button>
        </td>
      </tr>`).join('');
  }

  // Search
  const searchInput = document.getElementById('product-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      filteredItems = q
        ? allItems.filter(i =>
            (i.name || '').toLowerCase().includes(q) ||
            (i.shortName || '').toLowerCase().includes(q) ||
            (i.hsn || '').toLowerCase().includes(q))
        : allItems;
      currentPage = 1;
      renderPage();
    });
  }

  // Pagination
  const prevBtn = document.getElementById('product-prev');
  const nextBtn = document.getElementById('product-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderPage(); } });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
    if (currentPage < totalPages) { currentPage++; renderPage(); }
  });

  // Store list for use in detail modal (quantity is here)
  window._allProductsCache = allItems;

  renderPage();
}

async function viewProductDetail(id) {
  if (!id) return;
  try {
    // Use cached list item for quantity (not in single-item endpoint)
    const cached = (window._allProductsCache || []).find(i => i._id === id);
    // Fetch full item details (prices, warranty, serial policy etc.)
    const item = await fetchAPI(`/items/${id}`);
    // Merge quantity from list cache
    if (cached) item.quantity = cached.quantity;

    const modal = document.getElementById('product-detail-modal');
    if (!modal) return;

    const setText = (elId, val) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = (val !== null && val !== undefined && val !== '') ? val : '—';
    };

    setText('pd-name', item.name);
    setText('pd-shortname', item.shortName);
    setText('pd-hsn', item.hsn);
    setText('pd-qty', item.quantity ?? 0);
    setText('pd-sales', item.salesPrice != null ? `₹${item.salesPrice.toLocaleString('en-IN')}` : null);
    setText('pd-mrp', item.mrp != null ? `₹${item.mrp.toLocaleString('en-IN')}` : null);
    setText('pd-lowstock', item.lowStockThreshold != null ? `${item.lowStockThreshold} units` : null);
    setText('pd-warranty', item.warranty || 'None');
    setText('pd-seller-warranty', item.defaultSellerWarranty || 'None');
    setText('pd-serial', item.serialPolicy?.enableSerial ? '✅ Enabled' : '❌ Disabled');
    setText('pd-status', item.isActive !== false ? '✅ Active' : '❌ Inactive');

    modal.style.display = 'flex';
  } catch (err) {
    console.error('Failed to load product detail:', err);
    showToast('Failed to load product details', 'error');
  }
}

function closeProductModal() {
  const modal = document.getElementById('product-detail-modal');
  if (modal) modal.style.display = 'none';
}

window.viewProductDetail = viewProductDetail;
window.closeProductModal = closeProductModal;

// ============================================================
// SHARED SERIAL NUMBER HELPERS (used by Stock IN & Stock OUT)
// ============================================================

function generateSerialInputs(container, qty, prefix = 'SN') {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < qty; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'serial-input-wrapper';
    wrapper.style.cssText = 'position: relative;';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'serial-input';
    input.placeholder = `Enter serial number ${i + 1}`;
    input.dataset.index = i;
    input.style.cssText = 'width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;';
    input.addEventListener('input', () => validateSerialInputs(container));
    input.addEventListener('blur', () => {
      if (input.value) input.value = input.value.trim().toUpperCase();
      validateSerialInputs(container);
    });
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }
}

function validateSerialInputs(container) {
  if (!container) return { valid: false, filled: 0, hasDuplicates: false };
  const inputs = container.querySelectorAll('.serial-input');
  const values = [];
  let filled = 0;
  let hasDuplicates = false;
  inputs.forEach(input => {
    const val = input.value.trim().toUpperCase();
    if (val) {
      filled++;
      if (values.includes(val)) {
        hasDuplicates = true;
        input.style.borderColor = '#dc2626';
        input.classList.add('duplicate');
      } else {
        input.style.borderColor = '#22c55e';
        input.classList.remove('duplicate');
        input.classList.add('filled');
      }
      values.push(val);
    } else {
      input.style.borderColor = '#ddd';
      input.classList.remove('filled', 'duplicate');
    }
  });
  // Update nearest status badge
  const statusEl = container.closest('.serial-number-section')?.querySelector('[id$="-serial-status"]');
  if (statusEl) {
    statusEl.textContent = `${filled} / ${inputs.length} filled`;
    statusEl.style.background = (filled === inputs.length && !hasDuplicates) ? '#dcfce7' : '#fef3c7';
    statusEl.style.color = (filled === inputs.length && !hasDuplicates) ? '#166534' : '#92400e';
  }
  return { valid: filled === inputs.length && !hasDuplicates, filled, hasDuplicates };
}

function getSerialNumbers(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('.serial-input'))
    .map(input => input.value.trim().toUpperCase())
    .filter(Boolean);
}

function autoGenerateSerials(container, prefix = 'SN') {
  if (!container) return;
  const inputs = container.querySelectorAll('.serial-input');
  const timestamp = Date.now().toString(36).toUpperCase();
  inputs.forEach((input, i) => {
    if (!input.value.trim()) {
      input.value = `${prefix}-${timestamp}-${String(i + 1).padStart(4, '0')}`;
    }
  });
  validateSerialInputs(container);
}

function applyBulkSerials(container, text) {
  if (!container || !text) return;
  const serials = text.split(/[\n,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  const inputs = container.querySelectorAll('.serial-input');
  serials.forEach((serial, i) => {
    if (inputs[i]) inputs[i].value = serial;
  });
  validateSerialInputs(container);
}

async function initShippingManagement() {
  // Stock OUT (Buyer Entry) - Same as Manager Dashboard
  const form = document.getElementById('stock-buyer-form');
  if (!form) return;

  // Initialize company dropdown with auto-fill
  initShippingCompanyDropdown(form);

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
          >${escapeHtml(m.shortName || m.name)} (Stock: ${m.quantity || 0})</option>`).join('');
        
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

  // Load available serials — clicking a pill fills the next empty text input
  async function loadAvailableSerials(productId) {
    try {
      const res = await fetchAPI(`/stock/serials/${productId}?status=available`);
      availableSerials = res.serials || [];
      
      if (availableSerialsContainer) {
        if (availableSerials.length === 0) {
          availableSerialsContainer.innerHTML = '<p style="padding: 10px; color: #6b7280;">No serial numbers available for this product.</p>';
        } else {
          availableSerialsContainer.innerHTML = availableSerials.map(serial => `
            <button type="button" class="serial-pill" data-serial="${serial}" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 20px; background: #f3f4f6; cursor: pointer; transition: all 0.2s;">${serial}</button>
          `).join('');
          
          // Clicking a pill fills the next empty input box (clicking again clears it)
          availableSerialsContainer.querySelectorAll('.serial-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              const serial = btn.dataset.serial;
              const inputs = serialInputsContainer?.querySelectorAll('.serial-input');
              if (!inputs) return;

              // If already in an input, clear it
              let found = false;
              inputs.forEach(input => {
                if (input.value.trim().toUpperCase() === serial) {
                  input.value = '';
                  input.classList.remove('filled');
                  btn.style.background = '#f3f4f6';
                  btn.style.borderColor = '#ddd';
                  btn.style.color = '#374151';
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
                  btn.style.background = '#3b82f6';
                  btn.style.borderColor = '#3b82f6';
                  btn.style.color = '#ffffff';
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
        btn.style.background = '#f3f4f6';
        btn.style.borderColor = '#ddd';
        btn.style.color = '#374151';
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
      loadSection('dashboard');
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
    cancelBtn.addEventListener('click', () => loadSection('dashboard'));
  }
}

async function initSupplyManagement() {
  // Stock IN (Supplier Entry) - Same as Manager Dashboard
  const form = document.getElementById('stock-supplier-form');
  if (!form) return;

  // Initialize company dropdown with auto-fill
  initSupplyCompanyDropdown(form);

  const productNameSelect = form.querySelector('#sp-productName');
  const productSelect = form.querySelector('#sp-productId');
  const serialSection = document.getElementById('supplier-serial-section');
  const serialInputsContainer = document.getElementById('supplier-serial-inputs');
  const quantityInput = form.querySelector('#sp-quantity');
  const serialCountEl = document.getElementById('supplier-serial-count');
  const serialHintEl = form.querySelector('#sp-serial-hint');
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

  // Generate serial input fields
  // (uses shared generateSerialInputs / validateSerialInputs / getSerialNumbers / autoGenerateSerials / applyBulkSerials defined above)

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
      serialStatusEl.style.background = '#fef3c7';
      serialStatusEl.style.color = '#92400e';
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
        input.style.borderColor = '#ddd';
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
      showToast(`Loaded serials from file`, 'success');
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
      loadSection('dashboard');
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
    cancelBtn.addEventListener('click', () => loadSection('dashboard'));
  }
}

async function initProfile() {
  // Profile page - load user info
  const user = auth.getUser();
  
  // Populate form fields
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const phoneEl = document.getElementById('profile-phone');
  const roleEl = document.getElementById('profile-role');
  const statusEl = document.getElementById('profile-status');

  if (nameEl) nameEl.value = user?.name || '';
  if (emailEl) emailEl.value = user?.email || 'Not assigned';
  if (phoneEl) phoneEl.value = user?.phone || 'Not assigned';
  if (roleEl) roleEl.value = user?.role || 'USER';
  if (statusEl) statusEl.value = user?.isActive !== false ? 'Active' : 'Inactive';

  // Handle form submission
  const form = document.getElementById('profile-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('profile-name')?.value?.trim();
      const currentPassword = document.getElementById('profile-current-password')?.value;
      const newPassword = document.getElementById('profile-new-password')?.value;
      const confirmPassword = document.getElementById('profile-confirm-password')?.value;
      
      // Validate name
      if (!name) {
        showToast('Name is required', 'error');
        return;
      }
      
      // Validate password if changing
      if (newPassword || confirmPassword || currentPassword) {
        if (!currentPassword) {
          showToast('Current password is required to change password', 'error');
          return;
        }
        if (newPassword !== confirmPassword) {
          showToast('New passwords do not match', 'error');
          return;
        }
        if (newPassword.length < 8) {
          showToast('New password must be at least 8 characters', 'error');
          return;
        }
      }
      
      try {
        const payload = { name };
        if (newPassword && currentPassword) {
          payload.password = newPassword;
          payload.currentPassword = currentPassword;
        }
        
        const result = await fetchAPI('/users/profile', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        
        // Update stored user data
        const updatedUser = { ...user, name: result.user.name };
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
        
        // Update UI
        renderUserInfo(updatedUser);
        
        // Clear password fields
        if (document.getElementById('profile-current-password')) {
          document.getElementById('profile-current-password').value = '';
        }
        if (document.getElementById('profile-new-password')) {
          document.getElementById('profile-new-password').value = '';
        }
        if (document.getElementById('profile-confirm-password')) {
          document.getElementById('profile-confirm-password').value = '';
        }
        
        showToast('Profile updated successfully', 'success');
      } catch (error) {
        showToast(error.message || 'Failed to update profile', 'error');
      }
    });
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('profile-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      loadSection('dashboard');
    });
  }
}

function renderTable(tableId, data, columns) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center;">No data available</td></tr>`;
    return;
  }

  data.forEach(item => {
    const row = document.createElement('tr');
    columns.forEach(column => {
      const cell = document.createElement('td');
      cell.textContent = item[column];
      row.appendChild(cell);
    });
    // Add actions cell
    const actionsCell = document.createElement('td');
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  });
}

// ============================================================
// WARRANTY SECTION (Seller Warranty only for USER role)
// ============================================================

let _wPage = 1;
let _wPages = 1;
const W_LIMIT = 20;

async function initWarrantyList() {
  await _loadWarrantyStats();
  await _loadWarranties();

  // Search
  const searchInput = document.getElementById('warranty-search');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { _wPage = 1; _loadWarranties(); }, 350);
    });
  }

  // Status filter
  const statusFilter = document.getElementById('warranty-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', () => { _wPage = 1; _loadWarranties(); });
  }

  // Pagination
  const prevBtn = document.getElementById('warranty-prev');
  const nextBtn = document.getElementById('warranty-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { if (_wPage > 1) { _wPage--; _loadWarranties(); } });
  if (nextBtn) nextBtn.addEventListener('click', () => { if (_wPage < _wPages) { _wPage++; _loadWarranties(); } });

  // Table row click → view detail
  const tbody = document.getElementById('warranty-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-wid]');
      if (row) viewWarrantyDetail(row.dataset.wid);
    });
  }
}

async function _loadWarrantyStats() {
  try {
    const res = await fetchAPI('/warranty/stats');
    const seller = res.seller || {};
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
    setEl('sw-active', seller.active ?? 0);
    setEl('sw-expiring', seller.expiringSoon ?? 0);
    setEl('sw-expired', seller.expired ?? 0);
  } catch (err) {
    console.error('Failed to load warranty stats:', err);
  }
}

async function _loadWarranties() {
  const tbody = document.getElementById('warranty-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Loading…</td></tr>';

  const search = document.getElementById('warranty-search')?.value?.trim() || '';
  const status = document.getElementById('warranty-status-filter')?.value || '';

  const params = new URLSearchParams({
    page: _wPage,
    limit: W_LIMIT,
    type: 'seller',   // User only sees seller warranties
  });
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  try {
    const res = await fetchAPI(`/warranty?${params}`);
    const warranties = res.warranties || [];
    _wPages = res.pages || res.totalPages || 1;

    const pageInfo = document.getElementById('warranty-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${_wPage} of ${_wPages}`;

    const prevBtn = document.getElementById('warranty-prev');
    const nextBtn = document.getElementById('warranty-next');
    if (prevBtn) prevBtn.disabled = _wPage <= 1;
    if (nextBtn) nextBtn.disabled = _wPage >= _wPages;

    if (warranties.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">No warranties found.</td></tr>';
      return;
    }

    tbody.innerHTML = warranties.map(w => {
      const sw = w.sellerWarranty || {};
      const swDays = w.sellerDaysLeft ?? '—';
      const swStatus = _warrantyStatusBadge(swDays);
      const swExpiry = sw.expiryDate ? new Date(sw.expiryDate).toLocaleDateString() : '—';
      const buyer = sw.companyName || sw.buyerName || '—';

      return `
        <tr data-wid="${w._id}" style="cursor:pointer;" title="Click to view details">
          <td><code>${escapeHtml(w.serialNumber || '—')}</code></td>
          <td>${escapeHtml(w.productName || '—')}</td>
          <td>${swExpiry}</td>
          <td>${swStatus}</td>
          <td>${escapeHtml(buyer)}</td>
          <td><button class="btn ghost small">👁️ View</button></td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load warranties:', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Failed to load warranties.</td></tr>';
  }
}

function _warrantyStatusBadge(daysLeft) {
  if (daysLeft === '—' || daysLeft === null || daysLeft === undefined) return '<span class="badge">—</span>';
  if (daysLeft <= 0) return '<span class="badge badge-danger">Expired</span>';
  if (daysLeft <= 30) return `<span class="badge badge-warning">${daysLeft}d</span>`;
  return `<span class="badge badge-success">${daysLeft}d</span>`;
}

async function viewWarrantyDetail(id) {
  if (!id) return;
  try {
    const w = await fetchAPI(`/warranty/${id}`);
    const modal = document.getElementById('warranty-detail-modal');
    if (!modal) return;

    // Header
    document.getElementById('wd-product-name').textContent = w.productName || '—';
    document.getElementById('wd-serial').textContent = `Serial: ${w.serialNumber || '—'}`;

    // Seller warranty tier
    const sw = w.sellerWarranty || {};
    const swDays = w.sellerDaysLeft;
    document.getElementById('wd-seller-badge').textContent = swDays !== undefined && swDays !== null
      ? (swDays <= 0 ? 'Expired' : `${swDays} days left`)
      : (sw.period ? 'Active' : 'N/A');
    document.getElementById('wd-seller-period').textContent = sw.period || '—';
    document.getElementById('wd-seller-start').textContent = sw.startDate ? new Date(sw.startDate).toLocaleDateString() : '—';
    document.getElementById('wd-seller-expiry').textContent = sw.expiryDate ? new Date(sw.expiryDate).toLocaleDateString() : '—';
    document.getElementById('wd-seller-days').textContent = swDays !== undefined && swDays !== null
      ? (swDays <= 0 ? 'Expired' : `${swDays} days`)
      : '—';
    document.getElementById('wd-seller-buyer').textContent =
      sw.companyName || sw.buyerName || '—';
    document.getElementById('wd-seller-phone').textContent = sw.buyerPhone || '—';

    // Claims
    const claimsSection = document.getElementById('wd-claims-section');
    const claimsList = document.getElementById('wd-claims-list');
    const allClaims = [...(w.purchaseWarranty?.claims || []), ...(w.sellerWarranty?.claims || [])];
    if (allClaims.length > 0 && claimsSection && claimsList) {
      claimsSection.style.display = 'block';
      claimsList.innerHTML = allClaims.map(c => `
        <div class="wd-claim-item">
          <strong>${new Date(c.date).toLocaleDateString()}</strong>
          <span class="badge">${escapeHtml(c.status || 'Open')}</span>
          <p>${escapeHtml(c.description || '')}</p>
        </div>`).join('');
    } else if (claimsSection) {
      claimsSection.style.display = 'none';
    }

    modal.style.display = 'flex';
  } catch (err) {
    console.error('Failed to load warranty detail:', err);
    showToast('Failed to load warranty details', 'error');
  }
}

function closeWarrantyModal() {
  const modal = document.getElementById('warranty-detail-modal');
  if (modal) modal.style.display = 'none';
}

// Expose to global scope (called from inline onclick)
window.viewWarrantyDetail = viewWarrantyDetail;
window.closeWarrantyModal = closeWarrantyModal;
