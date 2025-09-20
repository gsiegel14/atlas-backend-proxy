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
