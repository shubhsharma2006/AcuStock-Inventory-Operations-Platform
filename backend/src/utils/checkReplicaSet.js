const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Verifies MongoDB is running as a replica set (required for transactions).
 * Logs a warning in development, exits in production.
 */
async function checkReplicaSet() {
  try {
    const admin = mongoose.connection.db.admin();
    const result = await admin.command({ replSetGetStatus: 1 });
    if (result.ok === 1) {
      logger.info('✅ MongoDB replica set detected — transactions enabled');
      return true;
    }
  } catch (err) {
    const msg = `MongoDB is NOT running as a replica set. Transactions will silently fail. Error: ${err.message}`;
    if (process.env.NODE_ENV === 'production') {
      logger.error(`❌ FATAL: ${msg}`);
      logger.error('Start MongoDB with --replSet or use MongoDB Atlas.');
      process.exit(1);
    } else {
      logger.warn(`⚠️  ${msg}`);
      logger.warn('Transactions are disabled in development mode. Use `mongosh --eval "rs.initiate()"` to enable.');
    }
  }
  return false;
}

module.exports = { checkReplicaSet };
