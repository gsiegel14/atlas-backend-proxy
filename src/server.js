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
import { validateAuth0Token, jwtErrorHandler } from './middleware/auth0.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { correlationId } from './middleware/correlationId.js';
import { FoundryService } from './services/foundryService.js';
import { healthRouter } from './routes/health.js';
import { publicDebugRouter } from './routes/publicDebug.js';
import { patientRouter } from './routes/patient.js';
import { foundryRouter } from './routes/foundry.js';
import { debugRouter } from './routes/debug.js';
import { medicationsRouter } from './routes/medications.js';
import { historyRouter } from './routes/history.js';
import { intraencounterRouter } from './routes/intraencounter.js';
import { healthkitRouter } from './routes/healthkit.js';
import datasetsRouter from './routes/datasets.js';
import fastenDatasetsRouter from './routes/fastenDatasets.js';
import fastenIngestionRouter from './routes/fastenIngestion.js';
import { transcriptionSummaryRouter } from './routes/transcriptionSummary.js';
import { usernamePropagation } from './middleware/usernamePropagation.js';
import patientProfileRouter from './routes/patient-profile.js';

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
app.use(express.json({ limit: '25mb' })); // Increased for HealthKit batch uploads
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Add correlation ID to all requests
app.use(correlationId);

// Global rate limiting
const globalRateLimit = createRateLimiter(1000, redisClient); // 1000 requests per minute
app.use(globalRateLimit);

// Health check (no auth required)
app.use('/health', healthRouter);
// Public debug (no auth required) — safe metadata only
app.use('/debug/public', publicDebugRouter);

// Auth0 validation for protected routes
app.use('/api', validateAuth0Token, usernamePropagation);

// Debug endpoints (protected)
app.use('/api/v1/debug', debugRouter);

// API Routes with specific rate limits
app.use('/api/v1/patient', createRateLimiter(100, redisClient), patientRouter);
app.use('/api/v1/patient-profile', createRateLimiter(50, redisClient), patientProfileRouter);
app.use('/api/v1/foundry', createRateLimiter(50, redisClient), foundryRouter);
app.use('/api/v1/medications', createRateLimiter(50, redisClient), medicationsRouter);
app.use('/api/v1/history', createRateLimiter(50, redisClient), historyRouter);
app.use('/api/v1/intraencounter', createRateLimiter(50, redisClient), intraencounterRouter);
app.use('/api/v1/healthkit', createRateLimiter(50, redisClient), healthkitRouter);
app.use('/api/v1/foundry/datasets', createRateLimiter(50, redisClient), datasetsRouter);
app.use('/api/v1/foundry', createRateLimiter(50, redisClient), transcriptionSummaryRouter);
app.use('/api/v1/fasten/datasets', createRateLimiter(50, redisClient), fastenDatasetsRouter);
app.use('/api/v1/fasten/fhir', createRateLimiter(100, redisClient), fastenIngestionRouter);

// JWT-specific error handling (must come before general error handler)
app.use(jwtErrorHandler);

// General error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  // Redirect bare media item RID requests to the proper media content route
  const path = String(req.originalUrl || req.url || '');
  const mediaRidMatch = path.match(/^\/ri\.mio\.main\.media-item\.[A-Za-z0-9.-_]+$/);
  if (mediaRidMatch) {
    const rid = path.replace(/^\//, '');
    return res.redirect(302, `/api/v1/foundry/media/items/${encodeURIComponent(rid)}/content`);
  }
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
});

// Error handling for uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  // Give time for logs to flush, then exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason,
    timestamp: new Date().toISOString()
  });
  
  // Don't exit immediately for unhandled rejections in production
  // Log and continue, but monitor these closely
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

if (process.env.NODE_ENV !== 'test' && (process.env.SKIP_SERVER_LISTEN ?? '').toLowerCase() !== 'true') {
  app.listen(PORT, () => {
    logger.info(`Atlas Backend Proxy server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Auth0 Domain: ${process.env.AUTH0_DOMAIN}`);
    logger.info(`Foundry Host: ${process.env.FOUNDRY_HOST}`);
  });
}

export default app;
