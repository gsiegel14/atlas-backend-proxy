import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { AtlasIntraencounterService } from '../services/atlasIntraencounterService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const atlasService = new AtlasIntraencounterService();
const expectedOntologyId = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';

logger.info('[AtlasIntraencounterHistory] Router module loaded and initialized');

router.post('/v2/ontologies/:ontologyId/objects/AtlasIntraencounterProduction/search',
  validateTokenWithScopes(['execute:actions']),
  async (req, res, next) => {
    try {
      logger.debug('[AtlasIntraencounterHistory] Route handler MATCHED for search endpoint');
      
      const { ontologyId } = req.params;
      const {
        where,
        pageSize = 30,
        nextPageToken,
        select,
        includeRid = false
      } = req.body ?? {};

      const selectList = Array.isArray(select)
        ? select
        : typeof select === 'string'
          ? select.split(',').map(s => s.trim()).filter(Boolean)
          : undefined;

      logger.info('Searching Atlas intra-encounter productions', {
        ontologyId,
        where,
        pageSize,
        hasNextPageToken: !!nextPageToken,
        select,
        includeRid,
        requestPath: req.path,
        requestMethod: req.method
      });

      if (ontologyId !== expectedOntologyId) {
        return res.status(400).json({
          error: 'Invalid ontology ID',
          expected: expectedOntologyId,
          received: ontologyId
        });
      }

      // Only explicit userId equality search is supported at the moment for parity with MCP usage.
      if (where && where.field === 'userId' && where.type === 'eq') {
        const results = await atlasService.searchByUserId(where.value, {
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          select: selectList,
          includeRid
        });

        return res.json({
          data: results,
          nextPageToken: null,
          hasMore: false
        });
      }

      // Fallback to generic pagination when no where clause is provided.
      const result = await atlasService.fetchPage({
        pageSize: Math.min(parseInt(pageSize) || 30, 100),
        nextPageToken,
        select: selectList,
        includeRid
      });

      if (!result.success) {
        return res.status(500).json({
          error: 'Failed to fetch intra-encounter productions',
          details: result.error
        });
      }

      res.json({
        data: result.data,
        nextPageToken: result.nextPageToken,
        hasMore: result.hasMore
      });
    } catch (error) {
      logger.error('Error in intra-encounter search endpoint', {
        error: error.message,
        stack: error.stack
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
