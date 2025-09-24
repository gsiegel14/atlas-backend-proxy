import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID,
  intraencounterActionId: process.env.FOUNDRY_INTRAENCOUNTER_ACTION_ID
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

    logger.info('Applying intra-encounter production action', {
      userId,
      hasAudioRid: typeof audiofile === 'object' && Boolean(audiofile?.$rid),
      correlationId: req.correlationId
    });

    const result = await foundryService.createIntraencounterProduction({
      userId,
      timestamp,
      audiofile,
      transcript,
      location,
      providerName,
      provider_name,
      speciality,
      hospital,
      additionalParameters,
      options
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


