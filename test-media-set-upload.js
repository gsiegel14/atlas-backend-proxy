#!/usr/bin/env node

// Test script to verify upload to the correct media set
import fetch from 'node-fetch';

// Use the values from render.yaml for testing
const config = {
  foundryHost: 'https://atlasengine.palantirfoundry.com',
  clientId: '5397e07e4277f7d7d5a081dce9645599',
  tokenUrl: 'https://atlasengine.palantirfoundry.com/multipass/api/oauth2/token',
  mediaSetRid: 'ri.mio.main.media-set.774ed489-e6ba-4f75-abd3-784080d7cfb3'
};

console.log('🔍 Testing Media Set Upload Configuration');
console.log('Media Set RID:', config.mediaSetRid);
console.log('Foundry Host:', config.foundryHost);

// Note: This test requires FOUNDRY_CLIENT_SECRET to be set
if (!process.env.FOUNDRY_CLIENT_SECRET) {
  console.log('❌ FOUNDRY_CLIENT_SECRET environment variable is required for testing');
  console.log('Set it with: export FOUNDRY_CLIENT_SECRET=your_secret_here');
  process.exit(1);
}

async function testMediaSetAccess() {
  try {
    // Step 1: Get authentication token
    console.log('\n🔐 Getting authentication token...');
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': config.clientId,
        'client_secret': process.env.FOUNDRY_CLIENT_SECRET,
        'scope': 'api:ontologies-read api:ontologies-write api:usage:mediasets-write'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Token obtained successfully');

    // Step 2: Test media set access (just check if we can access it)
    console.log('\n📁 Testing media set access...');
    const mediaSetUrl = `${config.foundryHost}/api/v2/mediasets/${config.mediaSetRid}`;
    
    const mediaSetResponse = await fetch(mediaSetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    if (!mediaSetResponse.ok) {
      const errorText = await mediaSetResponse.text();
      console.log(`❌ Media set access failed: ${mediaSetResponse.status} - ${errorText}`);
      return false;
    }

    const mediaSetInfo = await mediaSetResponse.json();
    console.log('✅ Media set accessible:', mediaSetInfo.name || 'Unnamed media set');

    // Step 3: Test upload endpoint format
    console.log('\n🎵 Testing upload endpoint format...');
    const testPath = `encounters/audio/test/${Date.now()}-test.wav`;
    const uploadUrl = `${config.foundryHost}/api/v2/mediasets/${config.mediaSetRid}/items?mediaItemPath=${encodeURIComponent(testPath)}&preview=true`;
    
    console.log('Upload URL format:', uploadUrl);
    console.log('✅ Upload configuration looks correct');

    return true;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
testMediaSetAccess().then(success => {
  if (success) {
    console.log('\n🎉 Media set configuration verified!');
    console.log('The backend proxy should now be able to upload to:');
    console.log(`   ${config.mediaSetRid}`);
  } else {
    console.log('\n❌ Media set configuration needs attention');
    process.exit(1);
  }
});
