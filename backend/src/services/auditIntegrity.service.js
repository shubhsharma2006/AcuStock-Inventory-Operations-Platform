/**
 * Audit Integrity Service — Cryptographic Merkle / Hash Chain Verifier
 * ──────────────────────────────────────────────────────────────────────────
 * Validates the cryptographic tamper-evident integrity of tenant audit logs.
 * Mathematically verifies:
 * 1. Monotonic sequence continuity (1, 2, 3... N without gaps or duplicates)
 * 2. Hash chaining (previousHash === preceding currentHash)
 * 3. Payload integrity (recomputed SHA-256 matches stored currentHash)
 */

'use strict';

const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Deterministic canonical JSON serializer
 */
function canonicalStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(',') + '}';
}

/**
 * Computes canonical SHA-256 hash for an audit log entry
 */
function computeAuditHash({
  tenantId,
  sequenceNumber,
  previousHash,
  createdAt,
  action,
  performedBy,
  targetUser,
  entityId,
  details,
  ipAddress
}) {
  const isoTime = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const raw = [
    String(tenantId || 'GLOBAL'),
    String(sequenceNumber),
    String(previousHash || GENESIS_HASH),
    isoTime,
    String(action || ''),
    String(performedBy || ''),
    String(targetUser || ''),
    String(entityId || ''),
    canonicalStringify(details),
    String(ipAddress || '')
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Mathematically verifies the cryptographic audit chain for a specific tenant.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId
 * @returns {Promise<{ valid: boolean, count: number, rootHash?: string, brokenAtSequence?: number, logId?: string, reason?: string, verifiedAt: string }>}
 */
async function verifyTenantAuditChain(tenantId) {
  const startTime = Date.now();
  const query = tenantId ? { tenantId } : { tenantId: null };

  const logs = await AuditLog.find(query)
    .sort({ sequenceNumber: 1, createdAt: 1 })
    .setOptions({ skipTenantIsolation: true })
    .lean();

  if (!logs || logs.length === 0) {
    return {
      valid: true,
      count: 0,
      rootHash: GENESIS_HASH,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      message: 'Chain is empty (0 records).'
    };
  }

  let previousLog = null;

  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];
    const expectedSeq = i + 1;

    // 1. Sequence Continuity Verification
    if (current.sequenceNumber !== expectedSeq) {
      return {
        valid: false,
        brokenAtSequence: current.sequenceNumber,
        expectedSequence: expectedSeq,
        logId: String(current._id),
        reason: `SEQUENCE_GAP_DETECTED: Expected sequence ${expectedSeq}, but found ${current.sequenceNumber}.`,
        verifiedCount: i,
        totalLogs: logs.length,
        verifiedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      };
    }

    // 2. Genesis / Preceding Hash Link Verification
    if (i === 0) {
      if (current.previousHash !== GENESIS_HASH) {
        return {
          valid: false,
          brokenAtSequence: 1,
          logId: String(current._id),
          reason: `GENESIS_HASH_MISMATCH: Genesis record must link to ${GENESIS_HASH}, got "${current.previousHash}".`,
          verifiedCount: 0,
          totalLogs: logs.length,
          verifiedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime
        };
      }
    } else {
      if (current.previousHash !== previousLog.currentHash) {
        return {
          valid: false,
          brokenAtSequence: current.sequenceNumber,
          logId: String(current._id),
          reason: `HASH_CHAIN_BROKEN: previousHash "${current.previousHash}" does not match preceding currentHash "${previousLog.currentHash}".`,
          verifiedCount: i,
          totalLogs: logs.length,
          verifiedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime
        };
      }
    }

    // 3. Payload Integrity & Hash Recalculation
    const expectedHash = computeAuditHash({
      tenantId: current.tenantId,
      sequenceNumber: current.sequenceNumber,
      previousHash: current.previousHash,
      createdAt: current.createdAt,
      action: current.action,
      performedBy: current.performedBy,
      targetUser: current.targetUser,
      entityId: current.entityId,
      details: current.details,
      ipAddress: current.ipAddress
    });

    if (current.currentHash !== expectedHash) {
      return {
        valid: false,
        brokenAtSequence: current.sequenceNumber,
        logId: String(current._id),
        reason: `PAYLOAD_TAMPERED: Recomputed SHA-256 "${expectedHash}" does not match recorded currentHash "${current.currentHash}".`,
        verifiedCount: i,
        totalLogs: logs.length,
        verifiedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      };
    }

    previousLog = current;
  }

  return {
    valid: true,
    count: logs.length,
    rootHash: logs[logs.length - 1].currentHash,
    firstHash: logs[0].currentHash,
    verifiedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime
  };
}

module.exports = {
  GENESIS_HASH,
  canonicalStringify,
  computeAuditHash,
  verifyTenantAuditChain
};

