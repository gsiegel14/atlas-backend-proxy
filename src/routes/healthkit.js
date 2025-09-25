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
  healthkitRawActionId: process.env.FOUNDRY_HEALTHKIT_ACTION_ID
});

// Use the same hardcoded ontology RID as other working routes
const ONTOLOGY_ID = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';

// Batch export endpoint for multiple chunks
router.post('/export/batch', async (req, res, next) => {
  try {
    const auth0id = req.user?.sub;
    if (!auth0id) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 identifier for HealthKit export',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { chunks, options } = req.body || {};
    
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'chunks array is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Validate each chunk
    const requests = [];
    let totalRecords = 0;
    const MAX_CHUNK_SIZE = 3 * 1024 * 1024; // 3MB per chunk
    const MAX_CHUNKS = 5; // Maximum 5 chunks per batch
    
    if (chunks.length > MAX_CHUNKS) {
      return res.status(400).json({
        error: {
          code: 'TOO_MANY_CHUNKS',
          message: `Maximum ${MAX_CHUNKS} chunks allowed per batch`,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    for (const chunk of chunks) {
      const { rawhealthkit, timestamp, device, recordCount } = chunk;
      
      if (typeof rawhealthkit !== 'string' || rawhealthkit.length === 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Each chunk must have rawhealthkit (base64 NDJSON)',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      let decoded;
      try {
        decoded = Buffer.from(rawhealthkit, 'base64');
      } catch (error) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'rawhealthkit must be valid base64',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      if (decoded.length > MAX_CHUNK_SIZE) {
        return res.status(413).json({
          error: {
            code: 'CHUNK_TOO_LARGE',
            message: `Each chunk must be under ${MAX_CHUNK_SIZE / (1024 * 1024)}MB`,
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      requests.push({
        parameters: {
          auth0id,
          rawhealthkit,
          timestamp: timestamp || new Date().toISOString(),
          device: device || 'iPhone'
        }
      });
      
      totalRecords += recordCount || 0;
    }

    logger.info('Forwarding HealthKit batch export to Foundry', {
      auth0id,
      correlationId: req.correlationId,
      chunkCount: chunks.length,
      totalRecords
    });

    const result = await foundryService.batchCreateHealthkitRaw({
      requests,
      options: { returnEdits: options?.returnEdits || 'NONE' },
      ontologyId: ONTOLOGY_ID
    });

    res.status(200).json({
      success: true,
      data: result,
      chunkCount: chunks.length,
      totalRecords,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('HealthKit batch export failed', {
      error: error.message,
      correlationId: req.correlationId,
      user: req.user?.sub
    });
    next(error);
  }
});

router.post('/export', async (req, res, next) => {
  try {
    const auth0id = req.user?.sub;
    if (!auth0id) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 identifier for HealthKit export',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { rawhealthkit, timestamp, device, recordCount, manifest, options } = req.body || {};

    if (typeof rawhealthkit !== 'string' || rawhealthkit.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'rawhealthkit (base64 NDJSON) is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    let decoded;
    try {
      decoded = Buffer.from(rawhealthkit, 'base64');
    } catch (error) {
      logger.warn('HealthKit export payload is not valid base64', {
        error: error.message,
        correlationId: req.correlationId,
        user: req.user?.sub
      });
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'rawhealthkit must be valid base64',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!decoded || decoded.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'rawhealthkit decoded payload is empty',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB raw payload (~6.7 MB base64) - Foundry limit
    if (decoded.length > MAX_PAYLOAD_BYTES) {
      logger.warn('HealthKit export exceeds payload limit', {
        size: decoded.length,
        limit: MAX_PAYLOAD_BYTES,
        correlationId: req.correlationId,
        user: req.user?.sub
      });
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'HealthKit export exceeds supported payload size',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const exportTimestamp = typeof timestamp === 'string' && timestamp.length > 0
      ? timestamp
      : new Date().toISOString();
    const exportDevice = typeof device === 'string' && device.length > 0
      ? device
      : 'unknown';

    logger.info('Forwarding HealthKit raw export to Foundry', {
      auth0id,
      correlationId: req.correlationId,
      recordCount: Number.isInteger(recordCount) ? recordCount : 'unknown',
      payloadBytes: decoded.length
    });

    const result = await foundryService.createHealthkitRaw({
      auth0id,
      rawhealthkit,
      timestamp: exportTimestamp,
      device: exportDevice,
      options: { returnEdits: 'ALL' }, // Use the exact format Foundry expects
      ontologyId: ONTOLOGY_ID
    });

    res.status(200).json({
      success: true,
      data: result,
      manifest: manifest || null,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('HealthKit raw export failed', {
      error: error.message,
      correlationId: req.correlationId,
      user: req.user?.sub
    });
    next(error);
  }
});

export { router as healthkitRouter };
