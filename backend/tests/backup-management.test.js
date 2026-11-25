const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const mongoose = require('mongoose');
const backupService = require('../src/services/backup.service');
const backupController = require('../src/controllers/backup.controller');

test('Phase 7: Enterprise Backup & Disaster Recovery System', async (t) => {
  const testTenantA = '507f191e810c19729de860ea';
  const testTenantB = '507f191e810c19729de860eb';
  let createdBackupId = null;
  const deleted = [];
  const model = {
    async init() {},
    schema: { path: () => true },
    find: () => ({ lean: () => ({ exec: async () => [] }) }),
    deleteMany: filter => ({ session: () => { deleted.push(String(filter.tenantId)); } })
  };
  const originalModel = mongoose.model;
  mongoose.model = () => model;
  t.after(() => { mongoose.model = originalModel; });

  await t.test('1. Backup Service: Creates compressed archive and computes valid SHA-256 checksum', async () => {
    const backup = await backupService.createBackup({
      tenantId: testTenantA,
      initiatedBy: { _id: 'user123', name: 'Admin User', role: 'ADMIN' },
      type: 'TENANT',
      description: 'Automated test backup'
    });

    assert.ok(backup.id, 'Backup ID must exist');
    assert.equal(backup.type, 'TENANT');
    assert.equal(backup.tenantId, testTenantA);
    assert.ok(backup.checksum, 'SHA-256 checksum must be generated');
    assert.equal(typeof backup.checksum, 'string');
    assert.equal(backup.checksum.length, 64, 'SHA-256 must be 64 hex characters');
    assert.ok(backup.fileSize > 0, 'Archive size must be > 0 bytes');

    createdBackupId = backup.id;

    // Verify physical file exists and is valid gzip
    const { fullPath } = backupService.getBackupFilePath(backup.id, {
      tenantId: testTenantA,
      userRole: 'ADMIN'
    });

    assert.ok(fs.existsSync(fullPath), 'Physical backup archive must exist on disk');

    const fileContent = fs.readFileSync(fullPath);
    const unzipped = zlib.gunzipSync(fileContent);
    const parsed = JSON.parse(unzipped.toString('utf8'));

    assert.equal(parsed.backupId, backup.id);
    assert.equal(parsed.tenantId, testTenantA);
    assert.ok(parsed.data, 'Data block must exist in archive payload');
  });

  await t.test('2. Backup Integrity: Verifies SHA-256 checksum and flags tampering', async () => {
    const { fullPath, entry } = backupService.getBackupFilePath(createdBackupId, {
      tenantId: testTenantA,
      userRole: 'ADMIN'
    });

    // Valid check
    const isValid = await backupService.verifyBackupIntegrity(fullPath, entry.checksum);
    assert.equal(isValid, true, 'Intact backup must pass integrity check');

    // Tampered checksum check
    const fakeChecksum = crypto.randomBytes(32).toString('hex');
    const isTamperedValid = await backupService.verifyBackupIntegrity(fullPath, fakeChecksum);
    assert.equal(isTamperedValid, false, 'Tampered checksum must fail integrity check');
  });

  await t.test('3. Multi-Tenant Isolation: Blocks cross-tenant backup access', async () => {
    // Tenant B attempting to access Tenant A's backup
    assert.throws(
      () => {
        backupService.getBackupById(createdBackupId, {
          tenantId: testTenantB,
          userRole: 'ADMIN'
        });
      },
      (err) => {
        return err.status === 403 || err.message.includes('Access denied');
      },
      'Non-superadmin cannot access backup belonging to another tenant'
    );

    // SUPER_ADMIN can access any backup
    const superAdminAccess = backupService.getBackupById(createdBackupId, {
      tenantId: testTenantB,
      userRole: 'SUPER_ADMIN'
    });
    assert.equal(superAdminAccess.id, createdBackupId);
  });

  await t.test('4. Catalog Scoping: listBackups isolates tenant archives', async () => {
    const tenantAList = backupService.listBackups({
      tenantId: testTenantA,
      userRole: 'ADMIN'
    });
    assert.ok(tenantAList.some(b => b.id === createdBackupId));

    const tenantBList = backupService.listBackups({
      tenantId: testTenantB,
      userRole: 'ADMIN'
    });
    assert.ok(!tenantBList.some(b => b.id === createdBackupId), 'Tenant B catalog must not contain Tenant A backups');

    const superAdminList = backupService.listBackups({
      tenantId: testTenantB,
      userRole: 'SUPER_ADMIN'
    });
    assert.ok(superAdminList.some(b => b.id === createdBackupId), 'SUPER_ADMIN sees all backups');
  });

  await t.test('5. Backup Controller: Enforces role gating on system-wide backups', async () => {
    let responseStatus = 0;
    let responseBody = {};

    const reqMock = {
      user: { role: 'MANAGER' },
      tenantId: testTenantA,
      body: { type: 'FULL' }
    };

    const resMock = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await backupController.createBackup(reqMock, resMock);
    assert.equal(responseStatus, 403, 'Non-SUPER_ADMIN should be rejected for FULL system backups');
    assert.equal(responseBody.success, false);
  });

  await t.test('Replacement requires a session and clears verified empty collections for the target tenant', async (t) => {
    const options = { targetTenantId: testTenantA, dropExisting: true, user: { role: 'ADMIN' } };
    const start = t.mock.method(mongoose, 'startSession', async () => { throw new Error('Session unavailable'); });
    await assert.rejects(backupService.restoreBackup(createdBackupId, options), /Session unavailable/);
    assert.deepEqual(deleted, []);
    let committed = false;
    start.mock.mockImplementation(async () => ({
      async withTransaction(work) {
        const result = await work();
        committed = true;
        return result;
      },
      async endSession() {}
    }));
    await backupService.restoreBackup(createdBackupId, options);
    assert.ok(committed);
    assert.ok(deleted.length > 0);
    assert.ok(deleted.every(id => id === testTenantA));
  });

  await t.test('Interrupted replacement-restore rolls back transaction and preserves tenant isolation', async (t) => {
    const options = { targetTenantId: testTenantA, dropExisting: true, user: { role: 'ADMIN' } };
    let aborted = false;


    t.mock.method(mongoose, 'startSession', async () => ({
      async withTransaction(work) {
        try {
          return await work();
        } catch (error) {
          aborted = true;
          throw error;
        }
      },
      async endSession() {}
    }));

    // Simulate an interruption error mid-restore during model operation
    const failingModel = {
      async init() {},
      schema: { path: () => true },
      find: () => ({ lean: () => ({ exec: async () => [] }) }),
      deleteMany: () => {
        const p = Promise.reject(new Error('EIO: Connection interrupted during restore operation'));
        p.session = () => p;
        return p;
      },
      insertMany: async () => {
        throw new Error('EIO: Connection interrupted during restore operation');
      }
    };

    const originalMongooseModel = mongoose.model;
    mongoose.model = () => failingModel;

    try {
      await assert.rejects(
        backupService.restoreBackup(createdBackupId, options),
        /EIO: Connection interrupted during restore operation/
      );

      // Verify that transaction rollback was triggered
      assert.ok(aborted, 'Transaction must be aborted on interruption');

      // Verify second tenant B was completely isolated and unaffected
      const catalogB = backupService.listBackups({ tenantId: testTenantB, userRole: 'ADMIN' });
      assert.ok(!catalogB.some(b => b.id === createdBackupId));
    } finally {
      mongoose.model = originalMongooseModel;
    }
  });

  await t.test('6. Backup Pruning & Deletion: Cleans up physical file and updates catalog', async () => {
    const result = backupService.deleteBackup(createdBackupId, {
      tenantId: testTenantA,
      userRole: 'ADMIN'
    });

    assert.equal(result.success, true);

    const catalog = backupService.listBackups({
      tenantId: testTenantA,
      userRole: 'ADMIN'
    });
    assert.ok(!catalog.some(b => b.id === createdBackupId), 'Deleted backup must not be in catalog');
  });
});
