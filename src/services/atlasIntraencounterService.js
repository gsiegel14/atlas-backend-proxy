import { client, AtlasIntraencounterProduction, osdkOntologyRid } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { isOk } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

/**
 * Service wrapper around the AtlasIntraencounterProduction object type.
 * Mirrors the structure of AiChatHistoryService so the frontend can reuse patterns
 * while backend-proxy keeps Foundry interactions centralized.
 */
export class AtlasIntraencounterService {
  constructor() {
    this.objectType = 'AtlasIntraencounterProduction';
    this.ontologyRid = osdkOntologyRid;
  }

  /**
   * Fetches a page of intra-encounter productions using the OSDK client.
   * @param {Object} options
   * @param {number} options.pageSize
   * @param {string} [options.nextPageToken]
   * @param {string[]} [options.select]
   * @param {boolean} [options.includeRid]
   */
  async fetchPage(options = {}) {
    const {
      pageSize = 30,
      nextPageToken,
      select,
      includeRid = false
    } = options;

    const defaultSelect = [
      'transcript',
      'summary',
      'llm_summary',
      'llmSummary',
      'aiSummary',
      'functionSummary',
      'userId',
      'user_id',
      'timestamp',
      'updatedAt',
      'createdAt',
      'ingested_at',
      'providerName',
      'provider_name',
      'location',
      'hospital',
      'speciality',
      'rid'
    ];

    const targetSelect = select && select.length > 0 ? select : defaultSelect;

    try {
      logger.info('Fetching intra-encounter page', {
        pageSize,
        hasNextPageToken: !!nextPageToken,
        select,
        includeRid
      });

      const queryParams = {
        $pageSize: pageSize
      };

      if (nextPageToken) {
        queryParams.$nextPageToken = nextPageToken;
      }

      queryParams.$select = targetSelect;

      if (includeRid) {
        queryParams.$includeRid = true;
      }

      const result = await client(this.objectType).fetchPageWithErrors(queryParams);

      if (isOk(result)) {
        return {
          success: true,
          data: this._normalize(result.value.data),
          nextPageToken: result.value.nextPageToken,
          hasMore: !!result.value.nextPageToken
        };
      }

      logger.error('Failed to fetch intra-encounter page', {
        error: result.error
      });

      return {
        success: false,
        error: result.error,
        data: [],
        nextPageToken: null,
        hasMore: false
      };
    } catch (error) {
      logger.error('Error fetching intra-encounter page', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Server-side filter by userId using the new $where syntax.
   * @param {string} userId
   * @param {Object} options
   */
  async searchByUserId(userId, options = {}) {
    if (!userId) {
      throw new Error('userId is required');
    }

    const {
      pageSize = 30,
      select,
      includeRid = false
    } = options;

    const defaultSelect = [
      'transcript',
      'summary',
      'llm_summary',
      'llmSummary',
      'aiSummary',
      'functionSummary',
      'userId',
      'user_id',
      'timestamp',
      'updatedAt',
      'createdAt',
      'ingested_at',
      'providerName',
      'provider_name',
      'location',
      'hospital',
      'speciality',
      'rid'
    ];

    const targetSelect = select && select.length > 0 ? select : defaultSelect;

    try {
      logger.info('Searching intra-encounter productions for user', {
        userId,
        pageSize,
        select,
        includeRid
      });

      const queryParams = {
        $where: {
          userId: { $eq: userId }
        },
        $pageSize: pageSize,
        $orderBy: {
          timestamp: 'desc'
        }
      };

      queryParams.$select = targetSelect;

      if (includeRid) {
        queryParams.$includeRid = true;
      }

      // Check if typed object is available
      if (!AtlasIntraencounterProduction) {
        throw new Error('AtlasIntraencounterProduction type not available - SDK not loaded');
      }

      // Use the typed OSDK v2 pattern
      // Note: The object type property is 'userId' not 'user_id'
      const result = await client(AtlasIntraencounterProduction)
        .where({ userId: { $eq: userId } })
        .fetchPage({
          $pageSize: pageSize,
          $select: targetSelect,
          $includeRid: includeRid,
          $orderBy: { timestamp: 'desc' }
        });

      return this._normalize(result.data || []);
    } catch (error) {
      logger.error('OSDK search failed for intra-encounter, falling back to REST API', {
        userId,
        error: error.message
      });
      
      // Fallback to REST API if OSDK fails (e.g., 404 if object type doesn't exist)
      try {
        return await this.searchByUserIdViaREST(userId, {
          pageSize,
          select: targetSelect,
          includeRid
        });
      } catch (restError) {
        logger.error('Both OSDK and REST API search failed for intra-encounter', {
          userId,
          osdkError: error.message,
          restError: restError.message
        });
        throw restError;
      }
    }
  }

  _normalize(entries) {
    return entries.map(entry => {
      if (entry && entry.properties) {
        return this._ensureSummaryFields(entry);
      }
      return this._ensureSummaryFields({
        ...entry,
        properties: entry ?? {}
      });
    });
  }

  _ensureSummaryFields(entry) {
    const properties = entry.properties ?? {};
    if (!properties.summary) {
      const summaryCandidate =
        properties.llm_summary
        || properties.llmSummary
        || properties.aiSummary
        || properties.functionSummary
        || properties.summary_text;

      if (summaryCandidate) {
        entry = {
          ...entry,
          properties: {
            ...properties,
            summary: summaryCandidate
          }
        };
      }
    }
    return entry;
  }

  /**
   * REST API fallback for searching by userId
   */
  async searchByUserIdViaREST(userId, options = {}) {
    const {
      pageSize = 30,
      select,
      includeRid = false
    } = options;

    const foundryHost = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
    
    // Get access token
    const tokenProvider = createConfidentialOauthClient(
      process.env.FOUNDRY_CLIENT_ID,
      process.env.FOUNDRY_CLIENT_SECRET,
      foundryHost,
      ['api:use-ontologies-read']
    );
    const token = await tokenProvider();
    
    const searchUrl = `${foundryHost}/api/v2/ontologies/${this.ontologyRid}/objects/${this.objectType}/search`;
    
    logger.info('Searching intra-encounter via REST API', {
      searchUrl: searchUrl.replace(foundryHost, '[FOUNDRY_HOST]'),
      userId,
      pageSize,
      ontologyRid: this.ontologyRid
    });

    // Note: The API shows the property is 'userId' not 'user_id'
    const requestBody = {
      where: {
        field: 'userId',
        type: 'eq',
        value: userId
      },
      pageSize,
      select: select || [
        'transcript', 'summary', 'llmSummary',
        'userId', 'timestamp', 'providerName', 
        'location', 'hospital', 'speciality', 
        'audiofileId', 'audiofile'
      ]
    };

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Foundry REST API search failed for intra-encounter', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId,
        ontologyRid: this.ontologyRid
      });
      throw new Error(`Foundry search API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    logger.info('Successfully searched intra-encounter via REST API', {
      userId,
      entryCount: result.data?.length || 0,
      hasNextPage: !!result.nextPageToken
    });

    return result.data || [];
  }
}

export default AtlasIntraencounterService;
