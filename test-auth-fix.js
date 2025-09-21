#!/usr/bin/env node

/**
 * Test script to validate Auth0 authentication fixes
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.TEST_URL || 'https://atlas-backend-proxy.onrender.com';

async function testEndpoint(endpoint, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Correlation-Id': `test-${Date.now()}`
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    console.log(`\n🧪 Testing ${endpoint}...`);
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: endpoint.includes('query') ? 'POST' : 'GET',
      headers,
      body: endpoint.includes('query') ? JSON.stringify({
        query: 'SELECT 1 as test',
        parameters: {}
      }) : undefined
    });
    
    const data = await response.text();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
    
    return {
      status: response.status,
      success: response.status < 400,
      data
    };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      status: 0,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🚀 Testing Atlas Backend Proxy Authentication Fixes');
  console.log(`📍 Base URL: ${BASE_URL}`);
  
  // Test 1: Health check (should work without auth)
  const healthResult = await testEndpoint('/health');
  
  // Test 2: Protected endpoint without token (should return 401 with proper error)
  const noTokenResult = await testEndpoint('/api/v1/foundry/query');
  
  // Test 3: Protected endpoint with invalid token (should return 401 with proper error)
  const invalidTokenResult = await testEndpoint('/api/v1/foundry/query', 'invalid-token');
  
  // Test 4: Protected endpoint with malformed token (should return 401 with proper error)
  const malformedTokenResult = await testEndpoint('/api/v1/foundry/query', 'Bearer malformed-jwt-token');
  
  console.log('\n📊 Test Results Summary:');
  console.log(`   Health endpoint: ${healthResult.success ? '✅' : '❌'} (${healthResult.status})`);
  console.log(`   No token: ${noTokenResult.status === 401 ? '✅' : '❌'} (${noTokenResult.status})`);
  console.log(`   Invalid token: ${invalidTokenResult.status === 401 ? '✅' : '❌'} (${invalidTokenResult.status})`);
  console.log(`   Malformed token: ${malformedTokenResult.status === 401 ? '✅' : '❌'} (${malformedTokenResult.status})`);
  
  const allTestsPassed = 
    healthResult.success &&
    noTokenResult.status === 401 &&
    invalidTokenResult.status === 401 &&
    malformedTokenResult.status === 401;
  
  console.log(`\n🎯 Overall: ${allTestsPassed ? '✅ All tests passed!' : '❌ Some tests failed'}`);
  
  if (!allTestsPassed) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});
