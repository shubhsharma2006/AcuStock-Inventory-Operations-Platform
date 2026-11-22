/**
 * Automated Verification: OpenAPI 3.0 Specification & Turnkey Deployment Manifests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('OpenAPI 3.0 & Production Deployment Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const openApiJsonPath = path.join(rootDir, 'docs/openapi.json');
  const openApiYamlPath = path.join(rootDir, 'docs/openapi.yaml');
  const backendOpenApiPath = path.join(rootDir, 'backend/src/docs/openapi.json');
  const railwayConfigPath = path.join(rootDir, 'deploy/railway.json');
  const nginxSslPath = path.join(rootDir, 'deploy/nginx-ssl.conf');

  test('1. should contain valid OpenAPI 3.0 JSON spec with required metadata', () => {
    assert.ok(fs.existsSync(openApiJsonPath), 'docs/openapi.json must exist');
    assert.ok(fs.existsSync(backendOpenApiPath), 'backend/src/docs/openapi.json must exist');

    const content = fs.readFileSync(openApiJsonPath, 'utf-8');
    const spec = JSON.parse(content);

    assert.equal(spec.openapi, '3.0.3');
    assert.ok(spec.info.title.includes('AcuStock'));
    assert.equal(spec.info.version, '2.0.0');
    assert.ok(Array.isArray(spec.tags) && spec.tags.length >= 10, 'Should include comprehensive tags');
    assert.ok(spec.paths['/auth/login'], 'Must document /auth/login');
    assert.ok(spec.paths['/crm/deals/{id}/generate-quote'], 'Must document formal quote generation');
    assert.ok(spec.paths['/crm/companies/{id}/customer-360'], 'Must document Customer 360 credit profile');
    assert.ok(spec.paths['/reports/tally-xml'], 'Must document Tally Prime XML export bridge');
    assert.ok(spec.components.securitySchemes.BearerAuth, 'Must include JWT Bearer security');

    // Verify comprehensive enterprise route coverage
    let opCount = 0;
    for (const p in spec.paths) {
      for (const m in spec.paths[p]) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(m.toLowerCase())) {
          opCount++;
          const op = spec.paths[p][m];
          // Check that every URL path parameter has a parameter declaration
          const pathParams = p.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
          if (pathParams.length > 0) {
            const declaredParamNames = (op.parameters || []).map(param => param.name);
            pathParams.forEach(paramStr => {
              const name = paramStr.replace(/[{}]/g, '');
              assert.ok(
                declaredParamNames.includes(name),
                `Operation ${m.toUpperCase()} ${p} missing declaration for path parameter "${name}"`
              );
            });
          }
        }
      }
    }

    assert.ok(opCount >= 450, `Spec must document all route operations (found ${opCount}, expected >= 450)`);
    assert.ok(Object.keys(spec.paths).length >= 350, `Spec must document >= 350 paths (found ${Object.keys(spec.paths).length})`);
  });

  test('2. should contain valid OpenAPI 3.0 YAML spec that parses cleanly', () => {
    assert.ok(fs.existsSync(openApiYamlPath), 'docs/openapi.yaml must exist');
    const content = fs.readFileSync(openApiYamlPath, 'utf-8');
    assert.ok(content.length > 5000, 'YAML file should have substantial content');

    // Verify syntax via python3 yaml parser
    const verifyCmd = `python3 -c "import yaml; spec = yaml.safe_load(open('${openApiYamlPath}')); assert spec['openapi'] == '3.0.3'"`;
    assert.doesNotThrow(() => {
      execSync(verifyCmd);
    }, 'YAML spec must be valid OpenAPI 3.0 syntax');
  });

  test('3. should have valid Railway deployment topology manifest', () => {
    assert.ok(fs.existsSync(railwayConfigPath), 'deploy/railway.json must exist');
    const content = fs.readFileSync(railwayConfigPath, 'utf-8');
    const config = JSON.parse(content);

    assert.ok(config.services['acustock-backend'], 'Must configure backend service');
    assert.ok(config.services['acustock-frontend'], 'Must configure frontend service');
    assert.equal(config.services['acustock-backend'].deploy.healthcheckPath, '/api/health');
  });

  test('4. should have production-hardened Nginx SSL configuration', () => {
    assert.ok(fs.existsSync(nginxSslPath), 'deploy/nginx-ssl.conf must exist');
    const content = fs.readFileSync(nginxSslPath, 'utf-8');

    assert.ok(content.includes('ssl_protocols TLSv1.2 TLSv1.3;'), 'Must enforce modern TLS');
    assert.ok(content.includes('limit_req_zone'), 'Must configure rate limiting');
    assert.ok(content.includes('location /socket.io/'), 'Must support WebSocket reverse proxy');
    assert.ok(content.includes('return 301 https://$host$request_uri;'), 'Must enforce HTTP to HTTPS 301 redirect');
    assert.ok(content.includes('Strict-Transport-Security'), 'Must set HSTS security header');
  });
});

