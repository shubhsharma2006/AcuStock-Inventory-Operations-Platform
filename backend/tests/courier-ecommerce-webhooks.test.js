const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/courier/ShiprocketService');
const Shipment = require('../src/models/Shipment');
const router = require('../src/routes/logistics');
const book = router.stack.find(layer => layer.route?.path === '/book').route.stack.at(-1).handle;
const parcel = {
  _id: '507f191e810c19729de860ea', quantity: 2, customerName: 'Recipient',
  address: '19 Market Road', city: 'Pune', state: 'Maharashtra', pincode: '411001',
  email: 'warehouse@example.org', phone: '9876543210', originWarehouse: 'Warehouse A',
  boxes: 1, weight: '2.4 kg', dimensions: '30x20x12', productId: 'product-1',
  productName: 'Printer', prepaidAmount: 650, deliveryType: 'Prepaid'
};

test('order uses the measured parcel, registered pickup and stable record identifier', () => {
  const payload = service.orderPayload(parcel);
  assert.equal(payload.order_id, parcel._id);
  assert.deepEqual([payload.weight, payload.length, payload.breadth, payload.height], [2.4, 30, 20, 12]);
  assert.equal(payload.order_items[0].selling_price, 325);
  assert.equal(payload.pickup_location, parcel.originWarehouse);
  for (const missing of ['pincode', 'dimensions', 'weight', 'originWarehouse', 'prepaidAmount']) {
    assert.throws(() => service.orderPayload({ ...parcel, [missing]: undefined }));
  }
});

function mockBooking(t, replies) {
  const shipment = { ...parcel, carrierBooking: {} };
  const calls = [];
  t.mock.method(service, 'getAuthToken', async () => 'fixture');
  t.mock.method(service, 'post', async (path, token, payload) => {
    calls.push({ path, payload });
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  });
  t.mock.method(Shipment, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.tenantId, 'warehouse-tenant');
    assert.equal(filter.createdBy, 'manager');
    if (shipment.carrierBooking.processing || (shipment.carrierBooking.stage ?? null) !== filter['carrierBooking.stage']) return null;
    shipment.carrierBooking = { ...shipment.carrierBooking, processing: true, stage: update.$set['carrierBooking.stage'] };
    return shipment;
  });
  t.mock.method(Shipment, 'updateOne', async (filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) {
      if (key.startsWith('carrierBooking.')) shipment.carrierBooking[key.split('.')[1]] = value;
      else shipment[key] = value;
    }
    return { modifiedCount: 1 };
  });
  async function run(step) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
    await book({ body: { provider: 'SHIPROCKET', shipmentId: parcel._id, step },
      user: { role: 'MANAGER', _id: 'manager' }, tenantId: 'warehouse-tenant' }, res);
    return res.statusCode;
  }
  return { run, shipment, calls };
}

test('booking persists each carrier confirmation and ignores duplicate submissions', async t => {
  const { run, shipment, calls } = mockBooking(t, [
    { shipment_id: 123 }, { awb_assign_status: 1, response: { data: { awb_code: 'TRACK123' } } },
    { label_url: 'https://example.org/label.pdf' }, { pickup_status: 1, response: { pickup_scheduled_date: '2026-12-04' } }
  ]);
  assert.deepEqual((await Promise.all([run('ORDER'), run('ORDER')])).sort(), [200, 409]);
  for (const step of ['AWB', 'LABEL', 'PICKUP']) assert.equal(await run(step), 200);
  assert.equal(shipment.awb, 'TRACK123');
  assert.equal(shipment.labelUrl, 'https://example.org/label.pdf');
  assert.equal(shipment.carrierBooking.stage, 'COMPLETE');
  assert.equal(await run('PICKUP'), 409);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3].payload, { shipment_id: ['123'] });
});

test('an uncertain order outcome blocks another carrier submission', async t => {
  const { run, calls } = mockBooking(t, [new Error('timeout')]);
  assert.equal(await run('ORDER'), 502);
  assert.equal(await run('ORDER'), 409);
  assert.equal(calls.length, 1);
});

test('missing carrier evidence cannot generate a local AWB, label or pickup confirmation', async t => {
  t.mock.method(service, 'post', async () => ({}));
  for (const step of ['ORDER', 'AWB', 'LABEL', 'PICKUP']) {
    await assert.rejects(service.performStep(step, parcel, 'fixture', {}));
  }
});
