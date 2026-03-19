/**
 * setup.js — First-Run Super Admin Setup Page
 * Handles:
 *  - Guard: redirect to login if setup already done
 *  - Password visibility toggles
 *  - Form validation & submission
 *  - Alert display helpers
 *
 * NOTE: No inline styles or inline scripts. All CSS lives in style.css.
 * The FOUC prevention rule (body { opacity:0 }) is in style.css;
 * adding .loaded here fades the page in after the guard check passes.
 */

(async () => {
  const BASE    = window.location.origin;
  const overlay = document.getElementById('loading-overlay');
  const btn     = document.getElementById('setup-btn');

  // ── Guard: if Super Admin already exists → go to login ────────────────────
  try {
    const r = await fetch(`${BASE}/api/setup/status`);
    const d = await r.json();
    if (!d.setupRequired) {
      window.location.replace('/admin-html/login.html');
      return;
    }
  } catch (e) {
    showAlert('Cannot reach server. Make sure the backend is running.', 'error');
  }

  // Reveal page once guard check is done
  document.body.classList.add('loaded');

  // ── Password visibility toggles ───────────────────────────────────────────
  document.querySelectorAll('.toggle-password').forEach(toggleBtn => {
    toggleBtn.addEventListener('click', () => {
      const inp = toggleBtn.previousElementSibling;
      inp.type  = inp.type === 'password' ? 'text' : 'password';
    });
  });

  // ── Form submission ───────────────────────────────────────────────────────
  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const name     = document.getElementById('sa-name').value.trim();
    const email    = document.getElementById('sa-email').value.trim();
    const password = document.getElementById('sa-password').value;
    const confirm  = document.getElementById('sa-confirm').value;

    // Client-side validation
    if (!name)
      return showAlert('Full name is required.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return showAlert('Enter a valid email address.');
    if (password.length < 8)
      return showAlert('Password must be at least 8 characters.');
    if (password !== confirm)
      return showAlert('Passwords do not match.');

    // Show loading state — use hidden attribute, not style=""
    btn.disabled    = true;
    btn.textContent = '⏳ Creating…';
    overlay.hidden  = false;

    try {
      const res  = await fetch(`${BASE}/api/setup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, password })
      });
      const data = await res.json();

      if (res.ok) {
        showAlert('✅ Super Admin created! Redirecting to login…', 'success');
        setTimeout(() => window.location.replace('/admin-html/login.html'), 2200);
      } else {
        showAlert(data.message || 'Setup failed. Please try again.');
        btn.disabled    = false;
        btn.textContent = '👑 Create Super Admin Account';
      }
    } catch (err) {
      showAlert('Network error. Please try again.');
      btn.disabled    = false;
      btn.textContent = '👑 Create Super Admin Account';
    } finally {
      overlay.hidden = true;
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showAlert(msg, type = 'error') {
    const box    = document.getElementById('setup-alert');
    box.innerHTML = msg;
    box.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
    box.hidden    = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    const box  = document.getElementById('setup-alert');
    box.hidden = true;
  }

})();
