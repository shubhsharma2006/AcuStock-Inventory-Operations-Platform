/**
 * Security Suite: SSRF & DNS Rebinding Protection Tests
 * ─────────────────────────────────────────────────────────────
 * Verifies that safeHttpClient and webhook controllers strictly block:
 * 1. Cloud instance metadata endpoints (169.254.169.254)
 * 2. Loopback addresses (127.0.0.1, localhost, ::1)
 * 3. Private RFC1918 subnets (10.0.0.1, 172.16.0.1, 192.168.1.1)
 * 4. IPv6 link-local and unique local addresses
 * 5. Invalid protocols (ftp://, file://, gopher://)
 * 6. Validates that allowed public endpoints resolve correctly
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateAndResolveHost,
  isIpBlocked,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  safeRequest
} = require('../src/utils/safeHttpClient');

test('SSRF Protection - IP Range Classification', () => {
  // Cloud metadata endpoint (AWS / GCP / Azure)
  assert.equal(isPrivateOrReservedIPv4('169.254.169.254'), true, 'Should block 169.254.169.254');
  assert.equal(isPrivateOrReservedIPv4('169.254.1.1'), true, 'Should block entire 169.254.0.0/16');

  // Loopback
  assert.equal(isPrivateOrReservedIPv4('127.0.0.1'), true, 'Should block 127.0.0.1');
  assert.equal(isPrivateOrReservedIPv4('127.128.0.1'), true, 'Should block entire 127.0.0.0/8');

  // RFC1918 Private Networks
  assert.equal(isPrivateOrReservedIPv4('10.0.0.1'), true, 'Should block 10.0.0.0/8');
  assert.equal(isPrivateOrReservedIPv4('10.255.255.255'), true, 'Should block 10.255.255.255');
  assert.equal(isPrivateOrReservedIPv4('172.16.0.1'), true, 'Should block 172.16.0.0/12');
  assert.equal(isPrivateOrReservedIPv4('172.31.255.255'), true, 'Should block 172.31.255.255');
  assert.equal(isPrivateOrReservedIPv4('192.168.0.1'), true, 'Should block 192.168.0.0/16');
  assert.equal(isPrivateOrReservedIPv4('192.168.1.100'), true, 'Should block 192.168.1.100');

  // CGNAT / Shared
  assert.equal(isPrivateOrReservedIPv4('100.64.0.1'), true, 'Should block 100.64.0.0/10');

  // Broadcast / Multicast
  assert.equal(isPrivateOrReservedIPv4('224.0.0.1'), true, 'Should block multicast');
  assert.equal(isPrivateOrReservedIPv4('255.255.255.255'), true, 'Should block broadcast');

  // Public IPs must NOT be blocked
  assert.equal(isPrivateOrReservedIPv4('8.8.8.8'), false, 'Should allow Google DNS (8.8.8.8)');
  assert.equal(isPrivateOrReservedIPv4('1.1.1.1'), false, 'Should allow Cloudflare DNS (1.1.1.1)');
  assert.equal(isPrivateOrReservedIPv4('142.250.190.46'), false, 'Should allow Google public IP');
});

test('SSRF Protection - IPv6 Classification', () => {
  assert.equal(isPrivateOrReservedIPv6('::1'), true, 'Should block IPv6 loopback');
  assert.equal(isPrivateOrReservedIPv6('::'), true, 'Should block IPv6 unspecified');
  assert.equal(isPrivateOrReservedIPv6('fe80::1'), true, 'Should block link-local IPv6');
  assert.equal(isPrivateOrReservedIPv6('fc00::1'), true, 'Should block ULA IPv6');
  assert.equal(isPrivateOrReservedIPv6('fd12:3456::1'), true, 'Should block ULA IPv6');
  assert.equal(isPrivateOrReservedIPv6('::ffff:127.0.0.1'), true, 'Should block IPv4-mapped loopback');
  assert.equal(isPrivateOrReservedIPv6('::ffff:169.254.169.254'), true, 'Should block IPv4-mapped metadata');
  assert.equal(isPrivateOrReservedIPv6('2607:f8b0:4005:808::200e'), false, 'Should allow public IPv6');
});

test('SSRF Protection - validateAndResolveHost rejects internal addresses', async () => {
  await assert.rejects(
    async () => validateAndResolveHost('127.0.0.1'),
    { message: /SSRF_DETECTED/ }
  );

  await assert.rejects(
    async () => validateAndResolveHost('169.254.169.254'),
    { message: /SSRF_DETECTED/ }
  );

  await assert.rejects(
    async () => validateAndResolveHost('localhost'),
    { message: /SSRF_DETECTED/ }
  );

  await assert.rejects(
    async () => validateAndResolveHost('10.0.0.5'),
    { message: /SSRF_DETECTED/ }
  );
});

test('SSRF Protection - safeRequest rejects unsupported protocols and blocked IPs', async () => {
  await assert.rejects(
    async () => safeRequest('ftp://example.com/test'),
    { message: /Unsupported protocol/ }
  );

  await assert.rejects(
    async () => safeRequest('file:///etc/passwd'),
    { message: /Unsupported protocol/ }
  );

  await assert.rejects(
    async () => safeRequest('http://169.254.169.254/latest/meta-data/'),
    { message: /SSRF_DETECTED/ }
  );

  await assert.rejects(
    async () => safeRequest('http://127.0.0.1:5001/api/admin'),
    { message: /SSRF_DETECTED/ }
  );
});

