const test = require('node:test');
const assert = require('node:assert/strict');
const matches = require('sift').default;
const Shipment = require('../src/models/Shipment');
const router = require('../src/routes/shipments');
const list = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.get).route.stack.at(-1).handle;

const rows = [
  { reference: 'S1', status: 'PENDING' },
  { reference: 'S2', status: 'PENDING', carrierBooking: { stage: 'COMPLETE' } },
  { reference: 'S3', status: 'PENDING', carrierBooking: { stage: 'AWB', processing: true } },
  { reference: 'S4', status: 'IN_TRANSIT' }, { reference: 'S5', status: 'NDR' },
  { reference: 'S6', status: 'RTO_DELIVERED' }, { reference: 'S7', status: 'DISPATCHED', carrierType: 'OTHER' },
  { reference: 'S8', status: 'DELIVERED' }, { reference: 'S9', status: 'PENDING', type: 'IN' },
  { reference: 'S10', status: 'PENDING', tenantId: 'different' }, { reference: 'S11', status: 'PENDING', createdBy: 'other' }
].map(row => ({ type: 'OUT', carrierType: 'SHIPROCKET', tenantId: 'tenant', createdBy: 'operator', ...row }));

test('shipment queues combine booking, delivery, tenant and operator filters before pagination', async t => {
  t.mock.method(Shipment, 'find', filter => {
    let result = rows.filter(matches(filter));
    return {
      populate() { return this; }, sort() { return this; },
      skip(n) { result = result.slice(n); return this; },
      limit(n) { return result.slice(0, n); }
    };
  });
  t.mock.method(Shipment, 'countDocuments', async filter => rows.filter(matches(filter)).length);
  async function fetchList(query) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await list({ query, user: { role: 'MANAGER', _id: 'operator' }, tenantId: 'tenant' }, res);
    return res;
  }
  for (const [queue, expected] of Object.entries({
    ready: ['S1'], pickup: ['S2'], attention: ['S3', 'S5'], transit: ['S4', 'S7'], returns: ['S6']
  })) {
    const res = await fetchList({ queue });
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.shipments.map(row => row.reference), expected);
  }
  const second = await fetchList({ queue: 'attention', search: 'S', carrierType: 'SHIPROCKET', page: '2', limit: '1' });
  assert.deepEqual(second.body.pagination, { page: 2, limit: 1, pages: 2, total: 2 });
  assert.equal(second.body.shipments[0].reference, 'S5');
  assert.equal((await fetchList({ queue: 'invalid' })).code, 400);
  assert.equal((await fetchList({})).body.pagination.total, 9);
});
