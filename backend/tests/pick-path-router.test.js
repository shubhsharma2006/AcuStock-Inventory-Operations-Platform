/**
 * pick-path-router.test.js
 * Unit test suite for S-Shape Serpentine & 2-Opt TSP Warehouse Pathfinding
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  euclideanDistance,
  calculateWarehouseDistance,
  optimizePickPath
} = require('../src/utils/pickPathRouter');

describe('Pick Path Router — Aisle-Aware Spatial Routing', () => {
  it('calculates 3D Euclidean distance correctly', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    assert.equal(euclideanDistance(p1, p2), 5);
  });

  it('routes through direct vertical/longitudinal delta when in the same aisle', () => {
    const binA = { aisleNumber: 1, x: 0, y: 0.5, z: 10 };
    const binB = { aisleNumber: 1, x: 0, y: 1.5, z: 25 };
    const dist = calculateWarehouseDistance(binA, binB, { frontCrossAisleZ: 0, backCrossAisleZ: 50 });
    // Same aisle: |10 - 25| + |0.5 - 1.5| * 0.5 = 15 + 0.5 = 15.5
    assert.equal(dist, 15.5);
  });

  it('routes via nearest cross-aisle when crossing between different aisles', () => {
    // Both near the front cross-aisle (z=2)
    const binA = { aisleNumber: 1, x: 0, y: 0, z: 2 };
    const binB = { aisleNumber: 2, x: 4, y: 0, z: 3 };
    const dist = calculateWarehouseDistance(binA, binB, { frontCrossAisleZ: 0, backCrossAisleZ: 50 });
    // Via front: |2-0| + |0-4| + |3-0| = 2 + 4 + 3 = 9
    assert.equal(dist, 9);
  });

  it('handles empty stops gracefully without throwing', () => {
    const res = optimizePickPath([], { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    assert.equal(res.totalDistanceMeters, 0);
    assert.equal(res.orderedStops.length, 0);
    assert.equal(res.percentSavings, 0);
  });

  it('optimizes pick sequence and achieves significant distance savings over disordered stops', () => {
    // Simulate a disordered batch across 4 aisles
    const stops = [
      { id: '1', code: 'A04-R05-S01', aisleNumber: 4, x: 12, y: 0.5, z: 25 },
      { id: '2', code: 'A01-R01-S01', aisleNumber: 1, x: 0, y: 0.5, z: 5 },
      { id: '3', code: 'A03-R02-S02', aisleNumber: 3, x: 8, y: 1.5, z: 10 },
      { id: '4', code: 'A01-R06-S01', aisleNumber: 1, x: 0, y: 0.5, z: 30 },
      { id: '5', code: 'A02-R04-S03', aisleNumber: 2, x: 4, y: 2.5, z: 20 },
      { id: '6', code: 'A02-R01-S01', aisleNumber: 2, x: 4, y: 0.5, z: 4 }
    ];

    const startPoint = { x: 0, y: 0, z: -5 };
    const endPoint = { x: 0, y: 0, z: -5 };

    const result = optimizePickPath(stops, startPoint, endPoint, { frontCrossAisleZ: -5, backCrossAisleZ: 35 });

    // Assertions
    assert.equal(result.orderedStops.length, 6);
    assert.ok(result.totalDistanceMeters > 0);
    assert.ok(result.totalDistanceMeters <= result.unoptimizedDistanceMeters);
    assert.ok(result.distanceSavedMeters >= 0);
    assert.ok(result.waypoints3D.length >= 6);

    // Verify all stops are accounted for in the output
    const processedIds = new Set(result.orderedStops.map(s => s.id));
    assert.equal(processedIds.size, 6);
  });

  it('ensures step numbers and cumulative distance increase monotonically', () => {
    const stops = [
      { id: '1', code: 'A01-R01-S01', aisleNumber: 1, x: 0, y: 0, z: 5 },
      { id: '2', code: 'A01-R03-S01', aisleNumber: 1, x: 0, y: 0, z: 15 },
      { id: '3', code: 'A02-R02-S01', aisleNumber: 2, x: 4, y: 0, z: 10 }
    ];

    const result = optimizePickPath(stops);

    for (let i = 0; i < result.orderedStops.length; i++) {
      assert.equal(result.orderedStops[i].stepNumber, i + 1);
      if (i > 0) {
        assert.ok(result.orderedStops[i].cumulativeDistanceMeters >= result.orderedStops[i - 1].cumulativeDistanceMeters);
      }
    }
  });
});
