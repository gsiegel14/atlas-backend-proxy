#!/usr/bin/env node

/**
 * Debug script to test OSDK client initialization and environment variables
 */

import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

dotenv.config();

console.log('=== OSDK Client Debug Script ===\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log('   FOUNDRY_HOST:', process.env.FOUNDRY_HOST || 'NOT SET');
console.log('   FOUNDRY_CLIENT_ID:', process.env.FOUNDRY_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('   FOUNDRY_CLIENT_SECRET:', process.env.FOUNDRY_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('   FOUNDRY_ONTOLOGY_RID:', process.env.FOUNDRY_ONTOLOGY_RID || 'NOT SET');
console.log('   FOUNDRY_OAUTH_TOKEN_URL:', process.env.FOUNDRY_OAUTH_TOKEN_URL || 'NOT SET');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
console.log('');

// Check required variables
const requiredVars = ['FOUNDRY_CLIENT_ID', 'FOUNDRY_CLIENT_SECRET', 'FOUNDRY_ONTOLOGY_RID'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.log('❌ Missing required environment variables:', missingVars);
    process.exit(1);
}

console.log('✅ All required environment variables are set\n');

// Test OSDK client initialization
console.log('2. Testing OSDK Client Initialization:');

const host = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID;
const clientId = process.env.FOUNDRY_CLIENT_ID;
const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;

try {
    console.log('   Creating OAuth client...');
    const tokenProvider = createConfidentialOauthClient(
        clientId, 
        clientSecret, 
        host, 
        ['api:use-ontologies-read', 'api:use-ontologies-write']
    );
    console.log('   ✅ OAuth client created successfully');

    console.log('   Creating OSDK client...');
    const client = createOSDKClient(host, ontologyRid, tokenProvider);
    console.log('   ✅ OSDK client created successfully');

    console.log('   Client type:', typeof client);
    console.log('   Client keys:', Object.keys(client));
    console.log('   Has ontology method:', typeof client.ontology === 'function');

    if (typeof client.ontology === 'function') {
        console.log('   Testing ontology access...');
        const ontology = client.ontology(ontologyRid);
        console.log('   ✅ Ontology access successful');
        console.log('   Ontology type:', typeof ontology);
        console.log('   Ontology keys:', Object.keys(ontology));
        
        if (typeof ontology.objects === 'function') {
            console.log('   Testing objects access...');
            const objects = ontology.objects('AiChatHistoryProduction');
            console.log('   ✅ Objects access successful');
            console.log('   Objects type:', typeof objects);
            console.log('   Objects keys:', Object.keys(objects));
        } else {
            console.log('   ❌ ontology.objects is not a function');
        }

        if (typeof ontology.action === 'function') {
            console.log('   Testing action access...');
            const action = ontology.action('create-ai-chat-history-production');
            console.log('   ✅ Action access successful');
            console.log('   Action type:', typeof action);
            console.log('   Action keys:', Object.keys(action));
        } else {
            console.log('   ❌ ontology.action is not a function');
        }
    } else {
        console.log('   ❌ client.ontology is not a function');
    }

    console.log('\n3. Testing Token Generation:');
    const token = await tokenProvider();
    console.log('   ✅ Token generated successfully');
    console.log('   Token type:', typeof token);
    console.log('   Token length:', token.length);
    console.log('   Token starts with:', token.substring(0, 20) + '...');

} catch (error) {
    console.log('   ❌ OSDK client initialization failed:');
    console.log('   Error:', error.message);
    console.log('   Stack:', error.stack);
    process.exit(1);
}

console.log('\n✅ All tests passed! OSDK client should work correctly.');
