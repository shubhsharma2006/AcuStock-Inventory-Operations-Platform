/**
 * warehouse-digital-twin.test.js
 * Unit test suite for 3D Warehouse Digital Twin Schema & Slotting Logic
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const WarehouseLocation = require('../src/models/WarehouseLocation');
const Warehouse = require('../src/models/Warehouse');

describe('Warehouse Digital Twin — Spatial Schema & Model Tests', () => {
  it('validates 3D gridCoordinates defaults on WarehouseLocation schema', () => {
    const loc = new WarehouseLocation({
      warehouseId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      type: 'BIN',
      code: 'A01-R01-S01-B01'
    });

    assert.equal(loc.gridCoordinates.aisleNumber, 1);
    assert.equal(loc.gridCoordinates.bayNumber, 1);
    assert.equal(loc.gridCoordinates.shelfLevel, 1);
    assert.equal(loc.gridCoordinates.x, 0);
    assert.equal(loc.gridCoordinates.y, 0);
    assert.equal(loc.gridCoordinates.z, 0);
    assert.equal(loc.zoneType, 'AMBIENT');
    assert.equal(loc.velocityClassification, 'UNASSIGNED');
  });

  it('allows custom 3D spatial coordinates and zone classifications', () => {
    const loc = new WarehouseLocation({
      warehouseId: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      type: 'BIN',
      code: 'A02-R05-S03-B02',
      gridCoordinates: {
        aisleNumber: 2,
        bayNumber: 5,
        shelfLevel: 3,
        binIndex: 2,
        x: 8.4,
        y: 2.9,
        z: 14.0
      },
      zoneType: 'COLD_STORAGE',
      velocityClassification: 'FAST_A'
    });

    assert.equal(loc.gridCoordinates.aisleNumber, 2);
    assert.equal(loc.gridCoordinates.bayNumber, 5);
    assert.equal(loc.gridCoordinates.shelfLevel, 3);
    assert.equal(loc.gridCoordinates.x, 8.4);
    assert.equal(loc.gridCoordinates.y, 2.9);
    assert.equal(loc.gridCoordinates.z, 14.0);
    assert.equal(loc.zoneType, 'COLD_STORAGE');
    assert.equal(loc.velocityClassification, 'FAST_A');
  });

  it('validates Warehouse schema physical dimensions defaults', () => {
    const wh = new Warehouse({
      name: 'North Facility',
      code: 'WH-NORTH',
      createdBy: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId()
    });

    assert.equal(wh.dimensions.lengthMeters, 60);
    assert.equal(wh.dimensions.widthMeters, 30);
    assert.equal(wh.dimensions.heightMeters, 10);
    assert.equal(wh.dimensions.numberOfAisles, 6);
    assert.equal(wh.dimensions.baysPerAisle, 8);
  });
});
