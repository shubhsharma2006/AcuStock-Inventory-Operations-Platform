#!/usr/bin/env node
/**
 * AcuStock Production Pre-Flight Verification Script
 * Validates database connectivity, replica set state, Redis latency,
 * runtime directory permissions, and essential security environment variables.
 *
 * Usage:
 *   node scripts/preflight-check.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');
const redisService = require('../src/services/redis.service');
const { checkReplicaSet } = require('../src/utils/checkReplicaSet');

async function main() {
  console.log('\n========================================');
  console.log('🚀 AcuStock Production Pre-Flight Check');
  console.log('========================================\n');

  let passed = true;

  // 1. Environment Variable Checks
  console.log('1. Checking Environment Variables...');
  const REQUIRED_VARS = ['JWT_SECRET', 'MONGODB_URI'];
  const RECOMMENDED_VARS = ['REDIS_URL', 'ENCRYPTION_KEY', 'FRONTEND_BASE_URL'];

  for (const envVar of REQUIRED_VARS) {
    if (!process.env[envVar]) {
      console.error(`   ❌ Missing required environment variable: ${envVar}`);
      passed = false;
    } else {
      console.log(`   ✅ ${envVar} is configured`);
    }
  }

  for (const envVar of RECOMMENDED_VARS) {
    if (!process.env[envVar]) {
      console.warn(`   ⚠️  Recommended environment variable not set: ${envVar}`);
    } else {
      console.log(`   ✅ ${envVar} is configured`);
    }
  }

  // 2. Directory Permissions Checks
  console.log('\n2. Checking Storage & Log Directories...');
  const DIRS = ['logs', 'uploads', 'backups'];
  for (const dirName of DIRS) {
    const dirPath = path.resolve(__dirname, '..', dirName);
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
      console.log(`   ✅ Directory '${dirName}' is readable & writable`);
    } catch (err) {
      console.error(`   ❌ Directory '${dirName}' permission error:`, err.message);
      passed = false;
    }
  }

  // 3. Database Connectivity & Replica Set
  console.log('\n3. Checking MongoDB Database Connection & Replica Set...');
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
      console.log('   ✅ MongoDB connected successfully');

      const isReplSet = await checkReplicaSet();
      if (!isReplSet && process.env.NODE_ENV === 'production') {
        passed = false;
      }
      await mongoose.disconnect();
    } catch (err) {
      console.error('   ❌ MongoDB connection failed:', err.message);
      passed = false;
    }
  }

  // 4. Redis Connectivity
  console.log('\n4. Checking Redis Connectivity & Caching Fallback...');
  if (redisService.isRedisConnected && redisService.client) {
    try {
      const start = Date.now();
      await redisService.client.ping();
      console.log(`   ✅ Redis connected (latency: ${Date.now() - start}ms)`);
    } catch (err) {
      console.warn('   ⚠️  Redis ping failed:', err.message);
    }
  } else if (process.env.REDIS_URL) {
    console.warn('   ⚠️  REDIS_URL provided but client not connected yet');
  } else {
    console.log('   ℹ️  REDIS_URL not configured — High-performance In-Memory cache fallback active');
  }

  console.log('\n========================================');
  if (passed) {
    console.log('🎉 ALL CRITICAL PRE-FLIGHT CHECKS PASSED');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.error('❌ PRE-FLIGHT VERIFICATION FAILED');
    console.log('========================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal preflight error:', err);
  process.exit(1);
});
