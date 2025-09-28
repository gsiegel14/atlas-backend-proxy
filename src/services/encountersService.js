import { logger } from '../utils/logger.js';

const DEFAULT_CACHE_TTL_MS = 30 * 1000;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const ALLOWED_SORT_FIELDS = new Set([
  'periodStart',
  'periodEnd',
  'typeDisplay',
  'classDisplay',
  'encounterId'
]);

export class EncountersService {
  constructor({ foundryService, cacheTtlMs = DEFAULT_CACHE_TTL_MS, cache } = {}) {
    if (!foundryService) {
      throw new Error('EncountersService requires a FoundryService instance');
    }

    this.foundryService = foundryService;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = cache || new Map();
    this.objectType = process.env.FOUNDRY_ENCOUNTERS_OBJECT_TYPE || 'FastenEncounters';
  }

  async fetchEncounters({
    patientId,
    pageSize,
    pageToken,
    sort,
    correlationId
  }) {
    if (!patientId) {
      throw new Error('patientId is required to fetch encounters');
    }

    const normalizedPageSize = normalizePageSize(pageSize);
    const { field: sortField, direction: sortDirection } = normalizeSort(sort);
    const cacheKey = buildCacheKey({ patientId, normalizedPageSize, pageToken, sortField, sortDirection });
    const now = Date.now();
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      logger.debug('Serving encounters from cache', {
        patientId,
        pageSize: normalizedPageSize,
        sortField,
        sortDirection,
        pageToken,
        correlationId
      });
      return cached.payload;
    }

    const ontologyId = resolveOntologyRid(this.foundryService);
    if (!ontologyId) {
      throw new Error('Foundry encounters ontology RID is not configured');
    }

    const payload = {
      where: buildEncounterPatientFilter(patientId),
      pageSize: normalizedPageSize
    };

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    // Sorting has historically produced InvalidFieldType errors on this ontology.
    // Keep query parity with observations and clinical notes by omitting orderBy until confirmed otherwise.
    // if (sortField && sortDirection) {
    //   payload.orderBy = [{ field: sortField, direction: sortDirection }];
    // }

    logger.info('Fetching encounters from Foundry', {
      patientId,
      pageSize: normalizedPageSize,
      sortField,
      sortDirection,
      pageToken,
      payload: JSON.stringify(payload),
      correlationId
    });

    const result = await this.foundryService.searchOntologyObjects(ontologyId, this.objectType, payload);
    const encounters = extractEncounters(result);
    const responsePayload = {
      success: true,
      data: encounters,
      nextPageToken: result?.nextPageToken || result?.next_page_token || result?.pageToken || null,
      fetchedAt: new Date().toISOString(),
      correlationId
    };

    this.cache.set(cacheKey, {
      expiresAt: now + this.cacheTtlMs,
      payload: responsePayload
    });

    return responsePayload;
  }
}

function buildCacheKey({ patientId, normalizedPageSize, pageToken, sortField, sortDirection }) {
  return JSON.stringify({
    patientId,
    pageSize: normalizedPageSize,
    pageToken: pageToken ?? null,
    sortField,
    sortDirection
  });
}

function normalizePageSize(pageSize) {
  const parsed = Number.parseInt(pageSize, 10);
  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.max(MIN_PAGE_SIZE, Math.min(parsed, MAX_PAGE_SIZE));
}

function normalizeSort(sortParam) {
  const fallback = { field: 'periodStart', direction: 'DESC' };
  if (!sortParam || typeof sortParam !== 'string') {
    return fallback;
  }

  let requestedField = sortParam.trim();
  let requestedDirection = fallback.direction;

  if (requestedField.includes(':')) {
    const [fieldPart, directionPart] = requestedField.split(':');
    requestedField = fieldPart.trim();
    const trimmedDirection = directionPart?.trim().toUpperCase();
    if (trimmedDirection === 'ASC' || trimmedDirection === 'DESC') {
      requestedDirection = trimmedDirection;
    }
  } else if (requestedField.startsWith('-')) {
    requestedField = requestedField.substring(1).trim();
    requestedDirection = 'DESC';
  } else if (requestedField.startsWith('+')) {
    requestedField = requestedField.substring(1).trim();
    requestedDirection = 'ASC';
  }

  if (!ALLOWED_SORT_FIELDS.has(requestedField)) {
    return fallback;
  }

  return { field: requestedField, direction: requestedDirection };
}

function resolveOntologyRid(foundryService) {
  const ontologyRid = foundryService.getApiOntologyRid();
  if (!ontologyRid) {
    throw new Error('Foundry ontology RID is not configured. Please set FOUNDRY_ONTOLOGY_API_NAME or FOUNDRY_ONTOLOGY_RID environment variable.');
  }
  return ontologyRid;
}

function buildEncounterPatientFilter(patientId) {
  return {
    type: 'or',
    value: [
      {
        type: 'eq',
        field: 'patientId',
        value: patientId
      },
      {
        type: 'eq',
        field: 'auth0id',
        value: patientId
      }
    ]
  };
}

function extractEncounters(result) {
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

  return rawEntries.map((entry) => normalizeEncounter(entry));
}

export const DEFAULT_ENCOUNTERS_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;

function normalizeEncounter(entry) {
  const properties = extractProperties(entry);
  const normalized = { ...properties };

  const encounterId = pickFirstValue(properties, ['encounterId', 'encounter_id', 'id', '$primaryKey', 'rid']);
  if (encounterId && !normalized.encounterId) {
    normalized.encounterId = encounterId;
  }
  if (encounterId && !normalized.id) {
    normalized.id = encounterId;
  }

  const startDate = pickFirstValue(properties, ['periodStart', 'startDate', 'start', 'startTimestamp', 'start_date']);
  if (startDate) {
    normalized.periodStart = normalized.periodStart ?? startDate;
    normalized.startDate = startDate;
  }

  const endDate = pickFirstValue(properties, ['periodEnd', 'endDate', 'end', 'endTimestamp', 'end_date']);
  if (endDate) {
    normalized.periodEnd = normalized.periodEnd ?? endDate;
    normalized.endDate = endDate;
  }

  const typeDisplay = pickFirstValue(properties, ['typeDisplay', 'encounterType', 'type', 'encounter_type']);
  if (typeDisplay) {
    normalized.typeDisplay = normalized.typeDisplay ?? typeDisplay;
    normalized.encounterType = normalized.encounterType ?? typeDisplay;
  }

  const classDisplay = pickFirstValue(properties, ['classDisplay', 'encounterClass', 'class', 'encounter_class']);
  if (classDisplay) {
    normalized.classDisplay = normalized.classDisplay ?? classDisplay;
    normalized.encounterClass = normalized.encounterClass ?? classDisplay;
  }

  const practitionerName = pickFirstValue(properties, ['practitionerName', 'serviceProvider', 'providerName', 'provider']);
  if (practitionerName) {
    normalized.practitionerName = normalized.practitionerName ?? practitionerName;
    normalized.serviceProvider = normalized.serviceProvider ?? practitionerName;
  }

  const locationName = pickFirstValue(properties, ['locationName', 'location', 'facility']);
  if (locationName) {
    normalized.locationName = normalized.locationName ?? locationName;
    normalized.location = normalized.location ?? locationName;
  }

  const encounterTypeCode = pickFirstValue(properties, ['encounterTypeCode', 'typeCode', 'code']);
  if (encounterTypeCode) {
    normalized.encounterTypeCode = normalized.encounterTypeCode ?? encounterTypeCode;
  }

  const status = pickFirstValue(properties, ['status', 'encounterStatus']);
  if (status) {
    normalized.status = status;
  }

  const reasonDisplay = pickFirstValue(properties, ['reasonDisplay', 'reason']);
  if (reasonDisplay) {
    normalized.reasonDisplay = normalized.reasonDisplay ?? reasonDisplay;
  }

  const patientId = pickFirstValue(properties, ['patientId', 'patient_id', 'patient']);
  if (patientId) {
    normalized.patientId = normalized.patientId ?? patientId;
  }

  return normalized;
}

function extractProperties(entry) {
  if (entry && typeof entry === 'object') {
    if (entry.properties && typeof entry.properties === 'object') {
      return entry.properties;
    }
    return entry;
  }
  return {};
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    if (!key) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
      }
    }
  }
  return undefined;
}
