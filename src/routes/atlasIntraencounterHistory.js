import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { AtlasIntraencounterService } from '../services/atlasIntraencounterService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
const atlasService = new AtlasIntraencounterService();
const expectedOntologyId = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';

logger.info('[AtlasIntraencounterHistory] Router module loaded and initialized');

// NOTE: AtlasIntraencounterProduction search endpoint moved to intraencounter.js
// This route was causing conflicts and using OSDK client which throws "not implemented"
// The new implementation in intraencounter.js uses direct Foundry API calls

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
