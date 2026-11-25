const { test } = require('node:test');
const assert = require('node:assert/strict');
const Shipment = require('../src/models/Shipment');
const courier = require('../src/services/courier/ShiprocketService');
const router = require('../src/routes/logistics');
const handler = router.stack.find(layer => layer.route?.path === '/batch-documents').route.stack.at(-1).handle;
const ids = ['507f191e810c19729de860ea', '507f191e810c19729de860eb'];

function fixture(t, stages) {
  t.mock.method(Shipment, 'find', filter => {
    assert.deepEqual(filter._id.$in, ids);
    assert.equal(filter.tenantId, 'tenant-a');
    assert.equal(filter.createdBy, 'manager-a');
    assert.equal(filter.originWarehouse, 'Pune');
    return { select: async () => stages.map((stage, i) => ({
      awb: 'AWB' + i, carrierBooking: { stage, shipmentId: String(i + 1) }
    })) };
  });
  t.mock.method(courier, 'getAuthToken', async () => 'fixture');
  const post = t.mock.method(courier, 'post', async (path, token, body) => {
    assert.deepEqual(body, { shipment_id: ['1', '2'] });
    return path === '/manifests/generate' ? { manifest_url: 'https://example.org/manifest.pdf' } :
      { label_url: 'https://example.org/labels.pdf' };
  });
  async function request(document, shipmentIds = ids) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ body: { document, warehouse: 'Pune', shipmentIds }, tenantId: 'tenant-a',
      user: { role: 'MANAGER', _id: 'manager-a' } }, res);
    return res;
  }
  return { request, post };
}

test('labels accept pickup-ready parcels and manifest requires every pickup scheduled', async t => {
  const { request, post } = fixture(t, ['PICKUP', 'COMPLETE']);
  assert.equal((await request('manifest')).code, 409);
  assert.equal((await request('labels')).body.url, 'https://example.org/labels.pdf');
  assert.equal(post.mock.callCount(), 1);
});

test('completed parcels return a printable carrier manifest', async t => {
  const { request } = fixture(t, ['COMPLETE', 'COMPLETE']);
  assert.equal((await request('manifest')).body.url, 'https://example.org/manifest.pdf');
});

test('out-of-scope or duplicate records never reach the carrier', async t => {
  const { request, post } = fixture(t, ['COMPLETE']);
  assert.equal((await request('labels')).code, 409);
  assert.equal((await request('labels', [ids[0], ids[0]])).code, 400);
  assert.equal(post.mock.callCount(), 0);
});
