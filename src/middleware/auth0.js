import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { logger } from '../utils/logger.js';

// Official jwks-rsa integration compatible with express-jwt
const jwksSecret = jwksRsa.expressJwtSecret({
  cache: true,
  cacheMaxEntries: 5,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
});

// Auth0 JWT validation middleware
export const validateAuth0Token = jwt({
  secret: jwksSecret,
  audience: process.env.AUTH0_AUDIENCE || 'https://api.atlas.ai',
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
  requestProperty: 'user'
}).unless({
  path: ['/health', '/health/ready', '/health/live']
});

// Enhanced token validation with additional checks
export const validateTokenWithScopes = (requiredScopes = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No valid token provided',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check token expiry
    const now = Math.floor(Date.now() / 1000);
    if (req.user.exp && req.user.exp < now) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check required scopes
    if (requiredScopes.length > 0) {
      const userScopes = req.user.scope ? req.user.scope.split(' ') : [];
      const hasRequiredScopes = requiredScopes.every(scope => userScopes.includes(scope));
      
      if (!hasRequiredScopes) {
        logger.warn(`User ${req.user.sub} missing required scopes:`, {
          required: requiredScopes,
          provided: userScopes,
          correlationId: req.correlationId
        });
        
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: 'Insufficient permissions',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }
    }

    // Log successful authentication
    logger.debug(`User authenticated: ${req.user.sub}`, {
      correlationId: req.correlationId,
      scopes: req.user.scope
    });

    next();
  };
};

// Error handler for JWT middleware
export const jwtErrorHandler = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    logger.warn('JWT validation failed:', {
      error: err.message,
      correlationId: req.correlationId,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or malformed token',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  next(err);
};
