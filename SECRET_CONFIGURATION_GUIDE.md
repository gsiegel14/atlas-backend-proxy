# Secret Configuration Guide for Atlas Backend Proxy

## Overview
The backend proxy requires several secrets to authenticate with Auth0 and Foundry. This guide walks you through obtaining and configuring these secrets.

## Required Secrets

### 1. Auth0 Configuration
These secrets authenticate the backend proxy with Auth0 to validate JWT tokens.

#### AUTH0_CLIENT_ID
- **Where to find**: Auth0 Dashboard → Applications → [Your Backend API Application]
- **Current placeholder**: `NEW_AUTH0_CLIENT_ID_PLACEHOLDER`
- **Description**: Client ID for the backend API application (not the iOS app)

#### AUTH0_CLIENT_SECRET  
- **Where to find**: Auth0 Dashboard → Applications → [Your Backend API Application] → Settings
- **Current placeholder**: `NEW_AUTH0_CLIENT_SECRET_PLACEHOLDER`
- **Description**: Client secret for machine-to-machine authentication

### 2. Foundry Configuration
These secrets authenticate the backend proxy with Foundry APIs.

#### FOUNDRY_CLIENT_ID
- **Current value**: `d8038d443b968266e86ccc15b2373c9f` ✅ (from xcconfig)
- **Status**: Already configured

#### FOUNDRY_CLIENT_SECRET
- **Where to find**: Foundry Console → Third Party Applications → [Your Application] → Credentials
- **Current placeholder**: `FOUNDRY_CLIENT_SECRET_FROM_DASHBOARD`
- **Description**: Client secret for Foundry service-to-service authentication

## Step-by-Step Configuration

### Step 1: Get Auth0 Secrets

1. **Login to Auth0 Dashboard**: https://manage.auth0.com/
2. **Navigate to Applications**
3. **Find or Create Backend API Application**:
   - If you don't have a backend API app, create a new "Machine to Machine" application
   - Name it something like "Atlas Backend Proxy"
4. **Copy Client ID and Secret**:
   - Client ID: Copy from the application settings
   - Client Secret: Copy from the application settings (only visible for M2M apps)

### Step 2: Get Foundry Secrets

1. **Login to Foundry Console**: https://atlasengine.palantirfoundry.com/
2. **Navigate to Third Party Applications**
3. **Find your Atlas application**
4. **Copy Client Secret**:
   - The Client ID is already configured: `d8038d443b968266e86ccc15b2373c9f`
   - Copy the Client Secret from the credentials section

### Step 3: Update Render Environment Variables

#### Option A: Using Render Dashboard (Recommended)
1. **Go to Render Dashboard**: https://dashboard.render.com/web/srv-d37digbe5dus7399iqq0
2. **Click "Environment" tab**
3. **Update the following variables**:
   ```
   AUTH0_CLIENT_ID=<your-auth0-client-id>
   AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
   FOUNDRY_CLIENT_SECRET=<your-foundry-client-secret>
   ```
4. **Click "Save Changes"** - This will trigger a new deployment

#### Option B: Using Render MCP (Programmatic)
```javascript
await renderMCP.updateEnvironmentVariables({
  serviceId: 'srv-d37digbe5dus7399iqq0',
  envVars: [
    { key: 'AUTH0_CLIENT_ID', value: 'your-actual-auth0-client-id' },
    { key: 'AUTH0_CLIENT_SECRET', value: 'your-actual-auth0-client-secret' },
    { key: 'FOUNDRY_CLIENT_SECRET', value: 'your-actual-foundry-client-secret' }
  ],
  replace: false
});
```

## Verification

After updating the secrets, test the service:

### 1. Check Health Status
```bash
curl https://atlas-backend-proxy.onrender.com/health/ready
```

Should return all dependencies as `true`:
```json
{
  "status": "ready",
  "checks": {
    "foundry": true,
    "redis": true,
    "auth0": true
  }
}
```

### 2. Test Auth0 Integration
Create a test JWT token from Auth0 and test:
```bash
curl -H "Authorization: Bearer <your-jwt-token>" \
     https://atlas-backend-proxy.onrender.com/api/v1/foundry/ontology/metadata
```

### 3. Test Foundry Integration
If the above works, the backend proxy should successfully call Foundry APIs.

## Security Notes

- **Never commit secrets to git**
- **Use Render's environment variables for all secrets**
- **Rotate secrets regularly** (quarterly recommended)
- **Monitor for unauthorized access** in Auth0 and Foundry logs

## Troubleshooting

### Auth0 Issues
- **401 Unauthorized**: Check AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET
- **JWKS errors**: Verify AUTH0_DOMAIN is correct
- **Audience mismatch**: Ensure AUTH0_AUDIENCE matches your API identifier

### Foundry Issues  
- **Foundry token errors**: Check FOUNDRY_CLIENT_ID and FOUNDRY_CLIENT_SECRET
- **API call failures**: Verify FOUNDRY_HOST and FOUNDRY_OAUTH_TOKEN_URL
- **Permission errors**: Ensure Foundry application has required permissions

### Circuit Breaker Issues
- **Circuit open**: Check Foundry service health
- **Token refresh failures**: Verify Foundry credentials and network connectivity

## Current Environment Variables Status

✅ **Configured**:
- NODE_ENV=production
- PORT=3000
- LOG_LEVEL=info
- AUTH0_DOMAIN=dev-irxmxjwyduu4tesn.us.auth0.com
- AUTH0_AUDIENCE=https://api.atlas.ai
- FOUNDRY_HOST=https://atlasengine.palantirfoundry.com
- FOUNDRY_OAUTH_TOKEN_URL=https://atlasengine.palantirfoundry.com/multipass/api/oauth2/token
- FOUNDRY_CLIENT_ID=d8038d443b968266e86ccc15b2373c9f
- REDIS_URL=redis://red-d37dftre5dus7399gebg:6379
- CORS_ORIGINS=https://atlas.ai,https://app.atlas.ai,http://localhost:3000

⚠️ **Need Real Values**:
- AUTH0_CLIENT_ID (currently placeholder)
- AUTH0_CLIENT_SECRET (currently placeholder)  
- FOUNDRY_CLIENT_SECRET (currently placeholder)

## Next Steps After Configuration

1. **Test the complete flow** with real tokens
2. **Update iOS app** to use Auth0 authentication
3. **Replace direct Foundry calls** in iOS with backend proxy endpoints
4. **Monitor logs** in Render dashboard for any issues
