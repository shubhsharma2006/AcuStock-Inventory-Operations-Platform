const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let s3Client = null;
let PutObjectCommand = null;
if (process.env.S3_BUCKET) {
  const { S3Client, PutObjectCommand: PutCommand } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.S3_ACCESS_KEY_ID ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    } : undefined
  });
  PutObjectCommand = PutCommand;
}

function isS3Configured() {
  return Boolean(s3Client && PutObjectCommand && process.env.S3_BUCKET);
}

async function putObject({ key, body, contentType, tenantId }) {
  if (!tenantId) throw new Error('Tenant ID is required for storage operations');
  const safeKey = `${tenantId}/${crypto.randomUUID()}-${path.basename(key)}`;
  if (isS3Configured()) {
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: safeKey,
      Body: body,
      ContentType: contentType
    }));
    return { key: safeKey, provider: 's3' };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Object storage is required in production');
  }
  const uploadDir = path.resolve(process.env.UPLOAD_PATH || './uploads', String(tenantId));
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, path.basename(safeKey));
  await fs.promises.writeFile(filePath, body, { flag: 'wx' });
  return { key: filePath, provider: 'local' };
}

function validateCsvBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
  return !sample.includes('\uFFFD') && /[,\n\r]/.test(sample);
}

module.exports = { isS3Configured, putObject, validateCsvBuffer };
