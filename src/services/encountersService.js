import { logger } from '../utils/logger.js';

const DEFAULT_CACHE_TTL_MS = 30 * 1000;
const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const ALLOWED_SORT_FIELDS = new Set([
  'startDate',
  'endDate',
  'encounterType',
  'encounterClass',
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
    this.objectType = process.env.FOUNDRY_ENCOUNTERS_OBJECT_TYPE || 'Encounters';
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
      where: {
        type: 'eq',
        field: 'patientId',
        value: patientId
      },
      pageSize: normalizedPageSize
    };

    if (pageToken) {
      payload.pageToken = pageToken;
    }

    if (sortField && sortDirection) {
      payload.orderBy = [{ field: sortField, direction: sortDirection }];
    }

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
  const fallback = { field: 'startDate', direction: 'DESC' };
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
  return foundryService.getApiOntologyRid()
    || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
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

  return rawEntries.map((entry) => {
    if (entry && typeof entry === 'object') {
      if (entry.properties && typeof entry.properties === 'object') {
        return entry.properties;
      }
      return entry;
    }
    return {};
  });
}

export const DEFAULT_ENCOUNTERS_CACHE_TTL_MS = DEFAULT_CACHE_TTL_MS;
