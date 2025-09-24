#!/usr/bin/env node

/**
 * Debug script to test observations API and understand data structure
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://atlas-backend-proxy.onrender.com';
const PATIENT_ID = '7c2f5a19-087b-8b19-1070-800857d62e92';

// You'll need to get a valid token from your app
const TOKEN = process.env.AUTH_TOKEN;

if (!TOKEN) {
  console.error('Please set AUTH_TOKEN environment variable');
  process.exit(1);
}

async function testObservations() {
  console.log('🧪 Testing observations API...\n');

  try {
    // Test 1: Get all observations (no category filter)
    console.log('1️⃣ Testing all observations (no category):');
    const allResponse = await fetch(
      `${BASE_URL}/api/v1/foundry/observations?patientId=${PATIENT_ID}&pageSize=10`,
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const allData = await allResponse.json();
    console.log(`Status: ${allResponse.status}`);
    console.log(`Count: ${allData.data?.length || 0}`);
    
    if (allData.data?.length > 0) {
      console.log('Sample observation:');
      console.log(JSON.stringify(allData.data[0], null, 2));
      
      // Extract unique categories
      const categories = [...new Set(allData.data.map(obs => obs.category))];
      console.log(`\nUnique categories found: ${categories.join(', ')}`);
    }
    
    console.log('\n---\n');

    // Test 2: Test specific categories
    const testCategories = ['vital-signs', 'laboratory', 'survey', 'exam'];
    
    for (const category of testCategories) {
      console.log(`2️⃣ Testing category: ${category}`);
      const categoryResponse = await fetch(
        `${BASE_URL}/api/v1/foundry/observations?patientId=${PATIENT_ID}&category=${category}&pageSize=5`,
        {
          headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const categoryData = await categoryResponse.json();
      console.log(`Status: ${categoryResponse.status}, Count: ${categoryData.data?.length || 0}`);
      
      if (categoryData.error) {
        console.log(`Error: ${categoryData.error.message}`);
      }
      
      console.log('');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testObservations();
