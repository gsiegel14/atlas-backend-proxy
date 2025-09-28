import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { MediaUploadService } from '../services/mediaUploadService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Use MediaUploadService for direct Foundry action calls
const mediaUploadService = new MediaUploadService({
  foundryHost: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyApiName: 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194'
});

function resolveUserId(req) {
  const auth0Sub = typeof req.user?.sub === 'string' ? req.user.sub.trim() : '';
  if (auth0Sub) return auth0Sub;
  const username = typeof req.context?.username === 'string' ? req.context.username.trim() : '';
  return username || undefined;
}

router.post('/', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const {
      timestamp,
      audiofile,
      transcript,
      location,
      provider_name,
      providerName,
      speciality,
      hospital,
      additionalParameters = {},
      options = {}
    } = req.body || {};

    const userId = typeof req.body?.user_id === 'string' && req.body.user_id.trim().length > 0
      ? req.body.user_id.trim()
      : resolveUserId(req);

    if (!userId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve user identity for intra-encounter',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (typeof transcript !== 'string' || transcript.trim().length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'transcript is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!audiofile) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'audiofile is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Applying intra-encounter production action via direct Foundry API', {
      userId,
      hasAudiofile: !!audiofile,
      correlationId: req.correlationId
    });

    const result = await mediaUploadService.createIntraencounterProduction({
      timestamp,
      user_id: userId,
      audiofile,
      transcript,
      location,
      provider_name: provider_name || providerName,
      speciality,
      hospital
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to apply intra-encounter action', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as intraencounterRouter };


