import axios from 'axios';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger.js';

export class FoundryService {
  constructor(config) {
    this.host = config.host;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenUrl = config.tokenUrl;
    
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
      // Fallback to expired cached token if available
      if (cached) {
        logger.warn('Using expired token due to circuit breaker failure');
        return cached.token;
      }
      throw new Error('Unable to obtain Foundry token');
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
  async apiCall(method, endpoint, data = null, headers = {}) {
    try {
      return await this.apiCircuit.fire(method, endpoint, data, headers);
    } catch (error) {
      if (error.message === 'Circuit breaker is open') {
        throw new Error('Foundry service temporarily unavailable');
      }
      throw error;
    }
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

  async searchOntologyObjects(ontologyId, objectTypePath, payload = {}) {
    const endpoint = `/api/v1/ontologies/${ontologyId}/objects/${objectTypePath}/search`;
    return this.apiCall('POST', endpoint, payload);
  }

  async getPatientDashboard(patientId) {
    return this.apiCall('GET', `/api/v1/patient/${patientId}/dashboard`);
  }

  async uploadDocument(patientId, documentData) {
    return this.apiCall('POST', `/api/v1/patient/${patientId}/documents`, documentData);
  }
}
