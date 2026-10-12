/**
 * Migration Script: migrate-item-gallery.js
 * 
 * Safely populates the new gallery array from existing legacy _imageUrl strings on Item documents:
 * - If _imageUrl exists and gallery is empty, creates a primary gallery entry with storageKey: 'legacy'
 * - Ensures every item has an initialized gallery array
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
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log(`Connected. Starting gallery migration (dryRun=${isDryRun}, batchSize=${BATCH_SIZE})...`);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = Item.find({}, null, { skipTenantIsolation: true }).cursor({ batchSize: BATCH_SIZE });

  for await (const doc of cursor) {
    scanned++;
    let needsUpdate = false;

    const existingGallery = doc.gallery || [];
    const legacyUrl = doc._imageUrl;

    if (existingGallery.length === 0 && legacyUrl && legacyUrl.trim()) {
      doc.gallery = [{
        storageKey: 'legacy',
        url: legacyUrl.trim(),
        isPrimary: true,
        sortOrder: 0,
        altText: doc.name || 'Product Image',
        uploadedAt: doc.createdAt || new Date()
      }];
      needsUpdate = true;
    } else if (!doc.gallery) {
      doc.gallery = [];
      needsUpdate = true;
    }

    if (needsUpdate) {
      updated++;
      if (!isDryRun) {
        await Item.updateOne(
          { _id: doc._id },
          { $set: { gallery: doc.gallery, _imageUrl: doc._imageUrl } }
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
