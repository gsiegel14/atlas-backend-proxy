# Patient Profile API Implementation Guide

## Overview
This guide covers how to use the patient profile update endpoints with both OSDK (TypeScript) and REST API approaches.

---

## Backend Proxy Endpoints

### Base URL
```
https://your-backend-proxy.com/api/v1/patient-profile
```

### Authentication
All endpoints require Auth0 Bearer token:
```
Authorization: Bearer {auth0_access_token}
```

---

## 1. Update Patient Profile (Upsert)

Creates or updates a patient profile with setup data.

### Endpoint
```
POST /api/v1/patient-profile/update
```

### Request Body
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phoneNumber": "+1234567890",
  "address": "123 Main St, City, State 12345",
  "dateOfBirth": "1990-01-15",
  "birthSex": "Male",
  "pronouns": "he/him",
  "emergencyContactName": "Jane Doe",
  "emergencyContactPhone": "+0987654321",
  "familyMedicalHistory": [
    "Heart Disease",
    "Type 2 Diabetes",
    "High Blood Pressure"
  ],
  "healthKitAuthorized": true
}
```

### Response
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "type": "edits",
    "editedObjectTypes": [
      {
        "atlasId": "atlas_user123_1234567890",
        "objectType": "A"
      }
    ]
  }
}
```

### cURL Example
```bash
curl -X POST "https://your-backend-proxy.com/api/v1/patient-profile/update" \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: $(uuidgen)" \
  -d '{
    "dateOfBirth": "1990-01-15",
    "birthSex": "Male",
    "pronouns": "he/him",
    "emergencyContactName": "Jane Doe",
    "emergencyContactPhone": "+1234567890",
    "familyMedicalHistory": ["Heart Disease", "Type 2 Diabetes"],
    "healthKitAuthorized": true
  }'
```

---

## 2. Get Patient Profile

Retrieve the current user's patient profile.

### Endpoint
```
GET /api/v1/patient-profile
```

### Response
```json
{
  "success": true,
  "data": {
    "atlasId": "atlas_user123_1234567890",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phoneNumber": "+1234567890",
    "address": "123 Main St",
    "userId": "auth0|user123",
    "dateOfBirth": "1990-01-15",
    "birthSex": "Male",
    "pronouns": "he/him",
    "emergencyContactName": "Jane Doe",
    "emergencyContactPhone": "+0987654321",
    "familyMedicalHistory": "Heart Disease, Type 2 Diabetes",
    "healthKitAuthorized": "true",
    "healthKitAuthorizationDate": "2024-01-01T12:00:00Z",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### cURL Example
```bash
curl -X GET "https://your-backend-proxy.com/api/v1/patient-profile" \
  -H "Authorization: Bearer $AUTH0_TOKEN" \
  -H "X-Correlation-Id: $(uuidgen)"
```

---

## 3. Partial Update

Update only specific fields without affecting others.

### Endpoint
```
PATCH /api/v1/patient-profile/partial
```

### Request Body (any subset of fields)
```json
{
  "pronouns": "they/them",
  "healthKitAuthorized": false
}
```

### Response
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "type": "edits",
    "editedObjectTypes": [...]
  }
}
```

---

## 4. Batch Update (Admin Only)

Update multiple profiles in one request.

### Endpoint
```
POST /api/v1/patient-profile/batch-update
```

### Request Body
```json
{
  "updates": [
    {
      "atlasId": "atlas_user1_123",
      "firstName": "John",
      "birthSex": "Male"
    },
    {
      "atlasId": "atlas_user2_456",
      "firstName": "Jane",
      "birthSex": "Female"
    }
  ]
}
```

---

## Direct Foundry API Usage

### Using OSDK (TypeScript)

```typescript
import { client } from "@atlas-dev/sdk";
import { editA } from "@atlas-dev/sdk";

// Update patient profile using edit-a action
async function updatePatientProfile(
  atlasId: string,
  profileData: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    birthSex?: string;
    pronouns?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    familyMedicalHistory?: string[];
    healthKitAuthorized?: boolean;
  }
) {
  const result = await client(editA).applyAction(
    {
      A: atlasId,
      first_name: profileData.firstName,
      last_name: profileData.lastName,
      date_of_birth: profileData.dateOfBirth,
      birth_sex: profileData.birthSex,
      pronouns: profileData.pronouns,
      emergency_contact_name: profileData.emergencyContactName,
      emergency_contact_phone: profileData.emergencyContactPhone,
      family_medical_history: profileData.familyMedicalHistory?.join(', '),
      health_kit_authorized: String(profileData.healthKitAuthorized),
      health_kit_authorization_date: profileData.healthKitAuthorized 
        ? new Date().toISOString() 
        : undefined,
      timestamp: new Date().toISOString()
    },
    {
      $returnEdits: true
    }
  );

  if (result.type === "edits") {
    const updatedObject = result.editedObjectTypes[0];
    console.log("Updated object", updatedObject);
    return updatedObject;
  }
  
  throw new Error("Update failed");
}

// Example usage
await updatePatientProfile("atlas_user123_1234567890", {
  firstName: "John",
  lastName: "Doe",
  dateOfBirth: "1990-01-15",
  birthSex: "Male",
  pronouns: "he/him",
  emergencyContactName: "Jane Doe",
  emergencyContactPhone: "+1234567890",
  familyMedicalHistory: ["Heart Disease", "Type 2 Diabetes"],
  healthKitAuthorized: true
});
```

### Using REST API Directly

```bash
#!/bin/bash

# Configuration
FOUNDRY_TOKEN="your_foundry_token"
ONTOLOGY_RID="ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194"
ATLAS_ID="atlas_user123_1234567890"

# Update patient profile
curl -X POST \
  "https://atlasengine.palantirfoundry.com/api/v2/ontologies/${ONTOLOGY_RID}/actions/edit-a/apply" \
  -H "Authorization: Bearer ${FOUNDRY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "A": "'${ATLAS_ID}'",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@example.com",
      "phonenumber": "+1234567890",
      "address": "123 Main St, City, State",
      "user_id": "auth0|user123",
      "date_of_birth": "1990-01-15",
      "birth_sex": "Male",
      "pronouns": "he/him",
      "emergency_contact_name": "Jane Doe",
      "emergency_contact_phone": "+0987654321",
      "family_medical_history": "Heart Disease, Type 2 Diabetes",
      "health_kit_authorized": "true",
      "health_kit_authorization_date": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'"
    },
    "options": {
      "returnEdits": "ALL"
    }
  }'
```

### Response Format
```json
{
  "type": "edits",
  "editedObjectTypes": [
    {
      "objectType": "A",
      "primaryKey": "atlas_user123_1234567890",
      "properties": {
        "firstName": "John",
        "lastName": "Doe",
        "dateOfBirth": "1990-01-15",
        "birthSex": "Male",
        "pronouns": "he/him",
        "emergencyContactName": "Jane Doe",
        "emergencyContactPhone": "+0987654321",
        "familyMedicalHistory": "Heart Disease, Type 2 Diabetes",
        "healthKitAuthorized": "true",
        "healthKitAuthorizationDate": "2024-01-01T12:00:00Z",
        "timestamp": "2024-01-01T12:00:00Z"
      }
    }
  ]
}
```

---

## Batch Operations

### OSDK Batch Update

```typescript
import { client, editA } from "@atlas-dev/sdk";

async function batchUpdateProfiles(updates: Array<{
  atlasId: string;
  data: any;
}>) {
  const result = await client(editA).batchApplyAction(
    updates.map(update => ({
      A: update.atlasId,
      first_name: update.data.firstName,
      last_name: update.data.lastName,
      date_of_birth: update.data.dateOfBirth,
      birth_sex: update.data.birthSex,
      pronouns: update.data.pronouns,
      emergency_contact_name: update.data.emergencyContactName,
      emergency_contact_phone: update.data.emergencyContactPhone,
      family_medical_history: update.data.familyMedicalHistory?.join(', '),
      health_kit_authorized: String(update.data.healthKitAuthorized),
      timestamp: new Date().toISOString()
    })),
    {
      $returnEdits: false
    }
  );

  return result;
}

// Example
await batchUpdateProfiles([
  {
    atlasId: "atlas_user1_123",
    data: { firstName: "John", birthSex: "Male" }
  },
  {
    atlasId: "atlas_user2_456",
    data: { firstName: "Jane", birthSex: "Female" }
  }
]);
```

### REST API Batch Update

```bash
curl -X POST \
  "https://atlasengine.palantirfoundry.com/api/v2/ontologies/${ONTOLOGY_RID}/actions/edit-a/applyBatch" \
  -H "Authorization: Bearer ${FOUNDRY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "parameters": {
          "A": "atlas_user1_123",
          "first_name": "John",
          "birth_sex": "Male",
          "timestamp": "2024-01-01T12:00:00Z"
        }
      },
      {
        "parameters": {
          "A": "atlas_user2_456",
          "first_name": "Jane",
          "birth_sex": "Female",
          "timestamp": "2024-01-01T12:00:00Z"
        }
      }
    ],
    "options": {
      "returnEdits": "NONE"
    }
  }'
```

---

## iOS Integration

### Swift Service Method

```swift
import Foundation

class PatientProfileService {
    private let baseURL: URL
    
    init(baseURL: URL = URL(string: "https://your-backend-proxy.com")!) {
        self.baseURL = baseURL
    }
    
    func updateProfile(
        dateOfBirth: String?,
        birthSex: String?,
        pronouns: String?,
        emergencyContactName: String?,
        emergencyContactPhone: String?,
        familyMedicalHistory: [String]?,
        healthKitAuthorized: Bool
    ) async throws {
        guard let token = await getAuth0Token() else {
            throw ProfileError.unauthorized
        }
        
        let url = baseURL
            .appendingPathComponent("api")
            .appendingPathComponent("v1")
            .appendingPathComponent("patient-profile")
            .appendingPathComponent("update")
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Correlation-Id")
        
        let payload: [String: Any?] = [
            "dateOfBirth": dateOfBirth,
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
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let http = response as? HTTPURLResponse,
              http.statusCode == 200 else {
            throw ProfileError.updateFailed
        }
        
        Logger.log(message: "Successfully updated patient profile", event: .info)
    }
    
    private func getAuth0Token() async -> String? {
        // Get token from OAuthTokenStore
        guard let snapshot = OAuthTokenStore.shared.snapshot(),
              snapshot.isValid else {
            return nil
        }
        return snapshot.accessToken
    }
}

enum ProfileError: Error {
    case unauthorized
    case updateFailed
}
```

---

## Field Mapping Reference

| iOS/API Field | Foundry Parameter ID | Type | Notes |
|--------------|---------------------|------|-------|
| atlasId | A | String | Primary key |
| firstName | first_name | String | - |
| lastName | last_name | String | - |
| email | email | String | - |
| phoneNumber | phonenumber | String | - |
| address | address | String | - |
| userId | user_id | String | Auth0 user ID |
| dateOfBirth | date_of_birth | String | ISO8601 date |
| birthSex | birth_sex | String | Male/Female/Other |
| pronouns | pronouns | String | he/him, she/her, etc. |
| emergencyContactName | emergency_contact_name | String | - |
| emergencyContactPhone | emergency_contact_phone | String | - |
| familyMedicalHistory | family_medical_history | String | Comma-separated |
| healthKitAuthorized | health_kit_authorized | String | "true"/"false" |
| healthKitAuthorizationDate | health_kit_authorization_date | String | ISO8601 timestamp |
| timestamp | timestamp | Timestamp | Auto-updated |
| photo | photo | MediaReference | Upload separately |

---

## Error Handling

### Backend Proxy Errors

```json
{
  "success": false,
  "error": "Error message",
  "correlationId": "uuid-here"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad request (invalid data)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Profile not found
- `500` - Server error

### Swift Error Handling

```swift
do {
    try await profileService.updateProfile(
        dateOfBirth: "1990-01-15",
        birthSex: "Male",
        // ... other fields
        healthKitAuthorized: true
    )
} catch ProfileError.unauthorized {
    // Handle auth error
    print("Please log in again")
} catch ProfileError.updateFailed {
    // Handle update failure
    print("Failed to update profile")
} catch {
    // Handle other errors
    print("Unexpected error: \(error)")
}
```

---

## Testing

### Test Endpoint Health

```bash
# Test if backend proxy is running
curl -X GET "https://your-backend-proxy.com/health"

# Test Auth0 authentication
curl -X GET "https://your-backend-proxy.com/api/v1/patient-profile" \
  -H "Authorization: Bearer $AUTH0_TOKEN"
```

### Sample Test Data

```json
{
  "dateOfBirth": "1990-01-15",
  "birthSex": "Male",
  "pronouns": "he/him",
  "emergencyContactName": "Jane Doe",
  "emergencyContactPhone": "+1234567890",
  "familyMedicalHistory": [
    "Heart Disease",
    "Type 2 Diabetes",
    "High Blood Pressure",
    "Stroke"
  ],
  "healthKitAuthorized": true
}
```

---

## Security Considerations

1. **Always use HTTPS** for all API calls
2. **Validate tokens** on every request
3. **Log correlationIds** for request tracing
4. **Never log PHI/PII** in plain text
5. **Rate limit** profile updates per user
6. **Sanitize inputs** before sending to Foundry
7. **Use environment variables** for sensitive config

---

## Environment Variables

```bash
# Backend Proxy
AUTH0_AUDIENCE=https://your-api.com
AUTH0_ISSUER_BASE_URL=https://your-tenant.auth0.com
FOUNDRY_BASE_URL=https://atlasengine.palantirfoundry.com/api
FOUNDRY_SERVICE_TOKEN=your_foundry_service_token
ONTOLOGY_RID=ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194
```

---

## Deployment Checklist

- [ ] Backend proxy deployed with routes configured
- [ ] Foundry service token properly set
- [ ] Auth0 audience/issuer configured
- [ ] CORS headers configured for iOS app
- [ ] Rate limiting enabled
- [ ] Error logging configured (no PHI)
- [ ] Health check endpoint working
- [ ] iOS service layer updated
- [ ] End-to-end testing completed

---

**Last Updated:** 2025-09-30  
**API Version:** v1
