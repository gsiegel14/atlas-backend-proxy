# OSDK NPM Registry Setup for Backend Proxy

## ✅ Using Official Foundry NPM Registry (Recommended)

This guide follows the official Foundry setup instructions for TypeScript OSDK using their NPM registry.

---

## Step 1: Configure NPM Registry

### A. Create/Update `.npmrc` in `backend-proxy/` directory

Create or update `backend-proxy/.npmrc`:

```properties
# Foundry NPM Registry Authentication
//atlasengine.palantirfoundry.com/artifacts/api/repositories/ri.artifacts.main.repository.da5e46da-8a31-4c62-bccc-b3d5af0c8355/contents/release/npm/:_authToken=${FOUNDRY_TOKEN}

# Scope configuration for @atlas-dev packages
@atlas-dev:registry=https://atlasengine.palantirfoundry.com/artifacts/api/repositories/ri.artifacts.main.repository.da5e46da-8a31-4c62-bccc-b3d5af0c8355/contents/release/npm
```

**⚠️ IMPORTANT**: 
- Add `.npmrc` to `.gitignore` if it contains actual tokens
- OR use the `${FOUNDRY_TOKEN}` environment variable placeholder as shown above

### B. Add to `.gitignore` (if needed)

If your `.npmrc` has real tokens (not recommended), add:

```bash
echo ".npmrc" >> .gitignore
```

**Better approach**: Keep the `.npmrc` with `${FOUNDRY_TOKEN}` placeholder and set the token via environment variable.

---

## Step 2: Install SDK Packages

### A. Update `package.json`

Add these dependencies to `backend-proxy/package.json`:

```json
{
  "name": "atlas-backend-proxy",
  "dependencies": {
    "@atlas-dev/sdk": "^0.13.0",
    "@osdk/client": "^2.4.2",
    "@osdk/oauth": "^1.0.0",
    "@osdk/foundry": "latest",
    // ... existing dependencies
  }
}
```

### B. Install packages locally

```bash
cd backend-proxy

# Set your Foundry token (get from Foundry console)
export FOUNDRY_TOKEN="your-personal-token-here"

# Install dependencies
npm install
```

---

## Step 3: Update OSDK Client Configuration

Update `backend-proxy/src/osdk/client.js`:

```javascript
import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

// ✅ Import object types from the official SDK package
import { 
    A,                                      // AtlasCarePatientProfile object
    FastenClinicalNotes,                   // Fasten clinical notes
    // Add other object types as needed
} from '@atlas-dev/sdk';

dotenv.config();

const DEFAULT_HOST = 'https://atlasengine.palantirfoundry.com';
const host = process.env.FOUNDRY_HOST ?? DEFAULT_HOST;
const bypassInitialization = process.env.NODE_ENV === 'test'
    || (process.env.OSDK_CLIENT_DISABLE ?? '').toLowerCase() === 'true';

// Ontology RID - must match Foundry console
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

// Scopes from Foundry documentation (includes admin scopes)
const DEFAULT_SCOPES = [
    'api:use-ontologies-read',
    'api:use-ontologies-write',
    'api:use-admin-read',           // ✅ Added from Foundry docs
    'api:use-admin-write',          // ✅ Added from Foundry docs
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
        
        console.log('Using OAuth client with scopes:', scopes.slice(0, 3).join(', ') + '...');
        return createConfidentialOauthClient(clientId, clientSecret, host, scopes);
    }

    if (token) {
        console.log('Using personal access token for OSDK');
        return async () => token;
    }

    throw new Error('OSDK client requires FOUNDRY_TOKEN or FOUNDRY_CLIENT_ID/FOUNDRY_CLIENT_SECRET environment variables.');
}

let client;

if (bypassInitialization) {
    console.log('Skipping OSDK client initialization (test mode)');
    client = {};
} else {
    try {
        const tokenProvider = createTokenProvider();

        console.log('Creating OSDK client with:', { 
            host, 
            ontologyRid: ontologyRid.substring(0, 50) + '...',
            hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
            hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET
        });
        
        client = createOSDKClient(host, ontologyRid, tokenProvider);
        
        // Test that we can call the client
        if (client && typeof client === 'function') {
            console.log('✅ OSDK client created successfully');
            console.log('✅ Available object types: A, FastenClinicalNotes, etc.');
        } else {
            console.warn('⚠️ OSDK client created but has unexpected structure');
        }
    } catch (error) {
        console.error('❌ Failed to create OSDK client:', {
            error: error.message,
            stack: error.stack
        });
        client = null;
        console.log('Falling back to REST API only');
    }
}

// Export the converted API name for use in other services
let exportedOntologyRid = ontologyRid;
if (!bypassInitialization && ontologyRid.startsWith('ri.ontology.main.ontology.')) {
    const uuid = ontologyRid.replace('ri.ontology.main.ontology.', '');
    exportedOntologyRid = `ontology-${uuid}`;
}

// ✅ Export object types for use in routes
export { 
    client, 
    host as osdkHost, 
    exportedOntologyRid as osdkOntologyRid,
    A,
    FastenClinicalNotes
};
```

---

## Step 4: Update Routes to Use Typed Objects

### A. Update `src/routes/patient.js`

```javascript
// Import object types
import { client as osdkClient, A, osdkHost, osdkOntologyRid } from '../osdk/client.js';

// In dashboard endpoint (around line 156), replace:
// ❌ const patientObjects = osdkClient('A');

// With:
// ✅ Use typed import
if (osdkClient && typeof osdkClient === 'function') {
    try {
        const patientObjects = osdkClient(A);
        
        for (const identifier of identifierCandidates) {
            try {
                const page = await patientObjects
                    .where({ user_id: { $eq: identifier } })
                    .fetchPage({ $pageSize: 1 });
                
                if (page.data.length > 0) {
                    // ... rest of code
```

### B. Update Other Routes Using OSDK

Find all string-based object access:
```bash
grep -r "osdkClient('A')" src/routes/
grep -r 'osdkClient("A")' src/routes/
```

Replace with typed access using imported `A`.

---

## Step 5: Configure Environment for Render

### A. Update `render.yaml`

Add FOUNDRY_TOKEN to environment variables:

```yaml
services:
  - type: web
    name: atlas-backend-proxy
    envVars:
      # ... existing vars ...
      
      # ✅ Add FOUNDRY_TOKEN for OSDK
      - key: FOUNDRY_TOKEN
        sync: false  # This will be set via Render dashboard
      
      # Keep existing OAuth credentials (still needed for some operations)
      - key: FOUNDRY_CLIENT_ID
        value: 5397e07e4277f7d7d5a081dce9645599
      - key: FOUNDRY_CLIENT_SECRET
        sync: false
```

### B. Set Token in Render Dashboard

1. Go to Render dashboard → Your service → Environment
2. Add `FOUNDRY_TOKEN` secret
3. Get token from Foundry: Profile → Settings → Tokens → Create long-lived token
4. Paste token value in Render

---

## Step 6: Add `.npmrc` to Git

Since `.npmrc` uses environment variable placeholder, it's safe to commit:

```bash
cd backend-proxy
git add .npmrc
git add package.json package-lock.json
git add src/osdk/client.js
git commit -m "Configure OSDK with NPM registry"
git push
```

---

## Step 7: Test OSDK

### A. Add Test Endpoint

Add to `src/routes/foundry.js`:

```javascript
import { client as osdkClient, A, FastenClinicalNotes } from '../osdk/client.js';

router.get('/osdk-test', validateTokenWithScopes(['read:patient']), async (req, res) => {
  try {
    if (!osdkClient || typeof osdkClient !== 'function') {
      return res.status(503).json({ 
        error: 'OSDK client not initialized',
        message: 'Using REST API fallback mode'
      });
    }
    
    // Test fetching patient profiles
    const patientResults = await osdkClient(A)
      .fetchPage({ $pageSize: 1 });
    
    // Test fetching clinical notes
    const notesResults = await osdkClient(FastenClinicalNotes)
      .fetchPage({ $pageSize: 1 });
    
    res.json({
      success: true,
      message: 'OSDK is working!',
      results: {
        patients: {
          count: patientResults.data.length,
          hasMore: patientResults.nextPageToken !== undefined
        },
        clinicalNotes: {
          count: notesResults.data.length,
          hasMore: notesResults.nextPageToken !== undefined
        }
      },
      ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check OSDK client logs and verify SDK is installed correctly'
    });
  }
});
```

### B. Test Locally

```bash
cd backend-proxy

# Set your Foundry token
export FOUNDRY_TOKEN="your-token-here"

# Start server
npm start

# In another terminal, test
curl -H "Authorization: Bearer YOUR_AUTH0_TOKEN" \
  http://localhost:3000/api/v1/foundry/osdk-test
```

---

## Step 8: Deploy and Monitor

### A. Deploy to Render

```bash
git push origin main
```

### B. Monitor Logs in Render

Look for these messages:
- ✅ `OSDK client created successfully`
- ✅ `Available object types: A, FastenClinicalNotes, etc.`
- ❌ `Failed to create OSDK client` (if this appears, check token)

### C. Test in Production

```bash
curl https://atlas-backend-proxy.onrender.com/api/v1/foundry/osdk-test \
  -H "Authorization: Bearer YOUR_AUTH0_TOKEN"
```

---

## Troubleshooting

### Issue 1: "Cannot find module '@atlas-dev/sdk'"

**Cause**: NPM registry authentication failed or package not installed.

**Solution**:
```bash
# Check if FOUNDRY_TOKEN is set
echo $FOUNDRY_TOKEN

# If not set, export it
export FOUNDRY_TOKEN="your-token-here"

# Try installing again
npm install
```

### Issue 2: "401 Unauthorized" during npm install

**Cause**: FOUNDRY_TOKEN is invalid or expired.

**Solution**:
1. Go to Foundry Console → Profile → Settings → Tokens
2. Create a new long-lived token
3. Export the new token
4. Run `npm install` again

### Issue 3: "OSDK client created but has unexpected structure"

**Cause**: Version mismatch or incorrect import.

**Solution**:
```bash
# Check installed versions
npm list @osdk/client @atlas-dev/sdk

# Make sure versions match Foundry docs
npm install @osdk/client@^2.4.2 @atlas-dev/sdk@^0.13.0
```

### Issue 4: Certificate errors

**Cause**: Corporate network requires certificates.

**Solution**:
```bash
export NODE_EXTRA_CA_CERTS="/path/to/your/cert.crt"
npm install
```

---

## Comparison: NPM Registry vs Tarball

### NPM Registry (✅ Recommended)
- ✅ Always get latest updates
- ✅ Easier version management
- ✅ Standard npm workflow
- ❌ Requires network access to Foundry
- ❌ Needs token configuration

### Tarball
- ✅ Works offline after download
- ✅ No token needed in production
- ❌ Manual updates required
- ❌ Larger git repository

---

## What Object Types Are Available?

Check what's available in `@atlas-dev/sdk`:

```javascript
// Create a test file: src/test-sdk.js
import * as SDK from '@atlas-dev/sdk';

console.log('Available exports from @atlas-dev/sdk:');
console.log(Object.keys(SDK));

// Run it
node src/test-sdk.js
```

Common object types you might have:
- `A` - AtlasCarePatientProfile
- `FastenClinicalNotes` - Clinical notes from Fasten
- `MedicationsUpload` - Medication data
- `HealthKitRaw` - HealthKit data
- Actions like `createMedicationsUpload`, etc.

---

## Summary Checklist

- [ ] Create `.npmrc` with Foundry registry configuration
- [ ] Add SDK packages to `package.json`
- [ ] Set `FOUNDRY_TOKEN` environment variable
- [ ] Run `npm install` to install SDK
- [ ] Update `src/osdk/client.js` with typed imports
- [ ] Export object types: `A`, `FastenClinicalNotes`, etc.
- [ ] Update routes to use typed object access
- [ ] Add test endpoint `/osdk-test`
- [ ] Test locally with `npm start`
- [ ] Commit `.npmrc`, `package.json`, updated code
- [ ] Set `FOUNDRY_TOKEN` in Render dashboard
- [ ] Deploy to Render
- [ ] Monitor logs for successful initialization
- [ ] Test production endpoint

---

## Next Steps

Once OSDK is working:
1. ✅ Remove "not implemented" errors
2. ✅ Get type safety and autocomplete
3. ✅ Better performance than REST API
4. ✅ Can use Foundry Actions with types
5. ✅ Simplify code with native OSDK methods

Good luck! 🚀


