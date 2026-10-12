/**
 * Migration Script: migrate-warranty-lot-fields.js
 * 
 * Safely initializes lotId, packageId, supplierExpiry, and customerCoverage fields
 * on existing Warranty documents.
 * 
 * Flags:
 *   --dry-run   Simulates migration without persisting changes
 *   --batch-size=500
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Warranty = require('../models/Warranty');

const isDryRun = process.argv.includes('--dry-run');
const batchSizeArg = process.argv.find((a) => a.startsWith('--batch-size='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 500;

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/acustock';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log(`Connected. Starting warranty fields migration (dryRun=${isDryRun}, batchSize=${BATCH_SIZE})...`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = Warranty.find({}, null, { skipTenantIsolation: true }).cursor({ batchSize: BATCH_SIZE });

  for await (const doc of cursor) {
    scanned++;
    let needsUpdate = false;

    const updateFields = {};

    if (doc.supplierExpiry === undefined && doc.warrantyExpiryDate) {
      updateFields.supplierExpiry = doc.warrantyExpiryDate;
      needsUpdate = true;
    }

    if (!doc.customerCoverage) {
      updateFields.customerCoverage = {
        months: doc.warrantyPeriodMonths || 0,
        coverageBasis: 'ORDER_DATE',
        expiryDate: doc.warrantyExpiryDate || null
      };
      needsUpdate = true;
    }

    if (needsUpdate) {
      updated++;
      if (!isDryRun) {
        await Warranty.updateOne(
          { _id: doc._id },
          { $set: updateFields }
        );
      }
    } else {
      skipped++;
    }

    if (scanned % 100 === 0) {
      console.log(`Progress: scanned ${scanned}, updated ${updated}, skipped ${skipped}`);
    }
  }

  console.log(`\nMigration completed:`);
  console.log(`- Scanned: ${scanned}`);
  console.log(`- Updated: ${updated}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Mode: ${isDryRun ? 'DRY RUN (no database changes)' : 'LIVE EXECUTION'}`);

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
