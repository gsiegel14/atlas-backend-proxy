#!/usr/bin/env node

/**
 * Demonstrate the NDJSON format fix for HealthKit dataset uploads
 */

// Sample HealthKit record (like the one that caused the error)
const sampleHealthKitRecord = {
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
};

function demonstrateNDJSONFix() {
  console.log('🔧 HealthKit NDJSON Format Fix');
  console.log('='.repeat(40));
  console.log('');
  
  console.log('❌ Previous Format (caused Parquet error):');
  console.log('File: healthkit/raw/{auth0id}/{timestamp}.json');
  console.log('Content-Type: application/octet-stream');
  console.log('Structure: Single JSON object');
  console.log('');
  
  const oldFormat = {
    metadata: {
      auth0_user_id: "auth0|687a56be9811378240321ed6",
      device: "iPhone12,1",
      timestamp: "2025-09-26T06:19:34.801Z"
    },
    data: [sampleHealthKitRecord]
  };
  
  console.log('Old content preview:');
  console.log(JSON.stringify(oldFormat, null, 2).substring(0, 200) + '...');
  console.log('');
  console.log('🚫 Error: Foundry expected Parquet, got JSON magic number [34, 125, 93, 125] = "}]}"');
  console.log('');
  
  console.log('✅ New Format (NDJSON - Foundry compatible):');
  console.log('File: healthkit/raw/{auth0id}/{timestamp}.ndjson');
  console.log('Content-Type: application/x-ndjson');
  console.log('Structure: One JSON object per line (flattened)');
  console.log('');
  
  // Simulate the new flattening logic
  const auth0id = "auth0|687a56be9811378240321ed6";
  const exportDevice = "iPhone12,1";
  const exportTimestamp = "2025-09-26T06:19:34.801Z";
  
  const datasetRecord = {
    // User and device metadata
    auth0_user_id: auth0id,
    device: exportDevice,
    ingested_at: new Date().toISOString(),
    export_timestamp: exportTimestamp,
    
    // HealthKit record data (flattened)
    sample_type: sampleHealthKitRecord.sampleType || '',
    source_name: sampleHealthKitRecord.sourceName || '',
    sample_class: sampleHealthKitRecord.sampleClass || '',
    quantity_type: sampleHealthKitRecord.quantityType || '',
    source_version: sampleHealthKitRecord.sourceVersion || '',
    data_type: sampleHealthKitRecord.dataType || '',
    uuid: sampleHealthKitRecord.uuid || '',
    start_date: sampleHealthKitRecord.startDate || '',
    end_date: sampleHealthKitRecord.endDate || '',
    value_double: sampleHealthKitRecord.valueDouble || null,
    unit: sampleHealthKitRecord.unit || '',
    
    // Device information (flattened)
    device_hardware_version: sampleHealthKitRecord.device?.hardwareVersion || '',
    device_model: sampleHealthKitRecord.device?.model || '',
    device_name: sampleHealthKitRecord.device?.name || '',
    device_manufacturer: sampleHealthKitRecord.device?.manufacturer || '',
    device_software_version: sampleHealthKitRecord.device?.softwareVersion || '',
    
    // Store original record as JSON string for reference
    raw_healthkit_record: JSON.stringify(sampleHealthKitRecord)
  };
  
  const ndjsonLine = JSON.stringify(datasetRecord);
  
  console.log('New NDJSON content preview:');
  console.log(ndjsonLine.substring(0, 150) + '...');
  console.log('');
  
  console.log('🎯 Key Improvements:');
  console.log('• Each HealthKit record becomes a flat database row');
  console.log('• Proper NDJSON format (one JSON object per line)');
  console.log('• Foundry can process as structured data');
  console.log('• Original record preserved in raw_healthkit_record field');
  console.log('• Searchable/queryable fields extracted to top level');
  console.log('• Consistent metadata across all records');
  console.log('');
  
  console.log('📊 Dataset Schema Preview:');
  const schemaFields = Object.keys(datasetRecord).sort();
  schemaFields.forEach(field => {
    const value = datasetRecord[field];
    const type = typeof value === 'string' ? 'string' : 
                 typeof value === 'number' ? 'number' : 
                 value === null ? 'null' : 'object';
    console.log(`  ${field}: ${type}`);
  });
  
  console.log('');
  console.log('✅ This format should resolve the Parquet magic number error!');
}

demonstrateNDJSONFix();
