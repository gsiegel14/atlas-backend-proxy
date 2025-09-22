import express from 'express';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { osdkHost, osdkOntologyRid } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { EncountersService, DEFAULT_ENCOUNTERS_CACHE_TTL_MS } from '../services/encountersService.js';

const router = express.Router();

const CLINICAL_NOTES_CACHE_TTL_MS = 30 * 1000;
const CONDITIONS_CACHE_TTL_MS = 30 * 1000;
const OBSERVATIONS_CACHE_TTL_MS = 30 * 1000;
const ENCOUNTERS_CACHE_TTL_MS = DEFAULT_ENCOUNTERS_CACHE_TTL_MS;
const ENCOUNTERS_DEBUG_PATIENT_ID = '7c2f5a19-087b-8b19-1070-800857d62e92';
const clinicalNotesCache = new Map();
const conditionsCache = new Map();
const observationsCache = new Map();
const encountersCache = new Map();
// Use object types as specified in the API documentation
const clinicalNotesObjectType = process.env.FOUNDRY_CLINICAL_NOTES_OBJECT_TYPE || 'ClinicalNotes';
const conditionsObjectType = process.env.FOUNDRY_CONDITIONS_OBJECT_TYPE || 'Conditions';
const observationsObjectType = process.env.FOUNDRY_OBSERVATIONS_OBJECT_TYPE || 'Observations';
const defaultObservationsPatientId = '7c2f5a19-087b-8b19-1070-800857d62e92';

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

const encountersService = new EncountersService({
  foundryService,
  cacheTtlMs: ENCOUNTERS_CACHE_TTL_MS,
  cache: encountersCache
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

router.get('/clinical-notes', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId.trim() : '';
    if (!patientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'patientId query parameter is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['documentDate', 'encounterId']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'documentDate';
    let sortDirection = 'DESC';

    if (sortParam) {
      let requestedField = sortParam;
      let requestedDirection = sortDirection;

      if (sortParam.includes(':')) {
        const [fieldPart, directionPart] = sortParam.split(':');
        requestedField = fieldPart.trim();
        const trimmedDirection = directionPart?.trim().toUpperCase();
        if (trimmedDirection === 'ASC' || trimmedDirection === 'DESC') {
          requestedDirection = trimmedDirection;
        }
      } else if (sortParam.startsWith('-')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'DESC';
      } else if (sortParam.startsWith('+')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'ASC';
      } else {
        requestedField = sortParam;
        requestedDirection = 'DESC';
      }

      if (allowedSortFields.has(requestedField)) {
        sortField = requestedField;
        sortDirection = requestedDirection;
      }
    }

    const cacheKey = JSON.stringify({ patientId, pageSize, pageToken: pageToken ?? null, sortField, sortDirection });
    const now = Date.now();
    const cached = clinicalNotesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving clinical notes from cache', {
        patientId,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.ontologyRid || process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry clinical notes ontology RID is not configured');
    }

    const payload = {
      where: {
        type: 'eq',
        field: 'patientId',
        value: patientId
      }
    };

    // Add optional fields only if they're supported
    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }
    
    // Remove orderBy for now - it's causing InvalidFieldType errors
    // The ClinicalNotes object type might not support ordering
    // if (sortField && sortDirection) {
    //   payload.orderBy = [{ field: sortField, direction: sortDirection }];
    // }

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching clinical notes from Foundry', {
      requestedPatientId: patientId,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId: req.correlationId
    });

    // Use the same method as the working patient profile
    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, clinicalNotesObjectType, payload);
    } catch (error) {
      if (error.status === 429) {
        return res.status(503).json({
          error: {
            code: 'FOUNDRY_THROTTLED',
            message: 'Foundry returned throttling response',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      if (error.status === 400) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: error.foundryError?.message || 'Invalid Foundry request parameters',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      throw error;
    }

    const rawEntries = [];
    if (Array.isArray(result?.data)) {
      rawEntries.push(...result.data);
    }
    if (Array.isArray(result?.objects)) {
      rawEntries.push(...result.objects);
    }
    if (Array.isArray(result?.results)) {
      rawEntries.push(...result.results);
    }
    if (Array.isArray(result?.entries)) {
      rawEntries.push(...result.entries);
    }

    const notes = rawEntries.map((entry) => {
      if (entry && typeof entry === 'object') {
        if (entry.properties && typeof entry.properties === 'object') {
          return entry.properties;
        }
        return entry;
      }
      return {};
    });

    const responsePayload = {
      success: true,
      data: notes,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    clinicalNotesCache.set(cacheKey, {
      expiresAt: now + CLINICAL_NOTES_CACHE_TTL_MS,
      payload: responsePayload
    });

    res.json(responsePayload);
  } catch (error) {
    if (error.message === 'Foundry service temporarily unavailable') {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_UNAVAILABLE',
          message: 'Foundry service temporarily unavailable',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.error('Failed to fetch clinical notes', {
      patientId: req.query.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/encounters', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  const rawPatientId = typeof req.query.patientId === 'string' ? req.query.patientId.trim() : '';
  const patientId = rawPatientId || ENCOUNTERS_DEBUG_PATIENT_ID;

  if (!patientId) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PATIENT_ID',
        message: 'patientId query parameter is required',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }

  const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
    ? req.query.pageToken.trim()
    : undefined;
  const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : undefined;

  try {
    if (!rawPatientId && patientId === ENCOUNTERS_DEBUG_PATIENT_ID) {
      logger.debug('Encounters route using fallback patient context', {
        fallbackPatientId: patientId,
        correlationId: req.correlationId
      });
    }

    const payload = await encountersService.fetchEncounters({
      patientId,
      pageSize: req.query.pageSize,
      pageToken,
      sort: sortParam,
      correlationId: req.correlationId
    });

    res.json(payload);
  } catch (error) {
    if (error.status === 429) {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_THROTTLED',
          message: 'Foundry returned throttling response',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (error.status === 400) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: error.foundryError?.message || 'Invalid Foundry request parameters',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (error.message === 'Foundry service temporarily unavailable') {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_UNAVAILABLE',
          message: 'Foundry service temporarily unavailable',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (error.message === 'Foundry encounters ontology RID is not configured') {
      return res.status(500).json({
        error: {
          code: 'CONFIGURATION_ERROR',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.error('Failed to fetch encounters', {
      patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/observations', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const incomingPatientId = typeof req.query.patientId === 'string' ? req.query.patientId.trim() : '';
    const patientId = incomingPatientId || defaultObservationsPatientId;

    if (!patientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'patientId query parameter is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const categoryParam = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['observationDate', 'codeDisplay', 'category']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'observationDate';
    let sortDirection = 'DESC';

    if (sortParam) {
      let requestedField = sortParam;
      let requestedDirection = sortDirection;

      if (sortParam.includes(':')) {
        const [fieldPart, directionPart] = sortParam.split(':');
        requestedField = fieldPart.trim();
        const trimmedDirection = directionPart?.trim().toUpperCase();
        if (trimmedDirection === 'ASC' || trimmedDirection === 'DESC') {
          requestedDirection = trimmedDirection;
        }
      } else if (sortParam.startsWith('-')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'DESC';
      } else if (sortParam.startsWith('+')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'ASC';
      } else {
        requestedField = sortParam;
        requestedDirection = 'DESC';
      }

      if (allowedSortFields.has(requestedField)) {
        sortField = requestedField;
        sortDirection = requestedDirection;
      }
    }

    const cacheKey = JSON.stringify({
      patientId,
      category: categoryParam || null,
      pageSize,
      pageToken: pageToken ?? null,
      sortField,
      sortDirection
    });
    const now = Date.now();
    const cached = observationsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving observations from cache', {
        patientId,
        category: categoryParam || null,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.ontologyRid || process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry observations ontology RID is not configured');
    }

    const filters = [
      {
        type: 'eq',
        field: 'patientId',
        value: patientId
      }
    ];

    if (categoryParam) {
      filters.push({
        type: 'eq',
        field: 'category',
        value: categoryParam
      });
    }

    const payload = {
      where: filters.length === 1 ? filters[0] : { type: 'and', value: filters }
    };

    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }

    // Sorting has historically produced InvalidFieldType errors on this ontology.
    // Keep query parity with Clinical Notes by omitting orderBy until confirmed otherwise.

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching observations from Foundry', {
      patientId,
      category: categoryParam || null,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId: req.correlationId
    });

    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, observationsObjectType, payload);
    } catch (error) {
      if (error.status === 429) {
        return res.status(503).json({
          error: {
            code: 'FOUNDRY_THROTTLED',
            message: 'Foundry returned throttling response',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      if (error.status === 400) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: error.foundryError?.message || 'Invalid Foundry request parameters',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString()
          }
        });
      }

      throw error;
    }

    const rawEntries = [];
    if (Array.isArray(result?.data)) {
      rawEntries.push(...result.data);
    }
    if (Array.isArray(result?.objects)) {
      rawEntries.push(...result.objects);
    }
    if (Array.isArray(result?.results)) {
      rawEntries.push(...result.results);
    }
    if (Array.isArray(result?.entries)) {
      rawEntries.push(...result.entries);
    }

    const observations = rawEntries.map((entry) => {
      if (entry && typeof entry === 'object') {
        if (entry.properties && typeof entry.properties === 'object') {
          return entry.properties;
        }
        return entry;
      }
      return {};
    });

    const responsePayload = {
      success: true,
      data: observations,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    observationsCache.set(cacheKey, {
      expiresAt: now + OBSERVATIONS_CACHE_TTL_MS,
      payload: responsePayload
    });

    res.json(responsePayload);
  } catch (error) {
    if (error.message === 'Foundry service temporarily unavailable') {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_UNAVAILABLE',
          message: 'Foundry service temporarily unavailable',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.error('Failed to fetch observations', {
      patientId: req.query.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/conditions', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId.trim() : '';
    if (!patientId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PATIENT_ID',
          message: 'patientId query parameter is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['recordedDate', 'onsetDatetime', 'conditionDisplay']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'recordedDate';
    let sortDirection = 'DESC';

    if (sortParam) {
      let requestedField = sortParam;
      let requestedDirection = sortDirection;

      if (sortParam.includes(':')) {
        const [fieldPart, directionPart] = sortParam.split(':');
        requestedField = fieldPart.trim();
        const trimmedDirection = directionPart?.trim().toUpperCase();
        if (trimmedDirection === 'ASC' || trimmedDirection === 'DESC') {
          requestedDirection = trimmedDirection;
        }
      } else if (sortParam.startsWith('-')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'DESC';
      } else if (sortParam.startsWith('+')) {
        requestedField = sortParam.substring(1).trim();
        requestedDirection = 'ASC';
      }

      if (allowedSortFields.has(requestedField)) {
        sortField = requestedField;
        sortDirection = requestedDirection;
      }
    }

    const cacheKey = JSON.stringify({ patientId, pageSize, pageToken: pageToken ?? null, sortField, sortDirection });
    const now = Date.now();
    const cached = conditionsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving conditions from cache', {
        patientId,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.ontologyRid || process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry conditions ontology RID is not configured');
    }

    const payload = {
      where: {
        type: 'eq',
        field: 'patientId',
        value: patientId
      }
    };

    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }

    // The Conditions object type may not support ordering yet; retain manual default ordering until validated.
    // if (sortField && sortDirection) {
    //   payload.orderBy = [{ field: sortField, direction: sortDirection }];
    // }

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching conditions from Foundry', {
      patientId,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId: req.correlationId
    });

    const result = await foundryService.searchOntologyObjects(ontologyId, conditionsObjectType, payload);

    const rawEntries = [];
    if (Array.isArray(result?.data)) {
      rawEntries.push(...result.data);
    }
    if (Array.isArray(result?.objects)) {
      rawEntries.push(...result.objects);
    }
    if (Array.isArray(result?.results)) {
      rawEntries.push(...result.results);
    }
    if (Array.isArray(result?.entries)) {
      rawEntries.push(...result.entries);
    }

    const conditions = rawEntries.map((entry) => {
      if (entry && typeof entry === 'object') {
        if (entry.properties && typeof entry.properties === 'object') {
          return entry.properties;
        }
        return entry;
      }
      return {};
    });

    const responsePayload = {
      success: true,
      data: conditions,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    conditionsCache.set(cacheKey, {
      expiresAt: now + CONDITIONS_CACHE_TTL_MS,
      payload: responsePayload
    });

    res.json(responsePayload);
  } catch (error) {
    if (error.status === 429) {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_THROTTLED',
          message: 'Foundry returned throttling response',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (error.status === 400) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: error.foundryError?.message || 'Invalid Foundry request parameters',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (error.message === 'Foundry service temporarily unavailable') {
      return res.status(503).json({
        error: {
          code: 'FOUNDRY_UNAVAILABLE',
          message: 'Foundry service temporarily unavailable',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.error('Failed to fetch conditions', {
      patientId: req.query.patientId,
      error: error.message,
      status: error.status,
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

// Get media reference for profile photos and other media
router.get('/media/:mediaSetRid/items/:mediaItemRid/reference', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const { mediaSetRid, mediaItemRid } = req.params;

    logger.info('Fetching media reference', {
      mediaSetRid,
      mediaItemRid,
      user: req.user.sub,
      correlationId: req.correlationId
    });

    const mediaReference = await foundryService.getMediaReference(mediaSetRid, mediaItemRid);

    res.json({
      success: true,
      data: mediaReference,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to fetch media reference:', {
      error: error.message,
      user: req.user.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Get media content (actual image data)
router.get('/media/:mediaSetRid/items/:mediaItemRid/content', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const { mediaSetRid, mediaItemRid } = req.params;

    logger.info('Fetching media content', {
      mediaSetRid,
      mediaItemRid,
      user: req.user.sub,
      correlationId: req.correlationId
    });

    const mediaContent = await foundryService.getMediaContent(mediaSetRid, mediaItemRid);

    // If the content is binary image data, set appropriate headers
    if (mediaContent && mediaContent.contentType) {
      res.setHeader('Content-Type', mediaContent.contentType);
    }

    res.send(mediaContent);

  } catch (error) {
    logger.error('Failed to fetch media content:', {
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
    const userId = req.user.sub; // Authenticated user's ID (Auth0)

    logger.info('Fetching patient profile', {
      userId,
      correlationId: req.correlationId
    });

    // Use the foundryService to get the patient profile
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

    const properties = profile.properties || profile;
    const rid = properties.$primaryKey ?? properties.$rid ?? properties.rid ?? properties.id ?? null;

    // Check if the patient has a profile photo
    let photoUrl = null;
    if (properties.profilePhotoMediaSetRid && properties.profilePhotoMediaItemRid) {
      // Construct the URL for fetching the photo through our proxy
      photoUrl = `/api/v1/foundry/media/${properties.profilePhotoMediaSetRid}/items/${properties.profilePhotoMediaItemRid}/content`;
      logger.info('Patient has profile photo', {
        mediaSetRid: properties.profilePhotoMediaSetRid,
        mediaItemRid: properties.profilePhotoMediaItemRid,
        correlationId: req.correlationId
      });
    }

    res.json({
      success: true,
      data: {
        rid,
        properties: {
          ...properties,
          profilePhotoUrl: photoUrl // Add the photo URL to the response
        },
        ontologyId: osdkOntologyRid,
        sourceURL: `${osdkHost}/api/v2/ontologies/${osdkOntologyRid}/objects/A/search`,
        httpStatus: 200
      },
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
