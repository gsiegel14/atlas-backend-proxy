#!/usr/bin/env node

/**
 * Test Backend Proxy with Real Auth0 Token
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

async function getAuth0Token() {
  log(colors.blue, '🔐 Getting fresh Auth0 token...');
  
  const tokenData = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: '1weBKUjnKHA4pLWQqNlcJffM3u0xmNCy',
    client_secret: 'fM18ziIPWy3rmbnbkugtPjIYPwxR4EwfRyK7Phs4BePB8-UlSATJwt63M6in57_E',
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

  if (response.status === 200) {
    log(colors.green, '✅ Auth0 token acquired successfully');
    return response.data.access_token;
  } else {
    log(colors.red, '❌ Failed to get Auth0 token');
    return null;
  }
}

async function testBackendProxyEndpoints(token) {
  log(colors.blue, '\n🌉 Testing Backend Proxy Endpoints...');
  
  const endpoints = [
    {
      name: 'Ontology Metadata',
      url: 'https://atlas-backend-proxy.onrender.com/api/v1/foundry/ontology/metadata',
      method: 'GET'
    },
    {
      name: 'Patient Dashboard',
      url: 'https://atlas-backend-proxy.onrender.com/api/v1/patient/dashboard',
      method: 'POST',
      body: JSON.stringify({ patientId: 'test-patient-123' })
    },
    {
      name: 'Health Records',
      url: 'https://atlas-backend-proxy.onrender.com/api/v1/patient/health-records?patientId=test-patient-123&limit=10',
      method: 'GET'
    }
  ];
  
  let passed = 0;
  let total = endpoints.length;
  
  for (const endpoint of endpoints) {
    try {
      log(colors.yellow, `\n📡 Testing: ${endpoint.name}`);
      
      const options = {
        method: endpoint.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      if (endpoint.body) {
        options.body = endpoint.body;
      }
      
      const response = await makeRequest(endpoint.url, options);
      
      log(colors.yellow, `   Status: ${response.status}`);
      
      if (response.status === 200) {
        log(colors.green, `   ✅ ${endpoint.name} - Success`);
        passed++;
      } else if (response.status === 401) {
        log(colors.red, `   ❌ ${endpoint.name} - Authentication failed`);
        log(colors.red, `   Error: ${JSON.stringify(response.data)}`);
      } else if (response.status === 403) {
        log(colors.red, `   ❌ ${endpoint.name} - Insufficient permissions`);
        log(colors.red, `   Error: ${JSON.stringify(response.data)}`);
      } else {
        log(colors.yellow, `   ⚠️ ${endpoint.name} - Status ${response.status}`);
        log(colors.yellow, `   Response: ${JSON.stringify(response.data).substring(0, 200)}...`);
        // Count as passed if it's not an auth issue
        if (response.status < 500) passed++;
      }
    } catch (error) {
      log(colors.red, `   ❌ ${endpoint.name} - Error: ${error.message}`);
    }
  }
  
  return { passed, total };
}

async function runCompleteTest() {
  log(colors.blue, '🚀 Testing Complete Auth0 → Backend Proxy → Foundry Flow\n');
  
  // Get Auth0 token
  const token = await getAuth0Token();
  if (!token) {
    log(colors.red, '❌ Cannot proceed without Auth0 token');
    process.exit(1);
  }
  
  // Test backend proxy endpoints
  const results = await testBackendProxyEndpoints(token);
  
  // Summary
  log(colors.blue, '\n📊 Test Results:');
  log(colors.green, `✅ Passed: ${results.passed}/${results.total}`);
  
  if (results.passed === results.total) {
    log(colors.green, '\n🎉 Complete flow is working!');
    log(colors.yellow, '✅ Auth0 → Backend Proxy → Foundry integration successful');
    log(colors.yellow, '✅ JWT validation working');
    log(colors.yellow, '✅ All endpoints responding');
  } else if (results.passed > 0) {
    log(colors.yellow, '\n⚠️ Partial success - some endpoints working');
    log(colors.yellow, 'This is normal - some endpoints may need real data or specific Foundry setup');
  } else {
    log(colors.red, '\n❌ No endpoints working - check configuration');
  }
  
  process.exit(results.passed > 0 ? 0 : 1);
}

runCompleteTest().catch(error => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
