import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Target dataset RID for Fasten FHIR data
const FASTEN_FHIR_DATASET_RID = 'ri.foundry.main.dataset.3a90fb2b-7e9a-4a03-94b0-30839be53091';

/**
 * Ingest data directly to a Foundry dataset
 * This endpoint is specifically designed for Fasten FHIR data ingestion
 */
router.post('/ingest', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const { dataset_rid, records, metadata } = req.body;
    
    // Validate required fields
    if (!dataset_rid || !records || !Array.isArray(records)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'dataset_rid and records array are required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Security check - only allow ingestion to the Fasten FHIR dataset
    if (dataset_rid !== FASTEN_FHIR_DATASET_RID) {
      logger.warn('Attempt to ingest to unauthorized dataset', {
        requestedDataset: dataset_rid,
        allowedDataset: FASTEN_FHIR_DATASET_RID,
        user: req.user?.sub,
        correlationId: req.correlationId
      });
      
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Dataset ingestion not allowed for this dataset',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    logger.info('Processing Fasten FHIR dataset ingestion', {
      datasetRid: dataset_rid,
      recordCount: records.length,
      user: req.user?.sub,
      correlationId: req.correlationId,
      metadata
    });
    
    // Initialize Foundry service
    const foundryService = new FoundryService({
      host: process.env.FOUNDRY_HOST,
      clientId: process.env.FOUNDRY_CLIENT_ID,
      clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
      tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
      ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID
    });
    
    // Call the Fasten FHIR ingestion action
    const actionId = process.env.FOUNDRY_FASTEN_FHIR_ACTION_ID || 'create-fasten-fhir-data';
    
    // Prepare the action parameters
    const actionParams = {
      dataset_rid: dataset_rid,
      records: JSON.stringify(records), // Stringify for action parameter
      ingestion_metadata: JSON.stringify(metadata || {}),
      user_id: req.user?.sub,
      ingestion_timestamp: new Date().toISOString(),
      record_count: records.length
    };
    
    // Execute the Foundry action
    const result = await foundryService.applyOntologyAction(actionId, actionParams);
    
    logger.info('Successfully ingested Fasten FHIR data to Foundry', {
      datasetRid: dataset_rid,
      recordCount: records.length,
      actionId,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      dataset_rid: dataset_rid,
      records_ingested: records.length,
      ingestion_timestamp: actionParams.ingestion_timestamp,
      result
    });
    
  } catch (error) {
    logger.error('Failed to ingest data to Foundry dataset', {
      error: error.message,
      status: error.status,
      foundryError: error.foundryError,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    next(error);
  }
});

/**
 * Alternative: Direct dataset write using Foundry Dataset API
 * This bypasses actions and writes directly to the dataset
 */
router.post('/write', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const { dataset_rid, records, branch = 'master', transaction_type = 'APPEND' } = req.body;
    
    // Validate required fields
    if (!dataset_rid || !records || !Array.isArray(records)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'dataset_rid and records array are required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Security check - only allow writing to the Fasten FHIR dataset
    if (dataset_rid !== FASTEN_FHIR_DATASET_RID) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Dataset write not allowed for this dataset',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    logger.info('Direct write to Fasten FHIR dataset', {
      datasetRid: dataset_rid,
      recordCount: records.length,
      branch,
      transactionType: transaction_type,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    // Initialize Foundry service
    const foundryService = new FoundryService({
      host: process.env.FOUNDRY_HOST,
      clientId: process.env.FOUNDRY_CLIENT_ID,
      clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
      tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL
    });
    
    // Construct the dataset write endpoint
    const endpoint = `/datasets/${dataset_rid}/branches/${branch}/tables/default/rows`;
    
    // Prepare the write payload
    const payload = {
      transactionType: transaction_type,
      rows: records.map(record => ({
        values: record
      }))
    };
    
    // Execute the write
    const result = await foundryService.makeApiRequest('POST', endpoint, payload);
    
    logger.info('Successfully wrote data directly to Foundry dataset', {
      datasetRid: dataset_rid,
      recordCount: records.length,
      branch,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      dataset_rid: dataset_rid,
      records_written: records.length,
      branch,
      transaction_type,
      result
    });
    
  } catch (error) {
    logger.error('Failed to write directly to Foundry dataset', {
      error: error.message,
      status: error.status,
      foundryError: error.foundryError,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    next(error);
  }
});

export default router;
