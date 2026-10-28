#!/usr/bin/env node
/**
 * Archives StockLedger entries older than RETENTION_DAYS (default: 365)
 * to a separate `stock_ledger_archive` collection.
 * Run monthly via cron: 0 3 1 * * node scripts/archive-old-ledger.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const StockLedger = require('../src/models/StockLedger');

const RETENTION_DAYS = parseInt(process.env.LEDGER_RETENTION_DAYS || '365', 10);

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);

  const archiveCollection = mongoose.connection.db.collection('stock_ledger_archive');
  const cursor = StockLedger.find({ createdAt: { $lt: cutoff } }).cursor();

  let archived = 0;
  for await (const doc of cursor) {
    await archiveCollection.insertOne(doc.toObject());
    await StockLedger.deleteOne({ _id: doc._id });
    archived++;
  }

  console.log(`Archived ${archived} ledger entries older than ${RETENTION_DAYS} days.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Archival failed:', err);
  process.exit(1);
});
