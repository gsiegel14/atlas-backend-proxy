import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

const router = express.Router();

// Target dataset RID for Fasten FHIR data
const FASTEN_FHIR_DATASET_RID = 'ri.foundry.main.dataset.94686469-301b-462e-96e9-4a8572611178';

/**
 * Upload Fasten FHIR data directly to Foundry dataset using the Datasets API v2
 * This is much simpler than using actions!
 */
router.post('/upload', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const { records, metadata } = req.body;
    
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
    
    const auth0id = req.user?.sub;
    
    logger.info('Processing Fasten FHIR dataset upload', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      recordCount: records.length,
      user: auth0id,
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
          transactionType: 'APPEND'  // or 'UPDATE' or 'SNAPSHOT'
        })
      }
    );
    
    if (!transactionResponse.ok) {
      const errorText = await transactionResponse.text();
      throw new Error(`Failed to create transaction: ${transactionResponse.status} - ${errorText}`);
    }
    
    const transaction = await transactionResponse.json();
    const transactionRid = transaction.rid;
    
    logger.info('Created Foundry transaction', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      correlationId: req.correlationId
    });
    
    // Step 2: Upload the data to the transaction
    // Format records as CSV or JSON lines
    const jsonLines = records.map(record => {
      // Flatten the record for dataset storage
      const flatRecord = {
        record_id: `${auth0id}_${record.resource_id || ''}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        auth0_user_id: record.auth0_user_id || auth0id,
        org_connection_id: record.org_connection_id || '',
        resource_type: record.resource_type || '',
        resource_id: record.resource_id || '',
        fhir_resource_json: JSON.stringify(record.fhir_resource || record),
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
      return JSON.stringify(flatRecord);
    }).join('\n');
    
    // Upload the data
    const uploadResponse = await fetch(
      `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}/transactions/${transactionRid}/files/data.jsonl`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/x-ndjson'
        },
        body: jsonLines
      }
    );
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Failed to upload data: ${uploadResponse.status} - ${errorText}`);
    }
    
    logger.info('Uploaded data to transaction', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      recordCount: records.length,
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
      throw new Error(`Failed to commit transaction: ${commitResponse.status} - ${errorText}`);
    }
    
    const commitResult = await commitResponse.json();
    
    logger.info('Successfully uploaded Fasten FHIR data to Foundry dataset', {
      datasetRid: FASTEN_FHIR_DATASET_RID,
      transactionRid,
      recordCount: records.length,
      user: auth0id,
      correlationId: req.correlationId
    });
    
    res.json({
      success: true,
      dataset_rid: FASTEN_FHIR_DATASET_RID,
      records_uploaded: records.length,
      transaction_rid: transactionRid,
      commit_result: commitResult,
      ingestion_timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to upload data to Foundry dataset', {
      error: error.message,
      datasetRid: FASTEN_FHIR_DATASET_RID,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    
    next(error);
  }
});

/**
 * Get dataset info (for debugging)
 */
router.get('/info', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
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
        scope: 'api:datasets-read'
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Foundry token: ${tokenResponse.status}`);
    }
    
    const { access_token } = await tokenResponse.json();
    
    // Get dataset info
    const datasetResponse = await fetch(
      `${process.env.FOUNDRY_HOST}/api/v2/datasets/${FASTEN_FHIR_DATASET_RID}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );
    
    if (!datasetResponse.ok) {
      const errorText = await datasetResponse.text();
      throw new Error(`Failed to get dataset info: ${datasetResponse.status} - ${errorText}`);
    }
    
    const datasetInfo = await datasetResponse.json();
    
    res.json({
      success: true,
      dataset: datasetInfo,
      configured_rid: FASTEN_FHIR_DATASET_RID
    });
    
  } catch (error) {
    logger.error('Failed to get dataset info', {
      error: error.message,
      datasetRid: FASTEN_FHIR_DATASET_RID,
      correlationId: req.correlationId
    });
    
    next(error);
  }
});

export default router;
