import { logger } from '../utils/logger.js';

/**
 * CacheService - Handles caching for patient dashboard and media content
 * to minimize API calls and prevent rate limiting
 */
export class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.ttls = {
      dashboard: parseInt(process.env.DASHBOARD_CACHE_TTL) || 300, // 5 minutes
      media: parseInt(process.env.MEDIA_CACHE_TTL) || 86400, // 24 hours
      profile: parseInt(process.env.PROFILE_CACHE_TTL) || 600, // 10 minutes
      transcriptionSummary: parseInt(process.env.TRANSCRIPTION_CACHE_TTL) || 3600 // 1 hour
    };
    this.prefix = process.env.CACHE_KEY_PREFIX || 'atlas:v1:';
  }

  /**
   * Generate cache key with prefix
   */
  getCacheKey(type, identifier) {
    return `${this.prefix}${type}:${identifier}`;
  }

  /**
   * Get cached dashboard data
   */
  async getDashboard(userId) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey('dashboard', userId);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Dashboard cache hit', { userId, key });
        return JSON.parse(cached);
      }
      
      logger.debug('Dashboard cache miss', { userId, key });
      return null;
    } catch (error) {
      logger.error('Dashboard cache get error', { 
        userId, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache dashboard data
   */
  async setDashboard(userId, data) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey('dashboard', userId);
      const ttl = this.ttls.dashboard;
      
      await this.redis.setex(
        key, 
        ttl, 
        JSON.stringify({
          ...data,
          cachedAt: new Date().toISOString()
        })
      );
      
      logger.debug('Dashboard cached', { userId, key, ttl });
    } catch (error) {
      logger.error('Dashboard cache set error', { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Get cached media content
   */
  async getMedia(mediaSetRid, mediaItemRid) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey('media', `${mediaSetRid}:${mediaItemRid}`);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Media cache hit', { mediaSetRid, mediaItemRid, key });
        const data = JSON.parse(cached);
        
        // Return buffer from base64
        if (data.content) {
          data.content = Buffer.from(data.content, 'base64');
        }
        
        return data;
      }
      
      logger.debug('Media cache miss', { mediaSetRid, mediaItemRid, key });
      return null;
    } catch (error) {
      logger.error('Media cache get error', { 
        mediaSetRid, 
        mediaItemRid, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache media content
   */
  async setMedia(mediaSetRid, mediaItemRid, content, contentType) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey('media', `${mediaSetRid}:${mediaItemRid}`);
      const ttl = this.ttls.media;
      
      // Convert buffer to base64 for Redis storage
      const data = {
        content: content.toString('base64'),
        contentType,
        cachedAt: new Date().toISOString()
      };
      
      await this.redis.setex(key, ttl, JSON.stringify(data));
      
      logger.debug('Media cached', { 
        mediaSetRid, 
        mediaItemRid, 
        key, 
        ttl,
        size: content.length 
      });
    } catch (error) {
      logger.error('Media cache set error', { 
        mediaSetRid, 
        mediaItemRid, 
        error: error.message 
      });
    }
  }

  /**
   * Get cached profile data
   */
  async getProfile(userId) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey('profile', userId);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Profile cache hit', { userId, key });
        return JSON.parse(cached);
      }
      
      logger.debug('Profile cache miss', { userId, key });
      return null;
    } catch (error) {
      logger.error('Profile cache get error', { 
        userId, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache profile data
   */
  async setProfile(userId, data) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey('profile', userId);
      const ttl = this.ttls.profile;
      
      await this.redis.setex(
        key, 
        ttl, 
        JSON.stringify({
          ...data,
          cachedAt: new Date().toISOString()
        })
      );
      
      logger.debug('Profile cached', { userId, key, ttl });
    } catch (error) {
      logger.error('Profile cache set error', { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Get cached transcription summary
   */
  async getTranscriptionSummary(auth0Id, transcriptHash) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey('transcription', `${auth0Id}:${transcriptHash}`);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Transcription summary cache hit', { auth0Id, key });
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Transcription cache get error', { 
        auth0Id, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache transcription summary
   */
  async setTranscriptionSummary(auth0Id, transcriptHash, summary) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey('transcription', `${auth0Id}:${transcriptHash}`);
      const ttl = this.ttls.transcriptionSummary;
      
      await this.redis.setex(
        key, 
        ttl, 
        JSON.stringify({
          summary,
          cachedAt: new Date().toISOString()
        })
      );
      
      logger.debug('Transcription summary cached', { auth0Id, key, ttl });
    } catch (error) {
      logger.error('Transcription cache set error', { 
        auth0Id, 
        error: error.message 
      });
    }
  }

  /**
   * Invalidate cache entries
   */
  async invalidate(type, identifier) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey(type, identifier);
      await this.redis.del(key);
      
      logger.info('Cache invalidated', { type, identifier, key });
    } catch (error) {
      logger.error('Cache invalidation error', { 
        type, 
        identifier, 
        error: error.message 
      });
    }
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUser(userId) {
    if (!this.redis) return;
    
    try {
      const patterns = [
        this.getCacheKey('dashboard', userId),
        this.getCacheKey('profile', userId),
        this.getCacheKey('transcription', `${userId}:*`)
      ];
      
      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          logger.info('User cache invalidated', { 
            userId, 
            pattern, 
            keysDeleted: keys.length 
          });
        }
      }
    } catch (error) {
      logger.error('User cache invalidation error', { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Get cached clinical data (conditions, encounters, etc.)
   */
  async getClinicalData(type, userId, params = {}) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey(type, `${userId}:${JSON.stringify(params)}`);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug(`${type} cache hit`, { userId, key });
        return JSON.parse(cached);
      }
      
      logger.debug(`${type} cache miss`, { userId, key });
      return null;
    } catch (error) {
      logger.error(`${type} cache get error`, { 
        userId, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache clinical data
   */
  async setClinicalData(type, userId, params = {}, data) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey(type, `${userId}:${JSON.stringify(params)}`);
      
      // Get TTL based on type
      const ttlMap = {
        'conditions': 900, // 15 min
        'encounters': 600, // 10 min  
        'observations': 300, // 5 min
        'procedures': 1800, // 30 min
        'clinical-notes': 600, // 10 min
        'medications': 900, // 15 min
        'allergies': 900, // 15 min
        'immunizations': 900 // 15 min
      };
      
      const ttl = ttlMap[type] || 600;
      
      await this.redis.setex(
        key, 
        ttl, 
        JSON.stringify({
          ...data,
          cachedAt: new Date().toISOString()
        })
      );
      
      logger.debug(`${type} cached`, { userId, key, ttl });
    } catch (error) {
      logger.error(`${type} cache set error`, { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Get cached AI chat history
   */
  async getChatHistory(userId, pageSize = 25) {
    if (!this.redis) return null;
    
    try {
      const key = this.getCacheKey('chat-history', `${userId}:${pageSize}`);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.debug('Chat history cache hit', { userId, key });
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Chat history cache get error', { 
        userId, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Cache AI chat history
   */
  async setChatHistory(userId, pageSize, data) {
    if (!this.redis) return;
    
    try {
      const key = this.getCacheKey('chat-history', `${userId}:${pageSize}`);
      const ttl = 120; // 2 minutes for real-time feel
      
      await this.redis.setex(key, ttl, JSON.stringify({
        ...data,
        cachedAt: new Date().toISOString()
      }));
      
      logger.debug('Chat history cached', { userId, key, ttl });
    } catch (error) {
      logger.error('Chat history cache set error', { 
        userId, 
        error: error.message 
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.redis) return null;
    
    try {
      const info = await this.redis.info('stats');
      const keys = await this.redis.keys(`${this.prefix}*`);
      
      return {
        totalKeys: keys.length,
        redisStats: info,
        keysByType: {
          dashboard: keys.filter(k => k.includes(':dashboard:')).length,
          media: keys.filter(k => k.includes(':media:')).length,
          profile: keys.filter(k => k.includes(':profile:')).length,
          transcription: keys.filter(k => k.includes(':transcription:')).length,
          'clinical-data': keys.filter(k => 
            k.includes(':conditions:') || 
            k.includes(':encounters:') || 
            k.includes(':observations:') ||
            k.includes(':procedures:') ||
            k.includes(':clinical-notes:')
          ).length,
          'chat-history': keys.filter(k => k.includes(':chat-history:')).length
        }
      };
    } catch (error) {
      logger.error('Cache stats error', { error: error.message });
      return null;
    }
  }
}

// Export singleton instance
let cacheServiceInstance = null;

export function initializeCacheService(redisClient) {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService(redisClient);
    logger.info('Cache service initialized', {
      hasRedis: !!redisClient,
      ttls: cacheServiceInstance.ttls,
      prefix: cacheServiceInstance.prefix
    });
  }
  return cacheServiceInstance;
}

export function getCacheService() {
  if (!cacheServiceInstance) {
    logger.warn('Cache service not initialized, creating without Redis');
    cacheServiceInstance = new CacheService(null);
  }
  return cacheServiceInstance;
}
