# Atlas Backend Proxy Deployment Guide

## Render Deployment

This service is deployed on Render with the following architecture:

### Services Created

1. **Redis Instance**: `atlas-backend-redis` (red-d37dftre5dus7399gebg)
   - Plan: Starter
   - Region: Oregon
   - Used for: Rate limiting and caching

2. **Web Service**: `atlas-backend-proxy`
   - Plan: Starter (can be upgraded to Standard/Pro for production)
   - Region: Oregon
   - Auto-scaling: Enabled

### Environment Variables

The following environment variables need to be configured in Render:

#### Required (Auth0)
```
AUTH0_DOMAIN=dev-irxmxjwyduu4tesn.us.auth0.com
AUTH0_AUDIENCE=https://api.atlas.ai
AUTH0_CLIENT_ID=<from Auth0 dashboard>
AUTH0_CLIENT_SECRET=<from Auth0 dashboard>
```

#### Required (Foundry)
```
FOUNDRY_HOST=https://atlasengine.palantirfoundry.com
FOUNDRY_CLIENT_ID=<from Foundry>
FOUNDRY_CLIENT_SECRET=<from Foundry>
FOUNDRY_OAUTH_TOKEN_URL=https://atlasengine.palantirfoundry.com/multipass/api/oauth2/token
```

#### System Configuration
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
REDIS_URL=redis://red-d37dftre5dus7399gebg:6379
CORS_ORIGINS=https://atlas.ai,https://app.atlas.ai,http://localhost:3000
```

### Deployment Steps

#### Option 1: Manual Render Dashboard Deployment

1. **Create GitHub Repository**:
   ```bash
   # Create new repo on GitHub: atlas-backend-proxy
   git remote add origin https://github.com/YOUR_ORG/atlas-backend-proxy.git
   git branch -M main
   git push -u origin main
   ```

2. **Create Web Service in Render Dashboard**:
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect GitHub repository
   - Configure settings:
     - Name: `atlas-backend-proxy`
     - Runtime: Node
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Plan: Starter (upgrade for production)

3. **Configure Environment Variables**:
   - Add all required environment variables listed above
   - Ensure Redis URL points to the created Redis instance

4. **Deploy**:
   - Click "Create Web Service"
   - Monitor deployment logs

#### Option 2: Using Render MCP Tools

```javascript
// After creating GitHub repo and pushing code:
const webService = await renderMCP.createWebService({
  name: 'atlas-backend-proxy',
  repo: 'https://github.com/YOUR_ORG/atlas-backend-proxy',
  runtime: 'node',
  buildCommand: 'npm install',
  startCommand: 'npm start',
  plan: 'starter',
  region: 'oregon',
  envVars: [
    { key: 'NODE_ENV', value: 'production' },
    { key: 'AUTH0_DOMAIN', value: 'dev-irxmxjwyduu4tesn.us.auth0.com' },
    // ... other env vars
  ]
});
```

### Health Checks

Render will automatically use these endpoints:

- **Health Check**: `GET /health`
- **Readiness**: `GET /health/ready` 
- **Liveness**: `GET /health/live`

### Scaling Configuration

For production workloads, consider upgrading to:

- **Plan**: Standard or Pro
- **Instances**: 3-10 instances with auto-scaling
- **Redis**: Standard plan for higher throughput

### Monitoring

#### Logs
- View logs in Render dashboard
- Structured JSON logging with correlation IDs
- Error tracking with stack traces

#### Metrics
- Monitor via Render dashboard
- Set up alerts for:
  - High error rates
  - High response times
  - Circuit breaker events

### Security Checklist

- [ ] Auth0 client secrets configured securely
- [ ] Foundry credentials configured securely  
- [ ] CORS origins restricted to production domains
- [ ] Redis instance secured (IP allowlist if needed)
- [ ] Rate limiting configured appropriately
- [ ] Log level set to 'info' or 'warn' for production

### Testing Deployment

```bash
# Test health endpoint
curl https://your-service.onrender.com/health

# Test authenticated endpoint (with Auth0 token)
curl -H "Authorization: Bearer <token>" \
     https://your-service.onrender.com/api/v1/foundry/ontology/metadata
```

### Rollback Plan

1. **Immediate**: Use Render dashboard to rollback to previous deployment
2. **Code Issues**: Revert git commits and redeploy
3. **Config Issues**: Update environment variables in Render dashboard

### Production Considerations

1. **Upgrade Plans**: Move from Starter to Standard/Pro for production traffic
2. **Multiple Regions**: Deploy in multiple regions for HA
3. **Custom Domain**: Configure custom domain with SSL
4. **Monitoring**: Set up external monitoring (Datadog, New Relic, etc.)
5. **Backup**: Ensure Redis data is backed up if using for persistent data

## Cost Estimates

- **Redis Starter**: $7/month
- **Web Service Starter**: $7/month  
- **Total**: ~$14/month for development/staging

For production:
- **Redis Standard**: $25/month
- **Web Service Standard**: $25/month
- **Total**: ~$50/month
