#!/usr/bin/env node

/**
 * Test script for the patient profile endpoint
 * Tests the /api/v1/foundry/patient/profile endpoint with a specific user ID
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'https://atlas-backend-proxy.onrender.com';
const TEST_USER_ID = 'auth0|68d39b8321ee4ff6e25f9b03'; // Alex's user ID

async function testPatientProfile() {
  try {
    console.log('🧪 Testing patient profile endpoint...');
    console.log(`👤 User ID: ${TEST_USER_ID}`);
    console.log(`🌐 Base URL: ${BASE_URL}`);
    
    // You'll need to get a valid token for this user
    // This is just a placeholder - in real testing you'd need proper auth
    const token = process.env.TEST_TOKEN;
    
    if (!token) {
      console.log('❌ No TEST_TOKEN environment variable set');
      console.log('💡 Set TEST_TOKEN with a valid JWT for the test user');
      return;
    }
    
    const response = await axios.get(`${BASE_URL}/api/v1/foundry/patient/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success! Patient profile found:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Network error:', error.message);
    }
  }
}

// Test the Foundry API directly (for debugging)
async function testFoundryDirect() {
  try {
    console.log('\n🔧 Testing Foundry API directly...');
    
    const foundryToken = process.env.FOUNDRY_TOKEN;
    const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID;
    
    if (!foundryToken || !ontologyRid) {
      console.log('❌ Missing FOUNDRY_TOKEN or FOUNDRY_ONTOLOGY_RID');
      return;
    }
    
    const searchPayload = {
      where: {
        type: "eq",
        field: "user_id",
        value: TEST_USER_ID
      }
    };
    
    console.log('📤 Search payload:', JSON.stringify(searchPayload, null, 2));
    
    const response = await axios.post(
      `https://atlasengine.palantirfoundry.com/api/v2/ontologies/${ontologyRid}/objects/A/search`,
      searchPayload,
      {
        headers: {
          'Authorization': `Bearer ${foundryToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Foundry direct response:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ Foundry HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Foundry network error:', error.message);
    }
  }
}

async function main() {
  await testPatientProfile();
  await testFoundryDirect();
}

if (require.main === module) {
  main();
}
