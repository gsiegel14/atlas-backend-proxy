#!/usr/bin/env node

/**
 * Demo script for HealthKit Dataset Ingestion Endpoint
 * Shows the endpoint structure and provides cURL examples
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'https://atlas-backend-proxy.onrender.com';

// Sample HealthKit NDJSON data
const sampleHealthKitData = [
  {
    "type": "HKQuantitySample",
    "unit": "count/min", 
    "value": 72,
    "start": "2025-09-26T10:00:00Z",
    "end": "2025-09-26T10:01:00Z",
    "source": "Apple Watch"
  },
  {
    "type": "HKQuantitySample",
    "unit": "count", 
    "value": 8420,
    "start": "2025-09-26T00:00:00Z",
    "end": "2025-09-26T23:59:59Z", 
    "source": "iPhone"
  }
];

async function demonstrateEndpoint() {
  console.log('🏥 HealthKit Dataset Ingestion Endpoint Demo');
  console.log('='.repeat(60));
  console.log('');
  
  // Health check
  console.log('1️⃣  Service Health Check');
  console.log('-'.repeat(30));
  try {
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    const health = await healthResponse.json();
    console.log('✅ Service Status:', health.status);
    console.log('📅 Timestamp:', health.timestamp);
    console.log('🆔 Correlation ID:', health.correlationId);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }
  console.log('');
  
  // Show endpoint details
  console.log('2️⃣  Endpoint Details');
  console.log('-'.repeat(30));
  console.log('🔗 URL:', `${BACKEND_URL}/api/v1/healthkit/ingest`);
  console.log('📝 Method: POST');
  console.log('🔐 Auth: Bearer token required');
  console.log('📊 Target Dataset: ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730');
  console.log('');
  
  // Show sample data
  console.log('3️⃣  Sample NDJSON Data');
  console.log('-'.repeat(30));
  const ndjson = sampleHealthKitData.map(record => JSON.stringify(record)).join('\\n');
  console.log('Raw NDJSON:');
  sampleHealthKitData.forEach((record, i) => {
    console.log(`Line ${i + 1}:`, JSON.stringify(record));
  });
  console.log('');
  
  // Show base64 encoding
  console.log('4️⃣  Base64 Encoding');
  console.log('-'.repeat(30));
  const base64Data = Buffer.from(ndjson, 'utf-8').toString('base64');
  console.log('Base64 Length:', base64Data.length, 'characters');
  console.log('Base64 Sample:', base64Data.substring(0, 80) + '...');
  console.log('');
  
  // Test without auth (should fail)
  console.log('5️⃣  Authentication Test (should fail)');
  console.log('-'.repeat(30));
  try {
    const testResponse = await fetch(`${BACKEND_URL}/api/v1/healthkit/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawhealthkit: base64Data,
        device: 'test-device'
      })
    });
    
    console.log('Status:', testResponse.status);
    const errorData = await testResponse.json();
    console.log('✅ Expected error:', errorData.error?.code);
    console.log('📝 Message:', errorData.error?.message);
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
  console.log('');
  
  // Show cURL examples
  console.log('6️⃣  cURL Examples');
  console.log('-'.repeat(30));
  console.log('');
  
  console.log('🔹 Basic test (prepare NDJSON):');
  console.log('cat > healthkit-sample.ndjson << EOF');
  sampleHealthKitData.forEach(record => {
    console.log(JSON.stringify(record));
  });
  console.log('EOF');
  console.log('');
  
  console.log('🔹 Encode to base64:');
  console.log('B64_DATA=$(base64 -i healthkit-sample.ndjson)');
  console.log('echo "Base64 length: ${#B64_DATA}"');
  console.log('');
  
  console.log('🔹 Test with valid Auth0 token:');
  console.log('curl -X POST "https://atlas-backend-proxy.onrender.com/api/v1/healthkit/ingest" \\');
  console.log('  -H "Authorization: Bearer $AUTH0_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d "$(jq -n --arg b64 \\"$B64_DATA\\" --arg dev \\"iPhone\\" \\');
  console.log('    \'\\{rawhealthkit:$b64, device:$dev, timestamp:(now|toiso8601)\\}\')"');
  console.log('');
  
  console.log('🔹 Expected successful response:');
  console.log(JSON.stringify({
    "success": true,
    "dataset_rid": "ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730",
    "records_ingested": 2,
    "file_path": "healthkit/raw/{auth0id}/{timestamp}.json",
    "transaction_rid": "ri.foundry.main.transaction.{uuid}",
    "ingestion_timestamp": "2025-09-26T06:05:00.000Z",
    "correlationId": "{uuid}"
  }, null, 2));
  console.log('');
  
  console.log('7️⃣  Notes');
  console.log('-'.repeat(30));
  console.log('• Requires valid Auth0 Bearer token');
  console.log('• Max payload: 5MB raw NDJSON');
  console.log('• Creates single JSON file with metadata wrapper');
  console.log('• Uses Foundry Datasets API v2 with APPEND transaction');
  console.log('• File path: healthkit/raw/{auth0_user_id}/{iso_timestamp}.json');
  console.log('• Returns transaction RID for tracking');
  console.log('');
  
  console.log('✅ Demo completed! Endpoint is deployed and ready for testing.');
}

demonstrateEndpoint().catch(console.error);
