/**
 * First-Run Setup Route
 * POST /api/setup  — creates the one-and-only SUPER_ADMIN
 * GET  /api/setup/status — returns { setupRequired: true/false }
 *
 * After a SUPER_ADMIN exists this route is permanently disabled (returns 403).
 */

const express = require('express');
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');

const router = express.Router();

// ── GET /api/setup/status ────────────────────────────────────────────────────
// Frontend polls this to decide whether to show the setup page or login page.
router.get('/status', async (req, res) => {
  try {
    const superAdmin = await User.findOne({ isSuperAdmin: true });
    res.json({ setupRequired: !superAdmin });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/setup ──────────────────────────────────────────────────────────
// Creates the first SUPER_ADMIN. Disabled once one already exists.
router.post('/', async (req, res) => {
  try {
    // Guard: only allowed when no SUPER_ADMIN exists
    const existing = await User.findOne({ isSuperAdmin: true });
    if (existing) {
      return res.status(403).json({
        message: 'Setup already completed. A Super Admin already exists.',
        code: 'SETUP_ALREADY_DONE'
      });
    }

    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check email not already taken
    const emailTaken = await User.findOne({ email: email.toLowerCase() });
    if (emailTaken) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const salt         = await bcrypt.genSalt(10);
    const hashedPw     = await bcrypt.hash(password, salt);

    const superAdmin = await User.create({
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      password:     hashedPw,
      role:         'SUPER_ADMIN',
      isSuperAdmin: true,
      isActive:     true,
      passwordChangedBy: 'SYSTEM'
    });

    console.log(`✅ Super Admin created: ${superAdmin.email}`);

    res.status(201).json({
      message: 'Super Admin created successfully. You can now log in.',
      email:   superAdmin.email
    });

  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ message: 'Server error during setup' });
  }
});

module.exports = router;
