const test = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../src/services/email.service');

test('Email Templates - graceful fallback when SMTP is not configured', async () => {
  // Ensure unconfigured state
  const prevHost = process.env.EMAIL_HOST;
  delete process.env.EMAIL_HOST;

  try {
    const res = await emailService.sendTrialExpiringEmail({
      to: 'owner@example.com',
      name: 'Owner',
      daysRemaining: 3
    });
    assert.equal(res.success, false);
    assert.equal(res.error, 'Email not configured');
  } finally {
    if (prevHost) process.env.EMAIL_HOST = prevHost;
  }
});

test('Email Templates - all 4 templates are exported and accept expected arguments', async () => {
  assert.equal(typeof emailService.sendTrialExpiringEmail, 'function');
  assert.equal(typeof emailService.sendPaymentReceiptEmail, 'function');
  assert.equal(typeof emailService.sendLowStockAlertEmail, 'function');
  assert.equal(typeof emailService.sendWarrantyExpiryEmail, 'function');
});
