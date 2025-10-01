# AI Chat History & Transcript Endpoints

## Available Endpoints

### 1. Create AI Chat History (Save)
**Endpoint:** `POST /api/v1/history/chat`  
**Authentication:** Required (JWT Bearer token)  
**Uses:** OSDK client → `createChatHistoryViaOSDK()`

**Request:**
```json
{
  "transcript": "Patient discussed symptoms...",
  "user_id": "auth0|123456789",
  "timestamp": "2025-10-01T12:00:00Z" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chatId": "...",
    "userId": "auth0|123456789",
    "timestamp": "2025-10-01T12:00:00Z"
  },
  "timestamp": "2025-10-01T12:00:00Z",
  "correlationId": "..."
}
```

---

### 2. Get All Chat History (OSDK Style)
**Endpoint:** `GET /v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction`  
**Authentication:** Required (JWT Bearer token)  
**Uses:** OSDK client → `fetchPage()`

**Query Parameters:**
- `pageSize` (optional, default: 30, max: 100)
- `nextPageToken` (optional, for pagination)
- `select` (optional, comma-separated fields)
- `includeRid` (optional, true/false)

**Response:**
```json
{
  "data": [
    {
      "chatId": "...",
      "transcript": "...",
      "userId": "auth0|123456789",
      "timestamp": "2025-10-01T12:00:00Z"
    }
  ],
  "nextPageToken": "...",
  "hasMore": true
}
```

---

### 3. Get User-Specific Chat History
**Endpoint:** `GET /user/:userId/chat-history`  
**Authentication:** Required (JWT Bearer token)  
**Uses:** OSDK client → `searchByUserId()`  
**Security:** Users can only access their own history (verified via JWT)

**Example:** `GET /user/auth0|123456789/chat-history?pageSize=50`

**Response:**
```json
{
  "userId": "auth0|123456789",
  "chatHistory": [
    {
      "chatId": "...",
      "transcript": "...",
      "timestamp": "2025-10-01T12:00:00Z"
    }
  ],
  "count": 10
}
```

---

### 4. Search Chat History (OSDK Style)
**Endpoint:** `POST /v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction/search`  
**Authentication:** Required (JWT Bearer token)  
**Uses:** OSDK client → `searchByUserId()`

**OSDK-Style Request (Recommended):**
```json
{
  "where": {
    "userId": { "$eq": "auth0|123456789" }
  },
  "pageSize": 30,
  "select": ["chatId", "transcript", "timestamp"],
  "includeRid": false
}
```

**Legacy Format (Still Supported):**
```json
{
  "where": {
    "field": "userId",
    "type": "eq",
    "value": "auth0|123456789"
  },
  "pageSize": 30
}
```

**Response:** Same as endpoint #2

---

### 5. Generate Transcript Summary (LLM)
**Endpoint:** `POST /api/v1/foundry/transcription-summary`  
**Authentication:** Required (JWT Bearer token with `execute:queries` scope)  
**Uses:** Foundry Query (not an OSDK action)

**Request:**
```json
{
  "auth0Id": "auth0|123456789",
  "rawTranscript": "Full transcript text here..."
}
```

**Response:**
```json
{
  "summary": "Generated summary from LLM..."
}
```

---

## Common Issues & Solutions

### Issue 1: "Endpoint not found" (404)

**Possible causes:**
1. Wrong URL path
2. Missing authentication
3. Route registration order issue

**Check:**
```bash
# Test if endpoint exists
curl -I https://atlas-backend-proxy.onrender.com/api/v1/history/chat

# Should return 401 (needs auth) or 405 (wrong method), NOT 404
```

### Issue 2: OSDK client errors

**Symptoms:**
- "OSDK client not available"
- Falls back to REST API

**Check deployment logs for:**
```
✅ Successfully imported @atlas-dev/sdk object types
✅ OSDK client created and wrapped successfully
```

### Issue 3: Authorization errors

**Symptoms:**
- 403 Forbidden
- "You can only access your own chat history"

**Solution:**
- Ensure JWT token's `sub` matches the requested `userId`
- Check token has required scopes: `execute:actions`

---

## Testing Endpoints

### Test 1: Create Chat History
```bash
curl -X POST https://atlas-backend-proxy.onrender.com/api/v1/history/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Test chat transcript",
    "user_id": "auth0|YOUR_USER_ID"
  }'
```

### Test 2: Get User Chat History
```bash
curl https://atlas-backend-proxy.onrender.com/user/auth0|YOUR_USER_ID/chat-history \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test 3: Get All Chat History (OSDK Path)
```bash
curl "https://atlas-backend-proxy.onrender.com/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction?pageSize=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting Steps

1. **Check if service is running:**
   ```bash
   curl https://atlas-backend-proxy.onrender.com/health
   ```

2. **Check OSDK initialization:**
   Look for these in deployment logs:
   - `✅ Successfully imported @atlas-dev/sdk object types`
   - `✅ OSDK object types available: A, FastenClinicalNotes`

3. **Test specific endpoint:**
   ```bash
   # This should return 401, not 404
   curl -I https://atlas-backend-proxy.onrender.com/api/v1/history/chat
   ```

4. **Check JWT token:**
   - Decode JWT at jwt.io
   - Verify `sub` claim exists
   - Check token hasn't expired

5. **Review error logs:**
   Check Render dashboard logs for specific error messages

---

## What iOS App Should Call

For a typical chat history feature:

### Saving a chat:
```swift
POST /api/v1/history/chat
{
  "transcript": transcriptText,
  "user_id": currentUserId,
  "timestamp": ISO8601DateFormatter().string(from: Date())
}
```

### Loading chat history:
```swift
GET /user/\(userId)/chat-history?pageSize=50
```

### Generating summary:
```swift
POST /api/v1/foundry/transcription-summary
{
  "auth0Id": userId,
  "rawTranscript": fullTranscript
}
```

