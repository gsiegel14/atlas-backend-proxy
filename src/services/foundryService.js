import axios from 'axios';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';

export class FoundryService {
  constructor(config) {
    this.host = config.host;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenUrl = config.tokenUrl;
    this.ontologyRid = config.ontologyRid || process.env.FOUNDRY_ONTOLOGY_RID;
    this.medicationsActionId = config.medicationsActionId
      || process.env.FOUNDRY_MEDICATIONS_ACTION_ID
      || 'create-medications-upload';
    this.medicationsUploadObjectType = config.medicationsUploadObjectType
      || process.env.FOUNDRY_MEDICATIONS_OBJECT_TYPE
      || 'MedicationsUpload';
    this.chatHistoryActionId = config.chatHistoryActionId
      || process.env.FOUNDRY_CHAT_HISTORY_ACTION_ID
      || 'create-ai-chat-history-production';
    
    this.tokenCache = new Map();
    
    // Circuit breaker for token requests
    this.tokenCircuit = new CircuitBreaker(this.fetchToken.bind(this), {
      timeout: 5000, // 5 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000, // 30 seconds
      volumeThreshold: 10
    });
    
    // Circuit breaker for API requests
    this.apiCircuit = new CircuitBreaker(this.makeApiRequest.bind(this), {
      timeout: 10000, // 10 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10
    });
    
    this.setupCircuitBreakerEvents();
  }
  
  setupCircuitBreakerEvents() {
    this.tokenCircuit.on('open', () => {
      logger.error('Foundry token circuit breaker opened');
    });
    
    this.tokenCircuit.on('halfOpen', () => {
      logger.info('Foundry token circuit breaker half-open');
    });
    
    this.tokenCircuit.on('close', () => {
      logger.info('Foundry token circuit breaker closed');
    });
    
    this.apiCircuit.on('open', () => {
      logger.error('Foundry API circuit breaker opened');
    });
    
    this.apiCircuit.on('halfOpen', () => {
      logger.info('Foundry API circuit breaker half-open');
    });
    
    this.apiCircuit.on('close', () => {
      logger.info('Foundry API circuit breaker closed');
    });
  }

  /**
   * Transform ontology RID from OSDK format to API format
   * OSDK format: ri.ontology.main.ontology.151e0d3d-719c-464d-be5c-a6dc9f53d194
   * API format: ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194
   */
  getApiOntologyRid(osdkRid = this.ontologyRid) {
    if (!osdkRid) return null;
    
    // If already in API format, return as-is
    if (osdkRid.startsWith('ontology-')) {
      return osdkRid;
    }
    
    // Transform from OSDK format to API format
    if (osdkRid.startsWith('ri.ontology.main.ontology.')) {
      return osdkRid.replace('ri.ontology.main.ontology.', 'ontology-');
    }
    
    // If unknown format, log warning and return as-is
    logger.warn(`Unknown ontology RID format: ${osdkRid}`);
    return osdkRid;
  }
  
  async fetchToken() {
    const tokenData = {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    };
    
    logger.debug('Fetching new Foundry token');
    
    try {
      const response = await axios.post(this.tokenUrl, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000
      });
      
      const token = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600; // Default 1 hour
      const expiresAt = Date.now() + (expiresIn - 300) * 1000; // Subtract 5 minutes for safety
      
      this.tokenCache.set('service_token', {
        token,
        expiresAt
      });
      
      logger.debug('Foundry token fetched successfully', {
        expiresIn: expiresIn
      });
      
      return token;
    } catch (error) {
      logger.error('Failed to fetch Foundry token:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
  
  async getToken() {
    const cached = this.tokenCache.get('service_token');
    
    // Return cached token if valid
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    
    try {
      return await this.tokenCircuit.fire();
    } catch (error) {
      const msg = String(error?.message || '');
      // Fallback to expired cached token if available when breaker has opened
      if (cached && (msg.includes('Circuit breaker is open') || msg.includes('Breaker is open'))) {
        logger.warn('Using expired token due to circuit breaker failure (token breaker open)');
        return cached.token;
      }
      // Map breaker-open to temporary unavailability for consistent 503 handling upstream
      if (msg.includes('Circuit breaker is open') || msg.includes('Breaker is open')) {
        const unavailable = new Error('Foundry service temporarily unavailable');
        unavailable.status = 503;
        throw unavailable;
      }
      throw error;
    }
  }
  
  async makeApiRequest(method, endpoint, data = null, headers = {}) {
    const token = await this.getToken();
    const url = `${this.host}${endpoint}`;
    
    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.data = data;
    }
    
    logger.debug(`Making Foundry API request: ${method} ${endpoint}`);
    
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`Foundry API request failed: ${method} ${endpoint}`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Re-throw with enhanced error information
      const enhancedError = new Error(`Foundry API Error: ${error.message}`);
      enhancedError.status = error.response?.status || 500;
      enhancedError.foundryError = error.response?.data;
      throw enhancedError;
    }
  }

  // Wrapper method for circuit breaker protected API calls
  async apiCall(method, endpoint, data = null, headers = {}, queryParams = {}) {
    try {
      // Add query parameters to the endpoint if provided
      let finalEndpoint = endpoint;
      if (queryParams && Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams(queryParams).toString();
        finalEndpoint = `${endpoint}?${params}`;
      }
      return await this.apiCircuit.fire(method, finalEndpoint, data, headers);
    } catch (error) {
      const msg = String(error?.message || '');
      if (msg.includes('Circuit breaker is open') || msg.includes('Breaker is open')) {
        const unavailable = new Error('Foundry service temporarily unavailable');
        unavailable.status = 503;
        throw unavailable;
      }
      throw error;
    }
  }

  buildActionEndpointCandidates(actionId, pathTail, ontologyId = this.ontologyRid) {
    if (!ontologyId) {
      throw new Error('Foundry ontology RID is not configured');
    }

    const canonicalActionIds = new Set();
    if (actionId) {
      canonicalActionIds.add(actionId);
      canonicalActionIds.add(actionId.replace(/_/g, '-'));
      canonicalActionIds.add(actionId.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
      canonicalActionIds.add(actionId.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase());
    }

    const prefixes = [
      `/api/v2/ontologies/${ontologyId}/actions`,
      `/ontology/api/v2/ontologies/${ontologyId}/actions`,
      `/v2/ontologies/${ontologyId}/actions`
    ];

    const endpoints = new Set();
    for (const prefix of prefixes) {
      for (const candidate of canonicalActionIds) {
        endpoints.add(`${prefix}/${candidate}/${pathTail}`);
      }
    }
    return Array.from(endpoints);
  }

  normalizeActionOptions(options = {}) {
    const normalized = {
      mode: 'VALIDATE_AND_EXECUTE',
      returnEdits: 'NONE'
    };

    if (options.mode) {
      normalized.mode = options.mode;
    }
    if (options.$mode) {
      normalized.mode = options.$mode;
    }
    if (options.returnEdits) {
      normalized.returnEdits = options.returnEdits;
    }
    if (options.$returnEdits !== undefined) {
      normalized.returnEdits = options.$returnEdits === true ? 'ALL' : options.$returnEdits;
    }

    return normalized;
  }

  static normalizeMediaReference(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      if (value.startsWith('ri.')) {
        return { $rid: value };
      }
      return value;
    }

    if (typeof value === 'object') {
      const normalized = { ...value };
      if (normalized.rid && !normalized.$rid) {
        normalized.$rid = normalized.rid;
      }
      if (normalized.mediaRid && !normalized.$rid) {
        normalized.$rid = normalized.mediaRid;
      }
      if (normalized.reference && typeof normalized.reference === 'object') {
        const ref = normalized.reference;
        if (ref.rid && !ref.$rid) {
          ref.$rid = ref.rid;
        }
      }
      return normalized;
    }

    return value;
  }

  normalizeOntologySearchResults(response = {}) {
    const entries = [];
    if (Array.isArray(response)) {
      entries.push(...response);
    }
    if (Array.isArray(response.objects)) {
      entries.push(...response.objects);
    }
    if (Array.isArray(response.data)) {
      entries.push(...response.data);
    }
    if (Array.isArray(response.results)) {
      entries.push(...response.results);
    }
    if (response.properties && typeof response.properties === 'object') {
      entries.push({ properties: response.properties });
    }

    const normalized = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const properties = entry.properties && typeof entry.properties === 'object'
        ? entry.properties
        : entry;

      const medicationId = properties.medicationId || properties.medication_id || entry.medicationId || null;
      const timestamp = properties.timestamp || null;
      const userId = properties.userId || properties.user_id || null;
      const photolabel = properties.photolabel ?? null;
      const rid = entry.rid
        || properties.$primaryKey
        || properties.$rid
        || properties.rid
        || medicationId
        || null;

      normalized.push({
        rid,
        medicationId,
        timestamp,
        userId,
        photolabel,
        properties
      });
    }

    return normalized;
  }

  async applyOntologyAction(actionId, parameters = {}, options = {}) {
    const payload = {
      parameters,
      options: this.normalizeActionOptions(options)
    };

    const endpoints = this.buildActionEndpointCandidates(actionId, 'apply');
    let lastError;
    for (const endpoint of endpoints) {
      try {
        logger.debug('Attempting Foundry ontology action', {
          actionId,
          endpoint,
          correlationId: payload.parameters?.correlationId
        });
        return await this.apiCall('POST', endpoint, payload);
      } catch (error) {
        lastError = error;
        logger.warn('Foundry ontology action attempt failed', {
          actionId,
          endpoint,
          error: error.message
        });
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error(`Unable to apply Foundry action '${actionId}'`);
  }

  async createMedicationsUpload({
    userId,
    timestamp,
    photolabel,
    additionalParameters = {},
    options = {}
  }) {
    if (!userId) {
      throw new Error('userId is required to create a medications upload');
    }
    if (!photolabel) {
      throw new Error('photolabel is required to create a medications upload');
    }

    const normalizedPhotolabel = FoundryService.normalizeMediaReference(photolabel);
    const actionParams = {
      user_id: userId,
      timestamp: timestamp || new Date().toISOString(),
      photolabel: normalizedPhotolabel,
      ...additionalParameters
    };

    logger.info('Creating medications upload via Foundry action', {
      userId,
      timestamp: actionParams.timestamp
    });

    return this.applyOntologyAction(this.medicationsActionId, actionParams, options);
  }

  async createChatHistoryEntry({
    userId,
    transcript,
    timestamp,
    additionalParameters = {},
    options = {}
  }) {
    if (!userId) {
      throw new Error('userId is required to create a chat history entry');
    }
    const normalizedTranscript = typeof transcript === 'string' ? transcript.trim() : '';
    if (!normalizedTranscript) {
      throw new Error('transcript is required to create a chat history entry');
    }

    const actionParams = {
      user_id: userId,
      transcript: normalizedTranscript,
      timestamp: timestamp || new Date().toISOString(),
      ...additionalParameters
    };

    logger.info('Creating AI chat history entry via Foundry action', {
      userId,
      hasAdditionalParameters: Object.keys(additionalParameters || {}).length > 0
    });

    return this.applyOntologyAction(this.chatHistoryActionId, actionParams, options);
  }

  async listMedicationsUploads(userIdentifiers = [], { limit = 50 } = {}) {
    if (!this.ontologyRid) {
      throw new Error('Foundry ontology RID is not configured');
    }

    const identifiers = Array.from(new Set((userIdentifiers || []).filter(Boolean)));
    if (identifiers.length === 0) {
      return [];
    }

    const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const responses = [];
    const seen = new Set();

    for (const id of identifiers) {
      const payload = {
        where: {
          type: 'eq',
          field: 'userId',
          value: id
        },
        pageSize
      };

      try {
        const searchResult = await this.searchOntologyObjects(
          this.ontologyRid,
          this.medicationsUploadObjectType,
          payload
        );
        const normalized = this.normalizeOntologySearchResults(searchResult);
        for (const item of normalized) {
          const dedupeKey = item.rid || `${item.userId || 'unknown'}#${item.medicationId || item.timestamp}`;
          if (dedupeKey && !seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            responses.push({
              ...item,
              source: {
                ontologyId: this.ontologyRid,
                objectType: this.medicationsUploadObjectType
              }
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch medications uploads for identifier', {
          identifier: id,
          error: error.message
        });
      }
    }

    responses.sort((a, b) => {
      const tsA = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tsB = b.timestamp ? Date.parse(b.timestamp) : 0;
      return tsB - tsA;
    });

    return responses;
  }

  // Specific methods for common operations
  async invokeAction(actionId, parameters = {}) {
    return this.apiCall('POST', `/api/v1/ontologies/actions/${actionId}/invoke`, {
      parameters
    });
  }

  async executeQuery(query, parameters = {}) {
    return this.apiCall('POST', '/api/v1/datasets/query', {
      query,
      parameters
    });
  }

  // Execute ontology query (like patientChat) with extended timeout
  async executeOntologyQuery(queryName, parameters = {}) {
    const ontologyRid = this.getApiOntologyRid();
    if (!ontologyRid) {
      throw new Error('Ontology RID is not configured');
    }
    
    const endpoint = `/api/v2/ontologies/${ontologyRid}/queries/${queryName}/execute`;
    
    // Use direct API call with extended timeout for ontology queries
    const token = await this.getToken();
    const url = `${this.host}${endpoint}`;
    
    const config = {
      method: 'POST',
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { parameters },
      timeout: 30000 // 30 seconds for ontology queries
    };
    
    logger.debug(`Making extended timeout Foundry ontology query: ${queryName}`);
    
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`Foundry ontology query failed: ${queryName}`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      // Re-throw with enhanced error information
      const enhancedError = new Error(`Foundry Ontology Query Error: ${error.message}`);
      enhancedError.status = error.response?.status || 500;
      enhancedError.foundryError = error.response?.data;
      throw enhancedError;
    }
  }

  async searchOntologyObjects(ontologyId, objectTypePath, payload = {}) {
    const endpoint = `/api/v2/ontologies/${ontologyId}/objects/${objectTypePath}/search`;
    return this.apiCall('POST', endpoint, payload);
  }

  // Get patient profile by Auth0 identity or patientId for the Fasten ontology
  async getPatientProfile(userId) {
    const ontologyRid = this.getApiOntologyRid();
    const objectType = 'A';
    const identityFields = Array.from(new Set([
      'auth0id',
      'patientId',
      'user_id',
      'userId',
      'auth0_user_id'
    ]));

    let lastRecoverableError = null;
    let hadSuccessfulCall = false;

    const pickFirstProfile = (result) => {
      if (!result || typeof result !== 'object') {
        return null;
      }
      const collections = [result.data, result.objects, result.results, result.entries]
        .filter(Array.isArray);
      for (const collection of collections) {
        if (collection.length > 0) {
          return collection[0];
        }
      }
      if (result.properties && typeof result.properties === 'object') {
        return { properties: result.properties };
      }
      return null;
    };

    for (const field of identityFields) {
      const searchPayload = {
        where: {
          type: 'eq',
          field,
          value: userId
        },
        pageSize: 10
      };

      logger.debug('Searching for patient profile', {
        userId,
        ontologyRid,
        objectType,
        field
      });

      try {
        const result = await this.searchOntologyObjects(ontologyRid, objectType, searchPayload);
        hadSuccessfulCall = true;
        const match = pickFirstProfile(result);
        if (match) {
          logger.debug('Found patient profile match', {
            userId,
            ontologyRid,
            objectType,
            matchedField: field
          });
          return match;
        }
      } catch (error) {
        if (error.status === 400 || error.status === 404) {
          logger.warn('Patient profile search failed for field', {
            field,
            status: error.status,
            message: error.message
          });
          lastRecoverableError = error;
          continue;
        }
        throw error;
      }
    }

    if (!hadSuccessfulCall && lastRecoverableError) {
      throw lastRecoverableError;
    }

    logger.info('No patient profile found for user', {
      userId,
      ontologyRid,
      objectType
    });
    return null;
  }

  async getPatientDashboard(patientId) {
    return this.apiCall('GET', `/api/v1/patient/${patientId}/dashboard`);
  }

  async uploadDocument(patientId, documentData) {
    return this.apiCall('POST', `/api/v1/patient/${patientId}/documents`, documentData);
  }

  // Get media item reference for profile photos and other media
  async getMediaReference(mediaSetRid, mediaItemRid) {
    const endpoint = `/api/v2/mediasets/${mediaSetRid}/items/${mediaItemRid}/reference`;
    
    logger.debug('Fetching media reference', {
      mediaSetRid,
      mediaItemRid
    });

    try {
      const result = await this.apiCall('GET', endpoint, null, {}, { preview: true });
      return result;
    } catch (error) {
      logger.error('Failed to fetch media reference:', {
        mediaSetRid,
        mediaItemRid,
        error: error.message
      });
      throw error;
    }
  }

  // Get media item content (actual image data)
  async getMediaContent(mediaSetRid, mediaItemRid) {
    const endpoint = `/api/v2/mediasets/${mediaSetRid}/items/${mediaItemRid}/content`;
    
    logger.debug('Fetching media content', {
      mediaSetRid,
      mediaItemRid
    });

    try {
      const result = await this.apiCall('GET', endpoint, null, {}, { preview: true });
      return result;
    } catch (error) {
      logger.error('Failed to fetch media content:', {
        mediaSetRid,
        mediaItemRid,
        error: error.message
      });
      throw error;
    }
  }
}
