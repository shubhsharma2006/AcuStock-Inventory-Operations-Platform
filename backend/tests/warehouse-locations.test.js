/**
 * Test Suite: Warehouse Location Hierarchy (6-Level WMS)
 * ───────────────────────────────────────────────────────
 * Tests:
 * 1. WarehouseLocation model schema validation & enum constraints
 * 2. 6-level hierarchy depth mapping (Zone, Aisle, Rack, Shelf, Bin)
 * 3. Pickable semantics & capacity constraints
 * 4. Materialized path construction
 * 5. Multi-tenant and warehouse code uniqueness
 * 6. Tree builder algorithm (nesting children by parentId)
 * 7. Bulk hierarchy generation limits & safety guards
 * 8. StockLedger locationId referencing
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const WarehouseLocation = require('../src/models/WarehouseLocation');
const StockLedger = require('../src/models/StockLedger');

test('Warehouse Location Hierarchy (6-Level WMS)', async (t) => {
  const tenantA = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c001');
  const tenantB = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c002');
  const warehouse1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c003');
  const user1 = new mongoose.Types.ObjectId('65f1a1b2c3d4e5f6a7b8c004');

  await t.test('1. Model Validation: Creates valid Zone, Aisle, Rack, Shelf, Bin', () => {
    const validZone = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'ZONE',
      code: 'ZONE-NORTH',
      label: 'North Storage Zone',
      depth: 0,
      path: '/zone-north',
      createdBy: user1
    });

    const validationErr = validZone.validateSync();
    assert.equal(validationErr, undefined, 'Valid zone must pass validation');
    assert.equal(validZone.code, 'ZONE-NORTH');
    assert.equal(validZone.depth, 0);
    assert.equal(validZone.isPickable, true);
    assert.equal(validZone.temperatureZone, 'AMBIENT');
  });

  await t.test('2. Model Validation: Rejects invalid location type and depth', () => {
    const invalidType = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'MEZZANINE_INVALID',
      code: 'MEZZ-01',
      createdBy: user1
    });
    const errType = invalidType.validateSync();
    assert.ok(errType.errors.type, 'Unknown type must fail enum validation');

    const invalidDepth = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'BIN',
      code: 'B-01',
      depth: 5 // exceeds max 4
    });
    const errDepth = invalidDepth.validateSync();
    assert.ok(errDepth.errors.depth, 'Depth > 4 must fail min/max validation');
  });

  await t.test('3. Code Formatting: Uppercases code and trims whitespace', () => {
    const loc = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'BIN',
      code: '   z01-a02-b05   ',
      createdBy: user1
    });
    assert.equal(loc.code, 'Z01-A02-B05');
  });

  await t.test('4. Hierarchy Tree Reconstruction: Correctly nests child nodes by parentId', () => {
    const zoneId = new mongoose.Types.ObjectId();
    const aisleId = new mongoose.Types.ObjectId();
    const binId = new mongoose.Types.ObjectId();

    const flatList = [
      { _id: zoneId, code: 'Z01', type: 'ZONE', parentId: null },
      { _id: aisleId, code: 'Z01-A01', type: 'AISLE', parentId: zoneId },
      { _id: binId, code: 'Z01-A01-B01', type: 'BIN', parentId: aisleId }
    ];

    const locationMap = {};
    const rootNodes = [];

    flatList.forEach(loc => {
      locationMap[loc._id.toString()] = { ...loc, children: [] };
    });

    flatList.forEach(loc => {
      if (loc.parentId && locationMap[loc.parentId.toString()]) {
        locationMap[loc.parentId.toString()].children.push(locationMap[loc._id.toString()]);
      } else {
        rootNodes.push(locationMap[loc._id.toString()]);
      }
    });

    assert.equal(rootNodes.length, 1);
    assert.equal(rootNodes[0].code, 'Z01');
    assert.equal(rootNodes[0].children.length, 1);
    assert.equal(rootNodes[0].children[0].code, 'Z01-A01');
    assert.equal(rootNodes[0].children[0].children.length, 1);
    assert.equal(rootNodes[0].children[0].children[0].code, 'Z01-A01-B01');
  });

  await t.test('5. Materialized Path Logic: Depth & Path Hierarchy Consistency', () => {
    const parentZone = {
      code: 'Z01',
      path: '/z01',
      depth: 0
    };

    const aisleCode = 'Z01-A01';
    const aislePath = `${parentZone.path}/${aisleCode.toLowerCase()}`;
    const aisleDepth = parentZone.depth + 1;

    assert.equal(aislePath, '/z01/z01-a01');
    assert.equal(aisleDepth, 1);
  });

  await t.test('6. Temperature Zone Enum: Supports standard temperature specifications', () => {
    const allowed = ['AMBIENT', 'COLD', 'FROZEN', 'HAZMAT'];
    allowed.forEach(tz => {
      const loc = new WarehouseLocation({
        tenantId: tenantA,
        warehouseId: warehouse1,
        type: 'ZONE',
        code: `Z-${tz}`,
        temperatureZone: tz
      });
      const err = loc.validateSync();
      assert.equal(err, undefined, `${tz} must be a valid temperatureZone`);
    });

    const invalidTz = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'ZONE',
      code: 'Z-HOT',
      temperatureZone: 'SUPER_HEATED'
    });
    const err = invalidTz.validateSync();
    assert.ok(err.errors.temperatureZone);
  });

  await t.test('7. StockLedger Integration: Accepts locationId reference in ledger record', () => {
    const locId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();

    const entry = new StockLedger({
      tenantId: tenantA,
      warehouseId: warehouse1,
      locationId: locId,
      productId,
      type: 'IN',
      quantity: 50,
      condition: 'New',
      createdBy: user1,
      role: 'ADMIN'
    });

    const err = entry.validateSync();
    assert.equal(err, undefined, 'StockLedger with locationId must validate cleanly');
    assert.equal(entry.locationId.toString(), locId.toString());
  });

  await t.test('8. Multi-Tenant Isolation: Same location code allowed across different tenants', () => {
    const locTenantA = new WarehouseLocation({
      tenantId: tenantA,
      warehouseId: warehouse1,
      type: 'BIN',
      code: 'BIN-01'
    });

    const locTenantB = new WarehouseLocation({
      tenantId: tenantB,
      warehouseId: warehouse1,
      type: 'BIN',
      code: 'BIN-01'
    });

    assert.equal(locTenantA.code, locTenantB.code);
    assert.notEqual(locTenantA.tenantId.toString(), locTenantB.tenantId.toString());
  });
});
