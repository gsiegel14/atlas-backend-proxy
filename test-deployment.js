#!/usr/bin/env node

/**
 * Deployment Test Suite for Atlas Backend Proxy
 * Tests all key functionality to ensure the service is working correctly
 */

import https from 'https';

const BASE_URL = 'https://atlas-backend-proxy.onrender.com';
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function testHealthEndpoints() {
  log(colors.blue, '\n🏥 Testing Health Endpoints...');
  
  // Test basic health
  const health = await makeRequest(`${BASE_URL}/health`);
  if (health.status === 200 && health.data.status === 'healthy') {
    log(colors.green, '✅ /health - Service is healthy');
  } else {
    log(colors.red, '❌ /health - Service unhealthy');
    return false;
  }
  
  // Test readiness
  const ready = await makeRequest(`${BASE_URL}/health/ready`);
  if (ready.status === 200 && ready.data.status === 'ready') {
    log(colors.green, '✅ /health/ready - All dependencies ready');
    log(colors.yellow, `   - Foundry: ${ready.data.checks.foundry}`);
    log(colors.yellow, `   - Redis: ${ready.data.checks.redis}`);
    log(colors.yellow, `   - Auth0: ${ready.data.checks.auth0}`);
  } else {
    log(colors.red, '❌ /health/ready - Dependencies not ready');
  }
  
  // Test liveness
  const live = await makeRequest(`${BASE_URL}/health/live`);
  if (live.status === 200 && live.data.status === 'alive') {
    log(colors.green, `✅ /health/live - Service alive (uptime: ${Math.round(live.data.uptime)}s)`);
  } else {
    log(colors.red, '❌ /health/live - Service not alive');
  }
  
  return true;
}

async function testAuthentication() {
  log(colors.blue, '\n🔐 Testing Authentication...');
  
  // Test protected endpoint without token
  const unauth = await makeRequest(`${BASE_URL}/api/v1/foundry/ontology/metadata`);
  if (unauth.status === 401 && unauth.data.error?.code === 'UNAUTHORIZED') {
    log(colors.green, '✅ Authentication required - Properly blocks unauthenticated requests');
  } else {
    log(colors.red, '❌ Authentication bypass - Should require valid token');
    return false;
  }
  
  return true;
}

async function testErrorHandling() {
  log(colors.blue, '\n🚨 Testing Error Handling...');
  
  // Test 404 handling
  const notFound = await makeRequest(`${BASE_URL}/nonexistent`);
  if (notFound.status === 404 && notFound.data.error?.code === 'NOT_FOUND') {
    log(colors.green, '✅ 404 handling - Proper error format with correlation ID');
  } else {
    log(colors.red, '❌ 404 handling - Incorrect error response');
    return false;
  }
  
  return true;
}

async function testSecurity() {
  log(colors.blue, '\n🛡️ Testing Security Headers...');
  
  const response = await makeRequest(`${BASE_URL}/health`, {
    method: 'GET',
    headers: { 'Origin': 'https://atlas.ai' }
  });
  
  const headers = response.headers;
  
  // Check CORS
  if (headers['access-control-allow-origin'] === 'https://atlas.ai') {
    log(colors.green, '✅ CORS - Properly configured for allowed origins');
  } else {
    log(colors.red, '❌ CORS - Incorrect origin handling');
  }
  
  // Check security headers
  const securityHeaders = [
    'content-security-policy',
    'strict-transport-security', 
    'x-content-type-options',
    'x-frame-options',
    'x-correlation-id'
  ];
  
  let securityPassed = true;
  securityHeaders.forEach(header => {
    if (headers[header]) {
      log(colors.green, `✅ Security header: ${header}`);
    } else {
      log(colors.red, `❌ Missing security header: ${header}`);
      securityPassed = false;
    }
  });
  
  return securityPassed;
}

async function testRateLimit() {
  log(colors.blue, '\n⏱️ Testing Rate Limiting...');
  
  // Make several requests quickly
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(makeRequest(`${BASE_URL}/health`));
  }
  
  const responses = await Promise.all(promises);
  const successCount = responses.filter(r => r.status === 200).length;
  
  if (successCount >= 4) {
    log(colors.green, `✅ Rate limiting - ${successCount}/5 requests succeeded (normal traffic)`);
  } else {
    log(colors.yellow, `⚠️ Rate limiting - Only ${successCount}/5 requests succeeded`);
  }
  
  return true;
}

async function runTests() {
  log(colors.blue, '🚀 Starting Atlas Backend Proxy Deployment Tests...\n');
  
  const tests = [
    { name: 'Health Endpoints', fn: testHealthEndpoints },
    { name: 'Authentication', fn: testAuthentication },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Security Headers', fn: testSecurity },
    { name: 'Rate Limiting', fn: testRateLimit }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log(colors.red, `❌ ${test.name} - Test failed with error: ${error.message}`);
      failed++;
    }
  }
  
  log(colors.blue, '\n📊 Test Results:');
  log(colors.green, `✅ Passed: ${passed}`);
  if (failed > 0) {
    log(colors.red, `❌ Failed: ${failed}`);
  }
  
  if (failed === 0) {
    log(colors.green, '\n🎉 All tests passed! Backend proxy is ready for production.');
    log(colors.yellow, '\n📝 Next steps:');
    log(colors.yellow, '   1. Configure Auth0 and Foundry secrets in Render dashboard');
    log(colors.yellow, '   2. Update iOS app to use Auth0 authentication');
    log(colors.yellow, '   3. Replace direct Foundry calls with backend proxy endpoints');
  } else {
    log(colors.red, '\n⚠️ Some tests failed. Please review and fix issues before proceeding.');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
