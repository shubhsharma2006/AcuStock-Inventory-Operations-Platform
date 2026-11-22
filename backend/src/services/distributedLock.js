/**
 * distributedLock.js
 * Multi-container / multi-pod distributed locking for background crons and schedulers.
 * Prevents duplicate execution across horizontally scaled API replicas using Redis atomic primitives.
 */

const crypto = require('crypto');
const redisService = require('./redis.service');
const logger = require('../utils/logger');

const instanceId = process.env.HOSTNAME || process.env.CONTAINER_ID || `worker-${crypto.randomBytes(4).toString('hex')}`;
const heldLocks = new Map();

/**
 * Attempt to acquire a distributed leader lock.
 * @param {string} lockKey - Unique identifier for the scheduled task
 * @param {number} ttlSeconds - Time-to-live before automatic expiration (default 30s)
 * @returns {Promise<boolean>} - True if this instance is the elected leader
 */
async function acquireLeaderLock(lockKey = 'acustock:leader:crons', ttlSeconds = 30) {
  if (redisService.isRedisConnected && redisService.client) {
    try {
      // Redis atomic SET NX EX: only sets if key does not exist
      const res = await redisService.client.set(lockKey, instanceId, 'EX', ttlSeconds, 'NX');
      if (res === 'OK') {
        logger.info(`👑 Distributed leader lock acquired by [${instanceId}] for '${lockKey}' (TTL: ${ttlSeconds}s)`);

        // Setup background heartbeat to extend TTL while this node is alive
        if (!heldLocks.has(lockKey)) {
          const heartbeatInterval = setInterval(async () => {
            try {
              if (redisService.isRedisConnected && redisService.client) {
                const currentOwner = await redisService.client.get(lockKey);
                if (currentOwner === instanceId) {
                  await redisService.client.expire(lockKey, ttlSeconds);
                } else {
                  clearInterval(heartbeatInterval);
                  heldLocks.delete(lockKey);
                  logger.warn(`⚠️  Distributed lock '${lockKey}' lost or superseded by another instance`);
                }
              }
            } catch (err) {
              logger.warn(`Failed to renew distributed lock heartbeat for '${lockKey}':`, err.message);
            }
          }, Math.max(5000, Math.floor((ttlSeconds * 1000) / 2)));

          heldLocks.set(lockKey, heartbeatInterval);
        }

        return true;
      }

      // Check who holds the lock
      const currentLeader = await redisService.client.get(lockKey);
      logger.info(`⏳ Distributed lock '${lockKey}' already held by instance [${currentLeader || 'another replica'}]. Crons skipped on this replica.`);
      return false;
    } catch (err) {
      logger.warn(`Redis distributed lock check failed (${lockKey}):`, err.message);
    }
  }

  // In-memory fallback for local dev or when Redis is absent
  if (!heldLocks.has(lockKey)) {
    heldLocks.set(lockKey, true);
    logger.info(`ℹ️  Running in single-instance mode: Leader lock granted locally to [${instanceId}] for '${lockKey}'`);
    return true;
  }

  return false;
}

/**
 * Release a previously held distributed lock (e.g. during graceful shutdown)
 */
async function releaseLeaderLock(lockKey = 'acustock:leader:crons') {
  const timer = heldLocks.get(lockKey);
  if (timer && typeof timer === 'object' && timer._idleTimeout) {
    clearInterval(timer);
  }
  heldLocks.delete(lockKey);

  if (redisService.isRedisConnected && redisService.client) {
    try {
      const currentOwner = await redisService.client.get(lockKey);
      if (currentOwner === instanceId) {
        await redisService.client.del(lockKey);
        logger.info(`🔓 Distributed lock '${lockKey}' released by [${instanceId}]`);
      }
    } catch (err) {
      logger.warn(`Failed to cleanly release distributed lock '${lockKey}':`, err.message);
    }
  }
}

module.exports = {
  acquireLeaderLock,
  releaseLeaderLock,
  instanceId
};
