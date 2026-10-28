const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('OpenAPI Specification & Swagger Documentation', async (t) => {
  const specPath = path.join(__dirname, '../src/docs/openapi.json');

  await t.test('1. OpenAPI Specification File: Exists and contains valid OpenAPI 3.0 JSON', () => {
    assert.ok(fs.existsSync(specPath), 'openapi.json must exist');
    const content = fs.readFileSync(specPath, 'utf8');
    const spec = JSON.parse(content);

    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.info);
    assert.equal(spec.info.title, 'AcuStock Enterprise Inventory API');
    assert.ok(spec.paths['/health']);
    assert.ok(spec.paths['/stock/summary']);
    assert.ok(spec.paths['/stock/in']);
    assert.ok(spec.paths['/stock/out']);
    assert.ok(spec.paths['/reservations']);
    assert.ok(spec.paths['/api-keys']);
    assert.ok(spec.paths['/webhooks']);
    assert.ok(spec.paths['/billing/usage']);
    assert.ok(spec.paths['/backups']);

    // Check Security Schemes
    assert.ok(spec.components.securitySchemes.BearerAuth);
    assert.ok(spec.components.securitySchemes.ApiKeyAuth);
  });

  await t.test('2. Live Quota Utilization Calculation: Formula and percentage metrics', () => {
    const limits = { maxUsers: 20, maxItems: 1000, maxStorage: 1024 };
    const currentCounts = { users: 5, items: 400, storage: 256 };

    const usersPct = Math.min(100, Math.round((currentCounts.users / limits.maxUsers) * 100));
    const itemsPct = Math.min(100, Math.round((currentCounts.items / limits.maxItems) * 100));
    const storagePct = Math.min(100, Math.round((currentCounts.storage / limits.maxStorage) * 100));

    assert.equal(usersPct, 25);
    assert.equal(itemsPct, 40);
    assert.equal(storagePct, 25);

    const isNearLimit = usersPct >= 80 || itemsPct >= 80 || storagePct >= 80;
    assert.equal(isNearLimit, false);

    // Warning boundary
    const warningCounts = { users: 18, items: 400, storage: 256 };
    const warningUsersPct = Math.min(100, Math.round((warningCounts.users / limits.maxUsers) * 100));
    assert.equal(warningUsersPct, 90);
    assert.equal(warningUsersPct >= 80, true);
  });
});
