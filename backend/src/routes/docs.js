const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const openApiSpecPath = path.join(__dirname, '../docs/openapi.json');

// Serve OpenAPI 3.0 specification JSON
router.get('/openapi.json', (req, res) => {
  if (fs.existsSync(openApiSpecPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(openApiSpecPath);
  } else {
    res.status(404).json({ success: false, error: 'OpenAPI specification not found' });
  }
});

// Interactive Swagger UI documentation page
router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AcuStock API Documentation — Interactive Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar {
      display: none !important;
    }
    .custom-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 1.25rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: #38bdf8;
      font-size: 1.25rem;
      font-weight: 700;
    }
    .badge {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .swagger-ui .info .title {
      color: #f8fafc;
    }
    .swagger-ui .info p, .swagger-ui .info li {
      color: #94a3b8;
    }
    .swagger-ui .scheme-container {
      background: #1e293b;
      box-shadow: none;
      border-radius: 8px;
      margin: 1.5rem 0;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .swagger-ui .opblock {
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <div class="brand">
      <span>📦</span>
      <span>AcuStock API Documentation</span>
      <span class="badge">v2.0 Production</span>
    </div>
    <div>
      <a href="/api/docs/openapi.json" target="_blank" style="color: #94a3b8; text-decoration: none; font-size: 0.875rem; font-weight: 500;">Raw OpenAPI JSON &rarr;</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list"
      });
    };
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
