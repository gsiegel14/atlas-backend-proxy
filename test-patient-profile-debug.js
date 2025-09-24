#!/usr/bin/env node

/**
 * Debug script for patient profile endpoint
 * This helps debug the 404 issue with user auth0|68d39b8321ee4ff6e25f9b03
 */

import axios from 'axios';

// Configuration
const BASE_URL = 'https://atlas-backend-proxy.onrender.com';
const TEST_USER_ID = 'auth0|68d39b8321ee4ff6e25f9b03'; // Alex's user ID

async function debugPatientProfile() {
  console.log('🔍 Debugging patient profile 404 issue...');
  console.log(`👤 Target User ID: ${TEST_USER_ID}`);
  console.log(`🌐 Backend URL: ${BASE_URL}`);
  
  // Test 1: Check if the endpoint exists (without auth)
  try {
    console.log('\n📡 Test 1: Checking if endpoint exists...');
    const response = await axios.get(`${BASE_URL}/api/v1/foundry/patient/profile`);
    console.log('❌ Unexpected: Got response without auth');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Good: Endpoint exists but requires auth (401)');
    } else if (error.response?.status === 404) {
      console.log('❌ Bad: Endpoint not found (404) - deployment issue');
    } else {
      console.log(`❓ Unexpected status: ${error.response?.status}`);
    }
  }
  
  // Test 2: Check available endpoints
  try {
    console.log('\n📡 Test 2: Checking available endpoints...');
    const response = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health endpoint works:', response.data);
  } catch (error) {
    console.log('❌ Health endpoint failed:', error.message);
  }
  
  // Test 3: Check Foundry endpoints
  try {
    console.log('\n📡 Test 3: Checking Foundry observations endpoint...');
    const response = await axios.get(`${BASE_URL}/api/v1/foundry/observations`);
    console.log('❌ Unexpected: Got response without auth');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Good: Foundry observations endpoint exists and requires auth');
    } else if (error.response?.status === 404) {
      console.log('❌ Bad: Foundry observations endpoint not found');
    } else {
      console.log(`❓ Foundry observations unexpected status: ${error.response?.status}`);
    }
  }
  
  console.log('\n💡 Next steps:');
  console.log('1. If patient profile endpoint returns 404, the new code hasn\'t been deployed yet');
  console.log('2. Need to commit and push changes to trigger Render deployment');
  console.log('3. Once deployed, test with proper Auth0 token for the user');
}

async function checkFoundryDirectly() {
  console.log('\n🔧 Direct Foundry API Test (requires tokens)...');
  
  const foundryToken = process.env.FOUNDRY_TOKEN;
  const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
  
  if (!foundryToken) {
    console.log('❌ No FOUNDRY_TOKEN set - skipping direct test');
    console.log('💡 Set FOUNDRY_TOKEN to test Foundry API directly');
    return;
  }
  
  try {
    const searchPayload = {
      where: {
        type: "eq",
        field: "user_id",
        value: TEST_USER_ID
      }
    };
    
    console.log('📤 Searching Foundry for user:', TEST_USER_ID);
    console.log('📤 Exact search payload:', JSON.stringify(searchPayload, null, 2));
    console.log('📤 Using ontology:', ontologyRid);
    console.log('📤 Full URL:', `https://atlasengine.palantirfoundry.com/api/v2/ontologies/${ontologyRid}/objects/A/search`);
    
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
    
    console.log(`✅ Foundry returned ${response.data.data?.length || 0} patient records`);
    if (response.data.data && response.data.data.length > 0) {
      console.log('👤 Patient record found:', JSON.stringify(response.data.data[0], null, 2));
    } else {
      console.log('❌ No patient record found in Foundry for this user_id');
      console.log('💡 Check if patient record exists with correct user_id field');
    }
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ Foundry API error ${error.response.status}:`, error.response.data);
    } else {
      console.log('❌ Foundry network error:', error.message);
    }
  }
}

async function main() {
  await debugPatientProfile();
  await checkFoundryDirectly();
}

// Run the main function
main();
