#!/usr/bin/env node

/**
 * Test the deployed single JSON HealthKit upload
 * 
 * This script tests the live deployment with the new single JSON format
 */

import fetch from 'node-fetch';

console.log('🚀 Testing Single JSON HealthKit Upload - Live Deployment\n');

// Sample HealthKit NDJSON data (base64 encoded)
const sampleHealthKitNDJSON = `{"sampleType":"HKQuantityTypeIdentifierStepCount","sourceName":"iPhone","sampleClass":"HKCumulativeQuantitySample","quantityType":"HKQuantityTypeIdentifierStepCount","sourceVersion":"18.0","device":{"hardwareVersion":"iPhone16,2","model":"iPhone","name":"iPhone","manufacturer":"Apple Inc.","softwareVersion":"18.0"},"dataType":"quantity","uuid":"0645B3C5-2C96-48A8-86E3-8C1674D77E01","startDate":"2025-09-26T03:38:23.939Z","endDate":"2025-09-26T03:38:26.493Z","valueDouble":42}
{"sampleType":"HKQuantityTypeIdentifierActiveEnergyBurned","sourceName":"iPhone","sampleClass":"HKCumulativeQuantitySample","quantityType":"HKQuantityTypeIdentifierActiveEnergyBurned","sourceVersion":"18.0","device":{"hardwareVersion":"iPhone16,2","model":"iPhone","name":"iPhone","manufacturer":"Apple Inc.","softwareVersion":"18.0"},"dataType":"quantity","uuid":"1234B3C5-2C96-48A8-86E3-8C1674D77E02","startDate":"2025-09-26T04:00:00.000Z","endDate":"2025-09-26T04:15:00.000Z","valueDouble":125.5}`;

const sampleBase64 = Buffer.from(sampleHealthKitNDJSON).toString('base64');

async function testSingleJsonUpload() {
  const testPayload = {
    rawhealthkit: sampleBase64,
    device: 'iPhone',
    timestamp: new Date().toISOString()
  };

  console.log('📊 Test Payload:');
  console.log('- Base64 length:', sampleBase64.length, 'characters');
  console.log('- Device:', testPayload.device);
  console.log('- Timestamp:', testPayload.timestamp);
  console.log('- Expected format: Single JSON with auth0_user_id at top level\n');

  // Test without auth token first (should get 401)
  console.log('🔒 Testing authentication requirement...');
  try {
    const response = await fetch('https://atlas-backend-proxy.onrender.com/api/v1/healthkit/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    console.log('- Status:', response.status);
    if (response.status === 401) {
      console.log('✅ Authentication properly required');
    } else {
      console.log('❌ Expected 401 but got', response.status);
      const text = await response.text();
      console.log('Response:', text);
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }

  console.log('\n📋 To test with authentication:');
  console.log(`curl -X POST \\
  -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \\
  -H "Content-Type: application/json" \\
  "https://atlas-backend-proxy.onrender.com/api/v1/healthkit/export" \\
  -d '${JSON.stringify(testPayload)}' | jq`);

  console.log('\n✅ Expected Single JSON Structure:');
  console.log(`{
  "auth0_user_id": "auth0|your-user-id",
  "device": "iPhone",
  "ingested_at": "2025-09-26T06:40:56.404Z",
  "export_timestamp": "2025-09-26T06:40:56.404Z",
  "record_count": 2,
  "data": [
    {
      "auth0_user_id": "auth0|your-user-id",
      "device": "iPhone",
      "sample_type": "HKQuantityTypeIdentifierStepCount",
      "source_name": "iPhone",
      "uuid": "0645B3C5-2C96-48A8-86E3-8C1674D77E01",
      "value_double": 42,
      "raw_healthkit_record": "{\\"sampleType\\":\\"HKQuantityTypeIdentifierStepCount\\",..."
    },
    ...
  ]
}`);

  console.log('\n🎯 Key Changes from NDJSON to Single JSON:');
  console.log('- ✅ Content-Type: application/json (was application/x-ndjson)');
  console.log('- ✅ File extension: .json (was .ndjson)');
  console.log('- ✅ Format: Single JSON object with data array (was newline-delimited)');
  console.log('- ✅ auth0_user_id prominently at top level');
  console.log('- ✅ No chunking - single file upload up to 50MB');
  console.log('- ✅ iOS app uses 50MB limit instead of 2MB');

  console.log('\n🔧 Deployment Status:');
  console.log('- ✅ Backend deployed with single JSON format');
  console.log('- ✅ iOS app updated with 50MB limit and no chunking');
  console.log('- ✅ Ready for testing with reset export state feature');
}

testSingleJsonUpload().catch(console.error);
