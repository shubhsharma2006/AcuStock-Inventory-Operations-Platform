/**
 * AcuStock - Authentication JavaScript
 * Handles login, register, forgot-password, and setup-redirect logic.
 * All API calls use window.AcuStockConfig.API_BASE_URL (set by shared/config.js).
 */

const API_URL = (window.AcuStockConfig && window.AcuStockConfig.API_BASE_URL) || 'http://127.0.0.1:5001/api';

// ── Setup redirect guard ───────────────────────────────────────────────────
// Runs on the login page ONLY: if setup has not been completed yet,
// send the user to setup.html before they see the login form.
(async () => {
  if (document.body.dataset.page !== 'login') return;
  try {
    const r = await fetch('/api/setup/status');
    const d = await r.json();
    if (d.setupRequired) {
      window.location.replace('/admin-html/setup.html');
    }
  } catch (e) { /* server unreachable — stay on login page */ }
})();

// ============ Utility Functions ============

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\d{10,15}$/.test(phone);
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
  return false;
}

function clearAllErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function showAlert(alertId, msg, type = 'error') {
  const alert = document.getElementById(alertId);
  if (alert) {
    alert.textContent = msg;
    alert.className   = 'alert' + (type === 'success' ? ' alert-success' : type === 'info' ? ' alert-info' : '');
    alert.hidden      = false;
  }
}

function hideAlert(alertId) {
  const alert = document.getElementById(alertId);
  if (alert) alert.hidden = true;
}

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const btnText   = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btn.disabled = loading;
  if (btnText)   btnText.hidden   = loading;
  if (btnLoader) btnLoader.hidden = !loading;
}

function showPageOverlay(message) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const p = overlay.querySelector('p');
  if (p && message) p.textContent = message;
  overlay.hidden = false;
}

// Toggle password visibility
function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function() {
      const pwd = btn.parentElement.querySelector('input[type="password"], input[type="text"]');
      if (pwd) {
        pwd.type = pwd.type === 'password' ? 'text' : 'password';
      }
    });
  });
}

// ============ Login Page Functions ============

async function checkAdminExists() {
  try {
    const res = await fetch(API_URL + '/setup/status');
    const data = await res.json();
    // setupRequired: true  → no admin yet (exists = false)
    // setupRequired: false → setup done  (exists = true)
    return !data.setupRequired;
  } catch (error) {
    console.error('Failed to check setup status:', error);
    return true; // Assume exists on error
  }
}

function initLoginPage() {
  const roleSelect = document.getElementById('login-role');
  const identifierInput = document.getElementById('login-identifier');
  const identifierLabel = document.getElementById('identifier-label');
  const registerLinkContainer = document.getElementById('register-link-container');
  const loginForm = document.getElementById('login-form');

  if (!roleSelect || !identifierInput || !loginForm) return;

    // Role change handler
    function updateIdentifierField() {
      const role = roleSelect.value;
      
      if (role === 'USER') {
        identifierLabel.innerHTML = 'Phone Number <span class="required">*</span>';
        identifierInput.type = 'tel';
        identifierInput.placeholder = 'Enter phone number (given by Admin/Manager)';
        identifierInput.pattern = '[0-9]{10,15}';
        if (registerLinkContainer) {
          registerLinkContainer.innerHTML = '<p class="muted" style="font-size:0.8rem;color:var(--warning);">💡 Users cannot self-register. Contact your Admin or Manager to get an account.</p>';
        }
      } else if (role === 'MANAGER') {
        identifierLabel.innerHTML = 'Email <span class="required">*</span>';
        identifierInput.type = 'email';
        identifierInput.placeholder = 'Enter email address';
        identifierInput.pattern = '';
        if (registerLinkContainer) {
          registerLinkContainer.innerHTML = '<p class="muted" style="font-size:0.8rem;color:var(--warning);">💡 Managers cannot self-register. Contact your Admin to get an account.</p>';
        }
      } else if (role === 'SUPER_ADMIN') {
        identifierLabel.innerHTML = 'Email <span class="required">*</span>';
        identifierInput.type = 'email';
        identifierInput.placeholder = 'Enter Super Admin email address';
        identifierInput.pattern = '';
        if (registerLinkContainer) {
          registerLinkContainer.innerHTML = '<p class="muted" style="font-size:0.8rem;color:var(--warning);">👑 Owner account — full system access.</p>';
        }
      } else {
        identifierLabel.innerHTML = 'Email <span class="required">*</span>';
        identifierInput.type = 'email';
        identifierInput.placeholder = 'Enter email address';
        identifierInput.pattern = '';
        if (registerLinkContainer) {
          registerLinkContainer.innerHTML = '';
        }
      }
    }

  roleSelect.addEventListener('change', updateIdentifierField);
  updateIdentifierField();

  // Form submission
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('login-alert');
    setButtonLoading('login-btn', true);

    const role = roleSelect.value;
    const identifier = identifierInput.value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me')?.checked || false;

    // Validation
    if (!identifier || !password) {
      showAlert('login-alert', 'Please enter your credentials.');
      setButtonLoading('login-btn', false);
      return;
    }

    try {
      const res = await fetch(API_URL + '/auth/login', {
        method: 'POST',
        credentials: 'include', // Include cookies for HTTP-only auth
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, role, remember })
      });

      const data = await res.json();

      // Handle force password reset
      if (data.code === 'FORCE_PASSWORD_RESET' || data.forcePasswordReset) {
        sessionStorage.setItem('user', JSON.stringify(data.user));
        sessionStorage.setItem('forcePasswordReset', 'true');
        showAlert('login-alert', 'Password reset required. Redirecting to change password...', 'info');
        
        setTimeout(() => {
          showPageOverlay('Redirecting...');
          const r = data.user.role;
          if (r === 'SUPER_ADMIN' || r === 'ADMIN') {
            window.location.href = 'index.html?forcePasswordReset=true';
          } else if (r === 'MANAGER') {
            window.location.href = '../../manager-dashboard/manager.html?forcePasswordReset=true';
          } else if (r === 'USER') {
            window.location.href = '../../user-dashboard/user.html?forcePasswordReset=true';
          }
        }, 1500);
        return;
      }

      if (res.ok) {
        // Token is now stored in HTTP-only cookie by server
        // Only cache user info in sessionStorage for display purposes
        sessionStorage.setItem('user', JSON.stringify(data.user));
        sessionStorage.removeItem('forcePasswordReset');

        // Show full-page overlay only during navigation
        showPageOverlay('Signing you in...');

        // Redirect based on role
        const role = data.user.role;
        if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
          window.location.href = 'index.html';
        } else if (role === 'MANAGER') {
          window.location.href = '../../manager-dashboard/manager.html';
        } else if (role === 'USER') {
          window.location.href = '../../user-dashboard/user.html';
        } else {
          window.location.href = 'login.html';
        }
      } else {
        showAlert('login-alert', data.message || 'Login failed.');
      }
    } catch (err) {
      console.error('Login error:', err);
      showAlert('login-alert', 'Network error. Please try again.');
    } finally {
      setButtonLoading('login-btn', false);
    }
  });
}

// ============ Forgot Password Functions ============

function initForgotPasswordPage() {
  const form           = document.getElementById('forgot-form');
  const successMessage = document.getElementById('success-message');
  const resendBtn      = document.getElementById('resend-btn');
  const roleSelect     = document.getElementById('forgot-role');
  const emailInput     = document.getElementById('forgot-email');

  if (!form) return;

  // Form submission
  form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = emailInput.value.trim();
    const role  = roleSelect ? roleSelect.value : 'ADMIN';

    // Clear previous errors & alerts
    clearForgotError('email-error');
    hideAlert('forgot-alert');

    // Validate
    if (!email) {
      showForgotError('email-error', 'Email address is required');
      return;
    }
    if (!validateEmail(email)) {
      showForgotError('email-error', 'Please enter a valid email address');
      return;
    }

    setButtonLoading('forgot-btn', true);

    try {
      // Backend expects { identifier, role }
      const res  = await fetch(API_URL + '/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ identifier: email, role })
      });
      const data = await res.json();

      if (res.ok) {
        form.hidden = true;
        if (successMessage) {
          successMessage.hidden = false;
          const sentEmail = document.getElementById('sent-email');
          if (sentEmail) sentEmail.textContent = email;
        }
      } else {
        showAlert('forgot-alert', data.message || 'No account found with this email address. Please check and try again.');
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      showAlert('forgot-alert', 'Network error. Please check your connection and try again.');
    } finally {
      setButtonLoading('forgot-btn', false);
    }
  });

  // Resend button — hide success, show form again
  if (resendBtn) {
    resendBtn.addEventListener('click', function() {
      if (successMessage) successMessage.hidden = true;
      form.hidden = false;
      emailInput.focus();
      showAlert('forgot-alert', '💡 You can resend the reset link. Please verify your email address and try again.', 'info');
    });
  }
}

// Field-level error helpers used only on the forgot page
function showForgotError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent    = message;
  el.hidden         = false;
  el.style.display  = 'block';
  // Move focus to the associated input for accessibility
  const input = el.previousElementSibling?.tagName === 'INPUT'
    ? el.previousElementSibling
    : document.querySelector(`[aria-describedby="${elementId}"]`);
  if (input) input.focus();
}

function clearForgotError(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = '';
  el.hidden      = true;
}

// ============ Registration Page Functions ============

function initRegisterPage() {
  const form = document.getElementById('register-form');
  const noRegistration = document.getElementById('no-registration');
  const registrationInfo = document.getElementById('registration-info');
  const infoText = document.getElementById('info-text');

  if (!form) return;

  // Check if admin exists on page load
  checkAdminExists().then(exists => {
    if (exists) {
      // Admin exists — disable self-registration
      form.hidden = true;
      if (noRegistration) noRegistration.hidden = false;
      if (registrationInfo) registrationInfo.classList.add('warning');
      if (infoText) infoText.textContent = 'Registration is currently disabled. An admin account already exists.';
    } else {
      // No admin yet — allow first-admin registration
      form.hidden = false;
      if (noRegistration) noRegistration.hidden = true;
      if (infoText) infoText.textContent = 'Welcome! Since there is no admin account yet, you can register as the first Admin.';
    }
  });

  // Form submission
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAllErrors();
    hideAlert('register-alert');

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    // Validation
    if (!name) return showFieldError('name-error', 'Name is required');
    if (name.length < 2) return showFieldError('name-error', 'Name must be at least 2 characters');
    if (!email) return showFieldError('email-error', 'Email is required');
    if (!validateEmail(email)) return showFieldError('email-error', 'Invalid email address');
    if (!password) return showFieldError('password-error', 'Password is required');
    if (password.length < 8) return showFieldError('password-error', 'Password must be at least 8 characters');
    if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) {
      return showFieldError('password-error', 'Password must include a number and a letter');
    }
    if (!confirm) return showFieldError('confirm-error', 'Please confirm your password');
    if (password !== confirm) return showFieldError('confirm-error', 'Passwords do not match');

    // Show loading state
    setButtonLoading('register-btn', true);

    try {
      const res = await fetch(API_URL + '/auth/register', {
        method: 'POST',
        credentials: 'include', // Include cookies for HTTP-only auth
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (res.ok) {
        // Token is now stored in HTTP-only cookie by server
        // Only cache user info in sessionStorage for display purposes
        sessionStorage.setItem('user', JSON.stringify(data.user));
        showAlert('register-alert', 'Registration successful! Redirecting...', 'success');
        showPageOverlay('Setting up your account...');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } else {
        showAlert('register-alert', data.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      showAlert('register-alert', 'Network error. Please check your connection and try again.');
    } finally {
      setButtonLoading('register-btn', false);
    }
  });
}

// ============ Initialize Based on Page ============

document.addEventListener('DOMContentLoaded', function() {
  document.body.classList.add('loaded');
  
  // Initialize password toggles on all pages
  initPasswordToggles();
  
  // Detect page and initialize
  const page = document.body.dataset.page;
  
  if (page === 'login') {
    initLoginPage();
  } else if (page === 'register') {
    initRegisterPage();
  } else if (page === 'forgot') {
    initForgotPasswordPage();
  }
});