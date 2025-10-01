import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';
import { parseTranscriptionSummaryResult } from '../utils/transcriptionSummary.js';

const router = express.Router();

// Initialize Foundry service
const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID
});

// Generate LLM summary from raw transcript
router.post('/', validateTokenWithScopes(['execute:queries']), async (req, res, next) => {
  try {
    const { auth0Id, rawTranscript } = req.body;
    
    // Validation
    if (!auth0Id || !auth0Id.trim()) {
      return res.status(400).json({
        error: 'Missing auth0Id',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
    
    if (!rawTranscript || !rawTranscript.trim()) {
      return res.status(400).json({
        error: 'Empty transcript provided',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info('Generating transcription summary', {
      auth0Id,
      transcriptLength: rawTranscript.length,
      correlationId: req.correlationId
    });
    
    // Call Foundry transcriptionSummary query function
    const result = await foundryService.executeOntologyQuery('transcriptionSummary', {
      auth0Id: auth0Id.trim(),
      rawTranscript: rawTranscript.trim()
    });
    
    const summary = parseTranscriptionSummaryResult(result);

    if (!summary) {
      throw new Error('No summary returned from Foundry query');
    }
    
    logger.info('Transcription summary generated successfully', {
      auth0Id,
      summaryLength: summary.length,
      correlationId: req.correlationId
    });
    
    res.json({
      summary: summary
    });
    
  } catch (error) {
    logger.error('Failed to generate transcription summary', {
      error: error.message,
      stack: error.stack,
      auth0Id: req.body?.auth0Id,
      correlationId: req.correlationId
    });
    
    if (error.status === 404) {
      return res.status(500).json({
        error: 'Foundry query function not found',
        message: 'The transcriptionSummary query may not be configured in Foundry',
        correlationId: req.correlationId
      });
    }
    
    next(error);
  }
});

export { router as transcriptionSummaryRouter };
