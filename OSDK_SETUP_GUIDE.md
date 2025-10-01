# Complete OSDK Setup Guide for Backend Proxy

## Overview
This guide will help you set up the Palantir TypeScript OSDK (Ontology SDK) to work with your Atlas backend proxy.

## Prerequisites
- Access to Foundry Console: `https://atlasengine.palantirfoundry.com`
- Your ontology: **Atlas Engine Ontology**
  - RID: `ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58`
  - API Name: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`
- OAuth credentials already configured ✅

---

## Step 1: Generate TypeScript SDK from Foundry

### A. Navigate to Developer Console
1. Go to `https://atlasengine.palantirfoundry.com`
2. Navigate to **Ontology Manager**
3. Open your **Atlas Engine Ontology** (namespace: `Atlas Engine-2cacb0`)
4. Click on **Developer Console** or **Integrations** tab
5. Select **TypeScript SDK**

### B. Generate the SDK
1. Click **"Generate SDK"** or **"Create new version"**
2. Choose configuration:
   - **Package name**: `@atlas-dev/sdk` (or your preferred name)
   - **Include all object types**: YES
   - **Include actions**: YES
   - **Include queries**: YES (if you have any)
3. Click **Generate**
4. Wait for generation to complete (usually 30-60 seconds)

### C. Download or Get NPM Registry Details

**Option A: Download as tarball** (easier for private use)
1. Click **Download** button
2. Save the `.tgz` file (e.g., `atlas-dev-sdk-1.0.0.tgz`)
3. Copy to your `backend-proxy` directory

**Option B: Use Foundry's NPM registry** (recommended for teams)
1. Get the registry URL from Foundry (usually shown in the SDK page)
2. Note down the package name and version
3. You'll need authentication token

---

## Step 2: Install the Generated SDK

### Option A: Install from Downloaded Tarball

```bash
cd backend-proxy

# Install from local file
npm install ./atlas-dev-sdk-1.0.0.tgz

# Or if you moved it elsewhere:
npm install /path/to/atlas-dev-sdk-1.0.0.tgz
```

### Option B: Install from Foundry NPM Registry

```bash
cd backend-proxy

# Configure npm to use Foundry registry for your scope
npm config set @atlas-dev:registry https://your-foundry-instance.com/npm/

# Authenticate (you'll need a token from Foundry)
npm login --scope=@atlas-dev --registry=https://your-foundry-instance.com/npm/

# Install the package
npm install @atlas-dev/sdk@latest
```

---

## Step 3: Update Your OSDK Client Configuration

### A. Import the Generated SDK

Update `src/osdk/client.js`:

```javascript
import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

// ✅ IMPORT YOUR GENERATED SDK OBJECT TYPES
import { A } from '@atlas-dev/sdk';  // Import your object types
// If you have other object types, import them too:
// import { MedicationsUpload, FastenClinicalNotes, etc } from '@atlas-dev/sdk';

dotenv.config();

const DEFAULT_HOST = 'https://atlasengine.palantirfoundry.com';
const host = process.env.FOUNDRY_HOST ?? DEFAULT_HOST;
const bypassInitialization = process.env.NODE_ENV === 'test'
    || (process.env.OSDK_CLIENT_DISABLE ?? '').toLowerCase() === 'true';

// Ontology RID must be provided unless we are bypassing for tests
const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID
    ?? (bypassInitialization ? 'ontology-test-bypass' : undefined);
if (!ontologyRid) {
    throw new Error('FOUNDRY_ONTOLOGY_RID environment variable is required');
}

console.log('OSDK Client Configuration:', {
    host,
    ontologyRid,
    hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
    hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET
});

const DEFAULT_SCOPES = [
    'api:use-ontologies-read',
    'api:use-ontologies-write',
    'api:use-datasets-read',
    'api:use-datasets-write',
    'api:use-filesystem-read',
    'api:use-filesystem-write',
    'api:use-aip-agents-read',
    'api:use-aip-agents-write',
    'api:use-streams-read',
    'api:use-streams-write',
    'api:use-connectivity-read',
    'api:use-connectivity-write',
    'api:use-connectivity-execute',
    'api:use-orchestration-read',
    'api:use-orchestration-write',
    'api:use-mediasets-read',
    'api:use-mediasets-write',
    'api:use-sql-queries-read',
    'api:use-sql-queries-execute'
];

function createTokenProvider() {
    const token = process.env.FOUNDRY_TOKEN;
    const clientId = process.env.FOUNDRY_CLIENT_ID;
    const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;

    if (clientId && clientSecret) {
        const scopes = process.env.FOUNDRY_SCOPES
            ? process.env.FOUNDRY_SCOPES.split(',').map(scope => scope.trim()).filter(Boolean)
            : DEFAULT_SCOPES;
        return createConfidentialOauthClient(clientId, clientSecret, host, scopes);
    }

    if (token) {
        return async () => token;
    }

    throw new Error('OSDK client requires FOUNDRY_TOKEN or FOUNDRY_CLIENT_ID/FOUNDRY_CLIENT_SECRET environment variables.');
}

let client;

if (bypassInitialization) {
    console.log('Skipping OSDK client initialization (test mode)');
    client = {};
} else {
    const tokenProvider = createTokenProvider();

    console.log('Using ontology RID for OSDK client:', {
        ontologyRid: ontologyRid
    });

    try {
        console.log('Creating OSDK client with:', { 
            host, 
            ontologyRid: ontologyRid.substring(0, 30) + '...',
            hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
            hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET
        });
        
        client = createOSDKClient(host, ontologyRid, tokenProvider);
        
        // Validate that the client has the expected structure
        if (client && typeof client === 'function') {
            console.log('✅ OSDK client created successfully');
        } else {
            console.warn('⚠️ OSDK client created but unexpected structure:', {
                clientType: typeof client,
                clientKeys: client ? Object.keys(client) : []
            });
        }
    } catch (error) {
        console.error('❌ Failed to create OSDK client (continuing with REST API only):', {
            error: error.message,
            stack: error.stack,
            host,
            ontologyRid
        });
        client = null;
        console.log('OSDK client disabled - REST API endpoints will still work');
    }
}

// Export the converted API name for use in other services
let exportedOntologyRid = ontologyRid;
if (!bypassInitialization && ontologyRid.startsWith('ri.ontology.main.ontology.')) {
    const uuid = ontologyRid.replace('ri.ontology.main.ontology.', '');
    exportedOntologyRid = `ontology-${uuid}`;
}

// ✅ EXPORT OBJECT TYPES TOO
export { 
    client, 
    host as osdkHost, 
    exportedOntologyRid as osdkOntologyRid,
    A  // Export object type for use in routes
};
```

---

## Step 4: Update Routes to Use Typed OSDK

### A. Update `src/routes/patient.js`

Replace the string-based object access with typed access:

```javascript
// At the top of the file
import { client as osdkClient, A, osdkHost, osdkOntologyRid } from '../osdk/client.js';

// In the dashboard endpoint (around line 156), replace:
// const patientObjects = osdkClient('A');  // ❌ OLD WAY

// With:
const patientObjects = osdkClient(A);  // ✅ NEW WAY using typed import
```

### B. Update Other Routes That Use OSDK

Find all places using string-based access:

```bash
cd backend-proxy
grep -r "osdkClient('A')" src/
grep -r 'osdkClient("A")' src/
```

Replace them with typed imports.

---

## Step 5: Add OSDK Types for Actions

If you're using Foundry Actions (like `create-medications-upload`), import those too:

```javascript
// In src/osdk/client.js
import { 
    A,
    createMedicationsUpload,
    createAiChatHistoryProduction,
    createAtlasIntraencounterProduction,
    // ... other actions
} from '@atlas-dev/sdk';

// Export them
export { 
    client, 
    osdkHost, 
    osdkOntologyRid,
    A,
    createMedicationsUpload,
    createAiChatHistoryProduction,
    createAtlasIntraencounterProduction
};
```

---

## Step 6: Test OSDK Connectivity

### A. Add Test Endpoint

Add this to `src/routes/foundry.js`:

```javascript
router.get('/osdk-test', validateTokenWithScopes(['read:patient']), async (req, res) => {
  try {
    if (!client || typeof client !== 'function') {
      return res.status(503).json({ 
        error: 'OSDK client not initialized',
        message: 'Using REST API fallback mode',
        suggestion: 'Check OSDK client configuration and generated SDK installation'
      });
    }
    
    // Test fetching objects
    const testResult = await client(A)
      .fetchPage({ $pageSize: 1 });
    
    res.json({
      success: true,
      message: 'OSDK is working!',
      resultsCount: testResult.data.length,
      hasMore: testResult.hasNext,
      ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      suggestion: 'Check OSDK client logs and verify SDK is installed correctly'
    });
  }
});
```

### B. Test Locally

```bash
cd backend-proxy

# Make sure your .env has the correct values
npm start

# In another terminal, test the endpoint
curl -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \
  http://localhost:3000/api/v1/foundry/osdk-test
```

### C. Expected Success Response

```json
{
  "success": true,
  "message": "OSDK is working!",
  "resultsCount": 1,
  "hasMore": true,
  "ontologyRid": "ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58"
}
```

---

## Step 7: Deploy to Render

### A. Add SDK to Dependencies

Make sure `package.json` includes your SDK:

```json
{
  "dependencies": {
    "@atlas-dev/sdk": "file:./atlas-dev-sdk-1.0.0.tgz",
    // ... other dependencies
  }
}
```

Or if using registry:
```json
{
  "dependencies": {
    "@atlas-dev/sdk": "^1.0.0",
    // ... other dependencies
  }
}
```

### B. Update Render Build

If using tarball, make sure it's committed to git:

```bash
git add atlas-dev-sdk-1.0.0.tgz
git add package.json package-lock.json
git commit -m "Add OSDK generated SDK"
git push
```

### C. Monitor Deployment Logs

Watch for these log messages:
- ✅ `OSDK client created successfully`
- ❌ `Failed to create OSDK client` (check error details)

---

## Troubleshooting

### Issue 1: "Cannot find module '@atlas-dev/sdk'"

**Solution**:
```bash
# Make sure SDK is installed
npm list @atlas-dev/sdk

# If not found, reinstall
npm install ./atlas-dev-sdk-1.0.0.tgz --save
```

### Issue 2: "OSDK client created but unexpected structure"

**Cause**: The client is initializing but not finding object types.

**Solution**: Make sure you're importing object types from the generated SDK, not using strings.

### Issue 3: "Authentication failed"

**Cause**: OAuth credentials might be incorrect.

**Solution**: 
1. Verify `FOUNDRY_CLIENT_ID` and `FOUNDRY_CLIENT_SECRET` in render.yaml
2. Check scopes include all necessary permissions
3. Test with a REST API call first to verify credentials

### Issue 4: Import errors with object types

**Solution**: Check what's exported from your generated SDK:

```javascript
// Create a test file to explore the SDK
import * as SDK from '@atlas-dev/sdk';
console.log('Available exports:', Object.keys(SDK));
```

---

## Alternative: Quick Setup Script

Create `scripts/setup-osdk.sh`:

```bash
#!/bin/bash

echo "🔧 Setting up OSDK for Atlas Backend Proxy"

# 1. Check if SDK tarball exists
if [ ! -f "atlas-dev-sdk-1.0.0.tgz" ]; then
    echo "❌ SDK tarball not found!"
    echo "Please download the generated SDK from Foundry Console and place it in this directory."
    exit 1
fi

# 2. Install SDK
echo "📦 Installing OSDK SDK..."
npm install ./atlas-dev-sdk-1.0.0.tgz

# 3. Check installation
if npm list @atlas-dev/sdk > /dev/null 2>&1; then
    echo "✅ SDK installed successfully!"
else
    echo "❌ SDK installation failed!"
    exit 1
fi

# 4. Test OSDK client initialization
echo "🧪 Testing OSDK client..."
node -e "import('./src/osdk/client.js').then(m => console.log('✅ OSDK client loads successfully')).catch(e => { console.error('❌ Error:', e.message); process.exit(1); })"

echo "✨ OSDK setup complete!"
echo "Next steps:"
echo "1. Update your routes to use typed imports"
echo "2. Test locally: npm start"
echo "3. Test endpoint: curl http://localhost:3000/api/v1/foundry/osdk-test"
```

Make it executable:
```bash
chmod +x scripts/setup-osdk.sh
./scripts/setup-osdk.sh
```

---

## Summary Checklist

- [ ] Generate TypeScript SDK from Foundry Console
- [ ] Download SDK tarball or configure NPM registry
- [ ] Install SDK: `npm install ./atlas-dev-sdk-1.0.0.tgz`
- [ ] Import object types in `src/osdk/client.js`
- [ ] Export object types: `export { client, A }`
- [ ] Update routes to use typed imports: `client(A)` instead of `client('A')`
- [ ] Add test endpoint `/osdk-test`
- [ ] Test locally
- [ ] Commit SDK to git (if using tarball)
- [ ] Deploy to Render
- [ ] Monitor logs for successful initialization
- [ ] Test in production: `/api/v1/foundry/osdk-test`

---

## Benefits of Using OSDK

Once working, you'll get:

1. **Type Safety**: TypeScript will catch errors at compile time
2. **Better IDE Support**: Autocomplete for object properties and methods
3. **Potentially Better Performance**: Direct ontology access vs REST API
4. **Action Support**: Execute Foundry Actions with type safety
5. **Query Support**: Run ontology queries with proper typing

---

## Need Help?

If you encounter issues:

1. Check Foundry documentation: https://www.palantir.com/docs/foundry/ontology-sdk/
2. Review OSDK GitHub: https://github.com/palantir/osdk-ts
3. Check server logs for initialization errors
4. Verify your OAuth scopes include all necessary permissions
5. Test REST API endpoint first to ensure connectivity

Good luck! 🚀


