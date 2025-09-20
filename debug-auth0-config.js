#!/usr/bin/env node

/**
 * Debug Auth0 Configuration
 * Detailed diagnostics for M2M setup
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

async function debugAuth0Configuration() {
  log(colors.blue, '🔍 Auth0 Configuration Debug\n');
  
  const config = {
    domain: 'dev-irxmxjwyduu4tesn.us.auth0.com',
    clientId: '1weBKUjnKHA4pLWQqNlcJffM3u0xmNCy',
    clientSecret: 'fM18ziIPWy3rmbnbkugtPjIYPwxR4EwfRyK7Phs4BePB8-UlSATJwt63M6in57_E',
    audience: 'https://api.atlas.ai'
  };
  
  log(colors.yellow, '📋 Current Configuration:');
  log(colors.yellow, `   Domain: ${config.domain}`);
  log(colors.yellow, `   Client ID: ${config.clientId}`);
  log(colors.yellow, `   Audience: ${config.audience}`);
  log(colors.yellow, `   Client Secret: ${config.clientSecret.substring(0, 10)}...`);
  
  // Test 1: Check if domain is accessible
  log(colors.blue, '\n🌐 Testing Auth0 Domain...');
  try {
    const wellKnown = await makeRequest(`https://${config.domain}/.well-known/openid_configuration`);
    if (wellKnown.status === 200) {
      log(colors.green, '✅ Domain accessible');
      log(colors.yellow, `   Issuer: ${wellKnown.data.issuer}`);
      log(colors.yellow, `   Token Endpoint: ${wellKnown.data.token_endpoint}`);
    } else {
      log(colors.red, `❌ Domain not accessible: ${wellKnown.status}`);
    }
  } catch (error) {
    log(colors.red, `❌ Domain error: ${error.message}`);
  }
  
  // Test 2: Try token request with detailed error info
  log(colors.blue, '\n🔐 Testing Token Request...');
  try {
    const tokenData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: config.audience
    }).toString();

    const response = await makeRequest(`https://${config.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': tokenData.length
      },
      body: tokenData
    });

    log(colors.yellow, `   Status: ${response.status}`);
    log(colors.yellow, `   Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (response.status === 200) {
      log(colors.green, '✅ Token request successful!');
      return true;
    } else {
      log(colors.red, '❌ Token request failed');
      
      // Provide specific troubleshooting
      if (response.data.error === 'access_denied') {
        log(colors.yellow, '\n💡 Troubleshooting "access_denied":');
        log(colors.yellow, '   1. Check if M2M app is authorized for the API');
        log(colors.yellow, '   2. Verify the audience parameter matches API identifier');
        log(colors.yellow, '   3. Ensure scopes are granted to the M2M application');
      }
      
      if (response.data.error === 'unauthorized_client') {
        log(colors.yellow, '\n💡 Troubleshooting "unauthorized_client":');
        log(colors.yellow, '   1. Verify this is a Machine-to-Machine application');
        log(colors.yellow, '   2. Check client_id and client_secret are correct');
        log(colors.yellow, '   3. Ensure grant_type is "client_credentials"');
      }
      
      return false;
    }
  } catch (error) {
    log(colors.red, `❌ Token request error: ${error.message}`);
    return false;
  }
}

async function testAlternativeApproach() {
  log(colors.blue, '\n🔄 Testing Alternative M2M Applications...');
  
  const alternativeApps = [
    {
      name: 'Atlas',
      clientId: 'ejxsDQhhgFZ0I1HI0WQU6U3HRgqa9JDO'
    },
    {
      name: 'Atlas Engine Foundry API (Test Application)', 
      clientId: 'wQT5WqZgQquntTV5ztUQFs91IXnZu2ea'
    }
  ];
  
  log(colors.yellow, '📋 Other M2M apps you have:');
  alternativeApps.forEach(app => {
    log(colors.yellow, `   • ${app.name}: ${app.clientId}`);
  });
  
  log(colors.yellow, '\n💡 If current app fails, try authorizing one of these for your API');
}

async function runDebug() {
  log(colors.blue, '🚀 Starting Auth0 Configuration Debug...\n');
  
  const success = await debugAuth0Configuration();
  await testAlternativeApproach();
  
  if (success) {
    log(colors.green, '\n🎉 Auth0 configuration is working!');
  } else {
    log(colors.red, '\n⚠️ Auth0 configuration needs attention');
    log(colors.yellow, '\n🔧 Next Steps:');
    log(colors.yellow, '1. Go back to Auth0 Dashboard');
    log(colors.yellow, '2. Check Machine to Machine Applications tab in your API');
    log(colors.yellow, '3. Ensure "Atlas iOS (Test Application)" is properly authorized');
    log(colors.yellow, '4. Verify all required scopes are granted');
  }
  
  process.exit(success ? 0 : 1);
}

runDebug().catch(error => {
  log(colors.red, `Fatal error: ${error.message}`);
  process.exit(1);
});
