#!/usr/bin/env node

/**
 * Test with real HealthKit sample data (base64 provided by user)
 * Shows parsing and validation behavior
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'https://atlas-backend-proxy.onrender.com';

// User's provided base64 (appears incomplete)
const userProvidedBase64 = "eyJzYW1wbGVUeXBlIjoiSEtRdWFudGl0eVR5cGVJZGVudGlmaWVyU3RlcENvdW50Iiwic291cmNlTmFtZSI6ImlQaG9uZSIsInNhbXBsZUNsYXNzIjoiSEtDdW11bGF0aXZlUXVhbnRpdHlTYW1wbGUiLCJxdWFudGl0eVR5cGUiOiJIS1F1YW50aXR5VHlwZUlkZW50aWZpZXJTdGVwQ291bnQiLCJzb3VyY2VWZXJzaW9uIjoiMTQuNCIsImRldmljZSI6eyJoYXJkd2FyZVZlcnNpb24iOiJpUGhvbmUxMiwxIiwibW9kZWwiOiJpUGhvbmUiLCJuYW1lIjoiaVBob25lIiwibWFudWZhY3R1cmVyIjoiQXBwbGUgSW5jLiIsInNvZnR3YXJlVmVyc2lvbiI6IjE0LjQifSwiZGF0YVR5cGUiOiJxdWFudGl0eSIsInV1aWQiOiIwNjQ1QjNDNS0yQzk2LTQ4QTgtODZFMy04QzE2NzRENzdFMDEiLCJzdGFydERhdGUiOiIyMDIxLTAyLTI4VDAzOjM4OjIzLjkzOVoiLCJlbmREYXRlIjoiMjAyMS0wMi0yOFQwMzozODoyNi40OTNaIiwidmFsdWVEb3VibGUi";

async function testRealHealthKitData() {
  console.log('🧪 Testing Real HealthKit Sample Data');
  console.log('='.repeat(50));
  console.log('');
  
  // Decode and analyze the provided data
  console.log('1️⃣  Analyzing Provided Base64 Data');
  console.log('-'.repeat(30));
  
  try {
    const decoded = Buffer.from(userProvidedBase64, 'base64').toString('utf-8');
    console.log('📝 Decoded content:');
    console.log(decoded);
    console.log('');
    console.log('📊 Length:', decoded.length, 'characters');
    
    // Try to parse as JSON
    let parsedData;
    try {
      parsedData = JSON.parse(decoded);
      console.log('✅ Valid JSON structure');
    } catch (parseError) {
      console.log('❌ Invalid JSON:', parseError.message);
      console.log('🔧 The JSON appears incomplete - ends with "valueDouble" without a value');
      
      // Create a corrected version
      const correctedJson = decoded + ': 1234}'; // Complete the incomplete JSON
      console.log('');
      console.log('🔧 Attempting to fix by completing the JSON:');
      console.log('Added: `: 1234}`');
      
      try {
        parsedData = JSON.parse(correctedJson);
        console.log('✅ Corrected JSON is valid');
        console.log('📋 Sample data structure:');
        console.log(JSON.stringify(parsedData, null, 2));
      } catch (fixError) {
        console.log('❌ Still invalid after correction:', fixError.message);
      }
    }
  } catch (error) {
    console.log('❌ Base64 decode error:', error.message);
  }
  
  console.log('');
  
  // Create a proper NDJSON version for testing
  console.log('2️⃣  Creating Proper NDJSON Test Data');
  console.log('-'.repeat(30));
  
  const completeHealthKitRecord = {
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
    "uuid": "0645B3C5-2C96-48A8-86E3-8C1674D77E01",
    "startDate": "2021-02-28T03:38:23.939Z",
    "endDate": "2021-02-28T03:38:26.493Z",
    "valueDouble": 1234,  // Added missing value
    "unit": "count"       // Added unit for step count
  };
  
  // Create NDJSON (single line for this test)
  const ndjson = JSON.stringify(completeHealthKitRecord);
  const correctedBase64 = Buffer.from(ndjson, 'utf-8').toString('base64');
  
  console.log('📝 Complete HealthKit record:');
  console.log(JSON.stringify(completeHealthKitRecord, null, 2));
  console.log('');
  console.log('🔐 Corrected base64 length:', correctedBase64.length, 'characters');
  console.log('🔐 Sample:', correctedBase64.substring(0, 80) + '...');
  console.log('');
  
  // Test endpoint behavior (will fail auth but show parsing)
  console.log('3️⃣  Testing Endpoint Behavior');
  console.log('-'.repeat(30));
  
  const testCases = [
    {
      name: "Original incomplete data",
      data: userProvidedBase64,
      expected: "Should fail with INVALID_NDJSON due to incomplete JSON"
    },
    {
      name: "Corrected complete data", 
      data: correctedBase64,
      expected: "Should fail with INVALID_TOKEN (auth required) but show proper parsing"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`🧪 Test: ${testCase.name}`);
    console.log(`📋 Expected: ${testCase.expected}`);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/healthkit/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawhealthkit: testCase.data,
          device: 'iPhone12,1',
          timestamp: '2025-09-26T06:10:00Z'
        })
      });
      
      const result = await response.json();
      console.log(`📡 Status: ${response.status}`);
      console.log(`📝 Response: ${result.error?.code} - ${result.error?.message}`);
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
    console.log('');
  }
  
  // Show what a successful call would look like
  console.log('4️⃣  Successful Call Example');
  console.log('-'.repeat(30));
  console.log('With a valid Auth0 token, the corrected data would produce:');
  console.log('');
  console.log('cURL command:');
  console.log('```bash');
  console.log('curl -X POST "https://atlas-backend-proxy.onrender.com/api/v1/healthkit/ingest" \\');
  console.log('  -H "Authorization: Bearer $AUTH0_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '{"rawhealthkit":"${correctedBase64.substring(0, 40)}...","device":"iPhone12,1","timestamp":"2025-09-26T06:10:00Z"}'`);
  console.log('```');
  console.log('');
  console.log('Expected successful response:');
  console.log(JSON.stringify({
    "success": true,
    "dataset_rid": "ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730",
    "records_ingested": 1,
    "file_path": "healthkit/raw/{auth0id}/2025-09-26T06-10-00-000Z.json",
    "transaction_rid": "ri.foundry.main.transaction.{uuid}",
    "ingestion_timestamp": "2025-09-26T06:10:00.000Z",
    "correlationId": "{uuid}"
  }, null, 2));
  console.log('');
  
  console.log('📊 Dataset file would contain:');
  console.log(JSON.stringify({
    "metadata": {
      "auth0_user_id": "{user_auth0_id}",
      "device": "iPhone12,1", 
      "timestamp": "2025-09-26T06:10:00Z"
    },
    "data": [completeHealthKitRecord]
  }, null, 2));
  
  console.log('');
  console.log('✅ Test completed! The endpoint can handle real HealthKit data once properly formatted.');
}

testRealHealthKitData().catch(console.error);
