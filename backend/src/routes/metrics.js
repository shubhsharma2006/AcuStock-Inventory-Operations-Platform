/**
 * Prometheus Metrics Endpoint
 * ─────────────────────────────────────────────────────────────
 * GET /api/metrics
 * Exposes system & application metrics in Prometheus 0.0.4 text format.
 * Optionally secured by METRICS_TOKEN if set in environment.
 */

const express = require('express');
const router = express.Router();
const metricsService = require('../services/metrics.service');

router.get('/', (req, res) => {
  // Optional security check if METRICS_TOKEN is defined
  const expectedToken = process.env.METRICS_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
    if (token !== expectedToken) {
      return res.status(401).send('Unauthorized: Invalid or missing metrics token');
    }
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metricsService.getPrometheusMetrics());
});

module.exports = router;

