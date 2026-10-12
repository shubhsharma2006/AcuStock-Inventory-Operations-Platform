/**
 * Migration Script: migrate-so-line-qty-fields.js
 * 
 * Safely initializes line item quantity split fields on existing SalesOrder documents:
 * - reservedQty (default 0)
 * - fulfilledQty (line.quantity if SO is dispatched/delivered, otherwise 0)
 * - backorderedQty (default 0)
 * - isBackordered (default false)
 * - packages (default [])
 * - fulfillmentStatus (FULFILLED if dispatched/delivered, otherwise UNFULFILLED)
 * 
 * Flags:
 *   --dry-run   Simulates migration without persisting changes
 *   --batch-size=500
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SalesOrder = require('../models/SalesOrder');

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

  const cursor = SalesOrder.find({}, null, { skipTenantIsolation: true }).cursor({ batchSize: BATCH_SIZE });

  for await (const doc of cursor) {
    scanned++;
    let needsUpdate = false;
    const isAlreadyDispatched = ['dispatched', 'delivered'].includes(doc.status);

    const updatedItems = doc.items.map((line) => {
      let lineModified = false;
      const copy = line.toObject ? line.toObject() : { ...line };

      if (copy.reservedQty === undefined) {
        copy.reservedQty = 0;
        lineModified = true;
      }
      if (copy.fulfilledQty === undefined) {
        copy.fulfilledQty = isAlreadyDispatched ? copy.quantity : 0;
        lineModified = true;
      }
      if (copy.backorderedQty === undefined) {
        copy.backorderedQty = 0;
        lineModified = true;
      }
      if (copy.isBackordered === undefined) {
        copy.isBackordered = false;
        lineModified = true;
      }

      if (lineModified) needsUpdate = true;
      return copy;
    });

    const updateOps = {};
    if (needsUpdate) {
      updateOps.items = updatedItems;
    }

    if (!doc.packages) {
      needsUpdate = true;
      updateOps.packages = [];
    }

    if (!doc.fulfillmentStatus) {
      needsUpdate = true;
      updateOps.fulfillmentStatus = isAlreadyDispatched ? 'FULFILLED' : 'UNFULFILLED';
    }

    if (needsUpdate) {
      if (!isDryRun) {
        await SalesOrder.updateOne(
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
