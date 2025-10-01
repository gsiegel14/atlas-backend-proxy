import fetch from 'node-fetch';
import { client, osdkHost } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { FoundryService } from './foundryService.js';

const DEFAULT_FOUNDRY_HOST = 'https://atlasengine.palantirfoundry.com';
const DEFAULT_QUERY_ID = 'arcExplains';

let arcExplainsDefinition;
try {
  const sdk = await import('@atlas-dev/sdk');
  arcExplainsDefinition = sdk.arcExplains
    || sdk.arcExplainsQuery
    || sdk.ArcExplains;
} catch (error) {
  logger?.warn?.('ArcExplainService: @atlas-dev/sdk missing, OSDK path may be unavailable', {
    message: error.message
  });
}

export class ArcExplainService {
  constructor({
    queryId,
    foundryService,
    host,
    ontologyApiName
  } = {}) {
    this.host = host || process.env.FOUNDRY_HOST || osdkHost || DEFAULT_FOUNDRY_HOST;
    this.queryId = queryId || process.env.FOUNDRY_ARC_EXPLAINS_QUERY_ID || DEFAULT_QUERY_ID;
    this.foundryService = foundryService || new FoundryService({
      host: this.host,
      clientId: process.env.FOUNDRY_CLIENT_ID,
      clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
      tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL
    });
    this.ontologyApiName = ontologyApiName
      || process.env.FOUNDRY_ARC_EXPLAINS_ONTOLOGY_ID
      || this.foundryService.getApiOntologyRid();
  }

  async explain({ auth0Id, frontendInput, correlationId }) {
    if (!auth0Id || typeof auth0Id !== 'string' || auth0Id.trim().length === 0) {
      const error = new Error('auth0Id is required');
      error.status = 400;
      throw error;
    }

    if (!frontendInput || typeof frontendInput !== 'string' || frontendInput.trim().length === 0) {
      const error = new Error('frontendInput must not be empty');
      error.status = 400;
      throw error;
    }

    const payload = {
      auth0Id: auth0Id.trim(),
      frontendInput: frontendInput.trim()
    };

    // Attempt the OSDK client path first when available.
    try {
      const result = await this.executeViaOSDK(payload, correlationId);
      if (result != null) {
        return result;
      }
    } catch (error) {
      logger.warn('ArcExplainService OSDK execution failed, falling back to REST', {
        message: error.message,
        correlationId
      });
    }

    return this.executeViaRest(payload, correlationId);
  }

  async executeViaOSDK(payload, correlationId) {
    if (!client || typeof client !== 'function') {
      logger.debug('ArcExplainService: OSDK client unavailable, skipping');
      return null;
    }

    try {
      const queryIdentifier = this.resolveQueryIdentifier();
      if (!queryIdentifier) {
        logger.debug('ArcExplainService: arcExplains query definition missing in SDK');
        return null;
      }

      const queryClient = client(queryIdentifier);
      if (!queryClient || typeof queryClient.executeFunction !== 'function') {
        logger.debug('ArcExplainService: executeFunction not available on query client');
        return null;
      }

      logger.info('ArcExplainService: executing via OSDK', {
        correlationId
      });

      const response = await queryClient.executeFunction(payload);
      return this.normalizeResult(response);
    } catch (error) {
      logger.error('ArcExplainService: OSDK execution error', {
        message: error.message,
        correlationId
      });
      throw error;
    }
  }

  resolveQueryIdentifier() {
    if (arcExplainsDefinition) {
      return arcExplainsDefinition;
    }
    // Fallback to using string identifier; client wrapper will attempt resolution
    return 'arcExplains';
  }

  async executeViaRest(payload, correlationId) {
    const token = await this.foundryService.getToken();

    const host = this.host.replace(/\/$/, '');
    const ontologyId = this.ontologyApiName;
    const url = `${host}/api/v2/ontologies/${ontologyId}/queries/${this.queryId}/execute`;

    logger.info('ArcExplainService: executing via REST', {
      url: url.replace(host, '[host]'),
      correlationId
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ parameters: payload })
    });

    const raw = await response.text();

    if (!response.ok) {
      const error = new Error(`Foundry arcExplains REST error: ${response.status}`);
      error.status = response.status;
      logger.error('ArcExplainService: REST call failed', {
        status: response.status,
        statusText: response.statusText,
        body: raw?.slice(0, 500),
        correlationId
      });
      throw error;
    }

    let data;
    try {
      data = raw ? JSON.parse(raw) : '';
    } catch (error) {
      data = raw;
    }

    return this.normalizeResult(data);
  }

  normalizeResult(result) {
    if (result == null) {
      return '';
    }

    if (typeof result === 'string') {
      return result;
    }

    if (typeof result === 'object') {
      if (typeof result.data === 'string') {
        return result.data;
      }
      if (typeof result.result === 'string') {
        return result.result;
      }
      if (typeof result.reply === 'string') {
        return result.reply;
      }
      if (typeof result.output === 'string') {
        return result.output;
      }
    }

    return JSON.stringify(result);
  }
}

export default ArcExplainService;
