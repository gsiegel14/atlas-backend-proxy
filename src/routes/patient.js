import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { client as osdkClient, osdkHost, osdkOntologyRid } from '../osdk/client.js';
import { logger } from '../utils/logger.js';

// Object type definition for OSDK queries
// This replaces the 'A' import from @atlas-dev/sdk
// The actual object type API name should be provided via environment variable
const OBJECT_TYPE_API_NAME = process.env.FOUNDRY_OBJECT_TYPE_API_NAME || 'A';

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
      : ['user_id', 'userId', 'patientId'];

    const ontologies = Array.isArray(ontologyIds) && ontologyIds.length > 0
      ? ontologyIds
      : [process.env.PATIENT_PROFILE_ONTOLOGY_ID].filter(Boolean);

    if (ontologies.length === 0) {
      return res.status(500).json({
        error: {
          code: 'MISSING_ONTOLOGY_ID',
          message: 'No ontology identifiers provided',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const pageSize = Math.max(Math.min(parseInt(limit, 10) || 1, 100), 1);
    const defaultOntologyId = ontologies.find(id => !id || id === osdkOntologyRid) ?? osdkOntologyRid;
    let lastResponse = { objects: [] };
    let lastOntologyId = defaultOntologyId;

    for (const ontologyId of ontologies) {
      if (ontologyId && ontologyId !== osdkOntologyRid) {
        logger.warn('Skipping ontologyId not supported by OSDK client', {
          ontologyId,
          supportedOntologyId: osdkOntologyRid,
          correlationId: req.correlationId
        });
        continue;
      }

      const effectiveOntologyId = ontologyId || osdkOntologyRid;

      for (const field of candidates) {
        const filter = { [field]: { $eq: value } };

        try {
          const objectSet = osdkClient(OBJECT_TYPE_API_NAME).where(filter);
          const page = await objectSet.fetchPage({ $pageSize: pageSize });
          const objects = page.data.map(record => {
            const properties = JSON.parse(JSON.stringify(record));
            const rid = properties.$primaryKey ?? properties.$rid ?? properties.rid ?? properties.id ?? null;
            return {
              rid,
              properties,
              ontologyId: effectiveOntologyId,
              sourceURL: `${osdkHost}/api/v2/ontologies/${effectiveOntologyId}/objects/${objectTypePath}/search`,
              httpStatus: 200
            };
          });

          const response = { objects };

          if (objects.length > 0) {
            logger.info('OSDK ontology search returned objects', {
              ontologyId: effectiveOntologyId,
              field,
              count: objects.length,
              correlationId: req.correlationId
            });

            return res.json({
              success: true,
              data: {
                ontologyId: effectiveOntologyId,
                requestUrl: `${osdkHost}/api/v2/ontologies/${effectiveOntologyId}/objects/${objectTypePath}/search`,
                response
              },
              timestamp: new Date().toISOString(),
              correlationId: req.correlationId
            });
          }

          lastResponse = response;
          lastOntologyId = effectiveOntologyId;
        } catch (error) {
          logger.warn('OSDK ontology search attempt failed', {
            ontologyId: effectiveOntologyId,
            field,
            error: error.message,
            correlationId: req.correlationId
          });
        }
      }
    }

    return res.json({
      success: true,
      data: {
        ontologyId: lastOntologyId,
        requestUrl: `${osdkHost}/api/v2/ontologies/${lastOntologyId}/objects/${objectTypePath}/search`,
        response: lastResponse
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
