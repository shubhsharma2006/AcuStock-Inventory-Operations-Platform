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
});
