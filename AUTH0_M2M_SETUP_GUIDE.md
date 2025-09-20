# Auth0 Machine-to-Machine Setup Guide

## Overview
A Machine-to-Machine (M2M) application in Auth0 allows your backend proxy to authenticate itself and get access tokens to validate user JWTs. This is required for the backend proxy to work properly.

## Step-by-Step Setup

### Step 1: Access Auth0 Dashboard
1. Go to **Auth0 Dashboard**: https://manage.auth0.com/
2. Login with your credentials
3. Select your tenant: `dev-irxmxjwyduu4tesn.us.auth0.com`

### Step 2: Create Machine-to-Machine Application
1. **Navigate to Applications**:
   - Click **"Applications"** in the left sidebar
   - Click **"Create Application"** button

2. **Configure Application**:
   - **Name**: `Atlas Backend Proxy M2M`
   - **Application Type**: Select **"Machine to Machine Applications"**
   - Click **"Create"**

3. **Select API**:
   - You'll see a list of APIs
   - Find and select: **`Atlas iOS`** (https://api.atlas.ai)
   - Click **"Authorize"**

### Step 3: Configure Scopes
After authorizing the API, you'll see a scopes selection screen:

**Select these scopes** (check the boxes):
- `read:patient` - Read patient data
- `read:dashboard` - Read dashboard data
- `read:health_records` - Read health records
- `write:documents` - Upload documents
- `execute:actions` - Execute Foundry actions
- `execute:queries` - Execute SQL queries
- `read:ontology` - Read ontology metadata

If you don't see these scopes, you may need to define them in your API settings first.

### Step 4: Get Credentials
1. **Click "Authorize"** to finish setup
2. **Go to Application Settings**:
   - Click on your new M2M application
   - Go to **"Settings"** tab
3. **Copy Credentials**:
   - **Client ID**: Copy this value
   - **Client Secret**: Copy this value (it's visible for M2M apps)

### Step 5: Update Backend Proxy Environment Variables
Replace the current credentials in Render with your new M2M credentials:

1. **Go to Render Dashboard**: https://dashboard.render.com/web/srv-d37digbe5dus7399iqq0
2. **Click "Environment" tab**
3. **Update these variables**:
   ```
   AUTH0_CLIENT_ID=<your-new-m2m-client-id>
   AUTH0_CLIENT_SECRET=<your-new-m2m-client-secret>
   ```
4. **Click "Save Changes"**

## API Configuration (If Scopes Don't Exist)

If you don't see the required scopes when setting up the M2M app, you need to define them in your API:

### Step 1: Go to APIs
1. **Navigate to APIs** in Auth0 Dashboard
2. **Find your API**: `Atlas iOS` (https://api.atlas.ai)
3. **Click on it**

### Step 2: Define Scopes
1. **Go to "Scopes" tab**
2. **Add these scopes** if they don't exist:

| Scope | Description |
|-------|-------------|
| `read:patient` | Read patient information |
| `read:dashboard` | Access patient dashboard data |
| `read:health_records` | Read health records and documents |
| `write:documents` | Upload and manage documents |
| `execute:actions` | Execute Foundry ontology actions |
| `execute:queries` | Execute SQL queries against Foundry |
| `read:ontology` | Read ontology structure and metadata |

3. **Click "Add" for each scope**

### Step 3: Go Back to M2M Setup
After defining scopes, go back to your M2M application and authorize it again to select the new scopes.

## Testing the Setup

After updating the backend proxy with M2M credentials, test it:

### Option 1: Test Token Acquisition
```bash
curl -X POST https://dev-irxmxjwyduu4tesn.us.auth0.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<M2M_CLIENT_ID>&client_secret=<M2M_CLIENT_SECRET>&audience=https://api.atlas.ai"
```

### Option 2: Run Our Test Script
```bash
cd /Users/gabe/horizon-ios/backend-proxy
node test-token-flows.js
```

## Current vs New Configuration

### Current (API Credentials - Not Working)
```
AUTH0_CLIENT_ID=68cece9ee80248968f6b3157  # This is API ID, not client ID
AUTH0_CLIENT_SECRET=<api-secret>           # API secret, not M2M secret
```

### New (M2M Credentials - Will Work)
```
AUTH0_CLIENT_ID=<your-new-m2m-client-id>     # M2M application client ID
AUTH0_CLIENT_SECRET=<your-new-m2m-secret>    # M2M application secret
```

## Architecture Flow

Once M2M is set up, here's how it works:

```
1. iOS App → Auth0 Login → JWT Token (using IOv9pvajG7wxHzeF2pCW12toC4b9hWCY)
2. iOS App → Backend Proxy (with JWT in Authorization header)
3. Backend Proxy → Auth0 JWKS (validates JWT signature)
4. Backend Proxy → Auth0 Token Endpoint (gets M2M token using new credentials)
5. Backend Proxy → Foundry API (with service token)
6. Backend Proxy → iOS App (with Foundry data)
```

## Troubleshooting

### "access_denied" Error
- Check that M2M app is authorized for your API
- Verify scopes are granted
- Ensure audience matches: `https://api.atlas.ai`

### "unauthorized_client" Error
- Verify client_id and client_secret are from M2M app
- Check that grant_type is `client_credentials`

### "insufficient_scope" Error
- Go back to M2M app settings
- Re-authorize with required scopes
- Update API scopes if needed

## Security Notes

- **M2M credentials are sensitive** - only store in Render environment variables
- **Never commit M2M secrets** to git
- **Rotate credentials regularly** (quarterly recommended)
- **Monitor usage** in Auth0 logs

## Next Steps After Setup

1. ✅ Create M2M application
2. ✅ Update Render environment variables  
3. ✅ Test token acquisition
4. ✅ Test backend proxy with iOS JWT tokens
5. ✅ Update iOS app to use backend proxy endpoints
