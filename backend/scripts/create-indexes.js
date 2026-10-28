/**
 * Production MongoDB Compound Index Creation Script.
 * Safe to run repeatedly (createIndex is idempotent).
 *
 * Usage:
 *   node scripts/create-indexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('Building compound indexes for enterprise performance...');

  // 1. Shipments: Poller & search performance
  console.log('→ Indexing shipments...');
  await db.collection('shipments').createIndex({ tenantId: 1, status: 1, carrierType: 1 });
  await db.collection('shipments').createIndex({ tenantId: 1, carrierType: 1, createdAt: -1 });
  await db.collection('shipments').createIndex({ tenantId: 1, awb: 1 });
  await db.collection('shipments').createIndex({ tenantId: 1, 'porterDetails.tripId': 1 });

  // 2. TrackingEvents: Tracking timeline queries
  console.log('→ Indexing trackingevents...');
  await db.collection('trackingevents').createIndex({ shipmentId: 1, recordedAt: -1 });
  await db.collection('trackingevents').createIndex({ tenantId: 1, recordedAt: -1 });

  // 3. StockLedger: High-frequency ledger reporting
  console.log('→ Indexing stockledgers...');
  await db.collection('stockledgers').createIndex({ tenantId: 1, productId: 1, createdAt: -1 });
  await db.collection('stockledgers').createIndex({ tenantId: 1, type: 1, createdAt: -1 });

  // 4. Items: Text search weighting
  console.log('→ Indexing items...');
  try {
    await db.collection('items').createIndex(
      { name: 'text', shortName: 'text', description: 'text' },
      { weights: { name: 10, shortName: 5, description: 1 }, background: true }
    );
  } catch (err) {
    // If text index already exists with different options, log and continue
    console.log('   (Items text index notice:', err.message, ')');
  }

  console.log('✅ All production compound indexes verified and created successfully.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Index creation failed:', err);
  process.exit(1);
});
