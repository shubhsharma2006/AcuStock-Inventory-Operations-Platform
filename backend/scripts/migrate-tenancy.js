/**
 * Database Migration Script: Multi-Tenant Data Backfill & Validation Engine
 * 
 * Safely backfills tenantId on all legacy records across all TENANT_SCOPED models.
 * Verifies document counts before and after migration.
 * Idempotent: can be safely executed repeatedly.
 * 
 * Usage:
 *   node backend/scripts/migrate-tenancy.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// Load models
const Tenant           = require('../src/models/Tenant');
const User             = require('../src/models/User');
const Item             = require('../src/models/Item');
const StockLedger      = require('../src/models/StockLedger');
const SerialAudit      = require('../src/models/SerialAudit');
const Company          = require('../src/models/Company');
const PurchaseOrder    = require('../src/models/PurchaseOrder');
const SalesOrder       = require('../src/models/SalesOrder');
const Shipment         = require('../src/models/Shipment');
const Warranty         = require('../src/models/Warranty');
const Unit             = require('../src/models/Unit');
const Transporter      = require('../src/models/Transporter');
const ProductionPolicy = require('../src/models/ProductionPolicy');
const Invite           = require('../src/models/Invite');
const Notification     = require('../src/models/Notification');
const AuditLog         = require('../src/models/AuditLog');
const Report           = require('../src/models/Report');

const TENANT_MODELS = [
  { name: 'User',             model: User },
  { name: 'Item',             model: Item },
  { name: 'StockLedger',      model: StockLedger },
  { name: 'SerialAudit',      model: SerialAudit },
  { name: 'Company',          model: Company },
  { name: 'PurchaseOrder',    model: PurchaseOrder },
  { name: 'SalesOrder',       model: SalesOrder },
  { name: 'Shipment',         model: Shipment },
  { name: 'Warranty',         model: Warranty },
  { name: 'Unit',             model: Unit },
  { name: 'Transporter',      model: Transporter },
  { name: 'ProductionPolicy', model: ProductionPolicy },
  { name: 'Invite',           model: Invite },
  { name: 'Notification',     model: Notification },
  { name: 'AuditLog',         model: AuditLog },
  { name: 'Report',           model: Report }
];

async function runMigration() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/acustock';
  console.log(`Connecting to MongoDB at: ${uri}`);
  
  await mongoose.connect(uri);
  console.log('Connected to database.\n');

  try {
    // 1. Resolve or Create Default Root Tenant
    let defaultTenant = await Tenant.findOne({ slug: 'default-org' });
    if (!defaultTenant) {
      console.log('Creating default root organization (slug: "default-org")...');
      defaultTenant = await Tenant.create({
        name: 'Default Organization',
        slug: 'default-org',
        plan: 'enterprise',
        status: 'ACTIVE',
        isActive: true,
        limits: {
          maxUsers: 100,
          maxItems: 100000,
          maxStorage: 10240
        }
      });
      console.log(`Created default tenant ID: ${defaultTenant._id}\n`);
    } else {
      console.log(`Found existing default tenant ID: ${defaultTenant._id}\n`);
    }

    const tenantId = defaultTenant._id;
    const migrationResults = [];

    // 2. Iterate through all tenant-scoped collections
    for (const { name, model } of TENANT_MODELS) {
      const totalDocs = await model.countDocuments();
      const unmigratedDocs = await model.countDocuments({
        $or: [
          { tenantId: null },
          { tenantId: { $exists: false } }
        ]
      });

      if (unmigratedDocs > 0) {
        console.log(`Backfilling ${unmigratedDocs}/${totalDocs} documents in ${name}...`);
        const updateResult = await model.updateMany(
          {
            $or: [
              { tenantId: null },
              { tenantId: { $exists: false } }
            ]
          },
          { $set: { tenantId } }
        );
        console.log(`Updated ${updateResult.modifiedCount} documents in ${name}.`);
      } else {
        console.log(`All ${totalDocs} documents in ${name} already have tenantId.`);
      }

      // Verification check
      const verifiedWithTenant = await model.countDocuments({ tenantId: { $ne: null } });
      const finalTotal = await model.countDocuments();
      const isConsistent = verifiedWithTenant === finalTotal;

      migrationResults.push({
        Collection: name,
        Total: finalTotal,
        Migrated: verifiedWithTenant,
        Consistent: isConsistent ? 'YES' : 'NO'
      });
    }

    console.log('\nMigration Verification Summary Table:');
    console.table(migrationResults);

    const hasInconsistencies = migrationResults.some(r => r.Consistent === 'NO');
    if (hasInconsistencies) {
      console.error('\nERROR: Inconsistencies detected during migration!');
      process.exit(1);
    }

    console.log('\nAll collections successfully migrated and verified with 100% data consistency.');
  } catch (err) {
    console.error('Migration failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
