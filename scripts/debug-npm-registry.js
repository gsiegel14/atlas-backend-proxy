#!/usr/bin/env node

// Debug script to check npm registry configuration
import fs from 'fs';
import { execSync } from 'child_process';

console.log('=== NPM Registry Debug ===\n');

// Check if .npmrc exists
if (fs.existsSync('.npmrc')) {
    console.log('✅ .npmrc file exists');
    const npmrc = fs.readFileSync('.npmrc', 'utf8');
    console.log('\n.npmrc contents:');
    console.log('----------------');
    console.log(npmrc);
    console.log('----------------\n');
} else {
    console.log('❌ .npmrc file not found');
}

// Check FOUNDRY_TOKEN environment variable
if (process.env.FOUNDRY_TOKEN) {
    console.log('✅ FOUNDRY_TOKEN is set (length: ' + process.env.FOUNDRY_TOKEN.length + ')');
} else {
    console.log('❌ FOUNDRY_TOKEN is not set');
}

// Check npm config
console.log('\nNPM Configuration for @atlas-dev:');
try {
    const registry = execSync('npm config get @atlas-dev:registry', { encoding: 'utf8' }).trim();
    console.log('Registry:', registry || '(not set)');
} catch (e) {
    console.log('Registry: (error checking)');
}

// Try to view package info (this will fail if auth is not working)
console.log('\nAttempting to view @atlas-dev/sdk package info...');
try {
    execSync('npm view @atlas-dev/sdk', { stdio: 'inherit' });
    console.log('✅ Successfully accessed @atlas-dev/sdk');
} catch (e) {
    console.log('❌ Failed to access @atlas-dev/sdk - likely authentication issue');
}

// Check if package is installed locally
console.log('\nChecking if @atlas-dev/sdk is installed:');
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (packageJson.dependencies && packageJson.dependencies['@atlas-dev/sdk']) {
        console.log('✅ @atlas-dev/sdk is in package.json dependencies:', packageJson.dependencies['@atlas-dev/sdk']);
        
        // Check if it's actually installed
        if (fs.existsSync('node_modules/@atlas-dev/sdk')) {
            console.log('✅ @atlas-dev/sdk is installed in node_modules');
        } else {
            console.log('❌ @atlas-dev/sdk is NOT installed in node_modules');
        }
    } else {
        console.log('❌ @atlas-dev/sdk is not in package.json dependencies');
    }
} catch (e) {
    console.log('❌ Error reading package.json');
}

console.log('\n=== End Debug ===');
