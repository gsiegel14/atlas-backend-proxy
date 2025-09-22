import express from 'express';
import { A } from '@atlas-dev/sdk';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { client as osdkClient, osdkHost, osdkOntologyRid } from '../osdk/client.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Initialize Foundry service
const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL
});

// Get patient dashboard
router.post('/dashboard', validateTokenWithScopes(['read:patient', 'read:dashboard']), async (req, res, next) => {
  try {
    const { patientId } = req.body;
    
    if (!patientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'Patient ID is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Fetching patient dashboard', {
      patientId,
      user: req.user.sub,
      username: req.context?.username,
      correlationId: req.correlationId
    });

    // Call Foundry action to get patient dashboard
    const dashboardData = await foundryService.invokeAction('getPatientDashboard', {
      patientId,
      userId: req.user.sub,
      username: req.context?.username
    });

    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to fetch patient dashboard:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Search patient profile via Ontology object search (OSDK client; no SQL)
router.post('/profile/search', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const {
      value,
      fieldCandidates = [],
      limit = 10,
      ontologyIds = [],
      objectTypePath = 'A'
    } = req.body;

    if (!value) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'value is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (objectTypePath !== 'A') {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_OBJECT_TYPE',
          message: `Object type '${objectTypePath}' is not supported by the proxy`,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const candidates = Array.isArray(fieldCandidates) && fieldCandidates.length > 0
      ? fieldCandidates
      : ['patientId', 'user_id', 'userId'];

    const uniqueCandidates = Array.from(new Set(['patientId', ...candidates])).filter(Boolean);
    const requestedOntologyIds = Array.isArray(ontologyIds) ? ontologyIds : [];
    if (requestedOntologyIds.length > 0 && !requestedOntologyIds.includes(osdkOntologyRid)) {
      logger.warn('Ignoring unsupported ontology identifiers for patient profile search', {
        requestedOntologyIds,
        supportedOntologyId: osdkOntologyRid,
        correlationId: req.correlationId
      });
    }

    const pageSize = Math.max(Math.min(parseInt(limit, 10) || 1, 100), 1);
    const requestUrl = `${osdkHost}/api/v2/ontologies/${osdkOntologyRid}/objects/${objectTypePath}/search`;
    const patientObjects = osdkClient(A);
    let lastObjects = [];

    logger.info('Patient profile search request', {
      patientIdValue: value,
      candidates: uniqueCandidates,
      limit: pageSize,
      requestedOntologyIds,
      usingOntologyId: osdkOntologyRid,
      correlationId: req.correlationId
    });

    for (const field of uniqueCandidates) {
      const filter = { [field]: { $eq: value } };

      try {
        const objectSet = patientObjects.where(filter);
        const page = await objectSet.fetchPage({ $pageSize: pageSize });
        const objects = page.data.map(record => {
          const properties = JSON.parse(JSON.stringify(record));
          const rid = properties.$primaryKey ?? properties.$rid ?? properties.rid ?? properties.id ?? null;
          return {
            rid,
            properties,
            ontologyId: osdkOntologyRid,
            sourceURL: requestUrl,
            httpStatus: 200
          };
        });

        if (objects.length > 0) {
          logger.info('OSDK ontology search returned objects', {
            ontologyId: osdkOntologyRid,
            field,
            count: objects.length,
            correlationId: req.correlationId
          });

          return res.json({
            success: true,
            data: {
              ontologyId: osdkOntologyRid,
              requestUrl,
              response: { objects }
            },
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
          });
        }

        logger.info('OSDK ontology search returned zero objects', {
          ontologyId: osdkOntologyRid,
          field,
          patientIdValue: value,
          correlationId: req.correlationId
        });
        lastObjects = objects;
      } catch (error) {
        logger.warn('OSDK ontology search attempt failed', {
          ontologyId: osdkOntologyRid,
          field,
          error: error.message,
          correlationId: req.correlationId
        });
      }
    }

    try {
      const samplePage = await patientObjects.fetchPage({ $pageSize: Math.min(pageSize, 5) });
      const sampleIds = samplePage.data
        .map(record => JSON.parse(JSON.stringify(record)).patientId)
        .filter(Boolean)
        .slice(0, 5);
      logger.info('Patient profile search sample snapshot', {
        ontologyId: osdkOntologyRid,
        sampleSize: samplePage.data.length,
        samplePatientIds: sampleIds,
        correlationId: req.correlationId
      });
    } catch (sampleError) {
      logger.warn('Failed to fetch sample page from patient profiles', {
        ontologyId: osdkOntologyRid,
        error: sampleError.message,
        correlationId: req.correlationId
      });
    }

    logger.info('Patient profile search completed with no results', {
      ontologyId: osdkOntologyRid,
      patientIdValue: value,
      triedFields: uniqueCandidates,
      correlationId: req.correlationId
    });

    return res.json({
      success: true,
      data: {
        ontologyId: osdkOntologyRid,
        requestUrl,
        response: { objects: lastObjects }
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to execute patient profile search via OSDK', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Get health records
router.get('/health-records', validateTokenWithScopes(['read:health_records']), async (req, res, next) => {
  try {
    const { patientId, recordType, limit = 50, offset = 0 } = req.query;
    
    if (!patientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'Patient ID is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Fetching health records', {
      patientId,
      recordType,
      user: req.user.sub,
      username: req.context?.username,
      correlationId: req.correlationId
    });

    const healthRecords = await foundryService.invokeAction('getHealthRecords', {
      patientId,
      recordType,
      limit: parseInt(limit),
      offset: parseInt(offset),
      userId: req.user.sub,
      username: req.context?.username
    });

    res.json({
      success: true,
      data: healthRecords,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to fetch health records:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Upload patient document
router.post('/:patientId/documents', validateTokenWithScopes(['write:documents']), async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const documentData = req.body;

    if (!documentData || !documentData.content) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DOCUMENT',
          message: 'Document content is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Uploading patient document', {
      patientId,
      documentType: documentData.type,
      user: req.user.sub,
      username: req.context?.username,
      correlationId: req.correlationId
    });

    const result = await foundryService.uploadDocument(patientId, {
      ...documentData,
      userId: req.user.sub,
      username: req.context?.username,
      uploadedAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to upload document:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as patientRouter };
