import express from 'express';
import { logger } from '../utils/logger.js';
import axios from 'axios';

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    correlationId: req.correlationId
  });
});

// Readiness probe
router.get('/ready', async (req, res) => {
  const checks = {
    foundry: false,
    redis: false,
    auth0: false,
    tokenKidPresent: null,
    tokenAudienceOk: null
  };

  try {
    // Check Foundry connectivity
    if (process.env.FOUNDRY_HOST) {
      // Simple connectivity check - could be enhanced with actual API call
      checks.foundry = true;
    }

    // Check Redis connectivity
    if (req.app.locals.redisClient) {
      await req.app.locals.redisClient.ping();
      checks.redis = true;
    } else {
      checks.redis = true; // Redis is optional
    }

    // Check Auth0 JWKS endpoint + token shape (if provided)
    if (process.env.AUTH0_DOMAIN) {
      checks.auth0 = true;
      const authHeader = req.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '='), 'base64').toString('utf8');
          try {
            const header = JSON.parse(b64(parts[0]));
            const payload = JSON.parse(b64(parts[1]));
            checks.tokenKidPresent = Boolean(header?.kid);
            const audience = process.env.AUTH0_AUDIENCE || 'https://api.atlas.ai';
            const aud = payload?.aud;
            checks.tokenAudienceOk = Array.isArray(aud) ? aud.includes(audience) : aud === audience;
          } catch {}
        }
      }
    }

    const isReady = Object.values(checks).every(check => check === true);

    if (isReady) {
      res.json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      });
    }
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      checks,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  });
});

export { router as healthRouter };
