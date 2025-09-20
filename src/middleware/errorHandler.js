import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    user: req.user?.sub
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
        details: isDevelopment ? err.details : undefined
      }
    });
  }

  if (err.status === 429) {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle Foundry service errors
  if (err.foundryError) {
    return res.status(err.status || 502).json({
      error: {
        code: 'FOUNDRY_ERROR',
        message: 'External service error',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
        details: isDevelopment ? err.foundryError : undefined
      }
    });
  }

  // Default server error
  res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isDevelopment ? err.message : 'Internal server error',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      stack: isDevelopment ? err.stack : undefined
    }
  });
};
