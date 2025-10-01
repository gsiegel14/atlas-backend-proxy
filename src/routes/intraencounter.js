import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { MediaUploadService } from '../services/mediaUploadService.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';
import { resolveLlmSummary } from '../utils/transcriptionSummary.js';

const router = express.Router();

// Use MediaUploadService for direct Foundry action calls
const mediaUploadService = new MediaUploadService({
  foundryHost: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyApiName: 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194'
});

const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID
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

    const llmSummary = await resolveLlmSummary({
      existingSummary: req.body?.llm_summary
        || req.body?.summary
        || req.body?.aiSummary,
      transcript,
      auth0Id: req.body?.auth0Id || userId,
      foundryService,
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
      hospital,
      llm_summary: llmSummary
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

/**
 * POST /v2/ontologies/:ontologyId/objects/AtlasIntraencounterProduction/search
 * Search Atlas Intraencounter Production objects with filters
 */
router.post('/v2/ontologies/:ontologyId/objects/AtlasIntraencounterProduction/search',
  validateTokenWithScopes(['read:patient']),
  async (req, res, next) => {
    try {
      const { ontologyId } = req.params;
      const { 
        where,
        pageSize = 30,
        nextPageToken,
        select,
        includeRid = false
      } = req.body;

      logger.info('Searching Atlas Intraencounter Production objects', {
        ontologyId,
        where,
        pageSize,
        hasNextPageToken: !!nextPageToken,
        select,
        includeRid,
        userId: req.user?.sub
      });

      // Validate ontology ID
      const expectedOntologyId = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
      if (ontologyId !== expectedOntologyId) {
        return res.status(400).json({
          error: 'Invalid ontology ID',
          expected: expectedOntologyId,
          received: ontologyId
        });
      }

      // Get user ID for filtering
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_IDENTITY',
            message: 'Unable to resolve user identity for search',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Make direct call to Foundry API to search AtlasIntraencounterProduction objects
      try {
        // Get Foundry access token
        const token = await mediaUploadService.getFoundryToken();
        
        // Build search payload
        const searchPayload = {
          where: where || {
            type: "eq",
            field: "userId", 
            value: userId
          },
          pageSize: Math.min(parseInt(pageSize) || 30, 100)
        };

        if (select && Array.isArray(select)) {
          searchPayload.select = select;
        }

        if (includeRid) {
          searchPayload.includeRid = includeRid;
        }

        logger.info('Making direct Foundry API call for AtlasIntraencounterProduction search', {
          searchPayload,
          userId,
          correlationId: req.correlationId
        });

        // Make direct API call to Foundry
        const foundryHost = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
        const searchUrl = `${foundryHost}/api/v2/ontologies/${ontologyId}/objects/AtlasIntraencounterProduction/search`;
        
        const response = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(searchPayload)
        });

        if (!response.ok) {
          throw new Error(`Foundry API returned ${response.status}: ${response.statusText}`);
        }

        const foundryResult = await response.json();
        
        logger.info('Atlas Intraencounter search completed via Foundry API', {
          userId,
          resultCount: foundryResult.data?.length || 0,
          correlationId: req.correlationId
        });

        // Return results in the expected format
        res.json({
          data: foundryResult.data || [],
          nextPageToken: foundryResult.nextPageToken || null,
          hasMore: !!foundryResult.nextPageToken
        });

      } catch (searchError) {
        logger.warn('Foundry API search failed, returning empty results', {
          error: searchError.message,
          userId,
          correlationId: req.correlationId
        });

        // Return empty results instead of failing
        res.json({
          data: [],
          nextPageToken: null,
          hasMore: false
        });
      }

    } catch (error) {
      logger.error('Error in Atlas Intraencounter search endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.sub,
        correlationId: req.correlationId
      });
      next(error);
    }
  }
);

export { router as intraencounterRouter };
