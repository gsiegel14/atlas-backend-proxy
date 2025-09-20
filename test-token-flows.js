#!/usr/bin/env node

/**
 * Test Token Flows for Atlas Backend Proxy
 * Tests both Auth0 and Foundry token acquisition
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

async function testAuth0TokenAcquisition() {
  log(colors.blue, '\n🔐 Testing Auth0 Token Acquisition...');
  
  try {
    // Test Auth0 client credentials flow
    const tokenData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: '68cece9ee80248968f6b3157',
      client_secret: 'wTR7b0UKCfG21J07msllbZBRZa70amULfJiYXK33IY5NTwrOvj9_GNDOA9rophC8',
      audience: 'https://api.atlas.ai'
    }).toString();

    const response = await makeRequest('https://dev-irxmxjwyduu4tesn.us.auth0.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': tokenData.length
      },
      body: tokenData
    });

    if (response.status === 200 && response.data.access_token) {
      log(colors.green, '✅ Auth0 Token - Successfully acquired');
      log(colors.yellow, `   Token Type: ${response.data.token_type}`);
      log(colors.yellow, `   Expires In: ${response.data.expires_in} seconds`);
      log(colors.yellow, `   Token Preview: ${response.data.access_token.substring(0, 50)}...`);
      return response.data.access_token;
    } else {
      log(colors.red, '❌ Auth0 Token - Failed to acquire');
      log(colors.red, `   Status: ${response.status}`);
      log(colors.red, `   Error: ${JSON.stringify(response.data, null, 2)}`);
      return null;
    }
  } catch (error) {
    log(colors.red, `❌ Auth0 Token - Error: ${error.message}`);
    return null;
  }
}

async function testFoundryTokenAcquisition() {
  log(colors.blue, '\n🏭 Testing Foundry Token Acquisition...');
  
  try {
    const tokenData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'd8038d443b968266e86ccc15b2373c9f',
      client_secret: '28cadd1e81e1246de84f7d9e6d83e84f'
    }).toString();

    const response = await makeRequest('https://atlasengine.palantirfoundry.com/multipass/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': tokenData.length
      },
      body: tokenData
    });

    if (response.status === 200 && response.data.access_token) {
      log(colors.green, '✅ Foundry Token - Successfully acquired');
      log(colors.yellow, `   Token Type: ${response.data.token_type}`);
      log(colors.yellow, `   Expires In: ${response.data.expires_in} seconds`);
      log(colors.yellow, `   Token Preview: ${response.data.access_token.substring(0, 50)}...`);
      return response.data.access_token;
    } else {
      log(colors.red, '❌ Foundry Token - Failed to acquire');
      log(colors.red, `   Status: ${response.status}`);
      log(colors.red, `   Error: ${JSON.stringify(response.data, null, 2)}`);
      return null;
    }
  } catch (error) {
    log(colors.red, `❌ Foundry Token - Error: ${error.message}`);
    return null;
  }
}

async function testBackendProxyWithAuth0Token(auth0Token) {
  log(colors.blue, '\n🌉 Testing Backend Proxy with Auth0 Token...');
  
  if (!auth0Token) {
    log(colors.red, '❌ Cannot test - No Auth0 token available');
    return false;
  }

  try {
    const response = await makeRequest('https://atlas-backend-proxy.onrender.com/api/v1/foundry/ontology/metadata', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth0Token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      log(colors.green, '✅ Backend Proxy - Successfully processed Auth0 token');
      log(colors.yellow, `   Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
      return true;
    } else {
      log(colors.red, `❌ Backend Proxy - Failed (Status: ${response.status})`);
      log(colors.red, `   Error: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Backend Proxy - Error: ${error.message}`);
    return false;
  }
}

async function testJWTValidation(auth0Token) {
  log(colors.blue, '\n🔍 Testing JWT Token Validation...');
  
  if (!auth0Token) {
    log(colors.red, '❌ Cannot test - No Auth0 token available');
    return false;
  }

  // Decode JWT to inspect claims
  try {
    const parts = auth0Token.split('.');
    if (parts.length !== 3) {
      log(colors.red, '❌ Invalid JWT format');
      return false;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    log(colors.green, '✅ JWT Token Structure Valid');
    log(colors.yellow, `   Issuer: ${payload.iss}`);
    log(colors.yellow, `   Audience: ${payload.aud}`);
    log(colors.yellow, `   Subject: ${payload.sub}`);
    log(colors.yellow, `   Expires: ${new Date(payload.exp * 1000).toISOString()}`);
    log(colors.yellow, `   Scopes: ${payload.scope || 'none'}`);
    
    return true;
  } catch (error) {
    log(colors.red, `❌ JWT Decode Error: ${error.message}`);
    return false;
  }
}

async function runTokenTests() {
  log(colors.blue, '🚀 Starting Token Flow Tests for Atlas Backend Proxy...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test Auth0 token acquisition
  totalTests++;
  const auth0Token = await testAuth0TokenAcquisition();
  if (auth0Token) passedTests++;
  
  // Test Foundry token acquisition
  totalTests++;
  const foundryToken = await testFoundryTokenAcquisition();
  if (foundryToken) passedTests++;
  
  // Test JWT validation
  totalTests++;
  const jwtValid = await testJWTValidation(auth0Token);
  if (jwtValid) passedTests++;
  
  // Test backend proxy with Auth0 token
  totalTests++;
  const proxyWorking = await testBackendProxyWithAuth0Token(auth0Token);
  if (proxyWorking) passedTests++;
  
  // Results
  log(colors.blue, '\n📊 Token Flow Test Results:');
  log(colors.green, `✅ Passed: ${passedTests}/${totalTests}`);
  
  if (passedTests === totalTests) {
    log(colors.green, '\n🎉 All token flows working! Backend proxy is fully functional.');
  } else {
    log(colors.red, `\n⚠️ ${totalTests - passedTests} tests failed. Check configuration.`);
  }
  
  process.exit(passedTests === totalTests ? 0 : 1);
}

runTokenTests().catch(error => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
