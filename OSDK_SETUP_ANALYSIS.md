# OSDK Setup Analysis and Fixes

## Current Status: ❌ OSDK Not Working Correctly

### Issues Identified

#### 1. **Wrong Ontology RID in Example** ⚠️
The example code from Foundry shows:
```typescript
const ontologyRid: string = "ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58";
```

**But this is DIFFERENT from your actual ontology RID:**
- **Example shows**: `ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58`
- **Your production uses**: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194` (API format)
- **Your OSDK env var**: `ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58`

**This mismatch is likely causing the "not implemented" errors in your logs.**

#### 2. **Multiple Ontology RID Formats Creating Confusion**
Your codebase has THREE different ontology RID references:

1. **OSDK Format** (for OSDK client): `ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58`
2. **API Format** (for REST API): `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`
3. **Hardcoded** (in some files): `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`

#### 3. **OSDK Client Failing with "not implemented"**
From your logs:
```json
{"error":"not implemented","level":"warn","message":"OSDK client initialization failed"}
{"error":"not implemented","level":"warn","message":"OSDK failed for dashboard profile, trying REST API fallback"}
```

This indicates the OSDK client is initializing but failing to execute operations.

#### 4. **Missing Scopes (Potentially)**
The example shows these scopes that you might be missing:
```javascript
"api:use-admin-read",
"api:use-admin-write",
```

---

## Root Cause Analysis

### The Ontology RID Mismatch
Looking at your configuration:

```javascript
// render.yaml (lines 34-37)
FOUNDRY_ONTOLOGY_RID=ri.ontology.main.ontology.8208fd4c-b7fb-45ef-bf49-99a402136e58
FOUNDRY_ONTOLOGY_API_NAME=ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194
```

**These are TWO DIFFERENT ontologies!**

The UUID in the OSDK format (`8208fd4c-b7fb-45ef-bf49-99a402136e58`) is different from the UUID in the API format (`151e0d3d-719c-464d-be5c-a6dc9f53d194`).

### Where Are They Used?

1. **OSDK Client** uses `FOUNDRY_ONTOLOGY_RID` (`8208fd4c...`)
2. **REST API calls** use `FOUNDRY_ONTOLOGY_API_NAME` (`151e0d3d...`)
3. **Hardcoded values** in patient.js, atlasIntraencounterService.js use `ontology-151e0d3d...`

**This means OSDK is querying a DIFFERENT ontology than your REST API calls!**

---

## Solution

### Step 1: Determine the Correct Ontology RID

You need to find out which ontology RID is correct. There are two possibilities:

#### Option A: The working ontology is `151e0d3d-719c-464d-be5c-a6dc9f53d194`
This appears to be correct because:
- Your REST API calls work with this ontology
- It's hardcoded in working services
- Your logs show successful REST API searches

**If this is correct**, update your OSDK configuration to:
```bash
FOUNDRY_ONTOLOGY_RID=ri.ontology.main.ontology.151e0d3d-719c-464d-be5c-a6dc9f53d194
```

#### Option B: You have two separate ontologies
- One for patient data (`151e0d3d...`)
- One for something else (`8208fd4c...`)

**If this is correct**, you need to clarify what each ontology is for.

### Step 2: Verify in Foundry Console

1. Go to your Foundry instance: `https://atlasengine.palantirfoundry.com`
2. Navigate to **Ontology Manager**
3. Check which ontologies you have access to
4. Verify the RID for your **AtlasCarePatientProfile** object type
5. Check if object type **A** exists in the ontology

### Step 3: Update Configuration

Once you've verified the correct ontology RID, update these files:

#### A. Environment Variables (render.yaml)
```yaml
- key: FOUNDRY_ONTOLOGY_RID
  value: ri.ontology.main.ontology.151e0d3d-719c-464d-be5c-a6dc9f53d194  # Use the CORRECT UUID
- key: FOUNDRY_ONTOLOGY_API_NAME
  value: ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194  # Same UUID, different format
```

#### B. Check OSDK Scopes
Add the admin scopes to your OSDK client if needed:

```javascript
// src/osdk/client.js
const DEFAULT_SCOPES = [
    'api:use-ontologies-read',
    'api:use-ontologies-write',
    'api:use-admin-read',        // ADD THIS
    'api:use-admin-write',        // ADD THIS
    'api:use-datasets-read',
    // ... rest of scopes
];
```

### Step 4: Remove Hardcoded Ontology RIDs

These files have hardcoded ontology RIDs that should use environment variables:

1. **src/services/atlasIntraencounterService.js** (line 13):
   ```javascript
   // BEFORE (HARDCODED):
   this.ontologyRid = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
   
   // AFTER (USE ENV VAR):
   this.ontologyRid = process.env.FOUNDRY_ONTOLOGY_API_NAME;
   ```

2. **src/services/patient-profile-service.js** (line 10):
   ```javascript
   // BEFORE (HARDCODED):
   const ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_API_NAME 
     || process.env.ONTOLOGY_RID 
     || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
   
   // AFTER (NO HARDCODED FALLBACK):
   const ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_API_NAME;
   if (!ONTOLOGY_RID) {
     throw new Error('FOUNDRY_ONTOLOGY_API_NAME environment variable is required');
   }
   ```

3. **src/routes/patient.js** (lines 266, 335):
   ```javascript
   // BEFORE (HARDCODED):
   ontologyRid: 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194',
   
   // AFTER (USE VARIABLE):
   ontologyRid: osdkOntologyRid,
   ```

---

## Recommended Configuration

### Correct Setup for Single Ontology

If you're using a single ontology (most likely):

```javascript
// .env or render.yaml
FOUNDRY_ONTOLOGY_RID=ri.ontology.main.ontology.151e0d3d-719c-464d-be5c-a6dc9f53d194
FOUNDRY_ONTOLOGY_API_NAME=ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194
```

### Expected OSDK Client Setup

Your OSDK client should look like this:

```javascript
// src/osdk/client.js
import { createClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

const clientId = process.env.FOUNDRY_CLIENT_ID;  // "5397e07e4277f7d7d5a081dce9645599"
const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;
const host = process.env.FOUNDRY_HOST;  // "https://atlasengine.palantirfoundry.com"
const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID;  // "ri.ontology.main.ontology.151e0d3d..."

const scopes = [
  'api:use-ontologies-read',
  'api:use-ontologies-write',
  'api:use-admin-read',
  'api:use-admin-write',
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

const auth = createConfidentialOauthClient(clientId, clientSecret, host, scopes);
const client = createClient(host, ontologyRid, auth);

export { client };
```

---

## Testing the Fix

### 1. Verify Ontology RID
```bash
# SSH into your Render instance or test locally
curl -X POST "https://atlasengine.palantirfoundry.com/api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/A/search" \
  -H "Authorization: Bearer $FOUNDRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {
      "type": "eq",
      "field": "user_id",
      "value": "test"
    },
    "pageSize": 1
  }'
```

### 2. Test OSDK Client
Add this test endpoint to verify OSDK is working:

```javascript
// Add to src/routes/foundry.js
router.get('/test-osdk', async (req, res) => {
  try {
    if (!client || typeof client !== 'function') {
      return res.status(503).json({ 
        error: 'OSDK client not available',
        usingRestApi: true 
      });
    }
    
    const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID;
    const testResult = await client
      .ontology(ontologyRid)
      .objects('A')
      .fetchPage({ $pageSize: 1 });
    
    res.json({
      success: true,
      osdkWorking: true,
      resultCount: testResult.data.length,
      ontologyRid
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      osdkWorking: false,
      stack: error.stack
    });
  }
});
```

### 3. Check Logs
After deployment, check for these log messages:
- ✅ `OSDK client created successfully with ontology method`
- ❌ `OSDK client initialization failed` (should not appear)

---

## Next Steps

1. **Verify the correct ontology RID** in Foundry Console
2. **Update render.yaml** with the correct UUID
3. **Remove hardcoded ontology RIDs** from code
4. **Add admin scopes** to OSDK client
5. **Deploy and test** with the `/api/v1/foundry/test-osdk` endpoint
6. **Monitor logs** for OSDK errors

---

## Expected Outcome

After fixing:
- ✅ OSDK client should initialize successfully
- ✅ No more "not implemented" errors
- ✅ Dashboard should use OSDK instead of falling back to REST API
- ✅ Improved performance from using OSDK native methods
- ✅ Consistent ontology RID across all services

---

## Questions to Answer

1. **What is ontology `8208fd4c-b7fb-45ef-bf49-99a402136e58` for?**
   - Is this a different ontology than your patient data?
   - Was this copied from an example by mistake?

2. **Which object types are in each ontology?**
   - Does `A` (AtlasCarePatientProfile) exist in `151e0d3d` ontology?
   - Does it exist in `8208fd4c` ontology?

3. **Do you need both ontologies or just one?**
   - If just one, use `151e0d3d` for everything
   - If both, clarify which is for what purpose


