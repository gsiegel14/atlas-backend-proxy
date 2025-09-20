import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

import { logger } from './utils/logger.js';
import { validateAuth0Token } from './middleware/auth0.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { correlationId } from './middleware/correlationId.js';
import { FoundryService } from './services/foundryService.js';
import { healthRouter } from './routes/health.js';
import { patientRouter } from './routes/patient.js';
import { foundryRouter } from './routes/foundry.js';
import { debugRouter } from './routes/debug.js';
import { usernamePropagation } from './middleware/usernamePropagation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Redis client setup
let redisClient;
try {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });
  await redisClient.connect();
  logger.info('Redis connected successfully');
} catch (error) {
  logger.error('Redis connection failed:', error);
  // Continue without Redis for development
  redisClient = null;
}

// Initialize Foundry service
const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Auth0-Username', 'X-Correlation-Id'],
  exposedHeaders: ['X-Correlation-Id']
}));

app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add correlation ID to all requests
app.use(correlationId);

// Global rate limiting
const globalRateLimit = createRateLimiter(1000, redisClient); // 1000 requests per minute
app.use(globalRateLimit);

// Health check (no auth required)
app.use('/health', healthRouter);

// Auth0 validation for protected routes
app.use('/api', validateAuth0Token, usernamePropagation);

// Debug endpoints (protected)
app.use('/api/v1/debug', debugRouter);

// API Routes with specific rate limits
app.use('/api/v1/patient', createRateLimiter(100, redisClient), patientRouter);
app.use('/api/v1/foundry', createRateLimiter(50, redisClient), foundryRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  if (redisClient) {
    await redisClient.quit();
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  if (redisClient) {
    await redisClient.quit();
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Atlas Backend Proxy server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Auth0 Domain: ${process.env.AUTH0_DOMAIN}`);
  logger.info(`Foundry Host: ${process.env.FOUNDRY_HOST}`);
});

export default app;
