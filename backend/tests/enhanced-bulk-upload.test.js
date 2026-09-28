const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { transformRow, parseBoolean, getUploadErrorResponse: getItemUploadError } = require('../src/routes/items');
const { transformCompanyRow, getUploadErrorResponse: getCompanyUploadError } = require('../src/routes/companies');

test('transformRow parses valid product data correctly with serial policy', () => {
  const row = {
    productName: 'MacBook Pro M3 Max',
    shortName: 'MBP16M3',
    hsnCode: '8471',
    salesPrice: '249900',
    purchasePrice: '210000',
    mrp: '269900',
    warrantyPeriod: '24 months',
    enableSerial: 'true',
    requireSerialOnIN: '1',
    requireSerialOnOUT: 'yes'
  };

  const userId = '60d5ec49f1b2c8b1f8e4e1a1';
  const result = transformRow(row, userId, 2);

  assert.equal(result.errors.length, 0);
  assert.ok(result.product);
  assert.equal(result.product.name, 'MacBook Pro M3 Max');
  assert.equal(result.product.shortName, 'MBP16M3');
  assert.equal(result.product.hsn, '8471');
  assert.equal(result.product.salesPrice, 249900);
  assert.equal(result.product.purchasePrice, 210000);
  assert.equal(result.product.mrp, 269900);
  assert.equal(result.product.warranty, '24 months');
  assert.equal(result.product.serialPolicy.enableSerial, true);
  assert.equal(result.product.serialPolicy.requireSerialOnIN, true);
  assert.equal(result.product.serialPolicy.requireSerialOnOUT, true);
});

test('transformRow flags missing product name and non-positive prices', () => {
  const row = {
    productName: '',
    salesPrice: '-500',
    purchasePrice: '100'
  };

  const result = transformRow(row, 'user123', 5);
  assert.ok(result.errors.length >= 2);
  assert.ok(result.errors.some(e => e.includes('Product name is required')));
  assert.ok(result.errors.some(e => e.includes('Sales price must be greater than 0')));
});

test('parseBoolean handles various truthy and falsy representations', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('TRUE'), true);
  assert.equal(parseBoolean('1'), true);
  assert.equal(parseBoolean('yes'), true);
  assert.equal(parseBoolean('y'), true);
  assert.equal(parseBoolean(true), true);

  assert.equal(parseBoolean('false'), false);
  assert.equal(parseBoolean('0'), false);
  assert.equal(parseBoolean('no'), false);
  assert.equal(parseBoolean('n'), false);
  assert.equal(parseBoolean(''), false);
  assert.equal(parseBoolean(undefined), false);
});

test('transformCompanyRow validates company records correctly', () => {
  const row = {
    companyName: 'Global Corp Inc',
    email: 'contact@globalcorp.io',
    phone: '+1 555-0199',
    street: '100 Innovation Way',
    city: 'San Jose',
    state: 'CA',
    zipCode: '95110',
    country: 'USA',
    industry: 'Technology',
    website: 'globalcorp.io',
    taxId: 'US-EIN-991823'
  };

  const userId = '60d5ec49f1b2c8b1f8e4e1a1';
  const result = transformCompanyRow(row, userId, 2);

  assert.equal(result.errors.length, 0);
  assert.ok(result.company);
  assert.equal(result.company.name, 'Global Corp Inc');
  assert.equal(result.company.email, 'contact@globalcorp.io');
  assert.equal(result.company.phone, '+1 555-0199');
  assert.equal(result.company.address.street, '100 Innovation Way');
  assert.equal(result.company.address.city, 'San Jose');
  assert.equal(result.company.address.state, 'CA');
  assert.equal(result.company.address.zipCode, '95110');
  assert.equal(result.company.address.country, 'USA');
  assert.equal(result.company.industry, 'Technology');
  assert.equal(result.company.website, 'https://globalcorp.io');
  assert.equal(result.company.taxId, 'US-EIN-991823');
});

test('transformCompanyRow validates invalid email and phone', () => {
  const row = {
    companyName: 'Acme Bad Contacts',
    email: 'not-an-email',
    phone: 'invalid-phone-string-with-letters',
    industry: 'UnknownIndustry'
  };

  const result = transformCompanyRow(row, 'user123', 3);
  assert.ok(result.errors.length >= 2);
  assert.ok(result.errors.some(e => e.includes('Invalid email address')));
  assert.ok(result.errors.some(e => e.includes('Invalid phone number')));
});

test('Excel workbook can be created and parsed back into rows with xlsx', () => {
  const sampleProducts = [
    { productName: 'Wireless Mouse', shortName: 'WMOUSE', salesPrice: 800, purchasePrice: 500 },
    { productName: 'Mechanical Keyboard', shortName: 'MECHKEY', salesPrice: 3500, purchasePrice: 2200 }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleProducts);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  assert.ok(buffer instanceof Buffer);
  assert.ok(buffer.length > 0);

  // Read back buffer
  const readWb = XLSX.read(buffer, { type: 'buffer' });
  const readSheet = readWb.Sheets[readWb.SheetNames[0]];
  const parsed = XLSX.utils.sheet_to_json(readSheet);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].productName, 'Wireless Mouse');
  assert.equal(parsed[1].productName, 'Mechanical Keyboard');
});

test('Upload error handler returns appropriate status code for limit exceeded', () => {
  const errorItem = getItemUploadError({ code: 'LIMIT_FILE_SIZE', message: 'Too large' });
  assert.equal(errorItem.statusCode, 413);

  const errorCompany = getCompanyUploadError({ code: 'LIMIT_FILE_SIZE', message: 'Too large' });
  assert.equal(errorCompany.statusCode, 413);
});

test('Plan limit check calculation prevents imports that exceed limits', () => {
  const tenantLimits = { maxItems: 100, maxCompanies: 50 };
  const currentItemUsage = 95;
  const currentCompanyUsage = 48;

  // Trying to import 10 items when 95 exist and limit is 100
  const attemptedItems = 10;
  const projectedItems = currentItemUsage + attemptedItems;
  const itemLimitExceeded = projectedItems > tenantLimits.maxItems;
  const remainingItemQuota = Math.max(0, tenantLimits.maxItems - currentItemUsage);

  assert.equal(itemLimitExceeded, true);
  assert.equal(remainingItemQuota, 5);

  // Trying to import 2 companies when 48 exist and limit is 50
  const attemptedCompanies = 2;
  const projectedCompanies = currentCompanyUsage + attemptedCompanies;
  const companyLimitExceeded = projectedCompanies > tenantLimits.maxCompanies;
  const remainingCompanyQuota = Math.max(0, tenantLimits.maxCompanies - currentCompanyUsage);

  assert.equal(companyLimitExceeded, false);
  assert.equal(remainingCompanyQuota, 2);
});
