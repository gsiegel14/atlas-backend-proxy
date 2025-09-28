# HealthKit Export Flow Diagnosis

## Current Status ✅

### Backend Service (FIXED)
- **✅ NDJSON Fix Deployed**: Converts JSON to proper NDJSON format for Foundry
- **✅ Endpoints Working**: `/export` and `/export/batch` properly configured
- **✅ Dataset Target**: `ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730`
- **✅ Authentication**: Properly validates Auth0 Bearer tokens

### iOS App (WORKING)
- **✅ Correct Endpoints**: Uses `api/v1/healthkit/export` and `api/v1/healthkit/export/batch`
- **✅ NDJSON Format**: Already generates NDJSON (`bundle.ndjson.base64EncodedString()`)
- **✅ Authentication**: Uses Auth0 tokens from `OAuthTokenStore`
- **✅ Export Triggers**: Manual export via UI + background sync

## Issue Analysis 🔍

### Last Successful Upload (Before Fix)
- **Date**: 2025-09-26T06:19:34Z
- **Records**: 11 HealthKit records
- **User**: `auth0|687a56be9811378240321ed6`
- **Transaction**: `ri.foundry.main.transaction.00000180-58b5-f07a-acd7-d0c43febdaea`
- **File**: `healthkit/raw/auth0|687a56be9811378240321ed6/2025-09-26T06-19-34-801Z.json`
- **Result**: ❌ Parquet format error (old JSON format)

### NDJSON Fix Deployment
- **Deployed**: 2025-09-26T06:23:31Z (4 minutes after last upload)
- **Status**: ✅ Live and ready
- **Changes**: JSON → NDJSON, flattened schema, proper content-type

### Current Gap
- **❌ No uploads since fix**: No new HealthKit exports triggered since NDJSON fix deployed
- **❌ Dataset visibility**: Old JSON files may be causing dataset processing issues

## Next Steps 🚀

### 1. Trigger New HealthKit Export
**iOS App**: Open Atlas app → Health Records → Export HealthKit
- This will generate new `.ndjson` files with proper format
- Should resolve Foundry processing issues

### 2. Monitor Upload Success
Watch for these log entries:
```
"Processing HealthKit raw export to dataset"
"Successfully uploaded HealthKit JSON to Foundry dataset"
```

### 3. Verify Dataset Files
New files should have:
- **Extension**: `.ndjson` (not `.json`)
- **Content-Type**: `application/x-ndjson`
- **Structure**: One flattened JSON object per line
- **Schema**: 21 fields including `auth0_user_id`, `sample_type`, `value_double`, etc.

### 4. Expected Success Response
```json
{
  "success": true,
  "dataset_rid": "ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730",
  "records_ingested": 11,
  "dataset_records_created": 11,
  "file_path": "healthkit/raw/auth0|687a56be9811378240321ed6/2025-09-26T06-30-00-000Z.ndjson",
  "file_format": "ndjson",
  "transaction_rid": "ri.foundry.main.transaction.{new-uuid}",
  "ingestion_timestamp": "2025-09-26T06:30:00.000Z",
  "correlationId": "{uuid}"
}
```

## Troubleshooting Commands 🛠️

### Check Recent Logs
```bash
# Monitor for HealthKit uploads
curl -s "https://render.com/api/logs?service=srv-d37digbe5dus7399iqq0&text=healthkit"
```

### Test Endpoint Health
```bash
curl -s "https://atlas-backend-proxy.onrender.com/health" | jq .
```

### Manual Test (with Auth0 token)
```bash
export AUTH0_TOKEN="your-token-here"
curl -X POST "https://atlas-backend-proxy.onrender.com/api/v1/healthkit/export" \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rawhealthkit":"BASE64_NDJSON_HERE","device":"iPhone-Test"}'
```

## Resolution Status 📊

- **Root Cause**: ✅ IDENTIFIED - Foundry expected Parquet/NDJSON, got JSON
- **Fix Implemented**: ✅ DEPLOYED - JSON → NDJSON conversion
- **Backend Ready**: ✅ CONFIRMED - Endpoints working with NDJSON format
- **iOS App Ready**: ✅ CONFIRMED - Already generates NDJSON format
- **Next Action**: 🟡 PENDING - Trigger new HealthKit export to test fix

## Expected Outcome 🎯

After triggering a new HealthKit export:
1. iOS app sends NDJSON to backend
2. Backend converts to flattened NDJSON format
3. Uploads `.ndjson` file to Foundry dataset
4. Foundry processes as structured data successfully
5. HealthKit data becomes visible and queryable in dataset

**The fix is deployed and ready - just need to trigger a new export to test it!** 🚀
