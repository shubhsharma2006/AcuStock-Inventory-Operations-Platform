/**
 * Migration Script: migrate-lot-tracking-mode.js
 * 
 * Safely populates trackingMode and lotPolicy on existing Item documents.
 * - If serialPolicy.enableSerial === true -> trackingMode: 'SERIAL'
 * - Otherwise -> trackingMode: 'NONE'
 * - Initializes default lotPolicy if not present
 * 
 * Flags:
 *   --dry-run   Simulates migration without persisting changes
 *   --batch-size=500
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Item = require('../models/Item');

const isDryRun = process.argv.includes('--dry-run');
const batchSizeArg = process.argv.find((a) => a.startsWith('--batch-size='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 500;

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/acustock';
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(mongoUri);
  console.log(`Connected. Starting migration (dryRun=${isDryRun}, batchSize=${BATCH_SIZE})...`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = Item.find({}, null, { skipTenantIsolation: true }).cursor({ batchSize: BATCH_SIZE });

  for await (const doc of cursor) {
    scanned++;
    let needsUpdate = false;
    const updateOps = {};

    if (!doc.trackingMode) {
      needsUpdate = true;
      const targetMode = doc.serialPolicy?.enableSerial ? 'SERIAL' : 'NONE';
      updateOps.trackingMode = targetMode;
    }

    if (!doc.lotPolicy || !doc.lotPolicy.allocationStrategy) {
      needsUpdate = true;
      updateOps.lotPolicy = {
        allocationStrategy: doc.lotPolicy?.allocationStrategy || 'FEFO',
        quarantineDays: doc.lotPolicy?.quarantineDays || 0,
        requireSupplierBatch: doc.lotPolicy?.requireSupplierBatch || false
      };
    }

    if (needsUpdate) {
      if (!isDryRun) {
        await Item.updateOne(
          { _id: doc._id },
          { $set: updateOps },
          { skipTenantIsolation: true }
        );
      }
      updated++;
    } else {
      skipped++;
    }

    if (scanned % 500 === 0) {
      console.log(`Progress: scanned=${scanned}, updated=${updated}, skipped=${skipped}`);
    }
  }

  console.log(`\nMigration completed.`);
  console.log(`Total scanned: ${scanned}`);
  console.log(`Total updated: ${updated} ${isDryRun ? '(simulated)' : ''}`);
  console.log(`Total skipped: ${skipped}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { run };
