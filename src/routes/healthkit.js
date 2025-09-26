import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';
import {
  transformHealthkitNdjson,
  HEALTHKIT_TEXT_SCHEMA_VERSION
} from '../utils/healthkitPlaintext.js';

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
const isPlaintextExportEnabled = () => (process.env.HEALTHKIT_EXPORT_ENABLE_PLAINTEXT || '').toLowerCase() === 'true';
const resolvePlaintextMaxRows = () => {
  const rawValue = process.env.HEALTHKIT_PLAINTEXT_MAX_MD_ROWS ?? '200';
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
};

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

    const MAX_PAYLOAD_BYTES = 7 * 1024 * 1024; // 7 MB raw payload (~9.3 MB base64)
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

    let plaintexthealthkit = null;
    let plaintextTransform = null;
    if (isPlaintextExportEnabled()) {
      plaintextTransform = transformHealthkitNdjson(decoded, {
        maxMarkdownRows: resolvePlaintextMaxRows()
      });

      if (plaintextTransform.errors.length > 0) {
        logger.warn('HealthKit plaintext transform reported issues', {
          correlationId: req.correlationId,
          errors: plaintextTransform.errors
        });
      }

      plaintexthealthkit = {
        schemaVersion: HEALTHKIT_TEXT_SCHEMA_VERSION,
        ndjsonSha256: plaintextTransform.ndjsonSha256,
        recordCount: plaintextTransform.recordCount,
        columns: plaintextTransform.columns,
        markdownBase64: plaintextTransform.markdownTable
          ? Buffer.from(plaintextTransform.markdownTable, 'utf8').toString('base64')
          : null,
        csvBase64: plaintextTransform.csv
          ? Buffer.from(plaintextTransform.csv, 'utf8').toString('base64')
          : null,
        generatedAt: new Date().toISOString(),
        transformErrors: plaintextTransform.errors
      };

      logger.info('Generated HealthKit plaintext artifact', {
        recordCount: plaintextTransform.recordCount,
        ndjsonSha256: plaintextTransform.ndjsonSha256,
        correlationId: req.correlationId
      });
    }

    const result = await foundryService.createHealthkitRaw({
      auth0id,
      rawhealthkit,
      timestamp: exportTimestamp,
      device: exportDevice,
      plaintexthealthkit,
      options: { $returnEdits: true }, // Match TypeScript SDK format
      ontologyId: ONTOLOGY_ID
    });

    res.status(200).json({
      success: true,
      data: result,
      manifest: manifest || null,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      plaintext: isPlaintextExportEnabled() && plaintexthealthkit
        ? {
            schemaVersion: plaintexthealthkit.schemaVersion,
            recordCount: plaintexthealthkit.recordCount,
            ndjsonSha256: plaintexthealthkit.ndjsonSha256,
            markdownBytes: plaintextTransform?.markdownTable
              ? Buffer.byteLength(plaintextTransform.markdownTable, 'utf8')
              : 0,
            csvBytes: plaintextTransform?.csv
              ? Buffer.byteLength(plaintextTransform.csv, 'utf8')
              : 0
          }
        : null
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
