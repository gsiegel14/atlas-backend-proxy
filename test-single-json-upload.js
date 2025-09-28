#!/usr/bin/env node

/**
 * Test script for single JSON HealthKit upload format
 * 
 * This script demonstrates the new single JSON format that includes:
 * - auth0_user_id prominently at the top level
 * - device information
 * - ingestion metadata
 * - record count
 * - data array with flattened HealthKit records
 */

console.log('🧪 Testing Single JSON HealthKit Upload Format\n');

// Sample HealthKit NDJSON data (base64 encoded)
const sampleHealthKitNDJSON = `{"sampleType":"HKQuantityTypeIdentifierStepCount","sourceName":"iPhone","sampleClass":"HKCumulativeQuantitySample","quantityType":"HKQuantityTypeIdentifierStepCount","sourceVersion":"18.0","device":{"hardwareVersion":"iPhone16,2","model":"iPhone","name":"iPhone","manufacturer":"Apple Inc.","softwareVersion":"18.0"},"dataType":"quantity","uuid":"0645B3C5-2C96-48A8-86E3-8C1674D77E01","startDate":"2025-09-26T03:38:23.939Z","endDate":"2025-09-26T03:38:26.493Z","valueDouble":42}
{"sampleType":"HKQuantityTypeIdentifierActiveEnergyBurned","sourceName":"iPhone","sampleClass":"HKCumulativeQuantitySample","quantityType":"HKQuantityTypeIdentifierActiveEnergyBurned","sourceVersion":"18.0","device":{"hardwareVersion":"iPhone16,2","model":"iPhone","name":"iPhone","manufacturer":"Apple Inc.","softwareVersion":"18.0"},"dataType":"quantity","uuid":"1234B3C5-2C96-48A8-86E3-8C1674D77E02","startDate":"2025-09-26T04:00:00.000Z","endDate":"2025-09-26T04:15:00.000Z","valueDouble":125.5}`;

const sampleBase64 = Buffer.from(sampleHealthKitNDJSON).toString('base64');

console.log('📊 Sample Input Data:');
console.log('- Format: Base64-encoded NDJSON');
console.log('- Records: 2 HealthKit samples');
console.log('- Types: StepCount, ActiveEnergyBurned');
console.log('- Base64 length:', sampleBase64.length, 'characters\n');

// Simulate the backend processing
function processHealthKitData(base64Data, auth0id, device, timestamp) {
  // Decode base64 to get NDJSON
  const ndjson = Buffer.from(base64Data, 'base64').toString('utf-8');
  const lines = ndjson.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  // Parse each line as JSON
  const records = lines.map(line => JSON.parse(line));
  
  // Flatten each record for dataset storage
  const datasetRecords = records.map(record => ({
    auth0_user_id: auth0id,
    device: device,
    ingested_at: new Date().toISOString(),
    export_timestamp: timestamp,
    sample_type: record.sampleType || record.type || '',
    source_name: record.sourceName || '',
    sample_class: record.sampleClass || '',
    uuid: record.uuid || '',
    start_date: record.startDate || '',
    end_date: record.endDate || '',
    value_double: record.valueDouble || null,
    value_string: record.valueString || null,
    unit: record.unit || '',
    device_name: record.device?.name || '',
    device_model: record.device?.model || '',
    device_manufacturer: record.device?.manufacturer || '',
    source_version: record.sourceVersion || '',
    raw_healthkit_record: JSON.stringify(record)
  }));
  
  // Create single JSON file with auth0_user_id prominently included
  const singleJsonContent = {
    auth0_user_id: auth0id,
    device: device,
    ingested_at: new Date().toISOString(),
    export_timestamp: timestamp,
    record_count: records.length,
    data: datasetRecords
  };
  
  return singleJsonContent;
}

// Test the processing
const testAuth0Id = 'auth0|687a56be9811378240321ed6';
const testDevice = 'iPhone';
const testTimestamp = new Date().toISOString();

const result = processHealthKitData(sampleBase64, testAuth0Id, testDevice, testTimestamp);

console.log('📄 Generated Single JSON Structure:');
console.log(JSON.stringify(result, null, 2));

console.log('\n✅ Key Features of Single JSON Format:');
console.log('- ✅ auth0_user_id prominently at top level');
console.log('- ✅ Device and timestamp metadata');
console.log('- ✅ Record count for validation');
console.log('- ✅ Flattened data array for easy querying');
console.log('- ✅ Original record preserved in raw_healthkit_record');
console.log('- ✅ Content-Type: application/json');
console.log('- ✅ File extension: .json');

console.log('\n🚀 Upload Details:');
console.log('- Dataset RID: ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730');
console.log('- File path: healthkit/raw/{auth0_user_id}/{timestamp}.json');
console.log('- Transaction type: APPEND');
console.log('- Content type: application/json');

console.log('\n📋 Test with cURL:');
console.log(`curl -X POST \\
  -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \\
  -H "Content-Type: application/json" \\
  "https://atlas-backend-proxy.onrender.com/api/v1/healthkit/export" \\
  -d '{
    "rawhealthkit": "${sampleBase64}",
    "device": "iPhone",
    "timestamp": "${testTimestamp}"
  }' | jq`);

console.log('\n🎯 Expected Result:');
console.log('- Single JSON file uploaded to Foundry dataset');
console.log('- auth0_user_id clearly visible at top level');
console.log('- No chunking or batching');
console.log('- Proper JSON format for Foundry processing');
