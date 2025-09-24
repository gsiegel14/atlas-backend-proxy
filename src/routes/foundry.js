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
const PROCEDURES_CACHE_TTL_MS = 30 * 1000;
const IMMUNIZATIONS_CACHE_TTL_MS = 30 * 1000;
const ALLERGIES_CACHE_TTL_MS = 30 * 1000;
const ENCOUNTERS_CACHE_TTL_MS = DEFAULT_ENCOUNTERS_CACHE_TTL_MS;
const clinicalNotesCache = new Map();
const conditionsCache = new Map();
const observationsCache = new Map();
const proceduresCache = new Map();
const immunizationsCache = new Map();
const allergiesCache = new Map();
const encountersCache = new Map();
// Use object types as specified in the API documentation
const clinicalNotesObjectType = process.env.FOUNDRY_CLINICAL_NOTES_OBJECT_TYPE || 'FastenClinicalNotes';
const conditionsObjectType = process.env.FOUNDRY_CONDITIONS_OBJECT_TYPE || 'FastenConditions';
const observationsObjectType = process.env.FOUNDRY_OBSERVATIONS_OBJECT_TYPE || 'FastenObservations';
const vitalsObjectType = process.env.FOUNDRY_VITALS_OBJECT_TYPE || 'FastenVitals';
const proceduresObjectType = process.env.FOUNDRY_PROCEDURES_OBJECT_TYPE || 'FastenProcedures';
const immunizationsObjectType = process.env.FOUNDRY_IMMUNIZATIONS_OBJECT_TYPE || 'FastenImmunizations';
const allergiesObjectType = process.env.FOUNDRY_ALLERGIES_OBJECT_TYPE || 'FastenAllergies';

function normalizeProcedureEntry(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const properties = base.properties && typeof base.properties === 'object' ? base.properties : base;

  const rawProcedureId = properties.procedureId
    || base.procedureId
    || properties.id
    || base.id
    || properties.$primaryKey
    || base.$primaryKey
    || properties.rid
    || base.rid;

  const resolvedPerformedDate = properties.performedDate
    || base.performedDate
    || properties.performed_period_start
    || properties.performedPeriodStart;

  const normalized = {
    ...properties,
    procedureId: rawProcedureId || properties.procedureId
  };

  if (!normalized.id && rawProcedureId) {
    normalized.id = rawProcedureId;
  }

  if (resolvedPerformedDate && !normalized.performedDate) {
    normalized.performedDate = resolvedPerformedDate;
  }

  if (!normalized.patientId && base.patientId) {
    normalized.patientId = base.patientId;
  }

  if (!normalized.procedureName && base.procedureName) {
    normalized.procedureName = base.procedureName;
  }

  return normalized;
}

function normalizeObservationEntry(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const properties = base.properties && typeof base.properties === 'object' ? base.properties : base;

  const rawObservationId = properties.observationId
    || properties.observation_id
    || properties.vitalId
    || properties.vital_id
    || base.observationId
    || base.observation_id
    || properties.id
    || base.id
    || properties.$primaryKey
    || base.$primaryKey
    || base.rid
    || properties.rid;

  const rawEffectiveDatetime = properties.effectiveDatetime
    || properties.effectiveDateTime
    || properties.observationDate
    || properties.date
    || base.effectiveDatetime
    || base.effectiveDateTime
    || base.observationDate;

  const resolvedCategoryDisplay = properties.categoryDisplay
    || properties.category
    || properties.vitalType
    || base.categoryDisplay
    || base.category;

  const resolvedCodeDisplay = properties.codeDisplay
    || properties.vitalType
    || properties.display
    || base.codeDisplay
    || base.display;

  const resolvedValueQuantity = properties.valueQuantity
    ?? properties.valueNumeric
    ?? base.valueQuantity
    ?? base.valueNumeric;

  const resolvedValueNumeric = properties.valueNumeric
    ?? properties.valueQuantity
    ?? base.valueNumeric
    ?? base.valueQuantity;

  const resolvedUnit = properties.valueUnit
    || properties.unit
    || base.valueUnit
    || base.unit;

  const normalized = {
    ...properties,
    observationId: rawObservationId || properties.observationId
  };

  if (!normalized.id && rawObservationId) {
    normalized.id = rawObservationId;
  }

  if (rawEffectiveDatetime) {
    normalized.effectiveDatetime = rawEffectiveDatetime;
    if (!normalized.observationDate) {
      normalized.observationDate = rawEffectiveDatetime;
    }
  }

  if (!normalized.observationDate && base.observationDate) {
    normalized.observationDate = base.observationDate;
  }

  if (resolvedCategoryDisplay) {
    normalized.categoryDisplay = resolvedCategoryDisplay;
    if (!normalized.category) {
      normalized.category = resolvedCategoryDisplay;
    }
  }

  if (resolvedCodeDisplay) {
    normalized.codeDisplay = resolvedCodeDisplay;
    if (!normalized.display) {
      normalized.display = resolvedCodeDisplay;
    }
  }

  if (resolvedValueQuantity !== undefined && resolvedValueQuantity !== null) {
    normalized.valueQuantity = resolvedValueQuantity;
  }

  if (resolvedValueNumeric !== undefined && resolvedValueNumeric !== null) {
    normalized.valueNumeric = resolvedValueNumeric;
  }

  if (!normalized.valueUnit && resolvedUnit) {
    normalized.valueUnit = resolvedUnit;
  }

  if (!normalized.patientId && base.patientId) {
    normalized.patientId = base.patientId;
  }

  if (properties.vitalType && !normalized.vitalType) {
    normalized.vitalType = properties.vitalType;
  }

  return normalized;
}

function normalizeImmunizationEntry(entry) {
  const base = entry && typeof entry === 'object' ? entry : {};
  const properties = base.properties && typeof base.properties === 'object' ? base.properties : base;

  const resolvedId = properties.immunizationId
    || properties.immunization_id
    || base.immunizationId
    || base.immunization_id
    || properties.id
    || base.id
    || properties.$primaryKey
    || base.$primaryKey
    || base.rid
    || properties.rid;

  const normalized = { ...properties };

  if (resolvedId && !normalized.immunizationId) {
    normalized.immunizationId = resolvedId;
  }

  if (resolvedId && !normalized.id) {
    normalized.id = resolvedId;
  }

  const snakeCaseMappings = {
    vaccine_name: 'vaccineName',
    occurrence_date: 'occurrenceDate',
    expiration_date: 'expirationDate',
    lot_number: 'lotNumber',
    dose_quantity: 'doseQuantity',
    dose_unit: 'doseUnit',
    performer_name: 'performerName',
    performer_function: 'performerFunction',
    performer_id: 'performerId',
    primary_source: 'primarySource',
    reason_code: 'reasonCode',
    reason_reference: 'reasonReference',
    source_file: 'sourceFile',
    run_id: 'runId'
  };

  Object.entries(snakeCaseMappings).forEach(([sourceKey, targetKey]) => {
    if (normalized[targetKey] === undefined && properties[sourceKey] !== undefined) {
      normalized[targetKey] = properties[sourceKey];
    }
  });

  if (!normalized.occurrenceDate && base.occurrenceDate) {
    normalized.occurrenceDate = base.occurrenceDate;
  }

  if (!normalized.expirationDate && base.expirationDate) {
    normalized.expirationDate = base.expirationDate;
  }

  if (!normalized.patientId && base.patientId) {
    normalized.patientId = base.patientId;
  }

  if (!normalized.encounterId && base.encounterId) {
    normalized.encounterId = base.encounterId;
  }

  if (typeof normalized.primarySource === 'string') {
    const value = normalized.primarySource.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(value)) {
      normalized.primarySource = true;
    } else if (['false', '0', 'no'].includes(value)) {
      normalized.primarySource = false;
    }
  }

  return normalized;
}

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

function collectIdentityCandidates(req, allowQueryOverride = true) {
  const candidates = [];

  // Primary: Always prioritize Auth0 user ID (auth0|xxx format)
  const auth0Sub = typeof req.user?.sub === 'string' ? req.user.sub.trim() : '';
  if (auth0Sub) {
    candidates.push(auth0Sub);
  }

  // Secondary: Allow query override only if no Auth0 user ID or explicitly allowed
  if (allowQueryOverride) {
    const queryValue = typeof req.query.patientId === 'string' ? req.query.patientId.trim() : '';
    if (queryValue) {
      candidates.push(queryValue);
    }
  }

  // Fallback: Username-like candidates (only if Auth0 user ID not available)
  if (!auth0Sub) {
    const usernameLikeCandidates = [
      typeof req.context?.username === 'string' ? req.context.username.trim() : '',
      typeof req.user?.preferred_username === 'string' ? req.user.preferred_username.trim() : '',
      typeof req.user?.nickname === 'string' ? req.user.nickname.trim() : '',
      typeof req.user?.email === 'string' ? req.user.email.trim() : ''
    ];

    for (const candidate of usernameLikeCandidates) {
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  const unique = Array.from(new Set(candidates.filter(Boolean)));
  return unique;
}

async function resolvePatientContext(
  req,
  { routeName, allowQueryOverride = true } = {}
) {
  req.context = req.context || {};

  if (req.context.foundryPatientContext) {
    return req.context.foundryPatientContext;
  }

  const identityCandidates = collectIdentityCandidates(req, allowQueryOverride);
  const queryOverride = allowQueryOverride && typeof req.query.patientId === 'string'
    ? req.query.patientId.trim()
    : '';
  const auth0Sub = typeof req.user?.sub === 'string' ? req.user.sub.trim() : '';

  let resolvedPatientId = '';
  let matchedIdentifier = '';
  let source = '';
  let lookedUpViaFoundry = false;

  for (const identifier of identityCandidates) {
    try {
      const profile = await foundryService.getPatientProfile(identifier);
      if (profile) {
        const properties = profile.properties && typeof profile.properties === 'object'
          ? profile.properties
          : profile;
        const candidatePatientId = properties.user_id
          || properties.userId
          || properties.patientId
          || properties.patient_id
          || properties.atlasId
          || properties.$primaryKey
          || properties.$rid
          || identifier;

        if (candidatePatientId) {
          resolvedPatientId = String(candidatePatientId).trim();
          matchedIdentifier = identifier;
          source = 'foundry-profile';
          lookedUpViaFoundry = true;
          break;
        }
      }
    } catch (error) {
      logger.warn('Foundry patient profile lookup failed', {
        routeName,
        identifier,
        error: error.message,
        correlationId: req.correlationId
      });
    }
  }

  if (!resolvedPatientId && auth0Sub) {
    resolvedPatientId = auth0Sub;
    matchedIdentifier = auth0Sub;
    source = 'auth0-sub';
  }

  if (!resolvedPatientId && queryOverride) {
    resolvedPatientId = queryOverride;
    matchedIdentifier = queryOverride;
    source = 'query-param';
  }

  if (!resolvedPatientId) {
    const fallbackCandidate = identityCandidates.find(Boolean);
    if (fallbackCandidate) {
      resolvedPatientId = fallbackCandidate;
      matchedIdentifier = fallbackCandidate;
      source = fallbackCandidate === queryOverride ? 'query-param' : 'username-claim';
    }
  }

  const context = {
    patientId: resolvedPatientId,
    matchedIdentifier: matchedIdentifier || null,
    source: source || null,
    queryOverride: queryOverride && queryOverride !== resolvedPatientId ? queryOverride : undefined,
    lookedUpViaFoundry,
    identityCandidates
  };

  req.context.foundryPatientContext = context;

  if (resolvedPatientId) {
    logger.debug('Resolved patient context for Foundry route', {
      routeName,
      patientId: resolvedPatientId,
      source: context.source,
      matchedIdentifier: context.matchedIdentifier,
      queryOverride: context.queryOverride,
      correlationId: req.correlationId
    });
  }

  return context;
}

function respondMissingPatientId(req, res, routeName) {
  return res.status(400).json({
    error: {
      code: 'MISSING_PATIENT_ID',
      message: 'Unable to resolve patient identity for this account',
      route: routeName,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
}

function buildPatientFilter(patientId) {
  const normalized = typeof patientId === 'string' ? patientId.trim() : patientId;
  
  if (!normalized) {
    return null;
  }

  // For Auth0 user IDs (auth0|xxx format), use user_id field directly
  if (normalized.startsWith('auth0|')) {
    return {
      type: 'eq',
      field: 'user_id',
      value: normalized
    };
  }

  // For non-Auth0 IDs, fall back to multiple field search
  const targetFields = ['user_id', 'userId', 'patientId', 'patient_id'];
  const filters = [];
  
  for (const field of targetFields) {
    filters.push({
      type: 'eq',
      field,
      value: normalized
    });
  }

  return {
    type: 'or',
    value: filters
  };
}

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
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'clinical-notes' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';
    if (!patientId) {
      return respondMissingPatientId(req, res, 'clinical-notes');
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['date', 'encounterId']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'date';
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

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry clinical notes ontology RID is not configured');
    }

    const payload = {
      where: buildPatientFilter(patientId)
    };

    // Add optional fields only if they're supported
    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }
    
    // Remove orderBy for now - it's causing InvalidFieldType errors
    // The FastenClinicalNotes object type might not support ordering
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
      ontologyObjectType: clinicalNotesObjectType,
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
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/procedures', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'procedures' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';

    if (!patientId) {
      return respondMissingPatientId(req, res, 'procedures');
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['performedDate', 'procedureName', 'status']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'performedDate';
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
    const cached = proceduresCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving procedures from cache', {
        patientId,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry procedures ontology RID is not configured');
    }

    const payload = {
      where: buildPatientFilter(patientId),
      pageSize
    };

    // Omit orderBy until schema is confirmed to support sorting fields to avoid InvalidFieldType errors

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching procedures from Foundry', {
      requestedPatientId: patientId,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      ontologyObjectType: proceduresObjectType,
      correlationId: req.correlationId
    });

    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, proceduresObjectType, payload);
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

    const procedures = rawEntries.map((entry) => normalizeProcedureEntry(entry));

    const responsePayload = {
      success: true,
      data: procedures,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    proceduresCache.set(cacheKey, {
      expiresAt: now + PROCEDURES_CACHE_TTL_MS,
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

    if (error.message === 'Foundry procedures ontology RID is not configured') {
      return res.status(500).json({
        error: {
          code: 'CONFIGURATION_ERROR',
          message: error.message,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.error('Failed to fetch procedures', {
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/encounters', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'encounters' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';
    if (!patientId) {
      return respondMissingPatientId(req, res, 'encounters');
    }

    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : undefined;

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
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/immunizations', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'immunizations' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';

    if (!patientId) {
      return respondMissingPatientId(req, res, 'immunizations');
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['occurrenceDate', 'vaccineName', 'status']);
    const sortParam = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
    let sortField = 'occurrenceDate';
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
      pageSize,
      pageToken: pageToken ?? null,
      sortField,
      sortDirection
    });
    const now = Date.now();
    const cached = immunizationsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving immunizations from cache', {
        patientId,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry immunizations ontology RID is not configured');
    }

    const queryPatientId = patientId;

    const filters = [];
    const patientFilter = buildPatientFilter(patientId);
    if (patientFilter) {
      filters.push(patientFilter);
    }

    const payload = {
      where: filters.length === 1 ? filters[0] : { type: 'and', value: filters }
    };

    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }

    // Sorting has historically produced InvalidFieldType errors on similar ontologies.
    // Keep parity with other record fetches by omitting orderBy until confirmed otherwise.

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching immunizations from Foundry', {
      patientId,
      queryPatientId,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId: req.correlationId
    });

    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, immunizationsObjectType, payload);
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

    const immunizations = rawEntries.map((entry) => normalizeImmunizationEntry(entry));

    const responsePayload = {
      success: true,
      data: immunizations,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    immunizationsCache.set(cacheKey, {
      expiresAt: now + IMMUNIZATIONS_CACHE_TTL_MS,
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

    logger.error('Failed to fetch immunizations', {
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/observations', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'observations' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';

    if (!patientId) {
      return respondMissingPatientId(req, res, 'observations');
    }

    const categoryParam = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const useFastenVitals = categoryParam === 'vital-signs';

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

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry observations ontology RID is not configured');
    }

    // Map iOS category values to ontology fields when using the general observations object type
    const categoryMapping = {
      'vital-signs': {
        code: 'vital-signs',
        display: 'Vital Signs'
      },
      'laboratory': {
        code: 'laboratory',
        display: 'Laboratory'
      },
      'survey': {
        code: 'survey',
        display: 'Survey'
      },
      'exam': {
        code: 'exam',
        display: 'Exam'
      }
    };

    const mappedCategory = (!useFastenVitals && categoryParam)
      ? categoryMapping[categoryParam] || { code: categoryParam }
      : null;

    const filters = [];
    const patientFilter = buildPatientFilter(patientId);
    if (patientFilter) {
      filters.push(patientFilter);
    }

    if (mappedCategory) {
      const categoryFilters = [];

      if (mappedCategory.code) {
        categoryFilters.push({
          type: 'eq',
          field: 'categoryCode',
          value: mappedCategory.code
        });
      }

      if (mappedCategory.display) {
        categoryFilters.push({
          type: 'eq',
          field: 'categoryDisplay',
          value: mappedCategory.display
        });
      }

      // Avoid legacy 'category' field which is not present on FastenObservations in some environments

      if (categoryFilters.length === 1) {
        filters.push(categoryFilters[0]);
      } else if (categoryFilters.length > 1) {
        filters.push({
          type: 'or',
          value: categoryFilters
        });
      }
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

    // Log the request with category mapping for debugging
    const objectType = useFastenVitals ? vitalsObjectType : observationsObjectType;

    logger.info('Fetching observations from Foundry', {
      patientId,
      category: categoryParam || null,
      mappedCategory: mappedCategory || null,
      mappedCategoryCode: mappedCategory?.code || null,
      mappedCategoryDisplay: mappedCategory?.display || null,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      ontologyObjectType: objectType,
      correlationId: req.correlationId
    });

    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, objectType, payload);
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

    const observations = rawEntries.map((entry) => normalizeObservationEntry(entry));

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
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/allergies', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'allergies' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';

    if (!patientId) {
      return respondMissingPatientId(req, res, 'allergies');
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['recordedDate', 'allergyDisplay', 'clinicalStatus', 'verificationStatus']);
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
      pageSize,
      pageToken: pageToken ?? null,
      sortField,
      sortDirection
    });
    const now = Date.now();
    const cached = allergiesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      logger.debug('Serving allergies from cache', {
        patientId,
        pageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId: req.correlationId
      });
      return res.json(cached.payload);
    }

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry allergies ontology RID is not configured');
    }

    const filters = [];
    const patientFilter = buildPatientFilter(patientId);
    if (patientFilter) {
      filters.push(patientFilter);
    }

    const payload = {
      where: filters.length === 1 ? filters[0] : { type: 'and', value: filters }
    };

    if (pageSize && pageSize > 0) {
      payload.pageSize = pageSize;
    }

    // Keep parity with other Foundry queries by omitting orderBy until schema validation is complete.

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    logger.info('Fetching allergies from Foundry', {
      patientId,
      pageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId: req.correlationId
    });

    let result;
    try {
      result = await foundryService.searchOntologyObjects(ontologyId, allergiesObjectType, payload);
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

    const allergies = rawEntries.map((entry) => {
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
      data: allergies,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId: req.correlationId
    };

    allergiesCache.set(cacheKey, {
      expiresAt: now + ALLERGIES_CACHE_TTL_MS,
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

    logger.error('Failed to fetch allergies', {
      patientId: patientContext?.patientId,
      error: error.message,
      status: error.status,
      correlationId: req.correlationId
    });

    next(error);
  }
});

router.get('/conditions', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  let patientContext;
  try {
    patientContext = await resolvePatientContext(req, { routeName: 'conditions' });
    const patientId = typeof patientContext.patientId === 'string' ? patientContext.patientId.trim() : '';
    if (!patientId) {
      return respondMissingPatientId(req, res, 'conditions');
    }

    const parsedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Math.max(Math.min(Number.isFinite(parsedPageSize) ? parsedPageSize : 25, 100), 1);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : undefined;

    const allowedSortFields = new Set(['recordedDate', 'onsetDate', 'onsetDatetime', 'conditionName']);
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

    const ontologyId = foundryService.getApiOntologyRid() || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    if (!ontologyId) {
      throw new Error('Foundry conditions ontology RID is not configured');
    }

    const payload = {
      where: buildPatientFilter(patientId)
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
      patientId: patientContext?.patientId,
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

// Helper function to resolve username from Auth0 token
function pickFirstString(values = []) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function resolveAuth0UserId(req, explicitCandidate) {
  const headerCandidate = req.get('X-Auth0-Username');
  const contextCandidate = pickFirstString([
    req.context?.username,
    req.user?.preferred_username,
    req.user?.nickname,
    req.user?.email
  ]);
  const auth0Sub = typeof req.user?.sub === 'string' ? req.user.sub.trim() : undefined;

  const candidates = [
    explicitCandidate,
    headerCandidate,
    auth0Sub,
    contextCandidate
  ].map((value) => (typeof value === 'string' ? value.trim() : undefined)).filter(Boolean);

  const auth0Id = candidates.find((candidate) => candidate.startsWith('auth0|'));
  return auth0Id || candidates[0];
}

// Execute patientChat ontology query
router.post('/patient-chat', validateTokenWithScopes(['execute:queries']), async (req, res, next) => {
  try {
    const explicitUserId = pickFirstString([
      req.body?.userid,
      req.body?.user_id,
      req.body?.patientId
    ]);
    const userInput = typeof req.body?.userinput === 'string' ? req.body.userinput.trim() : '';

    if (!userInput) {
      return res.status(400).json({
        error: {
          code: 'MISSING_USERINPUT',
          message: 'userinput parameter is required and must be a non-empty string',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const resolvedUserId = resolveAuth0UserId(req, explicitUserId);
    if (!resolvedUserId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 user identity for patient chat',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Executing patientChat query via backend proxy', {
      userid: resolvedUserId,
      userinputLength: userInput.length,
      correlationId: req.correlationId
    });

    const result = await foundryService.executeOntologyQuery('patientChat', {
      userid: resolvedUserId,
      userinput: userInput
    });

    let reply = '';
    if (typeof result === 'string') {
      reply = result.trim();
    } else if (result && typeof result === 'object') {
      if (typeof result.reply === 'string') {
        reply = result.reply.trim();
      } else if (typeof result.result === 'string') {
        reply = result.result.trim();
      } else if (typeof result.data === 'string') {
        reply = result.data.trim();
      }
    }

    if (!reply && Array.isArray(result?.data) && result.data.length > 0 && typeof result.data[0] === 'string') {
      reply = result.data[0].trim();
    }

    if (!reply) {
      reply = JSON.stringify(result ?? {});
    }

    res.json({
      success: true,
      data: {
        reply,
        raw: result
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to execute patientChat query:', {
      error: error.message,
      stack: error.stack,
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
