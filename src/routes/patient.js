import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { client as osdkClient, osdkHost, osdkOntologyRid } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { createConfidentialOauthClient } from '@osdk/oauth';

const router = express.Router();

// Initialize Foundry service
const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID,
  medicationsActionId: process.env.FOUNDRY_MEDICATIONS_ACTION_ID,
  medicationsUploadObjectType: process.env.FOUNDRY_MEDICATIONS_OBJECT_TYPE
});

// Derive human-friendly profile fields from JWT claims/headers
function deriveProfileFromClaims(req) {
  try {
    const emailClaim = typeof req.user?.email === 'string' ? req.user.email.trim() : undefined;
    const preferred = typeof req.user?.preferred_username === 'string' ? req.user.preferred_username.trim() : undefined;
    const nickname = typeof req.user?.nickname === 'string' ? req.user.nickname.trim() : undefined;
    const name = typeof req.user?.name === 'string' ? req.user.name.trim() : undefined;
    const givenName = typeof req.user?.given_name === 'string' ? req.user.given_name.trim() : undefined;
    const familyName = typeof req.user?.family_name === 'string' ? req.user.family_name.trim() : undefined;
    const headerUsername = typeof req.context?.username === 'string' ? req.context.username.trim() : undefined;

    const resolvedEmail = emailClaim || (preferred?.includes('@') ? preferred : undefined) || (headerUsername?.includes('@') ? headerUsername : undefined) || undefined;
    const displaySource = name || headerUsername || preferred || nickname || (resolvedEmail ? resolvedEmail.split('@')[0] : undefined);

    let firstName = givenName;
    let lastName = familyName;

    if (!firstName || !lastName) {
      if (displaySource && displaySource.includes(' ')) {
        const parts = displaySource.split(/\s+/).filter(Boolean);
        firstName = firstName || parts[0];
        lastName = lastName || parts.slice(1).join(' ');
      } else if (!firstName && displaySource) {
        firstName = displaySource;
      }
    }

    return {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: resolvedEmail || emailClaim || undefined
    };
  } catch {
    return { firstName: undefined, lastName: undefined, email: undefined };
  }
}

// REST API fallback for patient profile search
async function searchPatientProfileViaREST(value, fieldCandidates, limit, correlationId) {
  try {
    const tokenProvider = createConfidentialOauthClient(
      process.env.FOUNDRY_CLIENT_ID,
      process.env.FOUNDRY_CLIENT_SECRET,
      osdkHost,
      ['api:use-ontologies-read']
    );
    
    const token = await tokenProvider();
    const pageSize = Math.max(Math.min(parseInt(limit, 10) || 1, 100), 1);
    
    // Convert ontology RID format for REST API
    let restOntologyRid = osdkOntologyRid;
    if (osdkOntologyRid.startsWith('ri.ontology.main.ontology.')) {
      const uuid = osdkOntologyRid.replace('ri.ontology.main.ontology.', '');
      restOntologyRid = `ontology-${uuid}`;
    }
    
    const searchUrl = `${osdkHost}/api/v2/ontologies/${restOntologyRid}/objects/A/search`;
    
    // Try each field candidate
    for (const field of fieldCandidates) {
      const searchPayload = {
        where: {
          type: 'eq',
          field: field,
          value: value
        },
        orderBy: {
          fields: [{ field: field, direction: 'asc' }]
        },
        pageSize: pageSize
      };
      
      logger.info('REST API patient profile search attempt', {
        searchUrl,
        field,
        value,
        correlationId
      });
      
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchPayload)
      });
      
      if (!response.ok) {
        logger.warn('REST API search failed for field', {
          field,
          status: response.status,
          statusText: response.statusText,
          correlationId
        });
        continue;
      }
      
      const searchResult = await response.json();
      
      if (searchResult.data && searchResult.data.length > 0) {
        const objects = searchResult.data.map(record => ({
          rid: record.rid || record.__rid,
          properties: record,
          ontologyId: osdkOntologyRid,
          sourceURL: searchUrl,
          httpStatus: 200
        }));
        
        logger.info('REST API patient profile search success', {
          field,
          count: objects.length,
          correlationId
        });
        
        return {
          success: true,
          objects,
          source: 'REST_API'
        };
      }
    }
    
    logger.info('REST API patient profile search returned no results', {
      value,
      fields: fieldCandidates,
      correlationId
    });
    
    return {
      success: true,
      objects: [],
      source: 'REST_API'
    };
    
  } catch (error) {
    logger.error('REST API patient profile search failed', {
      error: error.message,
      correlationId
    });
    throw error;
  }
}

// Get patient dashboard
router.post('/dashboard', validateTokenWithScopes(['read:patient', 'read:dashboard']), async (req, res, next) => {
  try {
    const { patientId } = req.body;

    let effectivePatientId = patientId;

    // If patientId is not provided, attempt to resolve it via OSDK search using user identity
    if (!effectivePatientId) {
      const identifierCandidates = [
        typeof req.context?.username === 'string' ? req.context.username : undefined,
        req.user?.sub
      ].filter(Boolean);

      // Check if OSDK client is available for patient ID resolution
      if (!osdkClient || typeof osdkClient !== 'function') {
        logger.warn('OSDK client not available for patient ID resolution, skipping', {
          correlationId: req.correlationId
        });
      } else {
        try {
          const patientObjects = osdkClient('A');

          for (const identifier of identifierCandidates) {
            try {
              const page = await patientObjects.where({ user_id: { $eq: identifier } }).fetchPage({ $pageSize: 1 });
              if (page.data.length > 0) {
                const properties = JSON.parse(JSON.stringify(page.data[0]));
                effectivePatientId = properties.patientId
                  ?? properties.user_id
                  ?? properties.userId
                  ?? properties.$primaryKey
                  ?? properties.$rid
                  ?? null;

                logger.info('Resolved patientId via OSDK search', {
                  identifierType: 'user_id',
                  identifier,
                  resolvedPatientId: effectivePatientId,
                  correlationId: req.correlationId
                });
                break;
              }
            } catch (error) {
              logger.warn('OSDK patientId resolution attempt failed', {
                identifierType: 'user_id',
                identifier,
                error: error.message,
                correlationId: req.correlationId
              });
            }
          }
        } catch (error) {
          logger.warn('OSDK client initialization failed, skipping patient ID resolution', {
            error: error.message,
            correlationId: req.correlationId
          });
        }
      }
    }

    // If OSDK resolution failed, use Auth0 user ID as fallback
    if (!effectivePatientId && req.user?.sub) {
      effectivePatientId = req.user.sub;
      logger.info('Using Auth0 user ID as fallback patient ID', {
        patientId: effectivePatientId,
        correlationId: req.correlationId
      });
    }

    if (!effectivePatientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'Patient ID is required and could not be resolved from identity',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Fetching patient dashboard', {
      patientId: effectivePatientId,
      user: req.user.sub,
      username: req.context?.username,
      correlationId: req.correlationId
    });

    // Try to get patient profile data from OSDK first, fall back to basic info
    let dashboardData = {
      patientId: effectivePatientId,
      resolved: true,
      source: 'backend-proxy',
      availableEndpoints: [
        '/api/v1/foundry/conditions',
        '/api/v1/foundry/encounters', 
        '/api/v1/foundry/observations',
        '/api/v1/foundry/procedures',
        '/api/v1/foundry/clinical-notes',
        '/api/v1/foundry/medications'
      ]
    };

    // Try to get patient profile data - OSDK first, then REST API fallback
    let profileFound = false;
    
    if (osdkClient && typeof osdkClient === 'function') {
      try {
        const patientObjects = osdkClient('A');
        const page = await patientObjects.where({ user_id: { $eq: effectivePatientId } }).fetchPage({ $pageSize: 1 });
        
        if (page.data.length > 0) {
          const patientProfile = JSON.parse(JSON.stringify(page.data[0]));
          
          // Merge patient profile data into dashboard response
          dashboardData = {
            ...dashboardData,
            rid: patientProfile.$primaryKey || patientProfile.$rid,
            properties: {
              firstName: patientProfile.firstName,
              lastName: patientProfile.lastName,
              email: patientProfile.email,
              phonenumber: patientProfile.phonenumber,
              address: patientProfile.address,
              user_id: patientProfile.user_id,
              patientId: patientProfile.patientId || effectivePatientId,
              ...patientProfile
            }
          };
          
          profileFound = true;
          logger.info('Enhanced dashboard with patient profile data (OSDK)', {
            patientId: effectivePatientId,
            hasFirstName: !!patientProfile.firstName,
            hasLastName: !!patientProfile.lastName,
            correlationId: req.correlationId
          });
        }
      } catch (profileError) {
        logger.warn('OSDK failed for dashboard profile, trying REST API fallback', {
          patientId: effectivePatientId,
          error: profileError.message,
          correlationId: req.correlationId
        });
      }
    }
    
    // If OSDK didn't work, try REST API fallback
    if (!profileFound) {
      try {
        const restResult = await searchPatientProfileViaREST(
          effectivePatientId, 
          ['user_id', 'patientId', 'patient_id'], 
          1, 
          req.correlationId
        );
        
        if (restResult.objects && restResult.objects.length > 0) {
          const patientProfile = restResult.objects[0].properties;
          
          // Merge patient profile data into dashboard response
          dashboardData = {
            ...dashboardData,
            rid: restResult.objects[0].rid,
            properties: {
              firstName: patientProfile.firstName,
              lastName: patientProfile.lastName,
              email: patientProfile.email,
              phonenumber: patientProfile.phonenumber,
              address: patientProfile.address,
              user_id: patientProfile.user_id,
              patientId: patientProfile.patientId || effectivePatientId,
              ...patientProfile
            }
          };
          
          profileFound = true;
          logger.info('Enhanced dashboard with patient profile data (REST API)', {
            patientId: effectivePatientId,
            hasFirstName: !!patientProfile.firstName,
            hasLastName: !!patientProfile.lastName,
            correlationId: req.correlationId
          });
        }
      } catch (restError) {
        logger.warn('REST API also failed for dashboard profile', {
          patientId: effectivePatientId,
          error: restError.message,
          correlationId: req.correlationId
        });
      }
    }
    
    // If neither OSDK nor REST API worked, use fallback
    if (!profileFound) {
      // Create a fallback patient profile from claims when possible
      const claims = deriveProfileFromClaims(req);
      const userIdParts = effectivePatientId.split('|');
      const userIdentifier = userIdParts.length > 1 ? userIdParts[1] : effectivePatientId;

      dashboardData = {
        ...dashboardData,
        rid: `patient-${userIdentifier}`,
        properties: {
          firstName: claims.firstName || 'Atlas',
          lastName: claims.lastName || 'Patient',
          email: claims.email || req.user.email || `${userIdentifier}@example.com`,
          user_id: effectivePatientId,
          patientId: effectivePatientId,
          source: 'fallback-profile'
        }
      };
      
      logger.info('Using fallback patient profile (no data source available)', {
        patientId: effectivePatientId,
        correlationId: req.correlationId
      });
    }

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
      : ['user_id', 'userId', 'patientId', 'patient_id'];

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
    
    // Try OSDK client first, fallback to REST API if it fails
    let useRestApiFallback = false;
    let patientObjects;
    
    if (!osdkClient || typeof osdkClient !== 'function') {
      logger.warn('OSDK client not available, using REST API fallback', {
        osdkClientType: typeof osdkClient,
        correlationId: req.correlationId
      });
      useRestApiFallback = true;
    } else {
      try {
        patientObjects = osdkClient('A');
      } catch (error) {
        logger.warn('OSDK client failed, falling back to REST API', {
          error: error.message,
          correlationId: req.correlationId,
          user: req.user.sub
        });
        useRestApiFallback = true;
      }
    }
    
    // Use REST API fallback if OSDK failed
    if (useRestApiFallback) {
      try {
        const restResult = await searchPatientProfileViaREST(value, uniqueCandidates, pageSize, req.correlationId);
        
        return res.json({
          success: true,
          data: {
            ontologyId: osdkOntologyRid,
            requestUrl,
            response: { objects: restResult.objects }
          },
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        });
      } catch (restError) {
        logger.error('Both OSDK and REST API failed for patient profile search', {
          restError: restError.message,
          correlationId: req.correlationId,
          user: req.user.sub
        });
        return res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
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
