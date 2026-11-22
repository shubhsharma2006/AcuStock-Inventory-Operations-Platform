const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/stock-transfers');
const Transfer = require('../src/models/StockTransfer');
const Ledger = require('../src/models/StockLedger');

const uri = process.env.TRANSFER_TEST_MONGO_URI;

test('receiving a serialized transfer commits the selected serials once across retries', {
  skip: uri ? false : 'Set TRANSFER_TEST_MONGO_URI to a test replica set'
}, async (t) => {
  const objectId = () => new mongoose.Types.ObjectId();
  const dbName = 'acustock_receipt_test_' + objectId();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 3000 });
  t.after(async () => {
    try {
      await mongoose.connection.db.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  await Promise.all([Transfer.init(), Ledger.init()]);

  const tenantId = objectId();
  const user = { _id: objectId(), role: 'ADMIN' };
  const product = objectId();
  const manifest = Array.from({ length: 10 }, (_, i) => 'SERIAL-' + (i + 1));
  const transfer = await Transfer.create({
    transferNumber: 'TRF-RETRY', fromWarehouse: objectId(), toWarehouse: objectId(),
    tenantId, requestedBy: user._id, status: 'IN_TRANSIT',
    items: [{ product, quantity: 10, serialNumbers: manifest }, { product, quantity: 5 }]
  });
  const receiveRoute = router.stack.find(layer => layer.route?.path === '/:id/receive');
  const receive = receiveRoute.route.stack.at(-1).handle;
  const req = {
    params: { id: transfer.id }, user, tenantId,
    body: { receivedItems: [
      { lineId: transfer.items[0].id, receivedQuantity: 8, receivedSerials: manifest.slice(2) },
      { lineId: transfer.items[1].id, receivedQuantity: 2 }
    ] }
  };
  async function submit() {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; }
    };
    await receive(req, res);
    return res;
  }
  const first = await submit();
  assert.equal(first.statusCode, 200, first.body.message);
  assert.equal((await submit()).statusCode, 400);
  const posted = await Ledger.find({ tenantId, transferId: transfer._id, type: 'TRANSFER_IN' }).sort({ quantity: -1 }).lean();
  assert.deepEqual(posted.map(line => line.quantity), [8, 2]);
  assert.deepEqual(posted[0].serialNumbers, manifest.slice(2));
  const saved = await Transfer.findOne({ tenantId, _id: transfer._id });
  assert.equal(saved.status, 'RECEIVED');
  assert.deepEqual(Array.from(saved.items, line => line.shortageQuantity), [2, 3]);
});
