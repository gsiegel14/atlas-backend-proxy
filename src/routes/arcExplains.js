import express from 'express';
import { ArcExplainService } from '../services/arcExplainService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const arcExplainService = new ArcExplainService();

const isAuth0Identifier = (candidate) => typeof candidate === 'string' && candidate.trim().startsWith('auth0|');

function resolveAuth0Identifier(req) {
  const username = typeof req.context?.username === 'string'
    ? req.context.username.trim()
    : undefined;

  const auth0Sub = typeof req.user?.sub === 'string'
    ? req.user.sub.trim()
    : undefined;

  if (isAuth0Identifier(username)) {
    return username;
  }

  if (isAuth0Identifier(auth0Sub)) {
    return auth0Sub;
  }

  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const correlationId = req.correlationId;
    const resolvedAuth0Id = resolveAuth0Identifier(req);
    const { frontendInput, auth0Id: bodyAuth0Id } = req.body || {};

    const trimmedBodyAuth0Id = typeof bodyAuth0Id === 'string' ? bodyAuth0Id.trim() : '';
    const effectiveAuth0Id = resolvedAuth0Id ?? (isAuth0Identifier(trimmedBodyAuth0Id) ? trimmedBodyAuth0Id : null);

    if (!effectiveAuth0Id) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 identifier for this request',
          correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!frontendInput || typeof frontendInput !== 'string' || frontendInput.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'frontendInput must not be empty',
          correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (isAuth0Identifier(trimmedBodyAuth0Id) && trimmedBodyAuth0Id !== effectiveAuth0Id) {
      logger.warn('arcExplains: body auth0Id mismatch with resolved identity, overriding', {
        correlationId
      });
    }

    const explanation = await arcExplainService.explain({
      auth0Id: effectiveAuth0Id,
      frontendInput,
      correlationId
    });

    res.json({
      success: true,
      data: explanation,
      timestamp: new Date().toISOString(),
      correlationId
    });
  } catch (error) {
    logger.error('arcExplains: failed to generate explanation', {
      message: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    const status = error.status || 500;
    if (status >= 500) {
      return res.status(status).json({
        error: {
          code: 'ARC_EXPLAINS_ERROR',
          message: 'Unable to generate explanation at this time',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(status).json({
      error: {
        code: 'ARC_EXPLAINS_ERROR',
        message: error.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;
