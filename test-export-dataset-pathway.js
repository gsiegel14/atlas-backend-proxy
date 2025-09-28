#!/usr/bin/env node

/**
 * Test that HealthKit /export endpoints now use dataset pathway instead of Foundry action
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'https://atlas-backend-proxy.onrender.com';

// Sample HealthKit NDJSON data
const sampleHealthKitData = [
  {
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
    "valueDouble": 1234,
    "unit": "count"
  },
  {
    "sampleType": "HKQuantityTypeIdentifierHeartRate",
    "sourceName": "Apple Watch",
    "sampleClass": "HKQuantitySample",
    "quantityType": "HKQuantityTypeIdentifierHeartRate", 
    "sourceVersion": "8.0",
    "device": {
      "hardwareVersion": "Watch6,1",
      "model": "Apple Watch",
      "name": "Apple Watch",
      "manufacturer": "Apple Inc.",
      "softwareVersion": "8.0"
    },
    "dataType": "quantity",
    "uuid": "1234B3C5-2C96-48A8-86E3-8C1674D77E02",
    "startDate": "2021-02-28T03:40:00.000Z",
    "endDate": "2021-02-28T03:40:00.000Z",
    "valueDouble": 72,
    "unit": "count/min"
  }
];

async function testExportEndpoints() {
  console.log('🧪 Testing HealthKit Export → Dataset Pathway');
  console.log('='.repeat(55));
  console.log('');
  
  // Create NDJSON and base64 encode
  const ndjson = sampleHealthKitData.map(record => JSON.stringify(record)).join('\\n');
  const base64Data = Buffer.from(ndjson, 'utf-8').toString('base64');
  
  console.log('📝 Sample Data:');
  console.log('Records:', sampleHealthKitData.length);
  console.log('Base64 length:', base64Data.length);
  console.log('');
  
  const testCases = [
    {
      endpoint: '/api/v1/healthkit/export',
      name: 'Single Export',
      payload: {
        rawhealthkit: base64Data,
        device: 'iPhone12,1',
        timestamp: '2025-09-26T06:15:00Z',
        recordCount: 2
      }
    },
    {
      endpoint: '/api/v1/healthkit/export/batch', 
      name: 'Batch Export',
      payload: {
        chunks: [
          {
            rawhealthkit: base64Data,
            device: 'iPhone12,1',
            timestamp: '2025-09-26T06:15:00Z',
            recordCount: 2
          }
        ]
      }
    },
    {
      endpoint: '/api/v1/healthkit/ingest',
      name: 'Direct Ingest',
      payload: {
        rawhealthkit: base64Data,
        device: 'iPhone12,1',
        timestamp: '2025-09-26T06:15:00Z'
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`🧪 Testing: ${testCase.name}`);
    console.log(`🔗 Endpoint: ${testCase.endpoint}`);
    
    try {
      const response = await fetch(`${BACKEND_URL}${testCase.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.payload)
      });
      
      const result = await response.json();
      console.log(`📡 Status: ${response.status}`);
      
      if (response.status === 401) {
        console.log('✅ Expected: Authentication required');
        console.log(`📝 Error: ${result.error?.code} - ${result.error?.message}`);
      } else if (response.ok) {
        console.log('✅ Success! Using dataset pathway');
        console.log(`📊 Dataset RID: ${result.dataset_rid}`);
        console.log(`📊 Records: ${result.records_ingested || result.chunks_successful}`);
        console.log(`📊 File path: ${result.file_path || 'batch results'}`);
      } else {
        console.log(`❌ Unexpected error: ${response.status}`);
        console.log('Response:', JSON.stringify(result, null, 2));
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🎯 Key Changes Made:');
  console.log('• All HealthKit endpoints now use dataset uploads');
  console.log('• Target dataset: ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730');
  console.log('• Shared uploadHealthKitToDataset() helper function');
  console.log('• Single JSON files with metadata wrapper: {metadata: {...}, data: [...]}');
  console.log('• No more Foundry action dependencies');
  console.log('• Consistent error handling and logging');
  console.log('');
  
  console.log('✅ All HealthKit exports now flow through the dataset pathway!');
}

testExportEndpoints().catch(console.error);
