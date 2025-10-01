import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { AtlasIntraencounterService } from '../services/atlasIntraencounterService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const atlasService = new AtlasIntraencounterService();
const expectedOntologyId = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';

logger.info('[AtlasIntraencounterHistory] Router module loaded and initialized');

// POST search endpoint for OSDK-style queries
router.post('/v2/ontologies/:ontologyId/objects/AtlasIntraencounterProduction/search',
  validateTokenWithScopes(['execute:actions']),
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
      if (ontologyId !== expectedOntologyId) {
        return res.status(400).json({
          error: 'Invalid ontology ID',
          expected: expectedOntologyId,
          received: ontologyId
        });
      }

      let results;

      // OSDK-style where clause: { userId: { $eq: "value" } }
      if (where && where.userId && where.userId.$eq) {
        const userId = where.userId.$eq;
        
        // Filter out non-existent fields from select if provided
        const validFields = ['audiofileId', 'audiofile', 'hospital', 'llmSummary', 
                           'location', 'providerName', 'speciality', 'timestamp', 
                           'transcript', 'userId'];
        const filteredSelect = select ? select.filter(field => validFields.includes(field)) : undefined;
        
        results = await atlasService.searchByUserId(userId, {
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          select: filteredSelect,
          includeRid
        });

        res.json({
          data: results,
          nextPageToken: null,
          hasMore: false
        });
      }
      // Legacy format: { field: 'userId', type: 'eq', value: 'xxx' }
      else if (where && where.field === 'userId' && where.type === 'eq') {
        results = await atlasService.searchByUserId(where.value, {
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          select,
          includeRid
        });

        res.json({
          data: results,
          nextPageToken: null,
          hasMore: false
        });
      }
      // No where clause - fetch all
      else {
        res.status(400).json({
          error: 'Invalid search parameters',
          message: 'Please provide a where clause with userId filter'
        });
      }
    } catch (error) {
      logger.error('Error in Atlas Intraencounter search endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.sub
      });
      next(error);
    }
  }
);

router.get('/user/:userId/intraencounter-history',
  validateTokenWithScopes(['execute:actions']),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const {
        pageSize = 30,
        select,
        includeRid = false
      } = req.query ?? {};

      logger.info('Fetching intra-encounter history for user', {
        userId,
        pageSize,
        select,
        includeRid,
        requestingUser: req.user?.sub
      });

      if (req.user?.sub !== userId && !req.user?.scope?.includes('read:all-intraencounter-history')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only access your own intra-encounter history'
        });
      }

      const results = await atlasService.searchByUserId(userId, {
        pageSize: Math.min(parseInt(pageSize) || 30, 100),
        select: typeof select === 'string' ? select.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        includeRid: includeRid === true || includeRid === 'true'
      });

      res.json({
        userId,
        entries: results,
        count: results.length
      });
    } catch (error) {
      logger.error('Error fetching intra-encounter history for user', {
        userId: req.params.userId,
        error: error.message,
        stack: error.stack,
        requestingUser: req.user?.sub
      });
      next(error);
    }
  }
);

export default router;
