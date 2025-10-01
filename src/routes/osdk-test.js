import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { client as osdkClient, A, FastenClinicalNotes } from '../osdk/client.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Test endpoint to verify OSDK client is working correctly
 * GET /api/v1/osdk-test
 */
router.get('/', validateTokenWithScopes(['read:patient']), async (req, res) => {
  try {
    // Check if OSDK client is initialized
    if (!osdkClient || typeof osdkClient !== 'function') {
      return res.status(503).json({ 
        success: false,
        error: 'OSDK client not initialized',
        message: 'Using REST API fallback mode',
        suggestion: 'Check OSDK client configuration and verify credentials',
        details: {
          clientType: typeof osdkClient,
          sdkTypesAvailable: {
            A: !!A,
            FastenClinicalNotes: !!FastenClinicalNotes
          }
        }
      });
    }

    // Check if SDK types are available
    if (!A) {
      return res.status(503).json({
        success: false,
        error: 'SDK types not available',
        message: '@atlas-dev/sdk package not installed or failed to load',
        suggestion: 'Run: FOUNDRY_TOKEN=xxx npm install',
        details: {
          clientInitialized: true,
          sdkPackageLoaded: false
        }
      });
    }

    // Test fetching patient profiles
    logger.info('Testing OSDK client', {
      user: req.user.sub,
      correlationId: req.correlationId
    });

    const patientResults = await osdkClient(A)
      .fetchPage({ $pageSize: 1 });

    let clinicalNotesResults = null;
    if (FastenClinicalNotes) {
      try {
        clinicalNotesResults = await osdkClient(FastenClinicalNotes)
          .fetchPage({ $pageSize: 1 });
      } catch (error) {
        logger.warn('Could not fetch clinical notes', { error: error.message });
      }
    }

    logger.info('OSDK test successful', {
      patientsCount: patientResults.data.length,
      clinicalNotesCount: clinicalNotesResults?.data.length || 0,
      user: req.user.sub,
      correlationId: req.correlationId
    });

    res.json({
      success: true,
      message: '✅ OSDK is working correctly!',
      results: {
        patients: {
          count: patientResults.data.length,
          hasMore: !!patientResults.nextPageToken,
          sampleFields: patientResults.data.length > 0 
            ? Object.keys(patientResults.data[0]).filter(k => !k.startsWith('$')).slice(0, 5)
            : []
        },
        clinicalNotes: clinicalNotesResults ? {
          count: clinicalNotesResults.data.length,
          hasMore: !!clinicalNotesResults.nextPageToken
        } : null
      },
      configuration: {
        ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID,
        hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
        hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET,
        hasToken: !!process.env.FOUNDRY_TOKEN,
        sdkTypesAvailable: {
          A: !!A,
          FastenClinicalNotes: !!FastenClinicalNotes
        }
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('OSDK test failed', {
      error: error.message,
      stack: error.stack,
      user: req.user.sub,
      correlationId: req.correlationId
    });

    res.status(500).json({
      success: false,
      error: error.message,
      message: 'OSDK test failed',
      suggestion: 'Check server logs for details. Verify OSDK client logs and SDK installation.',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  }
});

export { router as osdkTestRouter };

