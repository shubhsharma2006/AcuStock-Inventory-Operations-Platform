const path = require('path');
const fs = require('fs');
const net = require('net');
const logger = require('../utils/logger');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.csv', '.xls', '.xlsx',
]);

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '5242880', 10); // 5MB default

// Known malicious executable signatures (Magic Bytes)
const DANGEROUS_MAGIC_BYTES = [
  Buffer.from([0x4D, 0x5A]),             // MZ - Windows PE/DOS executable
  Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF - Linux executable
  Buffer.from([0xCF, 0xFA, 0xED, 0xFE]), // Mach-O 32-bit
  Buffer.from([0xCE, 0xFA, 0xED, 0xFE]), // Mach-O 32-bit reverse
  Buffer.from([0xFE, 0xED, 0xFA, 0xCF]), // Mach-O 64-bit
  Buffer.from([0xFE, 0xED, 0xFA, 0xCE]), // Mach-O 64-bit reverse
];

// Standard EICAR Antivirus Test Signature
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * In-memory signature inspection for malware and executable headers
 */
function inspectFileBuffer(buffer, mimetype = '') {
  if (!buffer || buffer.length === 0) return { clean: true };

  // 1. Check for executable magic bytes
  for (const magic of DANGEROUS_MAGIC_BYTES) {
    if (buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic)) {
      return {
        clean: false,
        reason: 'Binary/executable payload detected in uploaded document'
      };
    }
  }

  // 2. EICAR test string
  const contentSnippet = buffer.subarray(0, 1024).toString('utf8');
  if (contentSnippet.includes(EICAR_SIGNATURE)) {
    return {
      clean: false,
      reason: 'Malware test signature (EICAR) detected'
    };
  }

  // 3. SVG script injection checks
  if (mimetype === 'image/svg+xml' || contentSnippet.includes('<svg')) {
    const lower = contentSnippet.toLowerCase();
    if (
      lower.includes('<script') ||
      lower.includes('javascript:') ||
      lower.includes('onload=') ||
      lower.includes('onerror=')
    ) {
      return {
        clean: false,
        reason: 'SVG image contains executable script or event handlers (XSS hazard)'
      };
    }
  }

  return { clean: true };
}

/**
 * Optional ClamAV TCP Daemon Scanner (INSTREAM protocol)
 */
async function scanWithClamAV(buffer) {
  const host = process.env.CLAMAV_HOST;
  const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);

  if (!host) {
    return { scanned: false };
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.write('zINSTREAM\0');
      const chunkSize = 2048;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, i + chunkSize);
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(chunk.length, 0);
        socket.write(sizeBuf);
        socket.write(chunk);
      }
      const zeroBuf = Buffer.alloc(4);
      zeroBuf.writeUInt32BE(0, 0);
      socket.write(zeroBuf);
    });

    let response = '';
    socket.on('data', data => { response += data.toString(); });
    socket.on('end', () => {
      socket.destroy();
      const isInfected = response.includes('FOUND');
      resolve({ scanned: true, isInfected, response: response.trim() });
    });

    socket.on('error', err => {
      logger.warn('ClamAV scan skipped (daemon connection error): ' + err.message);
      socket.destroy();
      resolve({ scanned: false, error: err.message });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ scanned: false, error: 'ClamAV scan timed out' });
    });
  });
}

/**
 * Middleware: Validates size, extension, MIME type, and malware signatures
 */
async function validateUpload(req, res, next) {
  if (!req.file && (!req.files || (Array.isArray(req.files) && req.files.length === 0))) {
    return next();
  }

  let files = [];
  if (req.file) {
    files = [req.file];
  } else if (Array.isArray(req.files)) {
    files = req.files;
  } else if (typeof req.files === 'object') {
    files = Object.values(req.files).flat();
  }

  for (const file of files) {
    // 1. Check file size
    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" exceeds maximum size of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
        code: 'FILE_TOO_LARGE'
      });
    }

    // 2. Check MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `File type "${file.mimetype}" is not allowed`,
        code: 'INVALID_FILE_TYPE'
      });
    }

    // 3. Check extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        error: `File extension "${ext}" is not allowed`,
        code: 'INVALID_EXTENSION'
      });
    }

    // 4. Antivirus and Executable Magic-Byte Inspection
    let buffer = null;
    if (file.buffer) {
      buffer = file.buffer;
    } else if (file.path && fs.existsSync(file.path)) {
      try {
        buffer = fs.readFileSync(file.path);
      } catch (readErr) {
        logger.error('Failed to read uploaded file for antivirus inspection:', readErr);
      }
    }

    if (buffer) {
      // Internal static signature scanner
      const inspection = inspectFileBuffer(buffer, file.mimetype);
      if (!inspection.clean) {
        // Quarantine: Delete temp file immediately
        if (file.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        return res.status(400).json({
          success: false,
          error: `Malicious content rejected: ${inspection.reason}`,
          code: 'MALICIOUS_PAYLOAD_DETECTED'
        });
      }

      // ClamAV daemon integration (if active in environment)
      const clamResult = await scanWithClamAV(buffer);
      if (clamResult.scanned && clamResult.isInfected) {
        if (file.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        return res.status(400).json({
          success: false,
          error: `Antivirus scanner detected infected file: ${clamResult.response}`,
          code: 'VIRUS_DETECTED'
        });
      }
    }
  }

  next();
}

module.exports = {
  validateUpload,
  inspectFileBuffer,
  scanWithClamAV,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE
};
