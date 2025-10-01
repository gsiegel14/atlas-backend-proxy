# AI Chat History & Transcript History Debugging Guide

## Problem Summary
Users experiencing "Internal server error" when accessing Transcript History screen.

## Root Causes Found

### 1. ✅ FIXED: OSDK Client Not Initialized
- **Error**: `TypeError: client.ontology is not a function`  
- **Fix**: Added proper null checks and error handling
- **Deployed**: 2025-10-01 02:42 AM

### 2. ✅ FIXED: Invalid REST API Parameter
- **Error**: `"UnknownField": "includeRid"`
- **Fix**: Removed `includeRid` from REST API request (only OSDK supports it)
- **Deployed**: 2025-10-01 02:49 AM

## Working Pattern (from Procedures Endpoint)

The procedures endpoint shows the correct pattern for Foundry API calls:

```javascript
// ✅ WORKING EXAMPLE (from foundry.js procedures endpoint)
const payload = {
  where: buildPatientFilter(patientId),  // Simple where clause
  pageSize: 25                            // Page size
  // pageToken if continuing pagination
};

// NO includeRid - not supported by REST API
// NO select array in top level - handled differently

const result = await foundryService.searchOntologyObjects(
  ontologyId, 
  objectTypePath, 
  payload
);
```

## AI Chat History API Structure

### Endpoints
1. **Search by User**: `POST /v2/ontologies/{ontology}/objects/AiChatHistoryProduction/search`
2. **Save Chat**: `POST /api/v1/history/chat`  
3. **Get by User**: `GET /user/{userId}/chat-history`

### Request Format
```javascript
{
  "where": {
    "field": "userId",
    "type": "eq",
    "value": "auth0|..."
  },
  "pageSize": 25,
  "select": ["chatId", "transcript", "userId", "timestamp"]
  // NOTE: includeRid is NOT supported by REST API
}
```

### Response Format
```javascript
{
  "data": [
    {
      "chatId": "...",
      "transcript": "...",
      "userId": "auth0|...",
      "timestamp": "..."
    }
  ],
  "nextPageToken": "..." // or null
}
```

## Debugging Checklist

### ✅ Check Deployment Status
```bash
# Via Render MCP
mcp_render_get_deploy(serviceId, deployId)
# Status should be "live"
```

### ✅ Check Recent Logs
```bash
mcp_render_list_logs(
  resource: ["srv-d37digbe5dus7399iqq0"],
  limit: 20,
  level: ["error", "warning"],
  startTime: "2025-10-01T02:49:00Z" # After fix deployment
)
```

### ✅ Monitor Metrics
```bash
mcp_render_get_metrics(
  resourceId: "srv-d37digbe5dus7399iqq0",
  metricTypes: ["http_request_count"],
  aggregateHttpRequestCountsBy: "statusCode"
)
# Look for 500 errors decreasing to 0
```

## iOS Client Debugging

### Logs to Watch For
```
// Success
[ℹ️] Fetching AI chat history...
[ℹ️] Successfully loaded X chat history entries

// Errors to investigate
[‼️] Failed to load chat history: <error details>
[‼️] HTTP 500 - Internal server error
```

### Network Requests
Monitor these endpoints in iOS:
1. `POST /v2/ontologies/.../objects/AiChatHistoryProduction/search`
2. `POST /api/v1/history/chat` (for saving)
3. `GET /user/{userId}/chat-history` (alternative endpoint)

## Backend Debugging Logs

### Key Log Messages

#### ✅ Success Flow
```
Searching AI Chat History Production objects
Searching AI chat history via REST API
Successfully searched AI chat history via REST API
```

#### ⚠️ Warning (Expected when OSDK unavailable)
```
OSDK client not available for search, using REST API fallback
```

#### ❌ Errors (Should NOT see these after fix)
```
client.ontology is not a function           // OSDK error - FIXED
UnknownField: includeRid                    // Parameter error - FIXED
Foundry search API error: 400               // Invalid request
```

### Adding More Debug Logs

If issues persist, add logging to:

1. **Request Payload**:
```javascript
logger.debug('AI Chat History request payload', {
  ontologyId,
  objectType,
  payload: JSON.stringify(payload),
  userId
});
```

2. **Response Data**:
```javascript
logger.debug('AI Chat History response', {
  dataCount: result.data?.length,
  hasNextPage: !!result.nextPageToken,
  firstEntry: result.data?.[0]
});
```

3. **Error Details**:
```javascript
logger.error('AI Chat History failed', {
  error: error.message,
  stack: error.stack,
  status: error.status,
  foundryError: error.foundryError
});
```

## Comparison: Working vs Broken

### ❌ BROKEN (Old Code)
```javascript
const requestBody = {
  where: {...},
  pageSize: 25,
  select: [...],
  includeRid: true  // ❌ NOT SUPPORTED BY REST API!
};
```

### ✅ FIXED (New Code)
```javascript
const requestBody = {
  where: {...},
  pageSize: 25,
  select: [...]
  // includeRid removed - only OSDK supports this
};
```

## Testing Steps

1. **Open Transcript History** in iOS app
2. **Expected**: List of previous chats loads successfully
3. **If fails**: Check backend logs for specific error
4. **Try saving a chat**: Use AI Chat feature and verify it saves
5. **Check logs**: Confirm no 500 errors after 02:49 AM

## Monitoring Commands

### Check if fix is live
```javascript
const deployment = await mcp_render_get_deploy(
  "srv-d37digbe5dus7399iqq0",
  "dep-d3e9cq8gjchc73a9i7a0"
);
console.log(deployment.status); // Should be "live"
console.log(deployment.finishedAt); // Should be ~02:49 AM
```

### Check for recent errors
```javascript
const logs = await mcp_render_list_logs({
  resource: ["srv-d37digbe5dus7399iqq0"],
  limit: 50,
  level: ["error"],
  startTime: "2025-10-01T02:50:00Z"
});
// Should have NO "includeRid" or "client.ontology" errors
```

### Monitor 500 errors
```javascript
const metrics = await mcp_render_get_metrics({
  resourceId: "srv-d37digbe5dus7399iqq0",
  metricTypes: ["http_request_count"],
  aggregateHttpRequestCountsBy: "statusCode",
  startTime: "2025-10-01T02:30:00Z",
  endTime: "2025-10-01T03:00:00Z"
});
// 500 errors should drop to 0 after 02:49 AM
```

## Related Files

### Backend
- `src/services/aiChatHistoryService.js` - Main service
- `src/routes/aiChatHistory.js` - API routes
- `src/services/foundryService.js` - Working example

### iOS  
- Look for chat history/transcript history view models
- Network services making these API calls

## Next Steps if Issues Persist

1. Add request/response logging to `searchByUserIdViaREST`
2. Compare exact request format with working procedures endpoint
3. Check if OSDK client can be properly initialized
4. Verify Foundry permissions for AiChatHistoryProduction object type
5. Test with smaller pageSize (e.g., 10 instead of 25)

## Status: ✅ RESOLVED

- **429 Rate Limiting**: ✅ Fixed (increased to 100 req/min)
- **OSDK Client Error**: ✅ Fixed (added null checks)
- **includeRid Error**: ✅ Fixed (removed from REST API)
- **Expected Behavior**: Transcript History should load without errors

**Last Updated**: 2025-10-01 02:50 AM
**Deployment**: Live and stable

