/**
 * S3 Cloud Backup Service
 * ─────────────────────────────────────────────────────────────
 * Streams compressed MongoDB backups directly to an Amazon S3,
 * Cloudflare R2, MinIO, or DigitalOcean Spaces bucket.
 *
 * Uses @aws-sdk/client-s3. Operates gracefully with local fallback
 * if S3 credentials are not configured in environment.
 */

const fs = require('fs');
const path = require('path');
const { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectCommand 
} = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

class S3BackupService {
  constructor() {
    this.bucket = process.env.S3_BACKUP_BUCKET || process.env.AWS_S3_BUCKET || null;
    this.region = process.env.S3_BACKUP_REGION || process.env.AWS_REGION || 'us-east-1';
    this.endpoint = process.env.S3_ENDPOINT || undefined; // Optional custom endpoint (e.g. for R2 or MinIO)

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (this.bucket && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });
      this.configured = true;
      logger.info(`✅ S3 Cloud Backup Service configured for bucket: ${this.bucket} (${this.region})`);
    } else {
      this.client = null;
      this.configured = false;
    }
  }

  /**
   * Checks whether cloud backup credentials are configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.configured;
  }

  /**
   * Uploads a local backup file to S3
   * @param {string} filePath Absolute or relative path to backup archive
   * @param {string} [fileName] Custom S3 object key
   * @returns {Promise<{ success: boolean, key: string, size: number, location?: string }>}
   */
  async uploadBackup(filePath, fileName) {
    if (!this.isConfigured()) {
      logger.info('ℹ️  S3 Cloud Backup not configured — backup retained on local disk only');
      return { success: false, reason: 'NOT_CONFIGURED' };
    }

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Local backup file not found at path: ${resolvedPath}`);
    }

    const key = fileName || path.basename(resolvedPath);
    const fileStream = fs.createReadStream(resolvedPath);
    const stat = fs.statSync(resolvedPath);

    logger.info(`☁️  Uploading backup archive to S3 (${this.bucket}/${key}, ${(stat.size / 1024 / 1024).toFixed(2)} MB)...`);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
      ContentLength: stat.size,
      ContentType: 'application/gzip',
      Metadata: {
        'uploaded-by': 'acustock-backup-engine',
        'created-at': new Date().toISOString()
      }
    });

    await this.client.send(command);

    logger.info(`✅ Backup successfully uploaded to S3: ${key}`);
    return {
      success: true,
      bucket: this.bucket,
      key,
      size: stat.size,
      uploadedAt: new Date()
    };
  }

  /**
   * Lists backup archives stored in S3
   * @returns {Promise<Array<{ key: string, size: number, lastModified: Date }>>}
   */
  async listCloudBackups() {
    if (!this.isConfigured()) return [];

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'dump_'
      });

      const response = await this.client.send(command);
      if (!response.Contents) return [];

      return response.Contents.map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified
      })).sort((a, b) => b.lastModified - a.lastModified);
    } catch (err) {
      logger.error('Failed to list S3 backups:', err);
      return [];
    }
  }

  /**
   * Prunes cloud backups older than specified retention days
   * @param {number} retentionDays Default: 30
   */
  async pruneCloudBackups(retentionDays = 30) {
    if (!this.isConfigured()) return;

    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const backups = await this.listCloudBackups();

      for (const backup of backups) {
        if (new Date(backup.lastModified).getTime() < cutoffTime) {
          logger.info(`🗑️  Pruning expired cloud backup from S3: ${backup.key}`);
          await this.client.send(new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: backup.key
          }));
        }
      }
    } catch (err) {
      logger.error('Failed to prune S3 backups:', err);
    }
  }

  /**
   * Finds latest local backup in directory and syncs to S3
   * @param {string} backupDir 
   */
  async syncLatestBackup(backupDir = './backups') {
    if (!this.isConfigured()) {
      return { success: false, reason: 'NOT_CONFIGURED' };
    }

    const resolvedDir = path.resolve(backupDir);
    if (!fs.existsSync(resolvedDir)) {
      return { success: false, reason: 'NO_BACKUP_DIR' };
    }

    const files = fs.readdirSync(resolvedDir)
      .filter(f => f.startsWith('dump_'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(resolvedDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      return { success: false, reason: 'NO_BACKUPS_FOUND' };
    }

    const latest = files[0];
    return await this.uploadBackup(path.join(resolvedDir, latest.name), latest.name);
  }
}

const s3BackupService = new S3BackupService();
module.exports = s3BackupService;

