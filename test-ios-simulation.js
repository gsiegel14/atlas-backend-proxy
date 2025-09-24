#!/usr/bin/env node

/**
 * Test script that simulates exactly what the iOS app is doing
 * This helps debug the 404 vs 401 discrepancy
 */

const https = require('https');

// Configuration matching iOS app
const BASE_URL = 'https://atlas-backend-proxy.onrender.com';
const ENDPOINT = '/api/v1/foundry/patient/profile';
const USER_ID = 'auth0|68d39b8321ee4ff6e25f9b03';

console.log('🧪 iOS App Simulation Test');
console.log(`👤 User ID: ${USER_ID}`);
console.log(`🌐 Base URL: ${BASE_URL}`);
console.log(`📍 Endpoint: ${ENDPOINT}`);
console.log(`🔗 Full URL: ${BASE_URL}${ENDPOINT}`);

// Test 1: Exact same request as iOS app (no auth)
console.log('\n📱 Test 1: Simulating iOS app request (no auth)...');
const options = {
  hostname: 'atlas-backend-proxy.onrender.com',
  port: 443,
  path: '/api/v1/foundry/patient/profile',
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Atlas/1.0 CFNetwork/1485 Darwin/23.1.0', // iOS-like user agent
    'X-Correlation-Id': 'test-correlation-id'
  }
};

const req = https.request(options, (res) => {
  console.log(`✅ Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log(`📄 Response body:`, data);
    
    if (res.statusCode === 404) {
      console.log('❌ ISSUE FOUND: Getting 404 instead of expected 401');
      console.log('🔍 This suggests the endpoint is not found, not just unauthorized');
    } else if (res.statusCode === 401) {
      console.log('✅ CORRECT: Getting 401 as expected (endpoint exists, needs auth)');
    } else {
      console.log(`⚠️  UNEXPECTED: Got status ${res.statusCode}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ Request error: ${e.message}`);
});

req.end();

// Test 2: Check if there's a case sensitivity issue
console.log('\n📱 Test 2: Checking case sensitivity...');
setTimeout(() => {
  const options2 = {
    ...options,
    path: '/api/v1/foundry/patient/Profile' // Capital P
  };
  
  const req2 = https.request(options2, (res) => {
    console.log(`Case test status: ${res.statusCode}`);
  });
  
  req2.on('error', () => {});
  req2.end();
}, 1000);

// Test 3: Check if there's a trailing slash issue
console.log('\n📱 Test 3: Checking trailing slash...');
setTimeout(() => {
  const options3 = {
    ...options,
    path: '/api/v1/foundry/patient/profile/' // Trailing slash
  };
  
  const req3 = https.request(options3, (res) => {
    console.log(`Trailing slash test status: ${res.statusCode}`);
  });
  
  req3.on('error', () => {});
  req3.end();
}, 2000);
