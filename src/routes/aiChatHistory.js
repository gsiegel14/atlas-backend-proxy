import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { AiChatHistoryService } from '../services/aiChatHistoryService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Initialize AI Chat History service
const aiChatHistoryService = new AiChatHistoryService();

/**
 * GET /v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction
 * Fetch AI Chat History Production objects using the new OSDK v2 client pattern
 */
router.get('/v2/ontologies/:ontologyId/objects/AiChatHistoryProduction', 
  validateTokenWithScopes(['execute:actions']), 
  async (req, res, next) => {
    try {
      const { ontologyId } = req.params;
      const { 
        pageSize = 30, 
        nextPageToken, 
        select, 
        includeRid = false 
      } = req.query;

      logger.info('Fetching AI Chat History Production objects', {
        ontologyId,
        pageSize: parseInt(pageSize),
        hasNextPageToken: !!nextPageToken,
        select: select ? select.split(',') : undefined,
        includeRid: includeRid === 'true',
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

      // Parse query parameters
      const options = {
        pageSize: Math.min(parseInt(pageSize) || 30, 100), // Cap at 100
        nextPageToken: nextPageToken || undefined,
        select: select ? select.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        includeRid: includeRid === 'true'
      };

      // Fetch the page using the new OSDK client pattern
      const result = await aiChatHistoryService.fetchPage(options);

      if (result.success) {
        res.json({
          data: result.data,
          nextPageToken: result.nextPageToken,
          hasMore: result.hasMore
        });
      } else {
        res.status(500).json({
          error: 'Failed to fetch AI chat history',
          details: result.error
        });
      }
    } catch (error) {
      logger.error('Error in AI Chat History endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.sub
      });
      next(error);
    }
  }
);

/**
 * POST /v2/ontologies/:ontologyId/objects/AiChatHistoryProduction/search
 * Search AI Chat History Production objects with filters
 */
router.post('/v2/ontologies/:ontologyId/objects/AiChatHistoryProduction/search',
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

      logger.info('Searching AI Chat History Production objects', {
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

      // Support both old-style and OSDK-style where clauses
      let results;

      // OSDK-style where clause: { userId: { $eq: "value" } }
      if (where && where.userId && where.userId.$eq) {
        const userId = where.userId.$eq;
        
        logger.debug('Searching AI chat history by userId (OSDK style)', {
          userId,
          pageSize,
          select,
          includeRid,
          correlationId: req.correlationId
        });

        // Filter out non-existent fields from select if provided
        // Note: Database uses snake_case (user_id) but we also accept camelCase (userId) for backwards compatibility
        const validFields = ['chatId', 'transcript', 'userId', 'user_id', 'timestamp'];
        const filteredSelect = select ? select.filter(field => validFields.includes(field)) : undefined;
        
        if (select && filteredSelect) {
          logger.debug('Filtered invalid fields from AI chat history select', {
            original: select,
            filtered: filteredSelect,
            removed: select.filter(field => !validFields.includes(field))
          });
        }
        
        // If all fields were filtered out, use undefined to get default fields
        const finalSelect = filteredSelect && filteredSelect.length > 0 ? filteredSelect : undefined;

        results = await aiChatHistoryService.searchByUserId(userId, {
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          select: finalSelect,
          includeRid
        });

        logger.debug('AI chat history search completed', {
          userId,
          resultCount: results.length,
          correlationId: req.correlationId
        });

        logger.info('Sending AI chat history response to frontend', {
          userId,
          resultCount: results.length,
          sampleResult: results[0] ? {
            chatId: results[0].chatId,
            transcript: results[0].transcript?.substring(0, 50) + '...',
            timestamp: results[0].timestamp
          } : null
        });

        res.json({
          data: results,
          nextPageToken: null,
          hasMore: false
        });
      }
      // Legacy format: { field: 'userId', type: 'eq', value: 'xxx' }
      else if (where && where.field === 'userId' && where.type === 'eq') {
        logger.debug('Searching AI chat history by userId (legacy format)', {
          userId: where.value,
          pageSize,
          select,
          includeRid,
          correlationId: req.correlationId
        });

        // Filter out non-existent fields from select if provided
        // Note: Database uses snake_case (user_id) but we also accept camelCase (userId) for backwards compatibility
        const validFields = ['chatId', 'transcript', 'userId', 'user_id', 'timestamp'];
        const filteredSelect = select ? select.filter(field => validFields.includes(field)) : undefined;
        
        if (select && filteredSelect) {
          logger.debug('Filtered invalid fields from AI chat history select (legacy)', {
            original: select,
            filtered: filteredSelect,
            removed: select.filter(field => !validFields.includes(field))
          });
        }
        
        // If all fields were filtered out, use undefined to get default fields
        const finalSelect = filteredSelect && filteredSelect.length > 0 ? filteredSelect : undefined;

        results = await aiChatHistoryService.searchByUserId(where.value, {
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          select: finalSelect,
          includeRid
        });

        logger.debug('AI chat history search completed', {
          userId: where.value,
          resultCount: results.length,
          correlationId: req.correlationId
        });

        logger.info('Sending AI chat history response to frontend', {
          userId: where.value,
          resultCount: results.length,
          sampleResult: results[0] ? {
            chatId: results[0].chatId,
            transcript: results[0].transcript?.substring(0, 50) + '...',
            timestamp: results[0].timestamp
          } : null
        });

        res.json({
          data: results,
          nextPageToken: null,
          hasMore: false
        });
      }
      // No where clause - fetch all
      else {
        logger.debug('Fetching all AI chat history (no filter)', {
          pageSize,
          correlationId: req.correlationId
        });

        const result = await aiChatHistoryService.fetchPage({
          pageSize: Math.min(parseInt(pageSize) || 30, 100),
          nextPageToken,
          select,
          includeRid
        });

        if (result.success) {
          res.json({
            data: result.data,
            nextPageToken: result.nextPageToken,
            hasMore: result.hasMore
          });
        } else {
          res.status(500).json({
            error: 'Failed to fetch AI chat history',
            details: result.error
          });
        }
      }
    } catch (error) {
      logger.error('Error in AI Chat History search endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.sub
      });
      next(error);
    }
  }
);

/**
 * GET /user/:userId/chat-history
 * Get chat history for a specific user (convenience endpoint)
 */
router.get('/user/:userId/chat-history',
  validateTokenWithScopes(['execute:actions']),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { 
        pageSize = 30,
        select,
        includeRid = false
      } = req.query;

      logger.info('Fetching chat history for user', {
        userId,
        pageSize: parseInt(pageSize),
        select,
        includeRid: includeRid === 'true',
        requestingUser: req.user?.sub
      });

      // Security check: users can only access their own chat history
      if (req.user?.sub !== userId && !req.user?.scope?.includes('read:all-chat-history')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only access your own chat history'
        });
      }

      const options = {
        pageSize: Math.min(parseInt(pageSize) || 30, 100),
        select: select ? select.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        includeRid: includeRid === 'true'
      };

      const results = await aiChatHistoryService.searchByUserId(userId, options);

      res.json({
        userId,
        chatHistory: results,
        count: results.length
      });
    } catch (error) {
      logger.error('Error fetching user chat history', {
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
