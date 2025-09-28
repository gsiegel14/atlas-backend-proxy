#!/usr/bin/env node

/**
 * Test script for the new HealthKit dataset ingestion endpoint
 * Tests the POST /api/v1/healthkit/ingest endpoint
 */

import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'https://atlas-backend-proxy.onrender.com';
const AUTH0_TOKEN = process.env.AUTH0_TOKEN; // Need a valid Auth0 token

// Sample HealthKit NDJSON data
const sampleHealthKitData = [
  {
    "type": "HKQuantitySample",
    "unit": "count/min",
    "value": 72,
    "start": "2025-09-26T10:00:00Z",
    "end": "2025-09-26T10:01:00Z",
    "source": "Apple Watch",
    "metadata": {
      "HKMetadataKeyHeartRateMotionContext": 1
    }
  },
  {
    "type": "HKQuantitySample", 
    "unit": "count",
    "value": 8420,
    "start": "2025-09-26T00:00:00Z",
    "end": "2025-09-26T23:59:59Z",
    "source": "iPhone",
    "metadata": {}
  },
  {
    "type": "HKCategorySample",
    "unit": "NoUnit",
    "value": 0,
    "start": "2025-09-26T06:30:00Z", 
    "end": "2025-09-26T06:45:00Z",
    "source": "Apple Watch",
    "metadata": {
      "HKMetadataKeyTimeZone": "America/New_York"
    }
  }
];

async function testHealthKitIngestion() {
  console.log('🧪 Testing HealthKit Dataset Ingestion Endpoint');
  console.log('='.repeat(50));
  
  if (!AUTH0_TOKEN) {
    console.error('❌ AUTH0_TOKEN environment variable is required');
    console.log('Set it with: export AUTH0_TOKEN="your-token-here"');
    process.exit(1);
  }
  
  try {
    // Convert sample data to NDJSON
    const ndjson = sampleHealthKitData.map(record => JSON.stringify(record)).join('\n');
    console.log('📝 Sample NDJSON data:');
    console.log(ndjson);
    console.log('');
    
    // Base64 encode the NDJSON
    const base64Data = Buffer.from(ndjson, 'utf-8').toString('base64');
    console.log('🔐 Base64 encoded length:', base64Data.length, 'chars');
    console.log('');
    
    // Prepare the request payload
    const payload = {
      rawhealthkit: base64Data,
      device: 'iPhone-Test',
      timestamp: new Date().toISOString()
    };
    
    console.log('🚀 Sending request to:', `${BACKEND_URL}/api/v1/healthkit/ingest`);
    console.log('📦 Payload device:', payload.device);
    console.log('📦 Payload timestamp:', payload.timestamp);
    console.log('');
    
    // Make the API call
    const response = await fetch(`${BACKEND_URL}/api/v1/healthkit/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH0_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:');
    for (const [key, value] of response.headers.entries()) {
      console.log(`   ${key}: ${value}`);
    }
    console.log('');
    
    const responseData = await response.text();
    
    if (response.ok) {
      const result = JSON.parse(responseData);
      console.log('✅ SUCCESS! HealthKit data ingested');
      console.log('📊 Dataset RID:', result.dataset_rid);
      console.log('📊 Records ingested:', result.records_ingested);
      console.log('📊 File path:', result.file_path);
      console.log('📊 Transaction RID:', result.transaction_rid);
      console.log('📊 Ingestion timestamp:', result.ingestion_timestamp);
      console.log('📊 Correlation ID:', result.correlationId);
      console.log('');
      console.log('🎉 Full response:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('❌ FAILED! Response body:');
      console.log(responseData);
      
      try {
        const errorData = JSON.parse(responseData);
        console.log('');
        console.log('🔍 Error details:');
        console.log('   Code:', errorData.error?.code);
        console.log('   Message:', errorData.error?.message);
        console.log('   Correlation ID:', errorData.error?.correlationId);
      } catch (e) {
        // Response is not JSON
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Health check first
async function healthCheck() {
  console.log('🏥 Checking service health...');
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const health = await response.json();
    console.log('✅ Service health:', health.status);
    console.log('');
  } catch (error) {
    console.log('⚠️  Health check failed:', error.message);
    console.log('');
  }
}

// Run the test
async function main() {
  await healthCheck();
  await testHealthKitIngestion();
}

main().catch(console.error);
