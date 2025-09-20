import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { logger } from '../utils/logger.js';

export const createRateLimiter = (maxRequests = 100, redisClient = null) => {
  const config = {
    max: maxRequests,
    windowMs: 60000, // 1 minute
    keyGenerator: (req) => {
      // Use Auth0 sub if available, otherwise fall back to IP
      return req.user?.sub || req.ip;
    },
    handler: (req, res) => {
      const retryAfter = Math.round(60); // 1 minute in seconds
      
      logger.warn('Rate limit exceeded', {
        user: req.user?.sub,
        ip: req.ip,
        correlationId: req.correlationId,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      res.set('Retry-After', retryAfter);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later',
          correlationId: req.correlationId,
          retryAfter: retryAfter,
          timestamp: new Date().toISOString()
        }
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path.startsWith('/health');
    },
    standardHeaders: true,
    legacyHeaders: false
  };

  // Use Redis store if available
  if (redisClient) {
    config.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:',
    });
  }

  return rateLimit(config);
};

// Specific rate limiters for different endpoint types
export const authRateLimit = (redisClient) => createRateLimiter(10, redisClient); // 10 auth attempts per minute
export const apiRateLimit = (redisClient) => createRateLimiter(100, redisClient); // 100 API calls per minute
export const uploadRateLimit = (redisClient) => createRateLimiter(5, redisClient); // 5 uploads per minute
