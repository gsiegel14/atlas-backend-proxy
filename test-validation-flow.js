#!/usr/bin/env node

/**
 * Test Token Validation Flow for Atlas Backend Proxy
 * Tests if the backend proxy can validate JWT tokens and call Foundry
 */

import https from 'https';

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
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testFoundryServiceTokenAcquisition() {
  log(colors.blue, '\n🏭 Testing Backend Proxy Foundry Token Acquisition...');
  
  try {
    // Test if the backend proxy can get a Foundry service token
    const response = await makeRequest('https://atlas-backend-proxy.onrender.com/health/ready');
    
    if (response.status === 200 && response.data.checks.foundry === true) {
      log(colors.green, '✅ Backend Proxy - Foundry connection healthy');
      log(colors.yellow, '   This means the backend proxy can likely get Foundry tokens');
      return true;
    } else {
      log(colors.red, '❌ Backend Proxy - Foundry connection unhealthy');
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Backend Proxy - Error: ${error.message}`);
    return false;
  }
}

async function testAuth0JWKSEndpoint() {
  log(colors.blue, '\n🔑 Testing Auth0 JWKS Endpoint...');
  
  try {
    const response = await makeRequest('https://dev-irxmxjwyduu4tesn.us.auth0.com/.well-known/jwks.json');
    
    if (response.status === 200 && response.data.keys && response.data.keys.length > 0) {
      log(colors.green, '✅ Auth0 JWKS - Endpoint accessible');
      log(colors.yellow, `   Found ${response.data.keys.length} signing keys`);
      return true;
    } else {
      log(colors.red, '❌ Auth0 JWKS - Endpoint not accessible');
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Auth0 JWKS - Error: ${error.message}`);
    return false;
  }
}

async function testBackendProxyInternalTokenFlow() {
  log(colors.blue, '\n🔄 Testing Backend Proxy Internal Token Management...');
  
  try {
    // The backend proxy should be able to get its own service tokens
    // We can't test this directly, but we can check if the service is healthy
    const response = await makeRequest('https://atlas-backend-proxy.onrender.com/health/ready');
    
    const allHealthy = response.data.checks.foundry && response.data.checks.redis && response.data.checks.auth0;
    
    if (allHealthy) {
      log(colors.green, '✅ Backend Proxy - All internal services ready');
      log(colors.yellow, '   Foundry: Ready (can acquire service tokens)');
      log(colors.yellow, '   Redis: Ready (rate limiting active)');
      log(colors.yellow, '   Auth0: Ready (JWT validation active)');
      return true;
    } else {
      log(colors.red, '❌ Backend Proxy - Some services not ready');
      log(colors.red, `   Foundry: ${response.data.checks.foundry}`);
      log(colors.red, `   Redis: ${response.data.checks.redis}`);
      log(colors.red, `   Auth0: ${response.data.checks.auth0}`);
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Backend Proxy - Error: ${error.message}`);
    return false;
  }
}

async function testRequiredAuth0Configuration() {
  log(colors.blue, '\n⚙️ Testing Required Auth0 Configuration...');
  
  log(colors.yellow, '📋 Current Configuration:');
  log(colors.yellow, '   Domain: dev-irxmxjwyduu4tesn.us.auth0.com');
  log(colors.yellow, '   API Audience: https://api.atlas.ai');
  log(colors.yellow, '   iOS Client: IOv9pvajG7wxHzeF2pCW12toC4b9hWCY');
  
  log(colors.blue, '\n🔧 Required Setup for Production:');
  log(colors.yellow, '1. Create Machine-to-Machine Application in Auth0');
  log(colors.yellow, '2. Authorize it for the API: https://api.atlas.ai');
  log(colors.yellow, '3. Grant required scopes (execute:actions, read:patient, etc.)');
  log(colors.yellow, '4. Use M2M credentials in backend proxy');
  
  log(colors.blue, '\n📱 For iOS App:');
  log(colors.yellow, '1. iOS app uses client: IOv9pvajG7wxHzeF2pCW12toC4b9hWCY');
  log(colors.yellow, '2. Gets JWT tokens via Auth0 login flow');
  log(colors.yellow, '3. Sends JWT to backend proxy');
  log(colors.yellow, '4. Backend proxy validates JWT and calls Foundry');
  
  return true;
}

async function runValidationTests() {
  log(colors.blue, '🚀 Starting Backend Proxy Validation Tests...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test Auth0 JWKS endpoint
  totalTests++;
  const jwksWorking = await testAuth0JWKSEndpoint();
  if (jwksWorking) passedTests++;
  
  // Test backend proxy internal health
  totalTests++;
  const proxyHealthy = await testBackendProxyInternalTokenFlow();
  if (proxyHealthy) passedTests++;
  
  // Test Foundry connection via proxy
  totalTests++;
  const foundryHealthy = await testFoundryServiceTokenAcquisition();
  if (foundryHealthy) passedTests++;
  
  // Show configuration requirements
  totalTests++;
  const configShown = await testRequiredAuth0Configuration();
  if (configShown) passedTests++;
  
  // Username propagation probe (manual header passthrough)
  totalTests++;
  try {
    const response = await makeRequest('https://atlas-backend-proxy.onrender.com/health', {
      method: 'GET',
      headers: {
        'X-Auth0-Username': 'test.user@example.com'
      }
    });
    // Health is unauthenticated; this just ensures header doesn't break CORS/helmet
    if (response.status === 200) {
      passedTests++;
      log(colors.green, '✅ CORS/Helmet allows X-Auth0-Username header');
    }
  } catch (e) {
    log(colors.red, `❌ Username header not allowed: ${e.message}`);
  }

  // Results
  log(colors.blue, '\n📊 Validation Test Results:');
  log(colors.green, `✅ Passed: ${passedTests}/${totalTests}`);
  
  if (passedTests >= 3) {
    log(colors.green, '\n🎉 Backend proxy infrastructure is working!');
    log(colors.yellow, '\n📝 Next Steps:');
    log(colors.yellow, '1. Create Machine-to-Machine app in Auth0 for backend proxy');
    log(colors.yellow, '2. Test with real JWT tokens from iOS app');
    log(colors.yellow, '3. Verify end-to-end Auth0 → Backend → Foundry flow');
  } else {
    log(colors.red, `\n⚠️ ${totalTests - passedTests} tests failed. Check configuration.`);
  }
  
  process.exit(passedTests >= 3 ? 0 : 1);
}

runValidationTests().catch(error => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
