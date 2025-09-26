import express from 'express';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

const router = express.Router();

// Target dataset RID for Fasten FHIR data
const FASTEN_FHIR_DATASET_RID = 'ri.foundry.main.dataset.3a90fb2b-7e9a-4a03-94b0-30839be53091';

/**
 * Service-to-service authentication middleware
 * Accepts either a shared secret or specific service tokens
 */
const validateServiceAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const serviceSecret = req.headers['x-service-secret'];
  
  // Check for service secret (for webhook service)
  if (serviceSecret === process.env.SERVICE_SECRET) {
    req.serviceAuth = { type: 'service', name: 'fasten-webhook' };
    return next();
  }
  
  // Check for Bearer token (for other services)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === process.env.WEBHOOK_SERVICE_TOKEN) {
      req.serviceAuth = { type: 'webhook', name: 'fasten-webhook-service' };
      return next();
    }
  }
  
  logger.warn('Unauthorized service access attempt', {
    correlationId: req.correlationId,
    headers: { 
      hasAuth: !!authHeader,
      hasSecret: !!serviceSecret 
    }
  });
  
  return res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Service authentication required',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Ingest Fasten FHIR data to Foundry dataset
 * This endpoint is called by the webhook service when FHIR data is received
 */
router.post('/ingest', validateServiceAuth, async (req, res, next) => {
  try {
    const { records, metadata, auth0_user_id } = req.body;
    
    // Validate required fields
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'records array is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    logger.info('Processing Fasten FHIR ingestion request', {
      recordCount: records.length,
      auth0UserId: auth0_user_id,
      serviceAuth: req.serviceAuth,
      correlationId: req.correlationId,
      metadata
    });
    
    // Get OAuth token for Foundry
    const tokenResponse = await fetch(process.env.FOUNDRY_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
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
    
    // Step 1: Create a transaction on the dataset
    const transactionResponse = await fetch(
      `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}/transactions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transactionType: 'APPEND'
        })
      }
    );
    
    if (!transactionResponse.ok) {
      const errorText = await transactionResponse.text();
      logger.error('Failed to create Foundry transaction', {
        status: transactionResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to create transaction: ${transactionResponse.status} - ${errorText}`);
    }
    
    const transaction = await transactionResponse.json();
    const transactionRid = transaction.rid;
    
    logger.info('Created Foundry transaction', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      correlationId: req.correlationId
    });
    
    // Step 2: Format and upload the data
    const formattedRecords = records.map(record => {
      // Ensure proper formatting for Foundry dataset
      return {
        record_id: `${auth0_user_id || record.auth0_user_id}_${record.resource_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        auth0_user_id: auth0_user_id || record.auth0_user_id || '',
        org_connection_id: record.org_connection_id || '',
        resource_type: record.resource_type || record.fhir_resource?.resourceType || '',
        resource_id: record.resource_id || record.fhir_resource?.id || '',
        fhir_resource_json: typeof record.fhir_resource === 'string' 
          ? record.fhir_resource 
          : JSON.stringify(record.fhir_resource || record),
        patient_id: record.patient_id || '',
        encounter_id: record.encounter_id || '',
        provider_org: record.provider_org || '',
        ingested_at: record.ingested_at || new Date().toISOString(),
        resource_date: record.resource_date || '',
        source: record.source || 'fasten-connect',
        ingestion_run_id: metadata?.ingestion_run_id || `run_${Date.now()}`,
        status: record.status || '',
        category: record.category || '',
        code_display: record.code_display || '',
        value_quantity: record.value_quantity || '',
        value_string: record.value_string || ''
      };
    });
    
    // Convert to NDJSON format
    const ndjson = formattedRecords.map(record => JSON.stringify(record)).join('\n');
    
    // Upload the data
    const uploadResponse = await fetch(
      `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}/transactions/${transactionRid}/files/data.jsonl`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/x-ndjson'
        },
        body: ndjson
      }
    );
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload data to Foundry', {
        status: uploadResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to upload data: ${uploadResponse.status} - ${errorText}`);
    }
    
    logger.info('Uploaded data to Foundry transaction', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      recordCount: formattedRecords.length,
      correlationId: req.correlationId
    });
    
    // Step 3: Commit the transaction
    const commitResponse = await fetch(
      `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}/transactions/${transactionRid}/commit`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!commitResponse.ok) {
      const errorText = await commitResponse.text();
      logger.error('Failed to commit Foundry transaction', {
        status: commitResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to commit transaction: ${commitResponse.status} - ${errorText}`);
    }
    
    const commitResult = await commitResponse.json();
    
    logger.info('Successfully ingested Fasten FHIR data to Foundry', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      recordCount: formattedRecords.length,
      auth0UserId: auth0_user_id,
      serviceAuth: req.serviceAuth,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      dataset_rid: FASTEN_FHIR_DATASET_RID,
      records_ingested: formattedRecords.length,
      transaction_rid: transactionRid,
      commit_result: commitResult,
      ingestion_timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to ingest Fasten FHIR data', {
      error: error.message,
      stack: error.stack,
      datasetRid: FASTEN_FHIR_DATASET_RID,
      serviceAuth: req.serviceAuth,
      correlationId: req.correlationId
    });
    
    next(error);
  }
});

/**
 * Health check endpoint for the ingestion service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'fasten-fhir-ingestion',
    dataset: FASTEN_FHIR_DATASET_RID,
    timestamp: new Date().toISOString()
  });
});

export default router;
