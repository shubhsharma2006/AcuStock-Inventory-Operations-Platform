const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectFileBuffer, validateUpload } = require('../src/middleware/uploadValidation');

test('File Upload Antivirus & Malicious Content Screening', async (t) => {
  await t.test('1. Clean Files: Allows legitimate images and documents', () => {
    const cleanPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const resultPng = inspectFileBuffer(cleanPngBuffer, 'image/png');
    assert.equal(resultPng.clean, true);

    const cleanCsvBuffer = Buffer.from('sku,name,price,quantity\nSKU-001,Widget,100,50');
    const resultCsv = inspectFileBuffer(cleanCsvBuffer, 'text/csv');
    assert.equal(resultCsv.clean, true);
  });

  await t.test('2. Windows Executable Magic Bytes: Detects and rejects MZ binary headers', () => {
    // Windows PE/DOS header starting with 'MZ'
    const dosExeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = inspectFileBuffer(dosExeBuffer, 'image/jpeg');

    assert.equal(result.clean, false);
    assert.ok(result.reason.includes('Binary/executable payload detected'));
  });

  await t.test('3. Linux ELF Executable: Detects and rejects ELF binary headers', () => {
    // Linux ELF header starting with 0x7F 'ELF'
    const elfBuffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const result = inspectFileBuffer(elfBuffer, 'application/pdf');

    assert.equal(result.clean, false);
    assert.ok(result.reason.includes('Binary/executable payload detected'));
  });

  await t.test('4. EICAR Test String: Detects and flags antivirus test signature', () => {
    const eicarBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    const result = inspectFileBuffer(eicarBuffer, 'text/plain');

    assert.equal(result.clean, false);
    assert.ok(result.reason.includes('EICAR'));
  });

  await t.test('5. SVG Cross-Site Scripting (XSS): Detects script tags and event handlers', () => {
    const maliciousSvg1 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');
    const result1 = inspectFileBuffer(maliciousSvg1, 'image/svg+xml');
    assert.equal(result1.clean, false);
    assert.ok(result1.reason.includes('XSS hazard'));

    const maliciousSvg2 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'//evil.com\')"></svg>');
    const result2 = inspectFileBuffer(maliciousSvg2, 'image/svg+xml');
    assert.equal(result2.clean, false);
    assert.ok(result2.reason.includes('XSS hazard'));
  });

  await t.test('6. Middleware Guard: Rejects malicious upload with 400 MALICIOUS_PAYLOAD_DETECTED', async () => {
    const req = {
      file: {
        originalname: 'invoice.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03]) // Disguised Windows .exe
      }
    };

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { jsonBody = data; }
        };
      }
    };

    await validateUpload(req, res, () => {
      assert.fail('Should not proceed with malicious executable file');
    });

    assert.equal(statusCode, 400);
    assert.equal(jsonBody.code, 'MALICIOUS_PAYLOAD_DETECTED');
  });
});
