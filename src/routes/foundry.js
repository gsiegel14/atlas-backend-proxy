import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';

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

// Generic action invocation endpoint
router.post('/actions/:actionId/invoke', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const { actionId } = req.params;
    const { parameters = {} } = req.body;

    // Allowlist of permitted actions for security
    const allowedActions = [
      'getPatientDashboard',
      'getHealthRecords',
      'uploadDocument',
      'createPatient',
      'updatePatient',
      'searchPatients',
      'getMedications',
      'addMedication',
      'getVisits',
      'createVisit'
    ];

    if (!allowedActions.includes(actionId)) {
      return res.status(403).json({
        error: {
          code: 'ACTION_NOT_ALLOWED',
          message: `Action '${actionId}' is not permitted`,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Invoking Foundry action', {
      actionId,
      user: req.user.sub,
      username: req.context?.username,
      correlationId: req.correlationId,
      parametersCount: Object.keys(parameters).length
    });

    // Add user context to parameters
    const enhancedParameters = {
      ...parameters,
      userId: req.user.sub,
      username: req.context?.username,
      requestTimestamp: new Date().toISOString(),
      correlationId: req.correlationId
    };

    const result = await foundryService.invokeAction(actionId, enhancedParameters);

    res.json({
      success: true,
      actionId,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to invoke Foundry action:', {
      actionId: req.params.actionId,
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// SQL query endpoint
router.post('/query', validateTokenWithScopes(['execute:queries']), async (req, res, next) => {
  try {
    const { query, parameters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: {
          code: 'MISSING_QUERY',
          message: 'SQL query is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Basic SQL injection protection - only allow SELECT statements
    const trimmedQuery = query.trim().toUpperCase();
    if (!trimmedQuery.startsWith('SELECT')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_QUERY',
          message: 'Only SELECT queries are allowed',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Executing Foundry SQL query', {
      user: req.user.sub,
      correlationId: req.correlationId,
      queryLength: query.length
    });

    const result = await foundryService.executeQuery(query, {
      ...parameters,
      userId: req.user.sub
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to execute SQL query:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Get patient profile by user_id
router.get('/patient/profile', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const userId = req.user.sub; // Use the authenticated user's ID
    
    logger.info('Fetching patient profile', {
      userId,
      correlationId: req.correlationId
    });

    const profile = await foundryService.getPatientProfile(userId);

    if (!profile) {
      return res.status(404).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'No patient profile found for this user',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to fetch patient profile:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Get ontology metadata
router.get('/ontology/metadata', validateTokenWithScopes(['read:ontology']), async (req, res, next) => {
  try {
    logger.info('Fetching ontology metadata', {
      user: req.user.sub,
      correlationId: req.correlationId
    });

    const metadata = await foundryService.apiCall('GET', '/api/v1/ontology/metadata');

    res.json({
      success: true,
      data: metadata,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to fetch ontology metadata:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as foundryRouter };
