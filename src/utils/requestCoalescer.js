import { logger } from './logger.js';

/**
 * RequestCoalescer - Prevents duplicate concurrent requests for the same resource
 * 
 * When multiple clients request the same resource simultaneously,
 * only one request is made to the upstream service, and all clients
 * receive the same response.
 */
export class RequestCoalescer {
  constructor(name = 'default') {
    this.name = name;
    this.pending = new Map();
    this.stats = {
      requests: 0,
      coalesced: 0,
      errors: 0
    };
  }

  /**
   * Coalesce requests for the same key
   * @param {string} key - Unique identifier for the resource
   * @param {Function} fetchFn - Async function that fetches the resource
   * @returns {Promise} The fetched resource
   */
  async coalesce(key, fetchFn) {
    this.stats.requests++;

    // If there's already a pending request for this key, return it
    if (this.pending.has(key)) {
      this.stats.coalesced++;
      logger.debug('Request coalesced', {
        coalescer: this.name,
        key,
        coalescedCount: this.stats.coalesced
      });
      return this.pending.get(key);
    }

    // Create new request
    const promise = fetchFn()
      .then(result => {
        logger.debug('Request completed', {
          coalescer: this.name,
          key
        });
        return result;
      })
      .catch(error => {
        this.stats.errors++;
        logger.error('Request failed', {
          coalescer: this.name,
          key,
          error: error.message
        });
        throw error;
      })
      .finally(() => {
        // Clean up pending request
        this.pending.delete(key);
      });

    // Store the pending promise
    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Get coalescer statistics
   */
  getStats() {
    return {
      name: this.name,
      ...this.stats,
      pending: this.pending.size,
      savingsPercentage: this.stats.requests > 0
        ? Math.round((this.stats.coalesced / this.stats.requests) * 100)
        : 0
    };
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.pending.clear();
    logger.info('Request coalescer cleared', {
      coalescer: this.name
    });
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      requests: 0,
      coalesced: 0,
      errors: 0
    };
  }
}

// Create singleton instances for common use cases
export const mediaCoalescer = new RequestCoalescer('media');
export const dashboardCoalescer = new RequestCoalescer('dashboard');
export const profileCoalescer = new RequestCoalescer('profile');
export const clinicalDataCoalescer = new RequestCoalescer('clinical-data');

// Export stats for all coalescers
export function getAllCoalescerStats() {
  return {
    media: mediaCoalescer.getStats(),
    dashboard: dashboardCoalescer.getStats(),
    profile: profileCoalescer.getStats(),
    clinicalData: clinicalDataCoalescer.getStats()
  };
}


