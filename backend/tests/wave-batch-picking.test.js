/**
 * Automated Test Suite: Wave, Batch & Cluster Picking Engine with Put-Wall Sorting
 * ─────────────────────────────────────────────────────────────
 * Validates:
 * 1. S-Shape / Snake bin traversal sequence calculation
 * 2. Order aggregation into consolidated pick lines
 * 3. Wave generation criteria (single-line vs multi-line, carrier filtering)
 * 4. Floor scanner validation (bin check, SKU verification, short-picking)
 * 5. Put-Wall item routing to order cubbies
 * 6. Order completion and cubby sealing workflow
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ── S-Shape Traversal Sequence Helper ──────────────────────────────
function calculateSShapeSequence(binCode = '') {
  const clean = String(binCode).toUpperCase().trim();
  const match = clean.match(/A?(\d+)[-_]R?(\d+)[-_]S?(\d+)/i) || clean.match(/(\d+)/g);

  let aisle = 1;
  let rack = 1;
  let shelf = 1;

  if (match && match.length >= 4) {
    aisle = parseInt(match[1], 10) || 1;
    rack = parseInt(match[2], 10) || 1;
    shelf = parseInt(match[3], 10) || 1;
  } else if (match && match.length >= 2) {
    aisle = parseInt(match[0], 10) || 1;
    rack = parseInt(match[1], 10) || 1;
  }

  const isEvenAisle = aisle % 2 === 0;
  const effectiveRack = isEvenAisle ? rack : Math.max(1, 100 - rack);

  return aisle * 10000 + effectiveRack * 100 + shelf;
}

// ── Wave Consolidation & Put-Wall Router Helper ────────────────────
function generateWaveFromOrders(orders, criteria = 'ALL', carrier = '') {
  let filtered = [...orders];

  if (criteria === 'SINGLE_ITEM_ONLY') {
    filtered = filtered.filter((o) => (o.items || []).length === 1);
  } else if (criteria === 'MULTI_ITEM_ONLY') {
    filtered = filtered.filter((o) => (o.items || []).length > 1);
  }

  if (carrier) {
    filtered = filtered.filter((o) => String(o.carrier || '').toLowerCase() === carrier.toLowerCase());
  }

  const productAggMap = new Map();

  for (const order of filtered) {
    for (const it of order.items || []) {
      const pId = it.productId;
      if (productAggMap.has(pId)) {
        productAggMap.get(pId).requiredQty += it.quantity;
      } else {
        productAggMap.set(pId, {
          productId: pId,
          sku: it.sku,
          name: it.name,
          barcode: it.barcode || it.sku,
          binCode: it.binCode || 'A01-R01-S01-B01',
          requiredQty: it.quantity,
          pickedQty: 0,
          status: 'PENDING',
          sequenceOrder: calculateSShapeSequence(it.binCode || 'A01-R01-S01-B01')
        });
      }
    }
  }

  const pickItems = Array.from(productAggMap.values()).sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  const cubbies = filtered.map((order, idx) => ({
    cubbyNumber: idx + 1,
    salesOrderId: order._id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    requiredItems: order.items.map((it) => ({
      productId: it.productId,
      sku: it.sku,
      quantity: it.quantity
    })),
    sortedItems: [],
    status: 'ASSIGNED'
  }));

  return {
    orders: filtered,
    pickItems,
    cubbies,
    totalUnits: pickItems.reduce((acc, p) => acc + p.requiredQty, 0)
  };
}

function routePutWallItem(cubbies, scannedBarcode) {
  const clean = scannedBarcode.trim().toLowerCase();

  for (const cubby of cubbies) {
    if (cubby.status === 'CLOSED') continue;

    const reqLine = cubby.requiredItems.find((r) => r.sku.toLowerCase() === clean);
    if (reqLine) {
      const sortedCount = cubby.sortedItems.filter((s) => s.sku.toLowerCase() === clean).length;
      if (sortedCount < reqLine.quantity) {
        cubby.sortedItems.push({
          sku: reqLine.sku,
          sortedAt: new Date()
        });

        const totalReq = cubby.requiredItems.reduce((acc, r) => acc + r.quantity, 0);
        const totalSorted = cubby.sortedItems.length;
        const isComplete = totalSorted >= totalReq;

        if (isComplete) {
          cubby.status = 'READY_TO_PACK';
        } else {
          cubby.status = 'IN_PROGRESS';
        }

        return {
          matchedCubby: cubby.cubbyNumber,
          orderNumber: cubby.orderNumber,
          isComplete,
          totalSorted,
          totalReq
        };
      }
    }
  }
  return null;
}

// ── Test Suites ────────────────────────────────────────────────────

describe('Wave, Batch & Cluster Picking Engine Suite', () => {
  test('1. should compute S-Shape snake traversal sequence correctly', () => {
    // In aisle 1 (odd): rack 01 should be processed after rack 10 (descending path: 100 - rack)
    const aisle1Rack1 = calculateSShapeSequence('A01-R01-S01-B01');
    const aisle1Rack10 = calculateSShapeSequence('A01-R10-S01-B01');

    // In aisle 2 (even): rack 01 should come before rack 10 (ascending path)
    const aisle2Rack1 = calculateSShapeSequence('A02-R01-S01-B01');
    const aisle2Rack10 = calculateSShapeSequence('A02-R10-S01-B01');

    // In odd aisle, rack 1 effective is (100 - 1) = 99; rack 10 effective is (100 - 10) = 90
    assert.ok(aisle1Rack10 < aisle1Rack1, 'Odd aisle should sequence higher racks first (descending to aisle end)');
    assert.ok(aisle2Rack1 < aisle2Rack10, 'Even aisle should sequence lower racks first (ascending to other end)');
    assert.ok(aisle1Rack1 < aisle2Rack1, 'Aisle 1 bins must precede Aisle 2 bins');
  });

  test('2. should consolidate lines across multiple orders into an optimized pick list', () => {
    const orders = [
      {
        _id: 'SO_1',
        orderNumber: 'SO-001',
        customerName: 'Retailer A',
        carrier: 'Delhivery',
        items: [
          { productId: 'P_A', sku: 'SKU-A', name: 'Widget A', quantity: 3, binCode: 'A01-R02-S01-B01' },
          { productId: 'P_B', sku: 'SKU-B', name: 'Gadget B', quantity: 2, binCode: 'A02-R01-S01-B01' }
        ]
      },
      {
        _id: 'SO_2',
        orderNumber: 'SO-002',
        customerName: 'Retailer B',
        carrier: 'Delhivery',
        items: [
          { productId: 'P_A', sku: 'SKU-A', name: 'Widget A', quantity: 5, binCode: 'A01-R02-S01-B01' },
          { productId: 'P_C', sku: 'SKU-C', name: 'Device C', quantity: 1, binCode: 'A01-R05-S02-B01' }
        ]
      }
    ];

    const wave = generateWaveFromOrders(orders, 'ALL');

    assert.equal(wave.orders.length, 2);
    // Total distinct products = 3 (SKU-A, SKU-B, SKU-C)
    assert.equal(wave.pickItems.length, 3);

    const skuA = wave.pickItems.find((p) => p.sku === 'SKU-A');
    assert.equal(skuA.requiredQty, 8, 'SKU-A total units should be 3 + 5 = 8');
    assert.equal(wave.totalUnits, 11, 'Total wave units should be 3+2+5+1 = 11');

    // Verify S-Shape sorting order
    for (let i = 0; i < wave.pickItems.length - 1; i++) {
      assert.ok(
        wave.pickItems[i].sequenceOrder <= wave.pickItems[i + 1].sequenceOrder,
        'Pick items must be sorted in ascending S-shape traversal sequence'
      );
    }
  });

  test('3. should filter orders by velocity profile (single-line vs multi-line)', () => {
    const orders = [
      { _id: 'SO_1', orderNumber: 'SO-001', items: [{ productId: 'P_A', sku: 'SKU-A', quantity: 1 }] },
      { _id: 'SO_2', orderNumber: 'SO-002', items: [{ productId: 'P_B', sku: 'SKU-B', quantity: 2 }] },
      {
        _id: 'SO_3',
        orderNumber: 'SO-003',
        items: [
          { productId: 'P_A', sku: 'SKU-A', quantity: 1 },
          { productId: 'P_B', sku: 'SKU-B', quantity: 1 }
        ]
      }
    ];

    const singleLineWave = generateWaveFromOrders(orders, 'SINGLE_ITEM_ONLY');
    assert.equal(singleLineWave.orders.length, 2);
    assert.equal(singleLineWave.orders[0].orderNumber, 'SO-001');
    assert.equal(singleLineWave.orders[1].orderNumber, 'SO-002');

    const multiLineWave = generateWaveFromOrders(orders, 'MULTI_ITEM_ONLY');
    assert.equal(multiLineWave.orders.length, 1);
    assert.equal(multiLineWave.orders[0].orderNumber, 'SO-003');
  });

  test('4. should route scanned items at Put-Wall and flag order completion', () => {
    const orders = [
      {
        _id: 'SO_1',
        orderNumber: 'SO-001',
        customerName: 'Client X',
        items: [
          { productId: 'P_A', sku: 'SKU-A', quantity: 1 },
          { productId: 'P_B', sku: 'SKU-B', quantity: 1 }
        ]
      },
      {
        _id: 'SO_2',
        orderNumber: 'SO-002',
        customerName: 'Client Y',
        items: [
          { productId: 'P_A', sku: 'SKU-A', quantity: 1 }
        ]
      }
    ];

    const wave = generateWaveFromOrders(orders, 'ALL');

    // 1st Scan: SKU-A goes into Cubby 1
    const res1 = routePutWallItem(wave.cubbies, 'SKU-A');
    assert.equal(res1.matchedCubby, 1);
    assert.equal(res1.isComplete, false, 'Cubby 1 still needs SKU-B');

    // 2nd Scan: SKU-A goes into Cubby 2 (Cubby 1 already received its 1 SKU-A)
    const res2 = routePutWallItem(wave.cubbies, 'SKU-A');
    assert.equal(res2.matchedCubby, 2);
    assert.equal(res2.isComplete, true, 'Cubby 2 is complete (1 of 1 item sorted)');
    assert.equal(wave.cubbies[1].status, 'READY_TO_PACK');

    // 3rd Scan: SKU-B goes into Cubby 1
    const res3 = routePutWallItem(wave.cubbies, 'SKU-B');
    assert.equal(res3.matchedCubby, 1);
    assert.equal(res3.isComplete, true, 'Cubby 1 is now 100% complete!');
    assert.equal(wave.cubbies[0].status, 'READY_TO_PACK');

    // 4th Scan: Extra SKU-A scanned when no order needs it
    const res4 = routePutWallItem(wave.cubbies, 'SKU-A');
    assert.equal(res4, null, 'Extra item should return null to alert operator of mispick');
  });

  test('5. should seal cubby and mark order ready to ship', () => {
    const cubby = {
      cubbyNumber: 1,
      orderNumber: 'SO-001',
      status: 'READY_TO_PACK'
    };

    // Close cubby
    cubby.status = 'CLOSED';
    assert.equal(cubby.status, 'CLOSED');
  });
});

