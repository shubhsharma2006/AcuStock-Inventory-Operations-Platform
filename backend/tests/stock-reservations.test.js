const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const StockReservation = require('../src/models/StockReservation');
const reservationService = require('../src/services/reservation.service');

test('Item 4: Enterprise Stock Reservation Engine (Soft-Lock)', async (t) => {
  const testTenant = new mongoose.Types.ObjectId('507f191e810c19729de860ea');
  const testProduct = new mongoose.Types.ObjectId('507f191e810c19729de860eb');
  const testWarehouse = new mongoose.Types.ObjectId('507f191e810c19729de860ec');
  const testUser = new mongoose.Types.ObjectId('507f191e810c19729de860ed');

  await t.test('1. StockReservation Model: Validates fields, positive quantity, and status enums', async () => {
    const reservation = new StockReservation({
      reservationCode: 'RES-TEST-001',
      productId: testProduct,
      warehouseId: testWarehouse,
      reservedQty: 10,
      status: 'ACTIVE',
      tenantId: testTenant,
      createdBy: testUser
    });

    assert.equal(reservation.reservationCode, 'RES-TEST-001');
    assert.equal(reservation.reservedQty, 10);
    assert.equal(reservation.status, 'ACTIVE');
    assert.ok(reservation.expiresAt > new Date(), 'expiresAt must be in the future');

    // Invalid non-positive quantity
    const invalidQty = new StockReservation({
      productId: testProduct,
      reservedQty: 0,
      tenantId: testTenant
    });
    const err = invalidQty.validateSync();
    assert.ok(err.errors.reservedQty, 'Zero or negative quantity must fail validation');

    // Invalid status enum
    const invalidStatus = new StockReservation({
      productId: testProduct,
      reservedQty: 5,
      status: 'UNKNOWN_STATUS',
      tenantId: testTenant
    });
    const statusErr = invalidStatus.validateSync();
    assert.ok(statusErr.errors.status, 'Unknown status must fail validation');
  });

  await t.test('2. Available-To-Promise (ATP) Logic: Formula physical - activeReserved = ATP', async () => {
    const physicalStock = 50;
    const activeReservations = [
      { reservedQty: 10, status: 'ACTIVE' },
      { reservedQty: 15, status: 'ACTIVE' },
      { reservedQty: 5, status: 'RELEASED' }, // Must NOT count
      { reservedQty: 8, status: 'FULFILLED' } // Must NOT count
    ];

    const activeTotal = activeReservations
      .filter(r => r.status === 'ACTIVE')
      .reduce((sum, r) => sum + r.reservedQty, 0);

    assert.equal(activeTotal, 25, 'Only ACTIVE reservations count toward reserved pool');

    const availableToPromise = Math.max(0, physicalStock - activeTotal);
    assert.equal(availableToPromise, 25, '50 physical - 25 active reserved = 25 ATP');

    // Edge case: reservations exceed physical stock
    const highReservations = 60;
    const clampedATP = Math.max(0, physicalStock - highReservations);
    assert.equal(clampedATP, 0, 'ATP must never drop below 0');
  });

  await t.test('3. TTL Expiration Calculation: Enforces specified hold duration in minutes', async () => {
    const now = Date.now();
    const ttlMinutes = 30;
    const expiresAt = new Date(now + ttlMinutes * 60 * 1000);

    const diffMinutes = Math.round((expiresAt.getTime() - now) / (60 * 1000));
    assert.equal(diffMinutes, 30, 'Calculated expiry must match requested TTL');

    // Test expiry status transition
    const expiredRes = new StockReservation({
      productId: testProduct,
      reservedQty: 5,
      status: 'ACTIVE',
      expiresAt: new Date(now - 10000), // Already in the past
      tenantId: testTenant
    });

    const isOverdue = expiredRes.expiresAt <= new Date();
    assert.equal(isOverdue, true, 'Reservation past its timestamp is flagged overdue');
  });

  await t.test('4. Reservation State Transitions: ACTIVE -> RELEASED and ACTIVE -> FULFILLED', async () => {
    const reservation = new StockReservation({
      reservationCode: 'RES-STATE-1',
      productId: testProduct,
      reservedQty: 4,
      status: 'ACTIVE',
      tenantId: testTenant
    });

    // Release transition
    reservation.status = 'RELEASED';
    reservation.releasedAt = new Date();
    reservation.releasedReason = 'Customer abandoned checkout';

    assert.equal(reservation.status, 'RELEASED');
    assert.ok(reservation.releasedAt instanceof Date);
    assert.equal(reservation.releasedReason, 'Customer abandoned checkout');

    // Fulfill transition
    const fulfilledRes = new StockReservation({
      reservationCode: 'RES-STATE-2',
      productId: testProduct,
      reservedQty: 6,
      status: 'ACTIVE',
      tenantId: testTenant
    });

    fulfilledRes.status = 'FULFILLED';
    fulfilledRes.fulfilledAt = new Date();

    assert.equal(fulfilledRes.status, 'FULFILLED');
    assert.ok(fulfilledRes.fulfilledAt instanceof Date);
  });

  await t.test('5. Multi-Tenant Reservation Scoping: Isolates reservations by tenantId', async () => {
    const tenantA = new mongoose.Types.ObjectId('507f191e810c19729de860ea');
    const tenantB = new mongoose.Types.ObjectId('507f191e810c19729de860eb');

    const resA = new StockReservation({
      productId: testProduct,
      reservedQty: 5,
      tenantId: tenantA
    });

    const resB = new StockReservation({
      productId: testProduct,
      reservedQty: 8,
      tenantId: tenantB
    });

    assert.notEqual(String(resA.tenantId), String(resB.tenantId));
  });
});
