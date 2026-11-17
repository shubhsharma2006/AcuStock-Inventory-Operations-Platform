/**
 * seed-enterprise-demo.js
 * Populates realistic enterprise demo data across all 38 modules for the active tenant.
 */
const mongoose = require('mongoose');

const TENANT_ID = new mongoose.Types.ObjectId('6aad914845c19993b361260f');
const USER_ID = new mongoose.Types.ObjectId('695c9c1fcf380b932951b367');

async function seedDemoData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/acustock?replicaSet=rs0&directConnection=true');
  console.log('Connected to MongoDB. Seeding demo data for tenant:', TENANT_ID);

  const db = mongoose.connection.db;

  // 1. Get or Create Warehouse
  let warehouse = await db.collection('warehouses').findOne({ tenantId: TENANT_ID });
  if (!warehouse) {
    const res = await db.collection('warehouses').insertOne({
      tenantId: TENANT_ID,
      name: 'Primary Fulfillment Hub (WH-01)',
      code: 'WH-01',
      location: 'Bangalore Logistics Park, Bay 4',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    warehouse = { _id: res.insertedId, name: 'Primary Fulfillment Hub (WH-01)' };
  }
  console.log('Warehouse ID:', warehouse._id);

  // 2. Seed Warehouse Locations (Zones, Aisles, Racks, Bins)
  const existingLocs = await db.collection('warehouselocations').countDocuments({ tenantId: TENANT_ID });
  if (existingLocs === 0) {
    const zoneA = await db.collection('warehouselocations').insertOne({
      tenantId: TENANT_ID,
      warehouseId: warehouse._id,
      name: 'Zone A - High Density Electronics',
      code: 'ZONE-A',
      type: 'ZONE',
      depth: 0,
      path: 'ZONE-A',
      isActive: true,
      createdAt: new Date()
    });

    const aisle1 = await db.collection('warehouselocations').insertOne({
      tenantId: TENANT_ID,
      warehouseId: warehouse._id,
      parentId: zoneA.insertedId,
      name: 'Aisle 01 - Fast Movers',
      code: 'A01',
      type: 'AISLE',
      depth: 1,
      path: 'ZONE-A/A01',
      isActive: true,
      createdAt: new Date()
    });

    const rack1 = await db.collection('warehouselocations').insertOne({
      tenantId: TENANT_ID,
      warehouseId: warehouse._id,
      parentId: aisle1.insertedId,
      name: 'Rack 01 - Heavy Duty Shelving',
      code: 'R01',
      type: 'RACK',
      depth: 2,
      path: 'ZONE-A/A01/R01',
      isActive: true,
      createdAt: new Date()
    });

    const bin1 = await db.collection('warehouselocations').insertOne({
      tenantId: TENANT_ID,
      warehouseId: warehouse._id,
      parentId: rack1.insertedId,
      name: 'Bin A01-R01-B01 (ESD Safe)',
      code: 'B01',
      type: 'BIN',
      depth: 3,
      path: 'ZONE-A/A01/R01/B01',
      capacity: { maxWeightKg: 150, maxVolumeM3: 0.8 },
      isActive: true,
      createdAt: new Date()
    });

    const bin2 = await db.collection('warehouselocations').insertOne({
      tenantId: TENANT_ID,
      warehouseId: warehouse._id,
      parentId: rack1.insertedId,
      name: 'Bin A01-R01-B02 (Standard)',
      code: 'B02',
      type: 'BIN',
      depth: 3,
      path: 'ZONE-A/A01/R01/B02',
      capacity: { maxWeightKg: 200, maxVolumeM3: 1.2 },
      isActive: true,
      createdAt: new Date()
    });

    console.log('Seeded 5 hierarchical warehouse locations');
  }

  // 3. Find some existing items or seed fresh items
  let items = await db.collection('items').find({ tenantId: TENANT_ID }).limit(6).toArray();
  if (items.length < 3) {
    const newItems = [
      {
        tenantId: TENANT_ID,
        name: 'STM32F407 Cortex-M4 Microcontroller IC',
        sku: 'MCU-STM32-407VGT6',
        category: 'Semiconductors',
        currentWAC: 480,
        standardCost: 450,
        valuationMethod: 'WAC',
        isActive: true,
        createdAt: new Date()
      },
      {
        tenantId: TENANT_ID,
        name: 'LiFePO4 3.2V 100Ah Prismatic Battery Cell',
        sku: 'BAT-LFP-32100',
        category: 'Energy Storage',
        currentWAC: 3200,
        standardCost: 3100,
        valuationMethod: 'FIFO',
        isActive: true,
        createdAt: new Date()
      },
      {
        tenantId: TENANT_ID,
        name: 'Precision Aluminum Enclosure (CNC IP67)',
        sku: 'ENC-ALU-IP67-BLK',
        category: 'Mechanical',
        currentWAC: 850,
        standardCost: 800,
        valuationMethod: 'STANDARD',
        isActive: true,
        createdAt: new Date()
      }
    ];
    await db.collection('items').insertMany(newItems);
    items = await db.collection('items').find({ tenantId: TENANT_ID }).limit(6).toArray();
    console.log('Seeded base items');
  }

  // 4. Seed Batches & Inventory Lots with Expiry Tiers
  await db.collection('inventorylots').deleteMany({ tenantId: TENANT_ID });
  const today = new Date();
  const lot1Expiry = new Date(today.getTime() + 15 * 86400000); // 15 days (Critical <30d)
  const lot2Expiry = new Date(today.getTime() + 60 * 86400000); // 60 days (Warning <90d)
  const lot3Expiry = new Date(today.getTime() + 240 * 86400000); // 240 days (Optimal)

  await db.collection('inventorylots').insertMany([
    {
      tenantId: TENANT_ID,
      productId: items[0]._id,
      lotNumber: 'LOT-2026-Q1-01',
      quantity: 120,
      initialQuantity: 150,
      costPerUnit: items[0].currentWAC || 480,
      expirationDate: lot1Expiry,
      warehouseId: warehouse._id,
      status: 'ACTIVE',
      createdAt: new Date()
    },
    {
      tenantId: TENANT_ID,
      productId: items[1]._id,
      lotNumber: 'LOT-2026-Q2-02',
      quantity: 80,
      initialQuantity: 100,
      costPerUnit: items[1].currentWAC || 3200,
      expirationDate: lot2Expiry,
      warehouseId: warehouse._id,
      status: 'ACTIVE',
      createdAt: new Date()
    },
    {
      tenantId: TENANT_ID,
      productId: items[2]._id,
      lotNumber: 'LOT-2026-Q3-03',
      quantity: 350,
      initialQuantity: 400,
      costPerUnit: items[2].currentWAC || 850,
      expirationDate: lot3Expiry,
      warehouseId: warehouse._id,
      status: 'ACTIVE',
      createdAt: new Date()
    }
  ]);
  console.log('Seeded 3 Inventory Lots with FEFO Expiry Tiers');

  // 5. Seed Inventory Adjustments (Damages, Scrap, Found)
  await db.collection('inventoryadjustments').deleteMany({ tenantId: TENANT_ID });
  await db.collection('inventoryadjustments').insertMany([
    {
      tenantId: TENANT_ID,
      adjustmentNumber: 'ADJ-2026-0001',
      type: 'WRITE_OFF',
      reasonCode: 'DAMAGE',
      status: 'PENDING_APPROVAL',
      warehouseId: warehouse._id,
      items: [
        {
          productId: items[0]._id,
          currentQuantity: 120,
          newQuantity: 115,
          varianceQuantity: -5,
          unitCost: 480,
          varianceValue: -2400
        }
      ],
      totalVarianceUnits: -5,
      totalVarianceValue: -2400,
      notes: 'Water damage detected in Bay 3 during heavy rainfall audit.',
      createdBy: USER_ID,
      createdAt: new Date(today.getTime() - 2 * 86400000)
    },
    {
      tenantId: TENANT_ID,
      adjustmentNumber: 'ADJ-2026-0002',
      type: 'SCRAP',
      reasonCode: 'SCRAP',
      status: 'APPROVED',
      warehouseId: warehouse._id,
      items: [
        {
          productId: items[1]._id,
          currentQuantity: 80,
          newQuantity: 78,
          varianceQuantity: -2,
          unitCost: 3200,
          varianceValue: -6400
        }
      ],
      totalVarianceUnits: -2,
      totalVarianceValue: -6400,
      notes: 'Scrapped due to terminal corrosion on battery contact pads.',
      approvedBy: USER_ID,
      approvedAt: new Date(),
      createdBy: USER_ID,
      createdAt: new Date(today.getTime() - 5 * 86400000)
    },
    {
      tenantId: TENANT_ID,
      adjustmentNumber: 'ADJ-2026-0003',
      type: 'FOUND',
      reasonCode: 'FOUND',
      status: 'APPROVED',
      warehouseId: warehouse._id,
      items: [
        {
          productId: items[2]._id,
          currentQuantity: 350,
          newQuantity: 360,
          varianceQuantity: 10,
          unitCost: 850,
          varianceValue: 8500
        }
      ],
      totalVarianceUnits: 10,
      totalVarianceValue: 8500,
      notes: 'Unopened supplier master carton located during annual floor sweep.',
      approvedBy: USER_ID,
      approvedAt: new Date(),
      createdBy: USER_ID,
      createdAt: new Date(today.getTime() - 8 * 86400000)
    }
  ]);
  console.log('Seeded 3 Inventory Adjustments');

  // 6. Seed Kits & Assemblies (BOM definitions & Work Orders)
  await db.collection('kits').deleteMany({ tenantId: TENANT_ID });
  const kitRes = await db.collection('kits').insertOne({
    tenantId: TENANT_ID,
    name: 'Industrial Smart Gateway Node (IP67)',
    sku: 'KIT-SGW-IP67',
    type: 'ASSEMBLY',
    yieldQuantity: 1,
    components: [
      {
        productId: items[0]._id,
        quantity: 1,
        scrapFactorPercent: 2,
        unitCost: 480
      },
      {
        productId: items[1]._id,
        quantity: 1,
        scrapFactorPercent: 1,
        unitCost: 3200
      },
      {
        productId: items[2]._id,
        quantity: 1,
        scrapFactorPercent: 0,
        unitCost: 850
      }
    ],
    totalComponentCost: 4530,
    laborCost: 350,
    overheadCost: 120,
    totalCost: 5000,
    isActive: true,
    createdBy: USER_ID,
    createdAt: new Date()
  });

  await db.collection('workorders').deleteMany({ tenantId: TENANT_ID });
  await db.collection('workorders').insertOne({
    tenantId: TENANT_ID,
    workOrderNumber: 'WO-2026-0001',
    kitId: kitRes.insertedId,
    type: 'ASSEMBLY',
    status: 'IN_PROGRESS',
    plannedQuantity: 25,
    completedQuantity: 10,
    scrappedQuantity: 0,
    warehouseId: warehouse._id,
    notes: 'Batch production run for commercial IoT sensor pilot.',
    createdBy: USER_ID,
    createdAt: new Date()
  });
  console.log('Seeded Kit BOM and Active Work Order');

  // 7. Seed Companies as Suppliers with Performance Scorecards
  let companies = await db.collection('companies').find({ tenantId: TENANT_ID }).toArray();
  if (companies.length === 0) {
    const c1 = await db.collection('companies').insertOne({
      tenantId: TENANT_ID,
      name: 'Arrow Electronics Asia Pacific',
      email: 'orders@arrow-asia.com',
      phone: '+91 80 4123 9800',
      isSupplier: true,
      createdAt: new Date()
    });
    const c2 = await db.collection('companies').insertOne({
      tenantId: TENANT_ID,
      name: 'Contemporary Amperex Dist.',
      email: 'b2b@amperex-supply.com',
      phone: '+91 22 6789 1234',
      isSupplier: true,
      createdAt: new Date()
    });
    companies = [{ _id: c1.insertedId, name: 'Arrow Electronics Asia Pacific' }, { _id: c2.insertedId, name: 'Contemporary Amperex Dist.' }];
  }

  await db.collection('supplierprofiles').deleteMany({ tenantId: TENANT_ID });
  await db.collection('supplierprofiles').insertMany([
    {
      tenantId: TENANT_ID,
      companyId: companies[0]._id,
      tier: 'PLATINUM',
      overallScore: 98.4,
      metrics: {
        onTimeDeliveryRate: 99.1,
        qualityAcceptanceRate: 99.5,
        priceVarianceScore: 95.0,
        leadTimeDays: 5
      },
      totalPOsFulfilled: 28,
      totalSpend: 1420000,
      paymentTerms: 'NET_30',
      createdAt: new Date()
    },
    {
      tenantId: TENANT_ID,
      companyId: companies[1] ? companies[1]._id : companies[0]._id,
      tier: 'GOLD',
      overallScore: 94.2,
      metrics: {
        onTimeDeliveryRate: 95.2,
        qualityAcceptanceRate: 98.0,
        priceVarianceScore: 90.0,
        leadTimeDays: 12
      },
      totalPOsFulfilled: 14,
      totalSpend: 860000,
      paymentTerms: 'NET_60',
      createdAt: new Date()
    }
  ]);
  console.log('Seeded Supplier Performance Scorecards');

  // 8. Seed Cycle Count Session & Reconciliation Task
  await db.collection('cyclecounts').deleteMany({ tenantId: TENANT_ID });
  const ccRes = await db.collection('cyclecounts').insertOne({
    tenantId: TENANT_ID,
    countNumber: 'CC-2026-0001',
    warehouseId: warehouse._id,
    status: 'PENDING_APPROVAL',
    blindCount: false,
    items: [
      {
        productId: items[0]._id,
        sku: items[0].sku,
        productName: items[0].name,
        expectedQuantity: 120,
        countedQuantity: 118,
        variance: -2,
        varianceValue: -960,
        reasonCode: 'SHRINKAGE'
      }
    ],
    totalVarianceUnits: -2,
    totalVarianceValue: -960,
    createdBy: USER_ID,
    createdAt: new Date()
  });

  await db.collection('reconciliationtasks').deleteMany({ tenantId: TENANT_ID });
  await db.collection('reconciliationtasks').insertOne({
    tenantId: TENANT_ID,
    taskNumber: 'REC-2026-0001',
    cycleCountSessionId: ccRes.insertedId,
    status: 'PENDING_AUDIT',
    discrepancies: [
      {
        productId: items[0]._id,
        expectedQuantity: 120,
        countedQuantity: 118,
        varianceUnits: -2,
        varianceValue: -960,
        reasonCode: 'SHRINKAGE'
      }
    ],
    totalVarianceUnits: -2,
    totalVarianceValue: -960,
    createdBy: USER_ID,
    createdAt: new Date()
  });
  console.log('Seeded Cycle Count & Reconciliation Task');

  // 9. Seed Bulk Import History
  await db.collection('importhistories').deleteMany({ tenantId: TENANT_ID });
  await db.collection('importhistories').insertMany([
    {
      tenantId: TENANT_ID,
      importNumber: 'IMP-2026-0001',
      type: 'PRODUCTS',
      fileName: 'q1_master_catalog_update.csv',
      totalRows: 150,
      successfulRows: 148,
      failedRows: 2,
      status: 'COMPLETED',
      isRolledBack: false,
      performedBy: USER_ID,
      createdAt: new Date(today.getTime() - 12 * 86400000)
    },
    {
      tenantId: TENANT_ID,
      importNumber: 'IMP-2026-0002',
      type: 'STOCK_LEDGER',
      fileName: 'opening_stock_migration.csv',
      totalRows: 85,
      successfulRows: 85,
      failedRows: 0,
      status: 'COMPLETED',
      isRolledBack: false,
      performedBy: USER_ID,
      createdAt: new Date(today.getTime() - 30 * 86400000)
    }
  ]);
  console.log('Seeded Import History Records');

  await mongoose.disconnect();
  console.log('\n=== ALL ENTERPRISE DEMO DATA SEEDED SUCCESSFULLY ===');
}

seedDemoData().catch(console.error);

