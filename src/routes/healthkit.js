import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

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

// Target dataset RID for HealthKit raw data uploads (single JSON file per request)
const HEALTHKIT_DATASET_RID = 'ri.foundry.main.dataset.19102749-23e6-4fa8-827e-70eae2b94730';

/**
 * Helper function to upload HealthKit data to Foundry dataset
 * Shared by /export, /export/batch, and /ingest endpoints
 */
async function uploadHealthKitToDataset(auth0id, rawhealthkit, device, timestamp, correlationId) {
  // Parse NDJSON into array of JSON objects
  const decodedBuffer = Buffer.from(rawhealthkit, 'base64');
  const ndjson = decodedBuffer.toString('utf-8');
  const lines = ndjson.split(/\r?\n/).filter(l => l.trim().length > 0);
  const records = [];
  
  try {
    for (const line of lines) {
      records.push(JSON.parse(line));
    }
  } catch (parseError) {
    const error = new Error('rawhealthkit must be base64-encoded NDJSON');
    error.code = 'INVALID_NDJSON';
    error.status = 400;
    throw error;
  }

  // Build single-file JSON payload with metadata wrapper
  const exportTimestamp = typeof timestamp === 'string' && timestamp.length > 0
    ? timestamp
    : new Date().toISOString();
  const exportDevice = typeof device === 'string' && device.length > 0
    ? device
    : 'unknown';

  const jsonContent = JSON.stringify({
    metadata: {
      auth0_user_id: auth0id,
      device: exportDevice,
      timestamp: exportTimestamp
    },
    data: records
  });

  logger.info('Uploading HealthKit data to dataset', {
    datasetRid: HEALTHKIT_DATASET_RID,
    recordCount: records.length,
    user: auth0id,
    correlationId
  });

  // Get OAuth token for Foundry
  const tokenResponse = await fetch(process.env.FOUNDRY_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.FOUNDRY_CLIENT_ID,
      client_secret: process.env.FOUNDRY_CLIENT_SECRET,
      scope: 'api:datasets-read api:datasets-write'
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get Foundry token: ${tokenResponse.status}`);
  }

  const { access_token } = await tokenResponse.json();

  // Generate filename with timestamp
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `healthkit/raw/${auth0id}/${safeTimestamp}.json`;

  // Upload file directly to Foundry dataset using Datasets API v2
  const uploadUrl = `${process.env.FOUNDRY_HOST}/api/v2/datasets/${HEALTHKIT_DATASET_RID}/files/${encodeURIComponent(fileName)}/upload?transactionType=APPEND`;

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/octet-stream'
    },
    body: jsonContent
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    logger.error('Failed to upload HealthKit JSON to Foundry dataset', {
      status: uploadResponse.status,
      error: errorText,
      correlationId
    });
    throw new Error(`Foundry upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  const uploadResult = await uploadResponse.json();
  const transactionRid = uploadResult.transactionRid;

  logger.info('Successfully uploaded HealthKit JSON to Foundry dataset', {
    datasetRid: HEALTHKIT_DATASET_RID,
    transactionRid,
    filePath: fileName,
    recordCount: records.length,
    auth0UserId: auth0id,
    correlationId
  });

  return {
    success: true,
    dataset_rid: HEALTHKIT_DATASET_RID,
    records_ingested: records.length,
    file_path: fileName,
    transaction_rid: transactionRid,
    ingestion_timestamp: new Date().toISOString(),
    correlationId
  };
}

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
    const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk (raw data before base64)
    const MAX_CHUNKS = 7; // Maximum 7 chunks per batch (~14MB raw, ~19MB base64)
    
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

    logger.info('Processing HealthKit batch export to dataset', {
      auth0id,
      correlationId: req.correlationId,
      chunkCount: chunks.length,
      totalRecords
    });

    // Process each chunk and upload to dataset
    const uploadResults = [];
    const errors = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const result = await uploadHealthKitToDataset(
          auth0id,
          chunk.rawhealthkit,
          chunk.device || 'iPhone',
          chunk.timestamp || new Date().toISOString(),
          req.correlationId
        );
        uploadResults.push({
          chunkIndex: i,
          ...result
        });
      } catch (error) {
        logger.error('Failed to upload HealthKit chunk to dataset', {
          chunkIndex: i,
          error: error.message,
          correlationId: req.correlationId
        });
        errors.push({
          chunkIndex: i,
          error: error.message
        });
      }
    }

    if (errors.length > 0 && uploadResults.length === 0) {
      // All chunks failed
      return res.status(500).json({
        error: {
          code: 'BATCH_UPLOAD_FAILED',
          message: 'All chunks failed to upload',
          details: errors,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(200).json({
      success: true,
      dataset_rid: HEALTHKIT_DATASET_RID,
      chunks_processed: chunks.length,
      chunks_successful: uploadResults.length,
      chunks_failed: errors.length,
      total_records: totalRecords,
      upload_results: uploadResults,
      errors: errors.length > 0 ? errors : undefined,
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

    logger.info('Processing HealthKit raw export to dataset', {
      auth0id,
      correlationId: req.correlationId,
      recordCount: Number.isInteger(recordCount) ? recordCount : 'unknown',
      payloadBytes: decoded.length
    });

    const result = await uploadHealthKitToDataset(
      auth0id,
      rawhealthkit,
      exportDevice,
      exportTimestamp,
      req.correlationId
    );

    res.status(200).json({
      ...result,
      manifest: manifest || null
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

/**
 * Ingest HealthKit base64 NDJSON and write as a single JSON file to Foundry dataset
 * Mirrors the Fasten FHIR dataset upload pipeline using Datasets API v2
 */
router.post('/ingest', async (req, res, next) => {
  try {
    const auth0id = req.user?.sub;
    if (!auth0id) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 identifier for HealthKit ingestion',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { rawhealthkit, timestamp, device } = req.body || {};
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

    let decodedBuffer;
    try {
      decodedBuffer = Buffer.from(rawhealthkit, 'base64');
    } catch (error) {
      logger.warn('HealthKit ingest payload is not valid base64', {
        error: error.message,
        correlationId: req.correlationId,
        user: auth0id
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

    // Enforce size limit similar to /export (5 MB raw NDJSON)
    const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
    if (!decodedBuffer || decodedBuffer.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'rawhealthkit decoded payload is empty',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    if (decodedBuffer.length > MAX_PAYLOAD_BYTES) {
      logger.warn('HealthKit ingest exceeds payload limit', {
        size: decodedBuffer.length,
        limit: MAX_PAYLOAD_BYTES,
        correlationId: req.correlationId,
        user: auth0id
      });
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'HealthKit ingest exceeds supported payload size',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Use shared helper function for dataset upload
    const result = await uploadHealthKitToDataset(
      auth0id,
      rawhealthkit,
      device,
      timestamp,
      req.correlationId
    );

    res.json(result);
  } catch (error) {
    logger.error('Failed to ingest HealthKit data to dataset', {
      error: error.message,
      stack: error.stack,
      datasetRid: HEALTHKIT_DATASET_RID,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as healthkitRouter };
