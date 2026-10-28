const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const BACKUP_DIR = path.resolve(__dirname, '../../backups');
const CATALOG_PATH = path.join(BACKUP_DIR, 'catalog.json');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Ensure catalog.json exists
function loadCatalog() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) {
      fs.writeFileSync(CATALOG_PATH, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const data = fs.readFileSync(CATALOG_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    logger.error('Failed to read backup catalog:', err.message);
    return [];
  }
}

function saveCatalog(catalog) {
  try {
    const tempPath = `${CATALOG_PATH}.tmp-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(catalog, null, 2), 'utf8');
    fs.renameSync(tempPath, CATALOG_PATH);
  } catch (err) {
    logger.error('Failed to write backup catalog:', err.message);
    throw err;
  }
}

// Supported models for backup & disaster recovery
const BACKUP_MODELS = [
  { name: 'Item', model: 'Item' },
  { name: 'StockLedger', model: 'StockLedger' },
  { name: 'SerialAudit', model: 'SerialAudit' },
  { name: 'Company', model: 'Company' },
  { name: 'Warehouse', model: 'Warehouse' },
  { name: 'Category', model: 'Category' },
  { name: 'Supplier', model: 'Supplier' },
  { name: 'PurchaseOrder', model: 'PurchaseOrder' },
  { name: 'SalesOrder', model: 'SalesOrder' },
  { name: 'Customer', model: 'Customer' },
  { name: 'Warranty', model: 'Warranty' },
  { name: 'InventoryLot', model: 'InventoryLot' },
  { name: 'CycleCount', model: 'CycleCount' },
  { name: 'RMA', model: 'RMA' },
  { name: 'User', model: 'User' },
  { name: 'Notification', model: 'Notification' },
  { name: 'AuditLog', model: 'AuditLog' },
  { name: 'Tenant', model: 'Tenant' }
];

function getMongooseModel(name) {
  try {
    return mongoose.model(name);
  } catch {
    try {
      return require(`../models/${name}`);
    } catch {
      return null;
    }
  }
}

/**
 * Creates an enterprise backup (full or tenant-scoped)
 */
async function createBackup({ tenantId, initiatedBy, type = 'TENANT', description = '' }) {
  if (type === 'TENANT' && !tenantId) {
    throw new Error('Tenant ID is required for tenant-scoped backup');
  }

  const backupId = `backup_${type.toLowerCase()}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const filename = `${backupId}.json.gz`;
  const filePath = path.join(BACKUP_DIR, filename);
  const tempPath = `${filePath}.tmp`;

  logger.info(`Starting backup creation: ${backupId} (${type})`);

  const backupData = {};
  const collectionStats = {};
  let totalRecords = 0;

  // Extract records from models
  for (const item of BACKUP_MODELS) {
    const Model = getMongooseModel(item.name);
    if (!Model) continue;

    let filter = {};
    if (type === 'TENANT') {
      if (item.name === 'Tenant') {
        filter = { _id: new mongoose.Types.ObjectId(tenantId) };
      } else if (Model.schema && Model.schema.path('tenantId')) {
        filter = { tenantId: new mongoose.Types.ObjectId(tenantId) };
      } else {
        // Skip models that are not tenant-scoped when building tenant backup
        continue;
      }
    }

    if (mongoose.connection.readyState !== 1) {
      backupData[item.name] = [];
      collectionStats[item.name] = 0;
      continue;
    }

    try {
      const records = await Model.find(filter).lean().exec();
      backupData[item.name] = records;
      collectionStats[item.name] = records.length;
      totalRecords += records.length;
    } catch (err) {
      logger.warn(`Could not backup collection ${item.name}: ${err.message}`);
      backupData[item.name] = [];
      collectionStats[item.name] = 0;
    }
  }

  const payload = {
    version: 1,
    backupId,
    type,
    tenantId: tenantId ? String(tenantId) : null,
    createdAt: new Date().toISOString(),
    description,
    collectionStats,
    totalRecords,
    data: backupData
  };

  // Compress & compute SHA-256
  const jsonString = JSON.stringify(payload);
  const hash = crypto.createHash('sha256');
  const gzip = zlib.createGzip({ level: 9 });

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempPath);

    gzip.on('data', chunk => hash.update(chunk));
    gzip.pipe(writeStream);

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    gzip.on('error', reject);

    gzip.end(Buffer.from(jsonString, 'utf8'));
  });

  const checksum = hash.digest('hex');
  fs.renameSync(tempPath, filePath);
  const stats = fs.statSync(filePath);

  const backupEntry = {
    id: backupId,
    type,
    tenantId: tenantId ? String(tenantId) : null,
    filename,
    filePath: path.relative(path.resolve(__dirname, '../..'), filePath),
    fileSize: stats.size,
    checksum,
    collections: collectionStats,
    totalRecords,
    initiatedBy: initiatedBy ? {
      id: initiatedBy._id || initiatedBy.id || initiatedBy,
      name: initiatedBy.name || 'Admin',
      role: initiatedBy.role || 'ADMIN'
    } : null,
    createdAt: new Date().toISOString(),
    status: 'COMPLETED',
    description
  };

  const catalog = loadCatalog();
  catalog.unshift(backupEntry);
  saveCatalog(catalog);

  logger.info(`Backup ${backupId} completed successfully: ${totalRecords} records, ${stats.size} bytes`);
  return backupEntry;
}

/**
 * List backups with tenant scoping
 */
function listBackups({ tenantId, userRole }) {
  const catalog = loadCatalog();
  if (userRole === 'SUPER_ADMIN') {
    return catalog;
  }
  return catalog.filter(entry => entry.tenantId === String(tenantId));
}

/**
 * Get backup metadata by ID with tenant access control
 */
function getBackupById(id, { tenantId, userRole }) {
  const catalog = loadCatalog();
  const entry = catalog.find(b => b.id === id);
  if (!entry) {
    const error = new Error('Backup not found');
    error.status = 404;
    throw error;
  }

  if (userRole !== 'SUPER_ADMIN' && entry.tenantId !== String(tenantId)) {
    const error = new Error('Access denied to backup from another tenant');
    error.status = 403;
    throw error;
  }

  return entry;
}

/**
 * Get physical backup file path with security check
 */
function getBackupFilePath(id, { tenantId, userRole }) {
  const entry = getBackupById(id, { tenantId, userRole });
  const fullPath = path.resolve(BACKUP_DIR, entry.filename);

  if (!fs.existsSync(fullPath)) {
    const error = new Error('Physical backup archive file is missing');
    error.status = 404;
    throw error;
  }

  return { fullPath, entry };
}

/**
 * Verifies the integrity of a backup file against its catalog SHA-256
 */
async function verifyBackupIntegrity(filePath, expectedChecksum) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const calculated = hash.digest('hex');
      resolve(calculated === expectedChecksum);
    });
    stream.on('error', reject);
  });
}

/**
 * Safely restores a backup
 */
async function restoreBackup(id, { targetTenantId, dropExisting = false, user }) {
  const entry = getBackupById(id, { tenantId: targetTenantId, userRole: user.role });
  const { fullPath } = getBackupFilePath(id, { tenantId: targetTenantId, userRole: user.role });

  logger.info(`Restoring backup ${id} to tenant ${targetTenantId}`);

  // 1. Verify SHA-256 checksum integrity
  const isValid = await verifyBackupIntegrity(fullPath, entry.checksum);
  if (!isValid) {
    const error = new Error('Integrity validation failed: Backup archive checksum mismatch');
    error.status = 400;
    throw error;
  }

  // 2. Read and decompress
  const compressedBuffer = fs.readFileSync(fullPath);
  const decompressed = zlib.gunzipSync(compressedBuffer);
  const payload = JSON.parse(decompressed.toString('utf8'));

  if (!payload.data) {
    throw new Error('Invalid backup archive payload: missing data block');
  }

  const restoredStats = {};
  let totalRestored = 0;

  // 3. Restore each collection safely
  for (const [collectionName, records] of Object.entries(payload.data)) {
    if (!Array.isArray(records) || records.length === 0) continue;

    const Model = getMongooseModel(collectionName);
    if (!Model) continue;

    // If tenant-scoped, never overwrite cross-tenant records
    if (collectionName !== 'Tenant') {
      if (dropExisting) {
        await Model.deleteMany({ tenantId: new mongoose.Types.ObjectId(targetTenantId) });
      }

      // Remap tenantId on records to target tenant to prevent accidental cross-tenant data leak
      const preparedRecords = records.map(doc => {
        const copy = { ...doc };
        copy.tenantId = new mongoose.Types.ObjectId(targetTenantId);
        return copy;
      });

      // Insert prepared documents
      if (preparedRecords.length > 0) {
        await Model.insertMany(preparedRecords, { ordered: false });
      }
      restoredStats[collectionName] = preparedRecords.length;
      totalRestored += preparedRecords.length;
    }
  }

  // Update entry status
  const catalog = loadCatalog();
  const catalogEntry = catalog.find(b => b.id === id);
  if (catalogEntry) {
    catalogEntry.lastRestoredAt = new Date().toISOString();
    catalogEntry.restoredBy = user._id || user.id;
    saveCatalog(catalog);
  }

  logger.info(`Backup ${id} restored successfully: ${totalRestored} records restored`);
  return {
    success: true,
    backupId: id,
    targetTenantId,
    collectionsRestored: restoredStats,
    totalRestored,
    restoredAt: new Date().toISOString()
  };
}

/**
 * Delete a backup archive and catalog entry
 */
function deleteBackup(id, { tenantId, userRole }) {
  const entry = getBackupById(id, { tenantId, userRole });
  const fullPath = path.resolve(BACKUP_DIR, entry.filename);

  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      logger.error(`Failed to delete physical backup file ${fullPath}:`, err.message);
    }
  }

  const catalog = loadCatalog();
  const updatedCatalog = catalog.filter(b => b.id !== id);
  saveCatalog(updatedCatalog);

  return { success: true, id };
}

/**
 * Automated retention policy pruning
 */
function pruneBackups({ retentionDays = 30, tenantId = null }) {
  const catalog = loadCatalog();
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const remaining = [];
  let prunedCount = 0;

  for (const entry of catalog) {
    const isTargetTenant = !tenantId || entry.tenantId === String(tenantId);
    const entryDate = new Date(entry.createdAt).getTime();

    if (isTargetTenant && entryDate < cutoff) {
      const fullPath = path.resolve(BACKUP_DIR, entry.filename);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          logger.warn(`Could not remove old backup file: ${e.message}`);
        }
      }
      prunedCount++;
    } else {
      remaining.push(entry);
    }
  }

  if (prunedCount > 0) {
    saveCatalog(remaining);
    logger.info(`Pruned ${prunedCount} backups older than ${retentionDays} days`);
  }

  return { success: true, prunedCount, remainingCount: remaining.length };
}

module.exports = {
  BACKUP_DIR,
  CATALOG_PATH,
  createBackup,
  listBackups,
  getBackupById,
  getBackupFilePath,
  verifyBackupIntegrity,
  restoreBackup,
  deleteBackup,
  pruneBackups
};
