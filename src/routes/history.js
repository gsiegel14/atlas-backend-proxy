import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { AiChatHistoryService } from '../services/aiChatHistoryService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Legacy FoundryService for backward compatibility
const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID,
  chatHistoryActionId: process.env.FOUNDRY_CHAT_HISTORY_ACTION_ID
});

// New OSDK-based service for direct action invocation
const aiChatHistoryService = new AiChatHistoryService();

function resolveUsername(req) {
  if (typeof req.context?.username === 'string' && req.context.username.trim().length > 0) {
    return req.context.username.trim();
  }
  if (typeof req.user?.preferred_username === 'string' && req.user.preferred_username.trim().length > 0) {
    return req.user.preferred_username.trim();
  }
  if (typeof req.user?.nickname === 'string' && req.user.nickname.trim().length > 0) {
    return req.user.nickname.trim();
  }
  if (typeof req.user?.email === 'string' && req.user.email.trim().length > 0) {
    return req.user.email.trim();
  }
  return undefined;
}

function normalizeTimestamp(input) {
  if (!input) {
    return new Date().toISOString();
  }
  if (typeof input === 'string') {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString();
  }
  return new Date().toISOString();
}

router.post('/chat', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    logger.debug('POST /api/v1/history/chat endpoint called', {
      hasTranscript: !!req.body?.transcript,
      transcriptLength: req.body?.transcript?.length || 0,
      hasUserId: !!req.body?.user_id,
      userId: req.body?.user_id,
      correlationId: req.correlationId
    });
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';
    if (!transcript) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'transcript is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const resolvedUser = resolveUsername(req);
    const userIdFromBody = typeof req.body?.user_id === 'string' ? req.body.user_id.trim() : undefined;
    // Prefer explicit user_id from body (e.g., auth0|...) over header/claims-derived username
    const finalUserId = userIdFromBody || resolvedUser;

    if (!finalUserId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve user identity for chat history entry',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const timestampIso = normalizeTimestamp(req.body?.timestamp);
    const additionalParameters = req.body?.additionalParameters && typeof req.body.additionalParameters === 'object'
      ? req.body.additionalParameters
      : {};
    const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};

    logger.info('Creating AI chat history entry via OSDK action', {
      userId: finalUserId,
      transcriptLength: transcript.length,
      correlationId: req.correlationId,
      endpoint: '/api/v1/history',
      method: 'POST'
    });

    // Use direct OSDK action instead of legacy FoundryService
    const result = await aiChatHistoryService.createChatHistory({
      userId: finalUserId,
      transcript,
      timestamp: timestampIso
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to create AI chat history entry', {
      error: error.message,
      user: req.user?.sub,
      username: req.context?.username,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as historyRouter };
