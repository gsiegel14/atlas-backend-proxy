#!/usr/bin/env node

// Test script to debug audio upload issues
import { MediaUploadService } from './src/services/mediaUploadService.js';
import { logger } from './src/utils/logger.js';

// Check environment variables
console.log('🔍 Environment Variables Check:');
const requiredEnvVars = [
  'FOUNDRY_HOST',
  'FOUNDRY_CLIENT_ID', 
  'FOUNDRY_CLIENT_SECRET',
  'FOUNDRY_OAUTH_TOKEN_URL',
  'FOUNDRY_ONTOLOGY_RID'
];

let missingVars = [];
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    missingVars.push(varName);
    console.log(`❌ ${varName}: MISSING`);
  } else {
    console.log(`✅ ${varName}: ${value.substring(0, 20)}...`);
  }
});

if (missingVars.length > 0) {
  console.log(`\n❌ Missing environment variables: ${missingVars.join(', ')}`);
  console.log('Please set these in your .env file or environment');
  process.exit(1);
}

// Create test audio data (small WAV file in base64)
const testAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='; // Empty WAV header
const testFilename = 'test-recording.wav';
const testUserId = 'test-user-123';

console.log('\n🎵 Testing Audio Upload...');

const mediaUploadService = new MediaUploadService({
  foundryHost: process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com',
  clientId: process.env.FOUNDRY_CLIENT_ID || '5397e07e4277f7d7d5a081dce9645599',
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL || 'https://atlasengine.palantirfoundry.com/multipass/api/oauth2/token',
  ontologyApiName: process.env.FOUNDRY_ONTOLOGY_API_NAME || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194'
});

try {
  // Test 1: Upload audio file
  console.log('Step 1: Uploading audio file...');
  const uploadResult = await mediaUploadService.uploadAudioFile(
    testAudioBase64,
    testFilename,
    'audio/wav',
    testUserId
  );
  
  console.log('✅ Upload successful:', JSON.stringify(uploadResult, null, 2));
  
  // Test 2: Create intraencounter with the uploaded audio
  console.log('\nStep 2: Creating intraencounter...');
  const intraencounterResult = await mediaUploadService.createIntraencounterProduction({
    timestamp: new Date().toISOString(),
    user_id: testUserId,
    audiofile: uploadResult.reference || uploadResult,
    transcript: 'This is a test transcript for debugging purposes.',
    location: 'Test Location',
    provider_name: 'Dr. Test',
    speciality: 'General Medicine',
    hospital: 'Test Hospital'
  });
  
  console.log('✅ Intraencounter creation successful:', JSON.stringify(intraencounterResult, null, 2));
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

console.log('\n🎉 All tests passed!');
