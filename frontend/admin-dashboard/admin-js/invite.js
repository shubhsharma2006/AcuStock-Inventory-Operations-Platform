/**
 * AcuStock — Accept Invite Page JS
 * Handles token verification and account creation from an invite link.
 */

const API_URL = (window.AcuStockConfig && window.AcuStockConfig.API_BASE_URL) || 'http://127.0.0.1:5001/api';

// ── State ──────────────────────────────────────────────────────
const verifyingState = document.getElementById('verifying-state');
const invalidState   = document.getElementById('invalid-state');
const formState      = document.getElementById('form-state');
const successState   = document.getElementById('success-state');

function showState(state) {
  [verifyingState, invalidState, formState, successState].forEach(el => {
    if (el) el.hidden = (el !== state);
  });
}

// ── Helpers ────────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  const alert = document.getElementById('invite-alert');
  if (!alert) return;
  alert.textContent = msg;
  alert.className   = 'alert' + (type === 'success' ? ' alert-success' : type === 'info' ? ' alert-info' : '');
  alert.hidden      = false;
}

function hideAlert() {
  const alert = document.getElementById('invite-alert');
  if (alert) alert.hidden = true;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function clearAllErrors() {
  ['name-error', 'password-error', 'confirm-error'].forEach(clearFieldError);
}

function setButtonLoading(loading) {
  const btn    = document.getElementById('invite-btn');
  if (!btn) return;
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (text)   text.hidden   = loading;
  if (loader) loader.hidden = !loading;
}

function showPageOverlay(msg) {
  const overlay = document.getElementById('loading-overlay');
  const msgEl   = document.getElementById('overlay-msg');
  if (overlay) { if (msgEl && msg) msgEl.textContent = msg; overlay.hidden = false; }
}

// ── Password toggle ────────────────────────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
      const pwd = btn.parentElement.querySelector('input[type="password"], input[type="text"]');
      if (pwd) pwd.type = pwd.type === 'password' ? 'text' : 'password';
    });
  });
}

// ── Role label helper ─────────────────────────────────────────
const ROLE_LABELS = { ADMIN: '🛡️ Admin', MANAGER: '📋 Manager', USER: '👤 User' };

// ── Main ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('loaded');
  initPasswordToggles();

  // Extract token from URL
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  if (!token) {
    document.getElementById('invalid-msg').textContent = 'No invite token found in the URL. Please use the link from your invite email.';
    showState(invalidState);
    return;
  }

  // Verify token with backend
  try {
    const res  = await fetch(`${API_URL}/invites/verify/${token}`);
    const data = await res.json();

    if (!res.ok) {
      document.getElementById('invalid-msg').textContent = data.message || 'This invite link is invalid or has expired.';
      showState(invalidState);
      return;
    }

    // Populate form with invite details
    const emailInput = document.getElementById('invite-email');
    if (emailInput) emailInput.value = data.email;

    const greetingEl = document.getElementById('invite-greeting');
    if (greetingEl) greetingEl.textContent = `${data.invitedBy} has invited you to join AcuStock.`;

    const roleLineEl = document.getElementById('invite-role-line');
    if (roleLineEl) roleLineEl.textContent = `Your role: ${ROLE_LABELS[data.role] || data.role}`;

    showState(formState);

    // Wire form submit
    const form = document.getElementById('invite-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllErrors();
      hideAlert();

      const name     = document.getElementById('invite-name').value.trim();
      const password = document.getElementById('invite-password').value;
      const confirm  = document.getElementById('invite-confirm').value;

      // Validate
      let valid = true;
      if (!name || name.length < 2) {
        showFieldError('name-error', 'Full name must be at least 2 characters');
        valid = false;
      }
      if (!password || password.length < 8) {
        showFieldError('password-error', 'Password must be at least 8 characters');
        valid = false;
      } else if (!/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) {
        showFieldError('password-error', 'Password must include both letters and numbers');
        valid = false;
      }
      if (!confirm) {
        showFieldError('confirm-error', 'Please confirm your password');
        valid = false;
      } else if (password !== confirm) {
        showFieldError('confirm-error', 'Passwords do not match');
        valid = false;
      }
      if (!valid) return;

      setButtonLoading(true);

      try {
        const acceptRes  = await fetch(`${API_URL}/invites/accept`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token, name, password })
        });
        const acceptData = await acceptRes.json();

        if (acceptRes.ok) {
          showState(successState);
          // Redirect to login after 3 seconds
          setTimeout(() => {
            showPageOverlay('Redirecting to login...');
            window.location.href = 'login.html';
          }, 3000);
        } else {
          showAlert(acceptData.message || 'Failed to create account. Please try again.');
          setButtonLoading(false);
        }
      } catch (err) {
        console.error('Accept invite error:', err);
        showAlert('Network error. Please check your connection and try again.');
        setButtonLoading(false);
      }
    });

  } catch (err) {
    console.error('Verify invite error:', err);
    document.getElementById('invalid-msg').textContent = 'Could not reach the server. Please try again.';
    showState(invalidState);
  }
});
