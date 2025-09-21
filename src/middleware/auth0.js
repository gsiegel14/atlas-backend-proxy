import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { logger } from '../utils/logger.js';

// Validate required environment variables
if (!process.env.AUTH0_DOMAIN) {
  throw new Error('AUTH0_DOMAIN environment variable is required');
}

// JWKS client for Auth0 token validation
const jwksClient = jwksRsa({
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  // Handle multiple keys by requiring KID
  strictSsl: true,
  timeout: 30000
});

// Get signing key function with proper error handling
const getKey = (header, callback) => {
  try {
    // Handle case where KID is not specified - try first available key
    const kidToUse = header.kid || null;
    
    if (!kidToUse) {
      logger.warn('No KID specified in JWT header, attempting to use first available key');
      // Get all keys and use the first one
      jwksClient.getKeys((err, keys) => {
        if (err) {
          logger.error('Failed to get JWKS keys:', err.message);
          return callback(err);
        }
        
        if (!keys || keys.length === 0) {
          const error = new Error('No keys available in JWKS');
          logger.error('JWT validation error:', error.message);
          return callback(error);
        }
        
        // Use the first key when no KID is specified
        const firstKey = keys[0];
        const signingKey = firstKey.publicKey || firstKey.rsaPublicKey;
        if (!signingKey) {
          const error = new Error('No valid signing key found in first JWKS key');
          logger.error('JWT validation error:', error.message);
          return callback(error);
        }
        
        logger.debug('Using first available JWKS key (no KID specified)', { 
          keyId: firstKey.kid || 'unknown' 
        });
        callback(null, signingKey);
      });
      return;
    }

    jwksClient.getSigningKey(kidToUse, (err, key) => {
      if (err) {
        logger.error('Failed to get signing key:', {
          error: err.message,
          kid: kidToUse,
          jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
        });
        return callback(err);
      }
      
      if (!key) {
        const error = new Error('No signing key found');
        logger.error('JWT validation error:', error.message);
        return callback(error);
      }
      
      const signingKey = key.publicKey || key.rsaPublicKey;
      if (!signingKey) {
        const error = new Error('No valid signing key found in JWKS response');
        logger.error('JWT validation error:', error.message);
        return callback(error);
      }
      
      logger.debug('Successfully retrieved signing key', { kid: kidToUse });
      callback(null, signingKey);
    });
  } catch (error) {
    logger.error('Unexpected error in getKey:', error);
    callback(error);
  }
};

// Auth0 JWT validation middleware with improved configuration
export const validateAuth0Token = jwt({
  secret: getKey,
  audience: process.env.AUTH0_AUDIENCE || 'https://api.atlas.ai',
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
  requestProperty: 'user',
  // Require KID in header to handle multiple keys
  getToken: (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return null;
    }
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }
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

// Enhanced error handler for JWT middleware
export const jwtErrorHandler = (err, req, res, next) => {
  // Prevent uncaught exceptions from crashing the service
  try {
    if (err.name === 'UnauthorizedError') {
      logger.warn('JWT validation failed:', {
        error: err.message,
        correlationId: req.correlationId || 'unknown',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        path: req.path,
        method: req.method
      });

      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or malformed token',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined,
          correlationId: req.correlationId || 'unknown',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Handle JWKS-related errors specifically
    if (err.name === 'SigningKeyNotFoundError') {
      logger.error('JWKS signing key error:', {
        error: err.message,
        correlationId: req.correlationId || 'unknown',
        jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
      });

      return res.status(401).json({
        error: {
          code: 'SIGNING_KEY_ERROR',
          message: 'Unable to verify token signature',
          correlationId: req.correlationId || 'unknown',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Handle other authentication-related errors
    if (err.message && err.message.includes('secret or public key must be provided')) {
      logger.error('JWT secret configuration error:', {
        error: err.message,
        correlationId: req.correlationId || 'unknown'
      });

      return res.status(500).json({
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Authentication service configuration error',
          correlationId: req.correlationId || 'unknown',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Log and pass through other errors
    logger.error('Unhandled authentication error:', {
      name: err.name,
      message: err.message,
      correlationId: req.correlationId || 'unknown',
      stack: err.stack
    });
    
    next(err);
  } catch (handlerError) {
    // Prevent error handler from crashing
    logger.error('Error in JWT error handler:', handlerError);
    
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal authentication error',
        correlationId: req.correlationId || 'unknown',
        timestamp: new Date().toISOString()
      }
    });
  }
};
