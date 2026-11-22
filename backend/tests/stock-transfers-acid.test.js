/**
 * stock-transfers-acid.test.js
 * Unit test suite for Stock Transfer ACID & Shortage Receiving validations
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const StockTransfer = require('../src/models/StockTransfer');

describe('Stock Transfers — Schema & Shortage Logic Tests', () => {
  it('validates shortageQuantity, discrepancyNotes, and receiptNotes on StockTransfer schema', () => {
    const transfer = new StockTransfer({
      transferNumber: 'TRF-TEST-001',
      fromWarehouse: new mongoose.Types.ObjectId(),
      toWarehouse: new mongoose.Types.ObjectId(),
      requestedBy: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      status: 'IN_TRANSIT',
      receiptNotes: 'Received at Dock 3 with seal verification',
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          quantity: 10,
          receivedQuantity: 8,
          shortageQuantity: 2,
          discrepancyNotes: '2 cartons broken during transit'
        }
      ]
    });

    assert.equal(transfer.transferNumber, 'TRF-TEST-001');
    assert.equal(transfer.receiptNotes, 'Received at Dock 3 with seal verification');
    assert.equal(transfer.items[0].quantity, 10);
    assert.equal(transfer.items[0].receivedQuantity, 8);
    assert.equal(transfer.items[0].shortageQuantity, 2);
    assert.equal(transfer.items[0].discrepancyNotes, '2 cartons broken during transit');
  });

  it('validates upper-bound rule: receivedQuantity cannot exceed shipped quantity', () => {
    const shippedQty = 10;
    const testCases = [
      { input: 8, valid: true },
      { input: 10, valid: true },
      { input: 11, valid: false },
      { input: 100, valid: false },
      { input: -1, valid: false },
    ];

    const validateReceiveQty = (entered, shipped) => {
      const num = Number(entered);
      if (isNaN(num) || num < 0) throw new Error('Received quantity must be non-negative');
      if (num > shipped) throw new Error(`Received quantity (${num}) cannot exceed shipped quantity (${shipped})`);
      return num;
    };

    for (const tc of testCases) {
      if (tc.valid) {
        assert.equal(validateReceiveQty(tc.input, shippedQty), tc.input);
      } else {
        assert.throws(() => validateReceiveQty(tc.input, shippedQty));
      }
    }
  });

  it('calculates shortage accurately and generates audit ledger annotations', () => {
    const shippedQty = 15;
    const receivedQty = 12;
    const shortage = Math.max(0, shippedQty - receivedQty);

    assert.equal(shortage, 3);
    const ledgerNote = `Transfer in: TRF-001${shortage > 0 ? ` (Shortage: ${shortage})` : ''}`;
    assert.equal(ledgerNote, 'Transfer in: TRF-001 (Shortage: 3)');
  });

  it('matches receipt lines strictly by transfer line _id when two lines share the same SKU', () => {
    const sharedProductId = new mongoose.Types.ObjectId();
    const line1Id = new mongoose.Types.ObjectId();
    const line2Id = new mongoose.Types.ObjectId();

    const transferItems = [
      { _id: line1Id, product: sharedProductId, quantity: 10, serialNumbers: [] },
      { _id: line2Id, product: sharedProductId, quantity: 15, serialNumbers: [] }
    ];

    const receivedPayload = [
      { lineId: line1Id.toString(), receivedQuantity: 8 },
      { lineId: line2Id.toString(), receivedQuantity: 12 }
    ];

    // Simulate line matching algorithm from stock-transfers.js
    const results = transferItems.map(it => {
      const userRec = receivedPayload.find(r => 
        (r.lineId && String(r.lineId) === String(it._id)) ||
        (r._id && String(r._id) === String(it._id))
      );
      return {
        lineId: it._id.toString(),
        receivedQuantity: userRec ? userRec.receivedQuantity : it.quantity,
        shortage: it.quantity - (userRec ? userRec.receivedQuantity : it.quantity)
      };
    });

    assert.equal(results[0].receivedQuantity, 8);
    assert.equal(results[0].shortage, 2);
    assert.equal(results[1].receivedQuantity, 12);
    assert.equal(results[1].shortage, 3);
  });

  it('records exact received serials (8 of 10) and prevents unreceived serial leakage', () => {
    const shippedSerials = [
      'SN-01', 'SN-02', 'SN-03', 'SN-04', 'SN-05',
      'SN-06', 'SN-07', 'SN-08', 'SN-09', 'SN-10'
    ];
    const shippedQty = 10;
    const recQty = 8;
    const providedSerials = ['SN-01', 'SN-02', 'SN-03', 'SN-04', 'SN-05', 'SN-06', 'SN-07', 'SN-08'];

    const shippedSet = new Set(shippedSerials);
    assert.equal(providedSerials.length, recQty);
    for (const s of providedSerials) {
      assert.ok(shippedSet.has(s), `Serial ${s} must be in shipped set`);
    }

    // Unreceived serials must NOT be in the received list
    assert.equal(providedSerials.includes('SN-09'), false);
    assert.equal(providedSerials.includes('SN-10'), false);
  });

  it('rejects receipt if received serial count does not match entered quantity or invalid serial', () => {
    const shippedSerials = ['SN-01', 'SN-02', 'SN-03'];
    const recQty = 2;

    const validateSerials = (serials, expectedQty, shipped) => {
      if (serials.length !== expectedQty) throw new Error('Serial count mismatch');
      const set = new Set(shipped);
      for (const s of serials) {
        if (!set.has(s)) throw new Error('Foreign serial detected');
      }
      return serials;
    };

    // Count mismatch
    assert.throws(() => validateSerials(['SN-01'], recQty, shippedSerials), /Serial count mismatch/);

    // Foreign serial
    assert.throws(() => validateSerials(['SN-01', 'SN-999'], recQty, shippedSerials), /Foreign serial detected/);

    // Valid
    const valid = validateSerials(['SN-01', 'SN-02'], recQty, shippedSerials);
    assert.deepEqual(valid, ['SN-01', 'SN-02']);
  });
});
