/**
 * AcuStock Email Service
 * Handles all outbound emails: password reset, notifications, etc.
 *
 * Configuration (in .env):
 *   EMAIL_HOST   = smtp.gmail.com
 *   EMAIL_PORT   = 587
 *   EMAIL_SECURE = false          (true for port 465)
 *   EMAIL_USER   = you@gmail.com
 *   EMAIL_PASS   = your-app-password  (Gmail: use App Password, NOT your account password)
 *   EMAIL_FROM   = AcuStock <you@gmail.com>  (optional, defaults to EMAIL_USER)
 *
 * Gmail App Password setup:
 *   1. Enable 2FA on your Google account
 *   2. Go to https://myaccount.google.com/apppasswords
 *   3. Generate a password for "Mail"
 *   4. Paste it as EMAIL_PASS in .env
 */

const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────
// Build transporter (lazy — only when first used)
// ─────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS } = process.env;

  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    return null; // Not configured — caller must handle gracefully
  }

  _transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT || '587'),
    secure: EMAIL_SECURE === 'true', // true for port 465
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });

  return _transporter;
}

/**
 * Low-level send helper.
 * Returns { success: true } or { success: false, error }
 */
async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn('[Email] Not configured — skipping email to:', to);
    return { success: false, error: 'Email not configured' };
  }

  const from = process.env.EMAIL_FROM || `AcuStock <${process.env.EMAIL_USER}>`;

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    console.log('[Email] Sent to', to, '— messageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Failed to send to', to, ':', err.message);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Send a password reset email to an ADMIN or MANAGER.
 * @param {object} opts
 * @param {string} opts.to        - Recipient email address
 * @param {string} opts.name      - Recipient's display name
 * @param {string} opts.resetUrl  - Full reset link (e.g. https://yourapp.com/reset-password/<token>)
 * @param {number} [opts.expiresMinutes=15] - Token expiry in minutes (shown in email)
 */
async function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes = 15 }) {
  const subject = '🔐 AcuStock — Password Reset Request';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .body { padding: 36px 40px; color: #374151; }
    .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; margin: 20px 0; padding: 14px 32px; background: #1e40af; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: bold; letter-spacing: 0.3px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0; }
    .footer { padding: 20px 40px; background: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Password Reset Request</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${name}</strong>,</p>
      <p>We received a request to reset your password for your <strong>AcuStock</strong> account.</p>
      <p>Click the button below to choose a new password:</p>
      <p style="text-align:center;">
        <a href="${resetUrl}" class="btn">Reset My Password</a>
      </p>
      <div class="warning">
        ⚠️ This link expires in <strong>${expiresMinutes} minutes</strong>. If you did not request this, you can safely ignore this email — your password will not change.
      </div>
      <hr class="divider" />
      <p style="font-size:13px; color:#6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
      <p style="font-size:12px; color:#6b7280; word-break:break-all;">${resetUrl}</p>
    </div>
    <div class="footer">
      AcuStock Inventory Management &nbsp;|&nbsp; This is an automated message, do not reply.
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nYou requested a password reset for your AcuStock account.\n\nReset link (expires in ${expiresMinutes} minutes):\n${resetUrl}\n\nIf you did not request this, ignore this email.\n\n— AcuStock`;

  return sendMail({ to, subject, html, text });
}

/**
 * Send a notification email when someone's password was reset by an admin/manager.
 */
async function sendPasswordResetByAdminEmail({ to, name, resetByName, resetByRole, temporaryPassword }) {
  const subject = '🔑 AcuStock — Your Password Has Been Reset';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .body { padding: 36px 40px; color: #374151; }
    .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
    .password-box { background: #f3f4f6; border: 2px dashed #d1d5db; border-radius: 8px; padding: 16px 24px; text-align: center; font-size: 22px; font-family: monospace; letter-spacing: 3px; font-weight: bold; color: #1e40af; margin: 20px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0; }
    .footer { padding: 20px 40px; background: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔑 Password Reset</h1>
    </div>
    <div class="body">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your AcuStock password has been reset by <strong>${resetByName}</strong> (${resetByRole}).</p>
      <p>Your temporary password is:</p>
      <div class="password-box">${temporaryPassword}</div>
      <div class="warning">
        ⚠️ You will be required to change this password the next time you log in. Do not share this password with anyone.
      </div>
    </div>
    <div class="footer">
      AcuStock Inventory Management &nbsp;|&nbsp; This is an automated message, do not reply.
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${name},\n\nYour AcuStock password was reset by ${resetByName} (${resetByRole}).\n\nTemporary password: ${temporaryPassword}\n\nYou must change this password on your next login.\n\n— AcuStock`;

  return sendMail({ to, subject, html, text });
}

/**
 * Send an invite email to a new team member.
 * @param {object} opts
 * @param {string} opts.to          - Recipient email
 * @param {string} opts.invitedBy   - Name of the person sending the invite
 * @param {string} opts.role        - Role being granted (ADMIN / MANAGER / USER)
 * @param {string} opts.inviteUrl   - Full accept-invite URL with token
 * @param {number} [opts.expiresHours=48]
 */
async function sendInviteEmail({ to, invitedBy, role, inviteUrl, expiresHours = 48 }) {
  const roleLabels = { ADMIN: 'Admin', MANAGER: 'Manager', USER: 'User' };
  const roleLabel  = roleLabels[role] || role;
  const subject    = `📬 You've been invited to join AcuStock as ${roleLabel}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1e40af 0%, #6366f1 100%); padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .header p  { color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; }
    .body { padding: 36px 40px; color: #374151; }
    .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
    .role-badge { display: inline-block; background: #ede9fe; color: #4f46e5; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
    .btn { display: inline-block; margin: 20px 0; padding: 14px 36px; background: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: bold; }
    .info { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #1e40af; margin: 20px 0; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 20px 0; }
    .footer { padding: 20px 40px; background: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📬 You're Invited!</h1>
      <p>AcuStock Inventory Management</p>
    </div>
    <div class="body">
      <p>Hi there,</p>
      <p><strong>${invitedBy}</strong> has invited you to join <strong>AcuStock</strong> as:</p>
      <p><span class="role-badge">🏷️ ${roleLabel}</span></p>
      <p>Click the button below to accept your invite and set up your account:</p>
      <p style="text-align:center;">
        <a href="${inviteUrl}" class="btn">Accept Invitation</a>
      </p>
      <div class="warning">
        ⏰ This invite expires in <strong>${expiresHours} hours</strong>. After that, ask ${invitedBy} to send a new one.
      </div>
      <div class="info">
        ℹ️ If you were not expecting this invite, you can safely ignore this email. No account will be created unless you click the link above.
      </div>
      <hr class="divider" />
      <p style="font-size:13px; color:#6b7280;">If the button doesn't work, copy and paste this URL:</p>
      <p style="font-size:12px; color:#6b7280; word-break:break-all;">${inviteUrl}</p>
    </div>
    <div class="footer">
      AcuStock Inventory Management &nbsp;|&nbsp; This is an automated message, do not reply.
    </div>
  </div>
</body>
</html>`;

  const text = `Hi,\n\n${invitedBy} invited you to join AcuStock as ${roleLabel}.\n\nAccept your invite (expires in ${expiresHours} hours):\n${inviteUrl}\n\nIgnore this email if you weren't expecting it.\n\n— AcuStock`;

  return sendMail({ to, subject, html, text });
}

/**
 * Check if email is configured and working.
 * Call this on startup to log a warning if not set up.
 */
async function verifyEmailConfig() {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[Email] ⚠️  Email not configured. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env to enable email delivery.');
    return false;
  }
  try {
    await transporter.verify();
    console.log('[Email] ✅ SMTP connection verified');
    return true;
  } catch (err) {
    console.warn('[Email] ⚠️  SMTP verify failed:', err.message);
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetByAdminEmail,
  sendInviteEmail,
  verifyEmailConfig
};
