/**
 * Prometheus Metrics Service
 * ─────────────────────────────────────────────────────────────
 * Zero-dependency OpenMetrics / Prometheus 0.0.4 text formatter.
 * Tracks HTTP requests, latencies, WebSocket counts, memory, and MongoDB state.
 */

const mongoose = require('mongoose');

class MetricsService {
  constructor() {
    this.httpRequestsTotal = new Map(); // key: "method|route|status" -> count
    this.httpRequestDurationSum = new Map(); // key: "method|route|status" -> sum of duration in ms
    this.httpRequestDurationCount = new Map(); // key: "method|route|status" -> count
    this.activeWebSockets = 0;
  }

  /**
   * Normalizes route path to avoid high cardinality (e.g. /api/items/64abc123 -> /api/items/:id)
   * @param {string} path 
   * @returns {string}
   */
  normalizeRoute(path) {
    if (!path) return 'unknown';
    // Clean query parameters
    const cleanPath = path.split('?')[0];
    // Replace Mongo ObjectIds with :id
    return cleanPath
      .replace(/[0-9a-fA-F]{24}/g, ':id')
      .replace(/\/[0-9]+/g, '/:num');
  }

  /**
   * Records completed HTTP request
   * @param {string} method 
   * @param {string} route 
   * @param {number} statusCode 
   * @param {number} durationMs 
   */
  recordHttpRequest(method, route, statusCode, durationMs) {
    const normRoute = this.normalizeRoute(route);
    const key = `${method.toUpperCase()}|${normRoute}|${statusCode}`;

    const currentCount = this.httpRequestsTotal.get(key) || 0;
    this.httpRequestsTotal.set(key, currentCount + 1);

    const currentDurationSum = this.httpRequestDurationSum.get(key) || 0;
    this.httpRequestDurationSum.set(key, currentDurationSum + durationMs);

    const currentDurationCount = this.httpRequestDurationCount.get(key) || 0;
    this.httpRequestDurationCount.set(key, currentDurationCount + 1);
  }

  setWebSocketCount(count) {
    this.activeWebSockets = Math.max(0, count);
  }

  incrementWebSockets() {
    this.activeWebSockets += 1;
  }

  decrementWebSockets() {
    this.activeWebSockets = Math.max(0, this.activeWebSockets - 1);
  }

  /**
   * Generates standard Prometheus exposition text
   * @returns {string}
   */
  getPrometheusMetrics() {
    const lines = [];

    // Process & Memory Metrics
    const mem = process.memoryUsage();
    lines.push('# HELP acustock_process_resident_memory_bytes Resident memory size in bytes.');
    lines.push('# TYPE acustock_process_resident_memory_bytes gauge');
    lines.push(`acustock_process_resident_memory_bytes ${mem.rss}`);

    lines.push('# HELP acustock_process_heap_used_bytes Process heap memory used in bytes.');
    lines.push('# TYPE acustock_process_heap_used_bytes gauge');
    lines.push(`acustock_process_heap_used_bytes ${mem.heapUsed}`);

    lines.push('# HELP acustock_process_uptime_seconds The uptime of the system in seconds.');
    lines.push('# TYPE acustock_process_uptime_seconds gauge');
    lines.push(`acustock_process_uptime_seconds ${Math.floor(process.uptime())}`);

    // MongoDB Connection Status
    const mongoState = mongoose.connection.readyState === 1 ? 1 : 0;
    lines.push('# HELP acustock_mongodb_connection_status 1 if MongoDB is connected, 0 otherwise.');
    lines.push('# TYPE acustock_mongodb_connection_status gauge');
    lines.push(`acustock_mongodb_connection_status ${mongoState}`);

    // Active WebSockets
    lines.push('# HELP acustock_websocket_connections_active Number of active WebSocket connections.');
    lines.push('# TYPE acustock_websocket_connections_active gauge');
    lines.push(`acustock_websocket_connections_active ${this.activeWebSockets}`);

    // HTTP Requests Total
    lines.push('# HELP acustock_http_requests_total Total number of HTTP requests handled.');
    lines.push('# TYPE acustock_http_requests_total counter');
    for (const [key, count] of this.httpRequestsTotal.entries()) {
      const [method, route, status] = key.split('|');
      lines.push(`acustock_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
    }

    // HTTP Request Duration Summary
    lines.push('# HELP acustock_http_request_duration_ms Total execution time of HTTP requests in ms.');
    lines.push('# TYPE acustock_http_request_duration_ms summary');
    for (const [key, sum] of this.httpRequestDurationSum.entries()) {
      const [method, route, status] = key.split('|');
      const count = this.httpRequestDurationCount.get(key) || 1;
      lines.push(`acustock_http_request_duration_ms_sum{method="${method}",route="${route}",status="${status}"} ${sum.toFixed(2)}`);
      lines.push(`acustock_http_request_duration_ms_count{method="${method}",route="${route}",status="${status}"} ${count}`);
    }

    return lines.join('\n') + '\n';
  }
}

const metricsService = new MetricsService();
module.exports = metricsService;

