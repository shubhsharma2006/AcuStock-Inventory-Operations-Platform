/**
 * fix_orphan_serials.js
 *
 * Finds SerialAudit records whose lastAction is 'IN' but have NO
 * corresponding StockLedger IN entry containing that serial number.
 * These are orphaned records (created before the StockLedger was
 * properly wired up) and should be removed.
 *
 * Run with: node scripts/fix_orphan_serials.js
 * Add --dry-run to preview without deleting.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const StockLedger = require('../src/models/StockLedger');
const SerialAudit = require('../src/models/SerialAudit');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // 1. Find all serials whose lastAction is 'IN' (i.e., appear available)
  const availableSerials = await SerialAudit.aggregate([
    { $sort: { createdAt: 1 } },
    { $group: { _id: { serial: '$serial', productId: '$productId' }, lastAction: { $last: '$action' } } },
    { $match: { lastAction: 'IN' } }
  ]);

  console.log(`Found ${availableSerials.length} serial(s) with lastAction=IN across all products\n`);

  const orphans = [];

  for (const entry of availableSerials) {
    const { serial, productId } = entry._id;

    // 2. Check if a StockLedger IN entry exists for this serial+product
    const ledgerEntry = await StockLedger.findOne({
      productId,
      type: 'IN',
      serialNumbers: serial,
      isDeleted: { $ne: true }
    });

    if (!ledgerEntry) {
      orphans.push({ serial, productId });
    }
  }

  if (orphans.length === 0) {
    console.log('✅ No orphaned SerialAudit records found. Data is clean.');
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️  Found ${orphans.length} orphaned SerialAudit record(s) (IN with no StockLedger entry):`);
  orphans.forEach(o => console.log(`   serial="${o.serial}"  productId=${o.productId}`));

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to delete these records.');
  } else {
    console.log('\nDeleting orphaned records...');
    for (const o of orphans) {
      const result = await SerialAudit.deleteMany({
        serial: o.serial,
        productId: o.productId
      });
      console.log(`   Deleted ${result.deletedCount} record(s) for serial="${o.serial}"`);
    }
    console.log('\n✅ Done. Orphaned SerialAudit records removed.');
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
