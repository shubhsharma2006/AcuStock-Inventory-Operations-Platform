/**
 * Emergency Admin CLI Script
 * ─────────────────────────────────────────────────────────────
 * Use this ONLY when you are locked out (all admins deleted/forgotten).
 *
 * Usage (on the server):
 *   node scripts/makeAdmin.js --email="admin@company.com"
 *
 *   Optional flags:
 *   --name="New Admin"         (default: "Admin")
 *   --password="NewPass@123"   (default: auto-generated, printed to console)
 *   --super                    (makes the user a SUPER_ADMIN instead of ADMIN)
 *
 * Examples:
 *   node scripts/makeAdmin.js --email="ceo@company.com" --super
 *   node scripts/makeAdmin.js --email="it@company.com" --name="IT Admin" --password="Secure@456"
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const User     = require('../src/models/User');

// ── Parse CLI arguments ──────────────────────────────────────────────────────
const args = {};
process.argv.slice(2).forEach(arg => {
  const match = arg.match(/^--(\w+)(?:=(.+))?$/);
  if (match) args[match[1]] = match[2] ?? true;
});

const email    = args.email;
const name     = args.name     || 'Admin';
const makeSuper = !!args.super;
const autoPass = crypto.randomBytes(10).toString('hex');   // e.g. "a3f9b2c1d4e5"
const password = args.password || autoPass;

if (!email) {
  console.error('❌  --email is required');
  console.error('    Usage: node scripts/makeAdmin.js --email="admin@company.com"');
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB');

    let user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (user) {
      // Promote existing user
      const salt = await bcrypt.genSalt(10);
      user.role         = makeSuper ? 'SUPER_ADMIN' : 'ADMIN';
      user.isSuperAdmin = makeSuper;
      user.isActive     = true;
      user.isDeleted    = false;
      user.tokenVersion = (user.tokenVersion || 0) + 1;   // Invalidate old sessions
      if (args.password) {
        user.password = await bcrypt.hash(password, salt);
      }
      await user.save({ validateModifiedOnly: true });
      console.log(`✅ Existing user promoted → ${user.role}`);
    } else {
      // Create a brand-new admin
      if (!password || password.length < 8) {
        console.error('❌  Password must be at least 8 characters (use --password="...")');
        process.exit(1);
      }
      const salt   = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);
      user = await User.create({
        name,
        email:        email.toLowerCase().trim(),
        password:     hashed,
        role:         makeSuper ? 'SUPER_ADMIN' : 'ADMIN',
        isSuperAdmin: makeSuper,
        isActive:     true,
        passwordChangedBy: 'SYSTEM'
      });
      console.log(`✅ New ${user.role} user created`);
    }

    console.log('─────────────────────────────────────');
    console.log(`  Name  : ${user.name}`);
    console.log(`  Email : ${user.email}`);
    console.log(`  Role  : ${user.role}`);
    if (!args.password) {
      console.log(`  Pass  : ${autoPass}  ← SAVE THIS, shown only once`);
    }
    console.log('─────────────────────────────────────');
    console.log('⚠️  Change the password immediately after login!');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
