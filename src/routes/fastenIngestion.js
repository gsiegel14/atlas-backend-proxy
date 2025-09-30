import express from 'express';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

const router = express.Router();

// Target dataset RID for Fasten FHIR data
const FASTEN_FHIR_DATASET_RID = 'ri.foundry.main.dataset.94686469-301b-462e-96e9-4a8572611178';

// Helper functions to extract data from FHIR resources
function extractPatientId(record) {
  const resource = record.fhir_resource || record;
  if (resource.resourceType === 'Patient') {
    return resource.id;
  }
  if (resource.subject?.reference) {
    return resource.subject.reference.replace('Patient/', '');
  }
  if (resource.patient?.reference) {
    return resource.patient.reference.replace('Patient/', '');
  }
  return '';
}

function extractEncounterId(record) {
  const resource = record.fhir_resource || record;
  if (resource.resourceType === 'Encounter') {
    return resource.id;
  }
  if (resource.encounter?.reference) {
    return resource.encounter.reference.replace('Encounter/', '');
  }
  if (resource.context?.reference) {
    return resource.context.reference.replace('Encounter/', '');
  }
  return '';
}

function extractProviderOrg(record) {
  const resource = record.fhir_resource || record;
  if (resource.resourceType === 'Organization') {
    return resource.name || resource.id;
  }
  if (resource.organization?.display) {
    return resource.organization.display;
  }
  if (resource.performer?.[0]?.display) {
    return resource.performer[0].display;
  }
  if (resource.serviceProvider?.display) {
    return resource.serviceProvider.display;
  }
  return '';
}

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
    
    // Handle empty records case
    if (records.length === 0) {
      return res.status(200).json({
        message: 'No records to ingest',
        dataset_rid: FASTEN_FHIR_DATASET_RID,
        records_ingested: 0,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
    
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
    
    // Format records as a single JSON object with top-level "data" array
    // This matches the format in gabe_chart.json
    const jsonDataArray = records.map(record => {
      return {
        auth0_user_id: auth0_user_id || record.auth0_user_id || '',
        org_connection_id: record.org_connection_id || metadata?.org_connection_id || '',
        ingested_at: record.ingested_at || new Date().toISOString(),
        fhir_resource: record.fhir_resource || record  // Complete FHIR resource preserved
      };
    });
    const jsonPayload = { data: jsonDataArray };
    const jsonContent = JSON.stringify(jsonPayload, null, 2);  // Pretty print for readability
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `fasten-fhir/${auth0_user_id}/${timestamp}.json`;
    
    // Upload file directly to Foundry dataset using Datasets API v2
    const uploadUrl = `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}/files/${encodeURIComponent(fileName)}/upload?transactionType=APPEND`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'  // Correct content type for JSON data
      },
      body: jsonContent
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload to Foundry dataset', {
        status: uploadResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Foundry upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    const transactionRid = uploadResult.transactionRid;
    
    logger.info('Successfully uploaded Fasten FHIR data to Foundry', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      filePath: fileName,
      recordCount: records.length,
      auth0UserId: auth0_user_id,
      serviceAuth: req.serviceAuth,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      dataset_rid: FASTEN_FHIR_DATASET_RID,
      records_ingested: records.length,
      file_path: fileName,
      transaction_rid: transactionRid,
      ingestion_timestamp: new Date().toISOString(),
      correlationId: req.correlationId
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
