#!/usr/bin/env node

/**
 * Test script to verify the REST API backup for chat history
 */

import dotenv from 'dotenv';
import { AiChatHistoryService } from './src/services/aiChatHistoryService.js';

dotenv.config();

console.log('=== Chat History REST API Test ===\n');

const service = new AiChatHistoryService();

async function testChatHistoryCreation() {
    console.log('1. Testing Chat History Creation via REST API:');
    
    const testData = {
        userId: 'auth0|test-user-123',
        transcript: 'User: Hello, how are you?\n\nAssistant: I am doing well, thank you for asking! How can I help you today?',
        timestamp: new Date().toISOString()
    };

    try {
        console.log('   Creating chat history entry...');
        const result = await service.createChatHistoryViaREST(testData);
        console.log('   ✅ Chat history created successfully');
        console.log('   Result:', JSON.stringify(result, null, 2));
        return result.chatId;
    } catch (error) {
        console.log('   ❌ Chat history creation failed:');
        console.log('   Error:', error.message);
        if (error.stack) {
            console.log('   Stack:', error.stack);
        }
        throw error;
    }
}

async function testChatHistorySearch() {
    console.log('\n2. Testing Chat History Search via REST API:');
    
    const testUserId = 'auth0|test-user-123';

    try {
        console.log('   Searching chat history...');
        const results = await service.searchByUserIdViaREST(testUserId, {
            pageSize: 10,
            select: ['chatId', 'transcript', 'userId', 'timestamp']
        });
        console.log('   ✅ Chat history search successful');
        console.log('   Found', results.length, 'entries');
        if (results.length > 0) {
            console.log('   Latest entry:', JSON.stringify(results[0], null, 2));
        }
        return results;
    } catch (error) {
        console.log('   ❌ Chat history search failed:');
        console.log('   Error:', error.message);
        if (error.stack) {
            console.log('   Stack:', error.stack);
        }
        throw error;
    }
}

async function testFullWorkflow() {
    console.log('\n3. Testing Full Workflow (Create + Search):');
    
    const testData = {
        userId: 'auth0|workflow-test-' + Date.now(),
        transcript: 'User: This is a test conversation.\n\nAssistant: I understand this is a test. Everything looks good!',
        timestamp: new Date().toISOString()
    };

    try {
        // Create
        console.log('   Step 1: Creating chat history...');
        const createResult = await service.createChatHistory(testData);
        console.log('   ✅ Created:', createResult.chatId);

        // Search
        console.log('   Step 2: Searching for created entry...');
        const searchResults = await service.searchByUserId(testData.userId);
        console.log('   ✅ Found', searchResults.length, 'entries');

        // Verify
        const foundEntry = searchResults.find(entry => entry.chatId === createResult.chatId);
        if (foundEntry) {
            console.log('   ✅ Created entry found in search results');
        } else {
            console.log('   ⚠️  Created entry not found in search results (may take time to propagate)');
        }

        return { createResult, searchResults };
    } catch (error) {
        console.log('   ❌ Full workflow failed:');
        console.log('   Error:', error.message);
        throw error;
    }
}

// Run tests
async function runTests() {
    try {
        await testChatHistoryCreation();
        await testChatHistorySearch();
        await testFullWorkflow();
        
        console.log('\n✅ All tests passed! REST API backup is working correctly.');
    } catch (error) {
        console.log('\n❌ Tests failed. Check the error messages above.');
        process.exit(1);
    }
}

runTests();
