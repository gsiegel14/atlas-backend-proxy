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

    logger.info('Creating AI chat history via OSDK action', {
      userId,
      transcriptLength: transcript.length,
      timestamp
    });

    try {
      // Use the OSDK client to apply the action
      // Format: /v2/ontologies/{ontologyRid}/actions/{actionType}/apply
      const actionClient = client.ontology(this.ontologyRid).action(this.actionType);
      
      const result = await actionClient.applyAction(
        {
          user_id: userId,
          transcript: transcript.trim(),
          timestamp: timestamp || new Date().toISOString()
        },
        {
          $returnEdits: true
        }
      );

      if (result && result.type === "edits") {
        const updatedObject = result.editedObjectTypes?.[0];

        logger.info('Successfully created AI chat history', {
          userId,
          objectId: updatedObject?.primaryKey,
          transcriptLength: transcript.length
        });

        return {
          success: true,
          chatId: updatedObject?.primaryKey || `chat_${Date.now()}`,
          userId,
          timestamp: timestamp || new Date().toISOString()
        };
      } else {
        logger.warn('Unexpected result type from OSDK action', {
          resultType: result?.type
        });

        // Fallback success response
        return {
          success: true,
          chatId: `chat_${Date.now()}`,
          userId,
          timestamp: timestamp || new Date().toISOString()
        };
      }
    } catch (error) {
      logger.error('Failed to create AI chat history via OSDK', {
        error: error.message,
        stack: error.stack,
        userId
      });

      throw error;
    }
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

      // Use the OSDK client to fetch the page directly (throws on error)
      const result = await client(this.objectType).fetchPage(queryParams);

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
   * Search AI chat history by user ID
   * @param {string} userId - User ID to search for
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} Chat history entries for the user
   */
  async searchByUserId(userId, options = {}) {
    if (!userId) {
      throw new Error('userId is required');
    }

    try {
      logger.info('Searching AI chat history by user ID', {
        userId,
        options
      });

      // For now, we'll fetch all entries and filter
      // In a real implementation, you would use the search API with filters
      const allEntries = await this.fetchMultiplePages(options);

      // Filter by user ID (assuming there's a userId field)
      const userEntries = allEntries.filter(entry => 
        entry.userId === userId || 
        entry.user_id === userId ||
        entry.properties?.userId === userId ||
        entry.properties?.user_id === userId
      );

      logger.info('Found AI chat history entries for user', {
        userId,
        entryCount: userEntries.length
      });

      return userEntries;
    } catch (error) {
      logger.error('Error searching AI chat history by user ID', {
        userId,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }
}

export default AiChatHistoryService;
