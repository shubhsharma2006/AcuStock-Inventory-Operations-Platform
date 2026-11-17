/**
 * Automated Test Suite: Production Hardening Gaps
 * ─────────────────────────────────────────────────────────────
 * Validates fixes for:
 * 1. Universal HTML/XSS Sanitizer Middleware (Gap #04)
 * 2. High-Speed Query Caching & Prefix Invalidation (Gap #13)
 * 3. Prometheus Metrics Exporter Service & Text Formatter (Gap #15)
 * 4. AWS S3 Cloud Backup Service & Graceful Fallback (Gap #16)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// 1. XSS Sanitizer Tests
const { sanitizeString, sanitizeValue, xssSanitizer } = require('../src/middleware/xssSanitizer');

describe('Security Hardening - Universal HTML/XSS Sanitizer (Gap #04)', () => {
  it('should strip <script> tags from strings', () => {
    const malicious = '<script>alert("xss")</script>Hello World';
    const clean = sanitizeString(malicious);
    assert.strictEqual(clean, 'Hello World');
  });

  it('should strip <iframe>, <object>, and <embed> tags', () => {
    const malicious = '<iframe src="evil.com"></iframe>Safe content<embed src="test.swf">';
    const clean = sanitizeString(malicious);
    assert.strictEqual(clean, 'Safe content');
  });

  it('should strip inline javascript event handlers', () => {
    const malicious = '<img src="x" onerror="alert(1)" onload="evil()">Photo';
    const clean = sanitizeString(malicious);
    assert.ok(!clean.includes('onerror'));
    assert.ok(!clean.includes('onload'));
  });

  it('should strip javascript: and vbscript: pseudo-protocols', () => {
    const malicious = 'javascript:evil()';
    const clean = sanitizeString(malicious);
    assert.strictEqual(clean.trim(), '');
  });

  it('should recursively sanitize nested objects and arrays in req.body', () => {
    const req = {
      body: {
        companyName: '<script>hack()</script>Acme Corp',
        items: [
          { name: 'Widget <iframe src=x></iframe>', notes: 'Valid note' },
          { name: 'Clean item' }
        ],
        metadata: {
          tag: 'test onfocus=attack()'
        }
      }
    };

    xssSanitizer(req, {}, () => {});

    assert.strictEqual(req.body.companyName, 'Acme Corp');
    assert.strictEqual(req.body.items[0].name, 'Widget ');
    assert.strictEqual(req.body.items[0].notes, 'Valid note');
    assert.ok(!req.body.metadata.tag.includes('onfocus'));
  });
});

// 2. High-Speed Query Caching & Prefix Invalidation Tests
const redisService = require('../src/services/redis.service');

describe('Scale Hardening - Query Caching & Prefix Invalidation (Gap #13)', () => {
  it('should store and retrieve data with TTL', async () => {
    const testKey = 'test:item:123';
    await redisService.set(testKey, { name: 'Industrial Valve', stock: 50 }, 10);

    const cached = await redisService.get(testKey);
    assert.deepStrictEqual(cached, { name: 'Industrial Valve', stock: 50 });
  });

  it('should delete keys by prefix matching', async () => {
    const prefix = 'cache:tenant:test-tenant:items:';
    await redisService.set(`${prefix}list`, [{ id: 1 }, { id: 2 }], 60);
    await redisService.set(`${prefix}page:2`, [{ id: 3 }], 60);
    await redisService.set('cache:tenant:other-tenant:items:list', [{ id: 99 }], 60);

    // Verify set
    assert.ok(await redisService.get(`${prefix}list`));
    assert.ok(await redisService.get(`${prefix}page:2`));

    // Delete prefix
    await redisService.delPrefix(prefix);

    // Target tenant keys should be deleted
    assert.strictEqual(await redisService.get(`${prefix}list`), null);
    assert.strictEqual(await redisService.get(`${prefix}page:2`), null);

    // Other tenant key should be preserved
    assert.ok(await redisService.get('cache:tenant:other-tenant:items:list'));
  });

  it('should support remember() method with cache hit and miss', async () => {
    let queryCount = 0;
    const fetchFn = async () => {
      queryCount += 1;
      return { result: 'database-query-result' };
    };

    const key = 'test:remember:sample';
    await redisService.del(key);

    // Miss: runs fetchFn
    const val1 = await redisService.remember(key, 60, fetchFn);
    assert.strictEqual(val1.result, 'database-query-result');
    assert.strictEqual(queryCount, 1);

    // Hit: returns cached, does NOT run fetchFn
    const val2 = await redisService.remember(key, 60, fetchFn);
    assert.strictEqual(val2.result, 'database-query-result');
    assert.strictEqual(queryCount, 1);
  });
});

// 3. Prometheus Metrics Exporter Tests
const metricsService = require('../src/services/metrics.service');

describe('Observability Hardening - Prometheus Metrics Service (Gap #15)', () => {
  it('should record HTTP requests with latency and route normalization', () => {
    metricsService.recordHttpRequest('GET', '/api/items', 200, 15.5);
    metricsService.recordHttpRequest('GET', '/api/items/60d5ec49f1a2c82b9c8b4567', 200, 8.2);
    metricsService.recordHttpRequest('POST', '/api/sales-orders', 201, 45.0);

    const output = metricsService.getPrometheusMetrics();

    assert.ok(output.includes('acustock_http_requests_total{method="GET",route="/api/items",status="200"}'));
    assert.ok(output.includes('acustock_http_requests_total{method="GET",route="/api/items/:id",status="200"}'));
    assert.ok(output.includes('acustock_http_requests_total{method="POST",route="/api/sales-orders",status="201"}'));
    assert.ok(output.includes('acustock_process_resident_memory_bytes'));
    assert.ok(output.includes('acustock_mongodb_connection_status'));
    assert.ok(output.includes('acustock_websocket_connections_active'));
  });

  it('should track WebSocket connection count changes', () => {
    metricsService.setWebSocketCount(5);
    metricsService.incrementWebSockets();
    assert.strictEqual(metricsService.activeWebSockets, 6);
    metricsService.decrementWebSockets();
    assert.strictEqual(metricsService.activeWebSockets, 5);
  });
});

// 4. S3 Cloud Backup Service Tests
const s3BackupService = require('../src/services/s3Backup.service');

describe('Disaster Recovery Hardening - S3 Cloud Backup (Gap #16)', () => {
  it('should report unconfigured gracefully in development without credentials', () => {
    // If AWS_ACCESS_KEY_ID is absent, isConfigured() should be false without throwing
    const configured = s3BackupService.isConfigured();
    assert.strictEqual(typeof configured, 'boolean');
  });

  it('should return NOT_CONFIGURED reason when attempting upload without credentials', async () => {
    if (!s3BackupService.isConfigured()) {
      const result = await s3BackupService.uploadBackup('/tmp/fake-dump.tar.gz');
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reason, 'NOT_CONFIGURED');
    }
  });

  it('should return empty list when querying unconfigured cloud backups', async () => {
    if (!s3BackupService.isConfigured()) {
      const list = await s3BackupService.listCloudBackups();
      assert.deepStrictEqual(list, []);
    }
  });
});

