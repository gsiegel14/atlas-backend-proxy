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
  medicationsActionId: process.env.FOUNDRY_MEDICATIONS_ACTION_ID,
  medicationsUploadObjectType: process.env.FOUNDRY_MEDICATIONS_OBJECT_TYPE
});

function resolveUserIdentifiers(req) {
  const username = typeof req.context?.username === 'string'
    ? req.context.username.trim()
    : undefined;
  return username ? [username] : [];
}

router.get('/uploads', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 username for this request',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const limit = parseInt(req.query.limit, 10) || 50;

    logger.info('Listing medications uploads', {
      identifiers,
      limit,
      correlationId: req.correlationId
    });

    const uploads = await foundryService.listMedicationsUploads(identifiers, { limit });

    res.json({
      success: true,
      data: uploads,
      count: uploads.length,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to list medications uploads', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

router.post('/uploads', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 username for this request',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const primaryUser = identifiers[0];
    const {
      timestamp,
      photolabel,
      photoRid,
      photoUrl,
      additionalParameters = {},
      options = {}
    } = req.body || {};

    const mediaCandidate = photolabel
      || (photoRid ? { $rid: photoRid } : null)
      || photoUrl;

    if (!mediaCandidate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'photolabel, photoRid, or photoUrl is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const normalizedMedia = FoundryService.normalizeMediaReference(mediaCandidate);

    logger.info('Creating medications upload', {
      userId: primaryUser,
      hasPhotoRid: typeof normalizedMedia === 'object' && Boolean(normalizedMedia?.$rid),
      correlationId: req.correlationId
    });

    const result = await foundryService.createMedicationsUpload({
      userId: primaryUser,
      timestamp,
      photolabel: normalizedMedia,
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
    logger.error('Failed to create medications upload', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as medicationsRouter };
