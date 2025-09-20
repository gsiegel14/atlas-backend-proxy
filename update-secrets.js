#!/usr/bin/env node

/**
 * Update Secrets Script for Atlas Backend Proxy
 * 
 * Usage:
 *   node update-secrets.js --auth0-client-id=<id> --auth0-client-secret=<secret> --foundry-client-secret=<secret>
 * 
 * Or set environment variables:
 *   AUTH0_CLIENT_ID=<id> AUTH0_CLIENT_SECRET=<secret> FOUNDRY_CLIENT_SECRET=<secret> node update-secrets.js
 */

import { execSync } from 'child_process';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const secrets = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg.startsWith('--auth0-client-id=')) {
      secrets.AUTH0_CLIENT_ID = arg.split('=')[1];
    } else if (arg.startsWith('--auth0-client-secret=')) {
      secrets.AUTH0_CLIENT_SECRET = arg.split('=')[1];
    } else if (arg.startsWith('--foundry-client-secret=')) {
      secrets.FOUNDRY_CLIENT_SECRET = arg.split('=')[1];
    }
  });
  
  // Fall back to environment variables
  secrets.AUTH0_CLIENT_ID = secrets.AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_ID;
  secrets.AUTH0_CLIENT_SECRET = secrets.AUTH0_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET;
  secrets.FOUNDRY_CLIENT_SECRET = secrets.FOUNDRY_CLIENT_SECRET || process.env.FOUNDRY_CLIENT_SECRET;
  
  return secrets;
}

function validateSecrets(secrets) {
  const missing = [];
  
  if (!secrets.AUTH0_CLIENT_ID) missing.push('AUTH0_CLIENT_ID');
  if (!secrets.AUTH0_CLIENT_SECRET) missing.push('AUTH0_CLIENT_SECRET');
  if (!secrets.FOUNDRY_CLIENT_SECRET) missing.push('FOUNDRY_CLIENT_SECRET');
  
  if (missing.length > 0) {
    log(colors.red, '❌ Missing required secrets:');
    missing.forEach(secret => log(colors.red, `   - ${secret}`));
    log(colors.yellow, '\nUsage:');
    log(colors.yellow, '  node update-secrets.js --auth0-client-id=<id> --auth0-client-secret=<secret> --foundry-client-secret=<secret>');
    log(colors.yellow, '\nOr set environment variables:');
    log(colors.yellow, '  AUTH0_CLIENT_ID=<id> AUTH0_CLIENT_SECRET=<secret> FOUNDRY_CLIENT_SECRET=<secret> node update-secrets.js');
    process.exit(1);
  }
  
  return true;
}

function updateRenderSecrets(secrets) {
  log(colors.blue, '🔐 Updating Render environment variables...');
  
  try {
    // Use render CLI if available, otherwise show manual instructions
    const renderCommand = `render env set AUTH0_CLIENT_ID="${secrets.AUTH0_CLIENT_ID}" AUTH0_CLIENT_SECRET="${secrets.AUTH0_CLIENT_SECRET}" FOUNDRY_CLIENT_SECRET="${secrets.FOUNDRY_CLIENT_SECRET}" --service=atlas-backend-proxy`;
    
    log(colors.yellow, 'Run this command in your terminal:');
    log(colors.yellow, renderCommand);
    
    log(colors.yellow, '\nOr update manually in Render Dashboard:');
    log(colors.yellow, 'https://dashboard.render.com/web/srv-d37digbe5dus7399iqq0');
    
    log(colors.green, '\n✅ Secret update commands generated!');
    
  } catch (error) {
    log(colors.red, `❌ Error: ${error.message}`);
    log(colors.yellow, '\nPlease update secrets manually in Render Dashboard:');
    log(colors.yellow, 'https://dashboard.render.com/web/srv-d37digbe5dus7399iqq0');
  }
}

function main() {
  log(colors.blue, '🚀 Atlas Backend Proxy - Secret Update Tool\n');
  
  const secrets = parseArgs();
  
  if (!validateSecrets(secrets)) {
    return;
  }
  
  log(colors.green, '✅ All required secrets provided');
  log(colors.yellow, '📝 Secrets to update:');
  log(colors.yellow, `   - AUTH0_CLIENT_ID: ${secrets.AUTH0_CLIENT_ID.substring(0, 8)}...`);
  log(colors.yellow, `   - AUTH0_CLIENT_SECRET: ${secrets.AUTH0_CLIENT_SECRET.substring(0, 8)}...`);
  log(colors.yellow, `   - FOUNDRY_CLIENT_SECRET: ${secrets.FOUNDRY_CLIENT_SECRET.substring(0, 8)}...`);
  
  updateRenderSecrets(secrets);
  
  log(colors.blue, '\n📋 Next Steps:');
  log(colors.yellow, '1. Update the secrets in Render Dashboard');
  log(colors.yellow, '2. Wait for deployment to complete');
  log(colors.yellow, '3. Test the service: node test-deployment.js');
  log(colors.yellow, '4. Verify Auth0 integration with real JWT tokens');
}

main();
