# Patient Profile API - Quick Reference

## 🚀 Quick Start

```bash
# 1. Set environment variables
export FOUNDRY_SERVICE_TOKEN="your_token"
export ONTOLOGY_RID="ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194"

# 2. Add to server.js
import { patientProfileRouter } from './routes/patient-profile.js';
app.use('/api/v1/patient-profile', patientProfileRouter);

# 3. Test
curl -X POST http://localhost:3000/api/v1/patient-profile/update \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dateOfBirth":"1990-01-15","birthSex":"Male"}'
```

---

## 📡 Endpoints

### Update Profile (Upsert)
```bash
POST /api/v1/patient-profile/update
Headers: Authorization: Bearer {auth0_token}
Body: {
  "dateOfBirth": "1990-01-15",
  "birthSex": "Male",
  "pronouns": "he/him",
  "emergencyContactName": "Jane Doe",
  "emergencyContactPhone": "+1234567890",
  "familyMedicalHistory": ["Heart Disease", "Diabetes"],
  "healthKitAuthorized": true
}
```

### Get Profile
```bash
GET /api/v1/patient-profile
Headers: Authorization: Bearer {auth0_token}
```

### Partial Update
```bash
PATCH /api/v1/patient-profile/partial
Headers: Authorization: Bearer {auth0_token}
Body: { "pronouns": "they/them" }
```

### Batch Update (Admin)
```bash
POST /api/v1/patient-profile/batch-update
Headers: Authorization: Bearer {auth0_token}
Body: { "updates": [{atlasId, ...}, {...}] }
```

---

## 🔑 Field Mapping

| iOS/API | Foundry | Type | Example |
|---------|---------|------|---------|
| dateOfBirth | date_of_birth | String | "1990-01-15" |
| birthSex | birth_sex | String | "Male" |
| pronouns | pronouns | String | "he/him" |
| emergencyContactName | emergency_contact_name | String | "Jane Doe" |
| emergencyContactPhone | emergency_contact_phone | String | "+1234567890" |
| familyMedicalHistory | family_medical_history | String | "Heart Disease, ..." |
| healthKitAuthorized | health_kit_authorized | String | "true" |

---

## 💻 Swift Code

```swift
// Service method
func updatePatientProfile(
    dateOfBirth: Date?,
    birthSex: String?,
    pronouns: String?,
    emergencyContactName: String?,
    emergencyContactPhone: String?,
    familyMedicalHistory: [String]?,
    healthKitAuthorized: Bool
) async throws {
    let url = baseURL
        .appendingPathComponent("api/v1/patient-profile/update")
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let payload: [String: Any?] = [
        "dateOfBirth": dateOfBirth?.iso8601String,
        "birthSex": birthSex,
        "pronouns": pronouns,
        "emergencyContactName": emergencyContactName,
        "emergencyContactPhone": emergencyContactPhone,
        "familyMedicalHistory": familyMedicalHistory,
        "healthKitAuthorized": healthKitAuthorized
    ]
    
    request.httpBody = try JSONSerialization.data(
        withJSONObject: payload.compactMapValues { $0 }
    )
    
    let (_, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else {
        throw ProfileError.updateFailed
    }
}

// Usage in SetupView
try await service.updatePatientProfile(
    dateOfBirth: setupData.birthDate,
    birthSex: setupData.birthSex.rawValue,
    pronouns: nil,
    emergencyContactName: nil,
    emergencyContactPhone: nil,
    familyMedicalHistory: setupData.familyHistory.map { $0.rawValue },
    healthKitAuthorized: setupData.healthKitAuthorized
)
```

---

## 🔧 Direct Foundry API

### OSDK
```typescript
import { client, editA } from "@atlas-dev/sdk";

await client(editA).applyAction({
  A: "atlas_user123",
  date_of_birth: "1990-01-15",
  birth_sex: "Male",
  pronouns: "he/him",
  family_medical_history: "Heart Disease, Diabetes",
  health_kit_authorized: "true"
}, { $returnEdits: true });
```

### REST
```bash
curl -X POST \
  "https://atlasengine.palantirfoundry.com/api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/actions/edit-a/apply" \
  -H "Authorization: Bearer $FOUNDRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "A": "atlas_user123",
      "date_of_birth": "1990-01-15",
      "birth_sex": "Male",
      "family_medical_history": "Heart Disease"
    },
    "options": { "returnEdits": "ALL" }
  }'
```

---

## ⚙️ Config

```bash
# .env
FOUNDRY_BASE_URL=https://atlasengine.palantirfoundry.com/api
FOUNDRY_SERVICE_TOKEN=your_foundry_token
ONTOLOGY_RID=ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194
AUTH0_AUDIENCE=https://your-api.com
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
```

---

## 🐛 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Invalid Auth0 token | Check token & audience |
| 500 Service Error | Missing Foundry token | Set FOUNDRY_SERVICE_TOKEN |
| 404 Not Found | Profile doesn't exist | Use POST /update to create |
| Failed to search | Ontology permissions | Check Foundry token has read access |
| Failed to apply action | Action permissions | Check token has write access |

---

## 📚 Full Docs

- **Complete Plan:** `ONTOLOGY_FIELD_ADDITIONS_PLAN.md`
- **API Guide:** `backend-proxy/PATIENT_PROFILE_API_GUIDE.md`
- **Integration:** `backend-proxy/INTEGRATION_STEPS.md`
- **Summary:** `PATIENT_PROFILE_UPDATE_SUMMARY.md`

---

## ✅ Checklist

**Backend:**
- [ ] Add FOUNDRY_SERVICE_TOKEN to .env
- [ ] Add routes to server.js
- [ ] Test with curl/Postman
- [ ] Deploy to staging

**iOS:**
- [ ] Add updatePatientProfile() method
- [ ] Call from SetupView
- [ ] Test end-to-end
- [ ] Deploy to TestFlight

**Foundry:**
- [ ] Verify schema has all fields
- [ ] Test edit-a action
- [ ] Check permissions
- [ ] Monitor action executions

---

**Status:** Ready to integrate  
**Last Updated:** 2025-09-30
