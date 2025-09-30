# Patient Profile Integration Steps

## Quick Integration Guide

Follow these steps to integrate the patient profile update functionality into your backend proxy.

---

## Step 1: Add New Service Files

The following files have been created:

1. **`src/services/patient-profile-service.js`** - Core service for Foundry ontology operations
2. **`src/routes/patient-profile.js`** - Express routes for patient profile endpoints

---

## Step 2: Update `src/server.js`

### Add Import (CommonJS)

If using CommonJS (`require`):
```javascript
const patientProfileRouter = require('./routes/patient-profile');
```

### Add Import (ES Modules)

If using ES modules (`import`):
```javascript
import { patientProfileRouter } from './routes/patient-profile.js';
```

### Register Route

Add this line with your other route registrations:
```javascript
// Patient profile routes (requires Auth0 token)
app.use('/api/v1/patient-profile', patientProfileRouter);
```

**Full Example:**
```javascript
// ... existing imports ...
import { patientProfileRouter } from './routes/patient-profile.js';

// ... middleware setup ...

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/foundry', foundryRouter);
app.use('/api/v1/patient-profile', patientProfileRouter); // NEW
// ... other routes ...
```

---

## Step 3: Update Environment Variables

Add these variables to your `.env` file:

```bash
# Foundry Configuration
FOUNDRY_BASE_URL=https://atlasengine.palantirfoundry.com/api
FOUNDRY_SERVICE_TOKEN=your_foundry_service_token_here
ONTOLOGY_RID=ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194

# Auth0 Configuration (should already exist)
AUTH0_AUDIENCE=https://your-api.com
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
```

---

## Step 4: Convert to ES Modules (if needed)

If your project uses CommonJS, convert the new files:

### `src/services/patient-profile-service.js`

Change imports:
```javascript
// From:
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

// To:
const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
```

Change exports:
```javascript
// From:
export class PatientProfileService { ... }

// To:
class PatientProfileService { ... }
module.exports = PatientProfileService;
```

### `src/routes/patient-profile.js`

Change imports:
```javascript
// From:
import express from 'express';
import { auth } from 'express-oauth2-jwt-bearer';

// To:
const express = require('express');
const { auth } = require('express-oauth2-jwt-bearer');
```

Change exports:
```javascript
// From:
export default router;

// To:
module.exports = router;
```

---

## Step 5: Test the Integration

### 5.1 Start the Server

```bash
cd backend-proxy
npm install  # Install any missing dependencies
npm start
```

### 5.2 Test Health Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 5.3 Test Profile Update (with Auth0 token)

```bash
# Get Auth0 token first
export AUTH0_TOKEN="your_auth0_access_token"

# Test profile update
curl -X POST http://localhost:3000/api/v1/patient-profile/update \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateOfBirth": "1990-01-15",
    "birthSex": "Male",
    "pronouns": "he/him",
    "familyMedicalHistory": ["Heart Disease"],
    "healthKitAuthorized": true
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { ... }
}
```

### 5.4 Test Profile Fetch

```bash
curl -X GET http://localhost:3000/api/v1/patient-profile \
  -H "Authorization: Bearer $AUTH0_TOKEN"
```

---

## Step 6: Update iOS App

### 6.1 Update Config

In `WrapFast/Horizon/Config/BackendProxyConfig.swift`:

```swift
enum BackendProxyConfig {
    static let baseURL: URL = {
        #if DEBUG
        return URL(string: "http://localhost:3000")!
        #else
        return URL(string: "https://your-production-url.com")!
        #endif
    }()
}
```

### 6.2 Add Service Method

In `WrapFast/Horizon/Integrations/Backend/BackendProxyPatientService.swift`:

```swift
public func updatePatientProfile(
    dateOfBirth: Date?,
    birthSex: String?,
    pronouns: String?,
    emergencyContactName: String?,
    emergencyContactPhone: String?,
    familyMedicalHistory: [String]?,
    healthKitAuthorized: Bool
) async throws {
    guard let snapshot = OAuthTokenStore.shared.snapshot(), snapshot.isValid else {
        throw BackendProxyError.unauthorized
    }
    
    let url = baseURL
        .appendingPathComponent("api")
        .appendingPathComponent("v1")
        .appendingPathComponent("patient-profile")
        .appendingPathComponent("update")
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(snapshot.accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    
    let payload: [String: Any?] = [
        "dateOfBirth": dateOfBirth.map { formatter.string(from: $0) },
        "birthSex": birthSex,
        "pronouns": pronouns,
        "emergencyContactName": emergencyContactName,
        "emergencyContactPhone": emergencyContactPhone,
        "familyMedicalHistory": familyMedicalHistory,
        "healthKitAuthorized": healthKitAuthorized
    ]
    
    let jsonData = try JSONSerialization.data(
        withJSONObject: payload.compactMapValues { $0 }
    )
    request.httpBody = jsonData
    
    let (_, response) = try await session.data(for: request)
    
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw BackendProxyError.serverError("Failed to update profile")
    }
    
    Logger.log(message: "Successfully updated patient profile", event: .info)
}
```

### 6.3 Call from Setup Flow

In `WrapFast/Horizon/Features/Setup/Views/SetupView.swift`:

```swift
private func completeSetup() async {
    do {
        // ... existing account creation ...
        
        // Sync setup data to ontology
        if FeatureFlags.useAuth0Backend {
            let service = BackendProxyPatientService()
            let familyHistory = setupData.familyHistory.map { $0.rawValue }
            
            try await service.updatePatientProfile(
                dateOfBirth: setupData.birthDate,
                birthSex: setupData.birthSex.rawValue,
                pronouns: nil,
                emergencyContactName: nil,
                emergencyContactPhone: nil,
                familyMedicalHistory: familyHistory,
                healthKitAuthorized: setupData.healthKitAuthorized
            )
            
            Logger.log(message: "Setup data synced to ontology", event: .info)
        }
        
        hasCompletedSetup = true
    } catch {
        Logger.log(message: "Setup failed: \(error)", event: .error)
    }
}
```

---

## Step 7: Verify in Foundry

### 7.1 Check Ontology Object

1. Go to Foundry Console
2. Navigate to Ontology: `ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194`
3. Open "Atlas Patient Profiles" (object type A)
4. Search for your test user by `user_id`
5. Verify new fields are populated:
   - `date_of_birth`
   - `birth_sex`
   - `pronouns`
   - `emergency_contact_name`
   - `emergency_contact_phone`
   - `family_medical_history`
   - `health_kit_authorized`
   - `health_kit_authorization_date`

### 7.2 Check Action History

1. In Foundry, go to Actions → `edit-a`
2. View Recent Executions
3. Verify your test update appears
4. Check parameters were correctly applied

---

## Step 8: Deploy to Production

### 8.1 Backend Deployment

If using Render:

```bash
cd backend-proxy
git add .
git commit -m "Add patient profile update endpoints"
git push origin main
```

Update Render environment variables:
- `FOUNDRY_SERVICE_TOKEN`
- `ONTOLOGY_RID`

### 8.2 iOS Deployment

1. Update `BackendProxyConfig.swift` with production URL
2. Test in staging/TestFlight first
3. Verify all fields sync correctly
4. Deploy to App Store

---

## Troubleshooting

### Issue: "Foundry service token not configured"

**Solution:** Ensure `FOUNDRY_SERVICE_TOKEN` is set in `.env`:
```bash
echo "FOUNDRY_SERVICE_TOKEN=your_token_here" >> .env
```

### Issue: "Failed to search for profile"

**Solution:** Check Foundry token has read permissions on ontology:
```bash
curl -H "Authorization: Bearer $FOUNDRY_SERVICE_TOKEN" \
  https://atlasengine.palantirfoundry.com/api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/A
```

### Issue: "Failed to apply edit-a action"

**Solution:** Verify action exists and token has write permissions:
```bash
curl -X POST \
  https://atlasengine.palantirfoundry.com/api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/actions/edit-a/apply \
  -H "Authorization: Bearer $FOUNDRY_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parameters": {"A": "test_id", "first_name": "Test"}}'
```

### Issue: Auth0 token validation fails

**Solution:** Check Auth0 configuration:
```bash
# Verify audience and issuer are correct
echo "AUTH0_AUDIENCE=$AUTH0_AUDIENCE"
echo "AUTH0_ISSUER_BASE_URL=$AUTH0_ISSUER_BASE_URL"
```

### Issue: CORS errors in iOS

**Solution:** Add CORS middleware in `server.js`:
```javascript
app.use(cors({
  origin: ['https://your-ios-app.com'],
  credentials: true
}));
```

---

## Monitoring & Logging

### Check Logs

```bash
# Backend proxy logs
tail -f logs/app.log

# Foundry action logs (in Foundry Console)
# Go to Actions → edit-a → Executions
```

### Track Requests

Each request includes a correlation ID for tracing:
```bash
curl -X POST ... \
  -H "X-Correlation-Id: $(uuidgen)" \
  ...
```

Search logs by correlation ID:
```bash
grep "correlation-id-here" logs/app.log
```

---

## Security Checklist

- [ ] Foundry service token stored in environment variables (not code)
- [ ] Auth0 JWT validation enabled on all endpoints
- [ ] HTTPS enforced in production
- [ ] No PHI/PII logged in plain text
- [ ] Rate limiting enabled
- [ ] Input validation on all fields
- [ ] CORS configured for iOS app domain only
- [ ] Error messages don't expose sensitive data

---

## Next Steps

1. ✅ Add backend service and routes
2. ✅ Update environment variables
3. ⬜ Test locally with Postman/curl
4. ⬜ Update iOS service layer
5. ⬜ Integrate with setup flow
6. ⬜ Test end-to-end
7. ⬜ Deploy to staging
8. ⬜ QA testing
9. ⬜ Deploy to production

---

**Need Help?**

See full API documentation in `PATIENT_PROFILE_API_GUIDE.md`

**Status:** Ready for integration  
**Last Updated:** 2025-09-30
