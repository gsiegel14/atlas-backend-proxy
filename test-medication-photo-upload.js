#!/usr/bin/env node

/**
 * Test script for medication photo upload to Foundry media set
 * 
 * This script demonstrates the new medication photo upload endpoint that:
 * - Accepts base64 encoded photos
 * - Uploads directly to Foundry media set: ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8
 * - Uses Ontology API v2 media upload endpoint
 * - Returns media reference for use in medication records
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

console.log('📸 Testing Medication Photo Upload to Foundry Media Set\n');

// Create a sample base64 image (1x1 pixel PNG)
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg==';

console.log('📊 Test Configuration:');
console.log('- Media Set RID: ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8');
console.log('- Endpoint: POST /api/v1/medications/upload-photo');
console.log('- Content: Base64 encoded image');
console.log('- Auth: Auth0 token with execute:actions scope');
console.log('- Sample image: 1x1 pixel PNG (', samplePngBase64.length, 'chars base64)\n');

async function testMedicationPhotoUpload() {
  const testPayload = {
    photoBase64: samplePngBase64,
    filename: 'test-medication-photo.png',
    mimeType: 'image/png'
  };

  console.log('🔒 Testing authentication requirement...');
  try {
    const response = await fetch('https://atlas-backend-proxy.onrender.com/api/v1/medications/upload-photo', {
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

  console.log('\n📋 Test with Authentication:');
  console.log(`curl -X POST \\
  -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \\
  -H "Content-Type: application/json" \\
  "https://atlas-backend-proxy.onrender.com/api/v1/medications/upload-photo" \\
  -d '${JSON.stringify(testPayload)}' | jq`);

  console.log('\n✅ Expected Success Response:');
  console.log(`{
  "success": true,
  "data": {
    "mediaReference": {
      "reference": {
        "$rid": "ri.mio.main.media-item.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      },
      "mimeType": "image/png"
    },
    "filename": "test-medication-photo.png",
    "mimeType": "image/png",
    "mediaSetRid": "ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8",
    "uploadedAt": "2025-09-26T06:45:00.000Z",
    "userId": "auth0|your-user-id"
  },
  "timestamp": "2025-09-26T06:45:00.000Z",
  "correlationId": "uuid-correlation-id"
}`);

  console.log('\n🔧 API Details:');
  console.log('- Method: POST');
  console.log('- Endpoint: /api/v1/medications/upload-photo');
  console.log('- Required Headers: Authorization (Auth0 Bearer token)');
  console.log('- Required Scopes: execute:actions');
  console.log('- Content-Type: application/json');

  console.log('\n📝 Request Body Schema:');
  console.log(`{
  "photoBase64": "string (required) - Base64 encoded image data",
  "filename": "string (optional) - Custom filename, auto-generated if not provided",
  "mimeType": "string (optional) - image/jpeg or image/png, defaults to image/jpeg"
}`);

  console.log('\n🎯 Integration Flow:');
  console.log('1. iOS app captures medication photo');
  console.log('2. Convert image to base64');
  console.log('3. POST to /api/v1/medications/upload-photo');
  console.log('4. Receive mediaReference with RID');
  console.log('5. Use mediaReference.reference.$rid in medication record');
  console.log('6. Photo is stored in Foundry media set and linked to medication');

  console.log('\n🔗 Foundry Integration:');
  console.log('- Uses Ontology API v2 media upload endpoint');
  console.log('- Uploads to specified media set with preview=true');
  console.log('- Returns media reference for object property linking');
  console.log('- Supports both JPEG and PNG formats');
  console.log('- Auto-generates unique filenames with user ID and timestamp');

  console.log('\n📱 iOS Implementation Notes:');
  console.log('- Use UIImageJPEGRepresentation or UIImagePNGRepresentation');
  console.log('- Convert Data to base64String');
  console.log('- Include mimeType based on image format');
  console.log('- Handle success response to get media RID');
  console.log('- Store media RID with medication record');
}

testMedicationPhotoUpload().catch(console.error);
