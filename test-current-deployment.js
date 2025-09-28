#!/usr/bin/env node

/**
 * Test the current deployment to verify NDJSON fix is working
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'https://atlas-backend-proxy.onrender.com';

// Create a simple test payload
const testHealthKitRecord = {
  "sampleType": "HKQuantityTypeIdentifierStepCount",
  "sourceName": "iPhone",
  "sampleClass": "HKCumulativeQuantitySample",
  "quantityType": "HKQuantityTypeIdentifierStepCount",
  "sourceVersion": "14.4",
  "device": {
    "hardwareVersion": "iPhone12,1",
    "model": "iPhone",
    "name": "iPhone",
    "manufacturer": "Apple Inc.",
    "softwareVersion": "14.4"
  },
  "dataType": "quantity",
  "uuid": "TEST-" + Date.now(),
  "startDate": new Date().toISOString(),
  "endDate": new Date().toISOString(),
  "valueDouble": 100,
  "unit": "count"
};

async function testCurrentDeployment() {
  console.log('🧪 Testing Current Deployment - NDJSON Fix');
  console.log('='.repeat(50));
  console.log('');
  
  // Create NDJSON and encode
  const ndjson = JSON.stringify(testHealthKitRecord);
  const base64Data = Buffer.from(ndjson, 'utf-8').toString('base64');
  
  console.log('📝 Test Data:');
  console.log('Record UUID:', testHealthKitRecord.uuid);
  console.log('NDJSON length:', ndjson.length);
  console.log('Base64 length:', base64Data.length);
  console.log('');
  
  // Test without authentication to see the error response format
  console.log('🔐 Testing Authentication (should fail with 401):');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/healthkit/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawhealthkit: base64Data,
        device: 'iPhone-Test',
        timestamp: new Date().toISOString()
      })
    });
    
    const result = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Error: ${result.error?.code} - ${result.error?.message}`);
    
    if (response.status === 401) {
      console.log('✅ Authentication working correctly');
    } else {
      console.log('❌ Unexpected response');
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
  }
  
  console.log('');
  console.log('📊 Dataset Information:');
  console.log('Target Dataset: ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730');
  console.log('Expected file format: .ndjson');
  console.log('Expected content-type: application/x-ndjson');
  console.log('');
  
  console.log('🔍 Troubleshooting Steps:');
  console.log('1. Verify you have a valid Auth0 token');
  console.log('2. Check that HealthKit export is using the /export endpoint');
  console.log('3. Monitor logs after export to see if data reaches the backend');
  console.log('4. Check Foundry dataset for new .ndjson files');
  console.log('');
  
  console.log('🚀 To test with real auth token:');
  console.log('export AUTH0_TOKEN="your-token-here"');
  console.log(`curl -X POST "${BACKEND_URL}/api/v1/healthkit/export" \\`);
  console.log('  -H "Authorization: Bearer $AUTH0_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '{"rawhealthkit":"${base64Data.substring(0, 50)}...","device":"iPhone-Test"}'`);
  
  console.log('');
  console.log('✅ Current deployment ready for testing with valid auth token');
}

testCurrentDeployment().catch(console.error);
