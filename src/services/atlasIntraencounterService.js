import { client, AtlasIntraencounterProduction } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { isOk } from '@osdk/client';

/**
 * Service wrapper around the AtlasIntraencounterProduction object type.
 * Mirrors the structure of AiChatHistoryService so the frontend can reuse patterns
 * while backend-proxy keeps Foundry interactions centralized.
 */
export class AtlasIntraencounterService {
  constructor() {
    this.objectType = 'AtlasIntraencounterProduction';
    this.ontologyRid = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
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
      logger.error('Error searching intra-encounter productions', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
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
}

export default AtlasIntraencounterService;
