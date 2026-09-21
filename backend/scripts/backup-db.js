/**
 * AcuStock Automated Database Backup & Point-In-Time Recovery (PITR) Script
 * Uses mongodump to create compressed gzip archives with timestamp rotation policy.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const BACKUP_DIR = path.join(__dirname, '../backups');

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not configured in environment variables.');
  process.exit(1);
}

// Create backups directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `acustock-dump-${timestamp}.gz`);

console.log('📦 Starting AcuStock Database Backup...');
console.log('Target file:', backupFile);

const backupProcess = spawn('mongodump', [
  `--uri=${MONGODB_URI}`,
  `--archive=${backupFile}`,
  '--gzip'
]);

let stderr = '';
backupProcess.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
backupProcess.on('error', (err) => {
  console.error('❌ Backup process failed:', err.message);
  process.exit(1);
});
backupProcess.on('close', (exitCode) => {
  if (exitCode !== 0) {
    console.error('❌ Backup process failed:', stderr.trim() || `exit code ${exitCode}`);
    process.exit(1);
  }

  console.log('✅ Database Backup Completed Successfully!');
  console.log('Archive location:', backupFile);

  // Clean up backups older than 30 days
  const RETENTION_DAYS = 30;
  const now = Date.now();

  fs.readdir(BACKUP_DIR, (readErr, files) => {
    if (readErr) return;

    files.forEach((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return;
        const fileAgeDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (fileAgeDays > RETENTION_DAYS) {
          fs.unlink(filePath, () => {
            console.log(`🗑️ Pruned old backup file: ${file}`);
          });
        }
      });
    });
  });
});
