# Atlas Backend Proxy

A production-ready backend proxy service that bridges Auth0 authentication with Foundry APIs for the Atlas Care iOS application.

## Architecture

This service implements the backend proxy pattern described in the [Auth Service Migration Plan](../Docs/AuthServiceMigrationPlan.md):

```
iOS App (Auth0) → Backend Proxy → Foundry APIs
```

### Key Features

- **Auth0 JWT Validation**: Validates Auth0 tokens using JWKS
- **Foundry Client Credentials**: Manages service-to-service auth with Foundry
- **Circuit Breaker**: Protects against cascade failures
- **Rate Limiting**: Per-user and global rate limiting with Redis
- **Comprehensive Logging**: Structured logging with correlation IDs
- **Health Checks**: Kubernetes-ready health endpoints
- **Security**: Helmet, CORS, input validation

## API Endpoints

### Health Endpoints
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe (checks dependencies)
- `GET /health/live` - Liveness probe

### Patient Endpoints
- `POST /api/v1/patient/dashboard` - Get patient dashboard data
- `GET /api/v1/patient/health-records` - Get health records
- `POST /api/v1/patient/:id/documents` - Upload patient documents

### Foundry Endpoints
- `POST /api/v1/foundry/actions/:actionId/invoke` - Invoke Foundry actions
- `POST /api/v1/foundry/query` - Execute SQL queries
- `GET /api/v1/foundry/clinical-notes` - Search ontology-backed clinical notes by patient
- `GET /api/v1/foundry/ontology/metadata` - Get ontology metadata

## Environment Configuration

Copy `env.template` to `.env` and configure:

```bash
cp env.template .env
```

### Required Variables

```env
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.atlas.ai

# Foundry Configuration  
FOUNDRY_HOST=https://your-instance.palantirfoundry.com
FOUNDRY_CLIENT_ID=your_foundry_client_id
FOUNDRY_CLIENT_SECRET=your_foundry_client_secret
FOUNDRY_OAUTH_TOKEN_URL=https://your-instance.palantirfoundry.com/multipass/api/oauth2/token
```

### Optional Variables

```env
# Redis for rate limiting and caching
REDIS_URL=redis://localhost:6379

# Monitoring
DATADOG_API_KEY=your_datadog_api_key
LOG_LEVEL=info

# Security
CORS_ORIGINS=https://atlas.ai,https://app.atlas.ai
```

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp env.template .env

# Edit .env with your configuration
# Start development server
npm run dev
```

## Production Deployment

### Render Deployment

This service is configured for deployment on Render with:

- **Auto-scaling**: 3-10 instances based on CPU
- **Health checks**: Kubernetes-style readiness/liveness probes
- **Redis**: Managed Redis instance for rate limiting
- **Monitoring**: Structured logging and metrics

### Environment Setup

1. Create Render services:
   - Web service for the backend proxy
   - Redis instance for rate limiting

2. Configure environment variables in Render dashboard

3. Deploy using the Render MCP tools (see deployment script below)

## Security Features

- **JWT Validation**: RS256 signature validation with JWKS
- **Scope-based Authorization**: Fine-grained permissions
- **Rate Limiting**: Per-user and global limits
- **Input Validation**: SQL injection protection
- **CORS**: Configurable cross-origin policies
- **Helmet**: Security headers
- **Circuit Breaker**: Prevents cascade failures

## Monitoring & Observability

- **Structured Logging**: JSON logs with correlation IDs
- **Health Endpoints**: Ready/live probes for orchestration
- **Error Tracking**: Comprehensive error logging
- **Performance Metrics**: Request timing and throughput

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "correlationId": "uuid-v4",
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

## Rate Limiting

- **Global**: 1000 requests/minute
- **Patient API**: 100 requests/minute per user
- **Foundry API**: 50 requests/minute per user
- **Auth**: 10 requests/minute per user

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Contributing

1. Follow the existing code patterns
2. Add tests for new features
3. Update documentation
4. Ensure all health checks pass
# Updated Sun Sep 21 12:00:12 MDT 2025
# Force deployment Wed Sep 24 01:55:58 MDT 2025
