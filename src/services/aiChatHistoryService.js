import { client } from '../osdk/client.js';
import { logger } from '../utils/logger.js';
import { isOk } from '@osdk/client';

/**
 * Service for managing AI Chat History using the new OSDK v2 client pattern
 * Following the format: GET /v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/objects/AiChatHistoryProduction
 */
export class AiChatHistoryService {
  constructor() {
    // Import the AiChatHistoryProduction object type from the SDK
    // This would normally be imported from "@atlas-dev/sdk" but we'll use a generic approach
    this.objectType = 'AiChatHistoryProduction';
    this.actionType = 'create-ai-chat-history-production';
    this.ontologyRid = 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
  }

  /**
   * Create a new AI chat history entry using the Ontology action
   * @param {Object} params - Creation parameters
   * @param {string} params.userId - User ID (Auth0 identifier)
   * @param {string} params.transcript - Chat transcript content
   * @param {string} params.timestamp - ISO timestamp
   * @returns {Promise<Object>} Creation result with chatId
   */
  async createChatHistory({ userId, transcript, timestamp }) {
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!transcript || transcript.trim().length === 0) {
      throw new Error('transcript cannot be empty');
    }

    const finalTimestamp = timestamp || new Date().toISOString();

    logger.info('Creating AI chat history', {
      userId,
      transcriptLength: transcript.length,
      timestamp: finalTimestamp
    });

    // Try OSDK first, fallback to REST API
    try {
      // Check if OSDK client is properly initialized
      if (client && typeof client.ontology === 'function') {
        logger.info('Attempting OSDK client approach');
        return await this.createChatHistoryViaOSDK({ userId, transcript, timestamp: finalTimestamp });
      } else {
        logger.warn('OSDK client not available, using REST API fallback');
        return await this.createChatHistoryViaREST({ userId, transcript, timestamp: finalTimestamp });
      }
    } catch (error) {
      logger.error('OSDK approach failed, falling back to REST API', {
        error: error.message,
        userId
      });
      
      try {
        return await this.createChatHistoryViaREST({ userId, transcript, timestamp: finalTimestamp });
      } catch (restError) {
        logger.error('Both OSDK and REST API approaches failed', {
          osdkError: error.message,
          restError: restError.message,
          userId
        });
        throw restError;
      }
    }
  }

  /**
   * Create chat history using OSDK client
   */
  async createChatHistoryViaOSDK({ userId, transcript, timestamp }) {
    const actionClient = client.ontology(this.ontologyRid).action(this.actionType);
    
    const result = await actionClient.applyAction(
      {
        user_id: userId,
        transcript: transcript.trim(),
        timestamp: timestamp
      },
      {
        $returnEdits: true
      }
    );

    if (result && result.type === "edits") {
      const updatedObject = result.editedObjectTypes?.[0];

      logger.info('Successfully created AI chat history via OSDK', {
        userId,
        objectId: updatedObject?.primaryKey,
        transcriptLength: transcript.length
      });

      return {
        success: true,
        chatId: updatedObject?.primaryKey || `chat_${Date.now()}`,
        userId,
        timestamp
      };
    } else {
      logger.warn('Unexpected result type from OSDK action', {
        resultType: result?.type
      });

      return {
        success: true,
        chatId: `chat_${Date.now()}`,
        userId,
        timestamp
      };
    }
  }

  /**
   * Create chat history using direct REST API calls
   */
  async createChatHistoryViaREST({ userId, transcript, timestamp }) {
    const foundryHost = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
    const clientId = process.env.FOUNDRY_CLIENT_ID;
    const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('FOUNDRY_CLIENT_ID and FOUNDRY_CLIENT_SECRET are required for REST API fallback');
    }

    // Get access token
    const token = await this.getFoundryAccessToken();
    
    // Make direct API call to Foundry
    const actionUrl = `${foundryHost}/api/v2/ontologies/${this.ontologyRid}/actions/${this.actionType}/apply`;
    
    logger.info('Making direct REST API call to Foundry', {
      actionUrl: actionUrl.replace(foundryHost, '[FOUNDRY_HOST]'),
      userId
    });

    const response = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        parameters: {
          user_id: userId,
          transcript: transcript.trim(),
          timestamp: timestamp
        },
        options: {
          returnEdits: 'ALL'
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Foundry REST API call failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId
      });
      throw new Error(`Foundry API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    logger.info('Successfully created AI chat history via REST API', {
      userId,
      transcriptLength: transcript.length
    });

    return {
      success: true,
      chatId: result.edits?.[0]?.primaryKey || `chat_${Date.now()}`,
      userId,
      timestamp,
      foundryResult: result
    };
  }

  /**
   * Get Foundry access token using client credentials
   */
  async getFoundryAccessToken() {
    const foundryHost = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
    const clientId = process.env.FOUNDRY_CLIENT_ID;
    const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;
    const tokenUrl = process.env.FOUNDRY_OAUTH_TOKEN_URL || `${foundryHost}/multipass/api/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'api:use-ontologies-write api:use-ontologies-read'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Foundry access token: ${response.status} - ${errorText}`);
    }

    const tokenData = await response.json();
    return tokenData.access_token;
  }

  /**
   * Batch create multiple AI chat history entries
   * @param {Array<Object>} entries - Array of creation parameters
   * @returns {Promise<Object>} Batch creation result
   */
  async batchCreateChatHistory(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('entries must be a non-empty array');
    }

    logger.info('Batch creating AI chat history entries', {
      count: entries.length
    });

    try {
      const parameters = entries.map(entry => ({
        user_id: entry.userId,
        transcript: entry.transcript.trim(),
        timestamp: entry.timestamp || new Date().toISOString()
      }));

      const actionClient = client.ontology(this.ontologyRid).action(this.actionType);

      const result = await actionClient.batchApplyAction(
        parameters,
        {
          $returnEdits: false  // More efficient for batch operations
        }
      );

      logger.info('Successfully batch created AI chat history entries', {
        count: entries.length
      });

      return {
        success: true,
        count: entries.length
      };
    } catch (error) {
      logger.error('Failed to batch create AI chat history', {
        error: error.message,
        count: entries.length
      });

      throw error;
    }
  }

  /**
   * Fetch AI chat history entries with pagination
   * @param {Object} options - Query options
   * @param {number} options.pageSize - Number of items per page (default: 30)
   * @param {string} options.nextPageToken - Token for next page
   * @param {string[]} options.select - Properties to select (e.g., ["chatId"])
   * @param {boolean} options.includeRid - Whether to include RID in results
   * @returns {Promise<Object>} Page result with data and pagination info
   */
  async fetchPage(options = {}) {
    const {
      pageSize = 30,
      nextPageToken,
      select,
      includeRid = false
    } = options;

    try {
      logger.info('Fetching AI chat history page', {
        pageSize,
        hasNextPageToken: !!nextPageToken,
        select,
        includeRid
      });

      // Build query parameters
      const queryParams = {
        $pageSize: pageSize
      };

      if (nextPageToken) {
        queryParams.$nextPageToken = nextPageToken;
      }

      if (select && select.length > 0) {
        queryParams.$select = select;
      }

      if (includeRid) {
        queryParams.$includeRid = true;
      }

      // Use the OSDK client to fetch the page
      // Note: This assumes the AiChatHistoryProduction object type is available
      // In a real implementation, you would import it from your generated SDK
      const result = await client(this.objectType).fetchPageWithErrors(queryParams);

      if (isOk(result)) {
        logger.info('Successfully fetched AI chat history page', {
          itemCount: result.value.data.length,
          hasNextPage: !!result.value.nextPageToken
        });

        return {
          success: true,
          data: result.value.data,
          nextPageToken: result.value.nextPageToken,
          hasMore: !!result.value.nextPageToken
        };
      } else {
        logger.error('Failed to fetch AI chat history page', {
          error: result.error
        });

        return {
          success: false,
          error: result.error,
          data: [],
          nextPageToken: null,
          hasMore: false
        };
      }
    } catch (error) {
      logger.error('Error fetching AI chat history page', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Fetch AI chat history entries without error wrapper (throws on error)
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Page result with data and pagination info
   */
  async fetchPageDirect(options = {}) {
    const {
      pageSize = 30,
      nextPageToken,
      select,
      includeRid = false
    } = options;

    try {
      logger.info('Fetching AI chat history page (direct)', {
        pageSize,
        hasNextPageToken: !!nextPageToken,
        select,
        includeRid
      });

      // Build query parameters
      const queryParams = {
        $pageSize: pageSize
      };

      if (nextPageToken) {
        queryParams.$nextPageToken = nextPageToken;
      }

      if (select && select.length > 0) {
        queryParams.$select = select;
      }

      if (includeRid) {
        queryParams.$includeRid = true;
      }

      // Check if OSDK client is properly initialized
      if (!client || typeof client.ontology !== 'function') {
        throw new Error('OSDK client not properly initialized');
      }

      // Use the OSDK client to fetch the page directly (throws on error)
      const objectSet = client.ontology(this.ontologyRid).objects(this.objectType);
      const result = await objectSet.fetchPage(queryParams);

      logger.info('Successfully fetched AI chat history page (direct)', {
        itemCount: result.data.length,
        hasNextPage: !!result.nextPageToken
      });

      return {
        data: result.data,
        nextPageToken: result.nextPageToken,
        hasMore: !!result.nextPageToken
      };
    } catch (error) {
      logger.error('Error fetching AI chat history page (direct)', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Fetch multiple pages of AI chat history
   * @param {Object} options - Query options
   * @param {number} options.maxPages - Maximum number of pages to fetch (default: 5)
   * @param {number} options.pageSize - Number of items per page (default: 30)
   * @param {string[]} options.select - Properties to select
   * @param {boolean} options.includeRid - Whether to include RID in results
   * @returns {Promise<Object[]>} Combined results from all pages
   */
  async fetchMultiplePages(options = {}) {
    const {
      maxPages = 5,
      pageSize = 30,
      select,
      includeRid = false
    } = options;

    try {
      logger.info('Fetching multiple AI chat history pages', {
        maxPages,
        pageSize,
        select,
        includeRid
      });

      const allObjects = [];
      let nextPageToken = null;
      let pageCount = 0;

      while (pageCount < maxPages) {
        const result = await this.fetchPageDirect({
          pageSize,
          nextPageToken,
          select,
          includeRid
        });

        allObjects.push(...result.data);
        nextPageToken = result.nextPageToken;
        pageCount++;

        if (!nextPageToken) {
          break; // No more pages
        }
      }

      logger.info('Successfully fetched multiple AI chat history pages', {
        totalItems: allObjects.length,
        pagesFetched: pageCount,
        hasMore: !!nextPageToken
      });

      return allObjects;
    } catch (error) {
      logger.error('Error fetching multiple AI chat history pages', {
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Search AI chat history by user ID using OSDK where clause
   * @param {string} userId - User ID to search for
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} Chat history entries for the user
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

    // Try OSDK first, fallback to REST API
    try {
      // Check if OSDK client is properly initialized
      if (client && typeof client.ontology === 'function') {
        logger.info('Searching AI chat history by user ID via OSDK where clause', {
          userId,
          pageSize,
          select,
          includeRid
        });

        // Build the query with where clause (OSDK fetchPage supports server-side filtering)
        const queryParams = {
          $where: {
            userId: { $eq: userId }
          },
          $pageSize: pageSize,
          $orderBy: {
            timestamp: 'desc'
          }
        };

        if (select && select.length > 0) {
          queryParams.$select = select;
        }

        if (includeRid) {
          queryParams.$includeRid = true;
        }

        // Execute using the OSDK client ontology method
        try {
          const objectSet = client.ontology(this.ontologyRid).objects(this.objectType);
          const result = await objectSet.fetchPage(queryParams);

          logger.info('Found AI chat history entries for user via OSDK', {
            userId,
            entryCount: result.data?.length || 0
          });

          return result.data || [];
        } catch (osdkError) {
          logger.error('OSDK client call failed', {
            error: osdkError.message,
            clientType: typeof client,
            hasOntology: typeof client?.ontology
          });
          throw osdkError; // Re-throw to trigger the outer catch block
        }
      } else {
        logger.warn('OSDK client not available for search, using REST API fallback');
        return await this.searchByUserIdViaREST(userId, options);
      }
    } catch (error) {
      logger.error('OSDK search failed, falling back to REST API', {
        userId,
        error: error.message
      });

      try {
        return await this.searchByUserIdViaREST(userId, options);
      } catch (restError) {
        logger.error('Both OSDK and REST API search approaches failed', {
          userId,
          osdkError: error.message,
          restError: restError.message
        });
        throw restError;
      }
    }
  }

  /**
   * Search chat history by user ID using direct REST API calls
   */
  async searchByUserIdViaREST(userId, options = {}) {
    const {
      pageSize = 30,
      select,
      includeRid = false
    } = options;

    const foundryHost = process.env.FOUNDRY_HOST || 'https://atlasengine.palantirfoundry.com';
    const token = await this.getFoundryAccessToken();
    
    const searchUrl = `${foundryHost}/api/v2/ontologies/${this.ontologyRid}/objects/${this.objectType}/search`;
    
    logger.info('Searching AI chat history via REST API', {
      searchUrl: searchUrl.replace(foundryHost, '[FOUNDRY_HOST]'),
      userId,
      pageSize
    });

    const requestBody = {
      where: {
        field: 'userId',
        type: 'eq',
        value: userId
      },
      pageSize,
      select: select || ['chatId', 'transcript', 'userId', 'timestamp']
      // Note: includeRid is not supported by Foundry REST API, only by OSDK
    };

    // Debug: Log exact request being sent
    logger.debug('AI Chat History REST API request details', {
      method: 'POST',
      url: searchUrl,
      body: JSON.stringify(requestBody),
      userId,
      hasToken: !!token
    });

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
      logger.error('Foundry REST API search failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        userId
      });
      throw new Error(`Foundry search API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    // Debug: Log response structure
    logger.debug('AI Chat History REST API response details', {
      userId,
      status: response.status,
      hasData: !!result.data,
      dataCount: result.data?.length || 0,
      hasNextPageToken: !!result.nextPageToken,
      dataKeys: result.data?.[0] ? Object.keys(result.data[0]) : [],
      responseStructure: Object.keys(result)
    });
    
    logger.info('Successfully searched AI chat history via REST API', {
      userId,
      entryCount: result.data?.length || 0,
      hasNextPage: !!result.nextPageToken
    });

    return result.data || [];
  }
}

export default AiChatHistoryService;
