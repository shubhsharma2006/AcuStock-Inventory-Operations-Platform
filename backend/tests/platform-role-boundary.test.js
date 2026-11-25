const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');
const Notification = require('../src/models/Notification');
const users = require('../src/routes/users');
const { requireAuth } = require('../src/middleware/auth');
const { authenticateSocketConnection } = require('../src/utils/socketAuth');

const updateUser = users.stack.find(layer => layer.route?.path === '/:id' && layer.route.methods.put).route.stack.at(-1).handle;
const actorId = '507f1f77bcf86cd799439011';
const memberId = '507f1f77bcf86cd799439012';
const tenantId = '507f1f77bcf86cd799439013';

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; }
  };
}

for (const role of ['MANAGER', 'SUPER_ADMIN']) {
  test('tenant admin assigning ' + role, async t => {
    const member = new User({ _id: memberId, tenantId, name: 'Member', email: 'member@example.org', role: 'USER' });
    const save = t.mock.method(member, 'save', async () => member);
    t.mock.method(Notification.prototype, 'save', async function () { return this; });
    t.mock.method(User, 'findOne', async filter => {
      assert.deepEqual(filter, { _id: memberId, tenantId });
      return member;
    });
    const res = response();
    await updateUser({ params: { id: memberId }, body: { role }, user: { _id: actorId, role: 'ADMIN' }, tenantId }, res);
    const allowed = role === 'MANAGER';
    assert.equal(res.statusCode, allowed ? 200 : 403);
    assert.equal(save.mock.callCount(), allowed ? 1 : 0);
    assert.equal(member.role, allowed ? 'MANAGER' : 'USER');
    if (allowed) assert.equal(res.data.sessionInvalidated, true);
  });
}

for (const owner of [false, true]) {
  test('HTTP and socket platform access with ownership flag ' + owner, async t => {
    const user = { _id: actorId, role: 'SUPER_ADMIN', isSuperAdmin: owner, isActive: true, tenantId };
    t.mock.method(User, 'findById', () => ({ select: async fields => {
      assert.ok(fields.split(' ').includes('isSuperAdmin'));
      return user;
    } }));
    const tenant = { _id: tenantId, status: 'ACTIVE', isActive: true };
    t.mock.method(Tenant, 'findById', () => ({ ...tenant, select: async () => tenant }));
    t.mock.method(jwt, 'verify', () => ({ _id: actorId }));
    const res = response();
    let admitted = false;
    await requireAuth({ method: 'GET', path: '/users', headers: {}, cookies: { authToken: 'fixture' } }, res, () => { admitted = true; });
    assert.equal(admitted, owner);
    assert.equal(res.statusCode, owner ? 200 : 403);
    const socketUser = await authenticateSocketConnection({ handshake: { auth: { token: 'fixture' } } });
    assert.equal(socketUser, owner ? user : null);
  });
}
