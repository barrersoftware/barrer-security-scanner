/**
 * Rate Limiter Service
 * Implements token bucket algorithm for rate limiting
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class RateLimiter {
  constructor(db) {
    this.db = db;
    this.algorithm = 'token_bucket';
  }

  async init() {
    logger.info('[RateLimiter] Initializing...');
    logger.info(`[RateLimiter] Algorithm: ${this.algorithm}`);
    logger.info('[RateLimiter] ✅ Initialized');
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(tenantId, identifier, identifierType, options = {}) {
    try {
      const {
        endpoint = null,
        limit = null,
        window = null
      } = options;

      // Get configuration
      const config = await this.getConfig(tenantId);
      
      if (!config.enabled) {
        return {
          allowed: true,
          remaining: Infinity,
          reset: null
        };
      }

      // Determine limits based on identifier type
      const limits = this.calculateLimits(identifierType, config, limit, window);

      // Get or create rate limit record
      const record = await this.getOrCreateRecord(
        tenantId,
        identifier,
        identifierType,
        endpoint,
        limits
      );

      // Refill tokens if needed
      const refilled = this.refillTokens(record, limits);

      // Check if request is allowed
      if (refilled.tokens_remaining > 0) {
        // Allow request and consume token
        refilled.tokens_remaining -= 1;
        refilled.requests_count += 1;
        await this.updateRecord(refilled);

        return {
          allowed: true,
          remaining: refilled.tokens_remaining,
          limit: limits.limit,
          reset: this.calculateReset(refilled.last_refill, limits.window),
          retryAfter: null
        };
      } else {
        // Rate limit exceeded
        const retryAfter = this.calculateReset(refilled.last_refill, limits.window);
        
        return {
          allowed: false,
          remaining: 0,
          limit: limits.limit,
          reset: retryAfter,
          retryAfter: Math.ceil((retryAfter - Date.now()) / 1000)
        };
      }

    } catch (error) {
      logger.error(`[RateLimiter] Error checking limit: ${error.message}`);
      // Fail open - allow request on error
      return { allowed: true, remaining: null, reset: null };
    }
  }

  /**
   * Get rate limit configuration for tenant
   */
  async getConfig(tenantId) {
    try {
      const query = 'SELECT * FROM rate_limit_config WHERE tenant_id = ?';
      let config = await this.db.get(query, [tenantId]);

      if (!config) {
        config = await this.createDefaultConfig(tenantId);
      }

      return config;
    } catch (error) {
      logger.error(`[RateLimiter] Error getting config: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  /**
   * Create default configuration for tenant
   */
  async createDefaultConfig(tenantId) {
    const config = {
      id: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      enabled: 1,
      global_limit: 1000,
      global_window: 3600,
      per_ip_limit: 100,
      per_ip_window: 60,
      per_user_limit: 1000,
      per_user_window: 3600,
      burst_allowance: 50,
      ddos_threshold: 1000,
      ddos_window: 60,
      brute_force_attempts: 5,
      brute_force_window: 300,
      block_duration: 3600,
      auto_block_enabled: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const query = `
      INSERT INTO rate_limit_config 
      (id, tenant_id, enabled, global_limit, global_window, per_ip_limit, per_ip_window,
       per_user_limit, per_user_window, burst_allowance, ddos_threshold, ddos_window,
       brute_force_attempts, brute_force_window, block_duration, auto_block_enabled,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      config.id, config.tenant_id, config.enabled, config.global_limit, config.global_window,
      config.per_ip_limit, config.per_ip_window, config.per_user_limit, config.per_user_window,
      config.burst_allowance, config.ddos_threshold, config.ddos_window,
      config.brute_force_attempts, config.brute_force_window, config.block_duration,
      config.auto_block_enabled, config.created_at, config.updated_at
    ]);

    return config;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      enabled: 1,
      global_limit: 1000,
      global_window: 3600,
      per_ip_limit: 100,
      per_ip_window: 60,
      per_user_limit: 1000,
      per_user_window: 3600,
      burst_allowance: 50,
      ddos_threshold: 1000,
      ddos_window: 60,
      brute_force_attempts: 5,
      brute_force_window: 300,
      block_duration: 3600,
      auto_block_enabled: 1
    };
  }

  /**
   * Calculate limits based on identifier type
   */
  calculateLimits(identifierType, config, overrideLimit, overrideWindow) {
    if (overrideLimit && overrideWindow) {
      return {
        limit: overrideLimit,
        window: overrideWindow
      };
    }

    switch (identifierType) {
      case 'ip':
        return {
          limit: config.per_ip_limit + config.burst_allowance,
          window: config.per_ip_window
        };
      case 'user':
        return {
          limit: config.per_user_limit + config.burst_allowance,
          window: config.per_user_window
        };
      case 'global':
        return {
          limit: config.global_limit,
          window: config.global_window
        };
      default:
        return {
          limit: config.per_ip_limit,
          window: config.per_ip_window
        };
    }
  }

  /**
   * Get or create rate limit record
   */
  async getOrCreateRecord(tenantId, identifier, identifierType, endpoint, limits) {
    try {
      // Try to get existing record
      const query = `
        SELECT * FROM rate_limits 
        WHERE tenant_id = ? AND identifier = ? AND identifier_type = ? 
        AND (endpoint = ? OR endpoint IS NULL)
        LIMIT 1
      `;
      
      let record = await this.db.get(query, [tenantId, identifier, identifierType, endpoint]);

      if (record) {
        return record;
      }

      // Create new record
      const now = new Date().toISOString();
      record = {
        id: crypto.randomBytes(16).toString('hex'),
        tenant_id: tenantId,
        identifier: identifier,
        identifier_type: identifierType,
        endpoint: endpoint,
        tokens_remaining: limits.limit,
        last_refill: now,
        requests_count: 0,
        window_start: now,
        created_at: now,
        updated_at: now
      };

      const insertQuery = `
        INSERT INTO rate_limits 
        (id, tenant_id, identifier, identifier_type, endpoint, tokens_remaining, 
         last_refill, requests_count, window_start, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(insertQuery, [
        record.id, record.tenant_id, record.identifier, record.identifier_type,
        record.endpoint, record.tokens_remaining, record.last_refill,
        record.requests_count, record.window_start, record.created_at, record.updated_at
      ]);

      return record;

    } catch (error) {
      logger.error(`[RateLimiter] Error getting/creating record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refill tokens using token bucket algorithm
   */
  refillTokens(record, limits) {
    const now = Date.now();
    const lastRefill = new Date(record.last_refill).getTime();
    const timePassed = (now - lastRefill) / 1000; // seconds

    // Calculate how many tokens to add
    const refillRate = limits.limit / limits.window;
    const tokensToAdd = Math.floor(timePassed * refillRate);

    if (tokensToAdd > 0) {
      // Refill tokens (cap at limit)
      record.tokens_remaining = Math.min(
        record.tokens_remaining + tokensToAdd,
        limits.limit
      );
      record.last_refill = new Date(now).toISOString();
    }

    return record;
  }

  /**
   * Update rate limit record
   */
  async updateRecord(record) {
    try {
      const query = `
        UPDATE rate_limits 
        SET tokens_remaining = ?,
            last_refill = ?,
            requests_count = ?,
            updated_at = ?
        WHERE id = ?
      `;

      await this.db.run(query, [
        record.tokens_remaining,
        record.last_refill,
        record.requests_count,
        new Date().toISOString(),
        record.id
      ]);

    } catch (error) {
      logger.error(`[RateLimiter] Error updating record: ${error.message}`);
    }
  }

  /**
   * Calculate reset timestamp
   */
  calculateReset(lastRefill, window) {
    const lastRefillTime = new Date(lastRefill).getTime();
    return lastRefillTime + (window * 1000);
  }

  /**
   * Reset limits for identifier
   */
  async resetLimit(tenantId, identifier, identifierType, endpoint = null) {
    try {
      const query = endpoint
        ? 'DELETE FROM rate_limits WHERE tenant_id = ? AND identifier = ? AND identifier_type = ? AND endpoint = ?'
        : 'DELETE FROM rate_limits WHERE tenant_id = ? AND identifier = ? AND identifier_type = ?';

      const params = endpoint
        ? [tenantId, identifier, identifierType, endpoint]
        : [tenantId, identifier, identifierType];

      await this.db.run(query, params);

      logger.info(`[RateLimiter] Reset limit for ${identifierType}:${identifier}`);

      return { success: true };

    } catch (error) {
      logger.error(`[RateLimiter] Error resetting limit: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStats(tenantId, identifierType = null) {
    try {
      let query, params;

      if (identifierType) {
        query = `
          SELECT 
            identifier_type,
            COUNT(*) as total_records,
            SUM(requests_count) as total_requests,
            AVG(tokens_remaining) as avg_tokens_remaining
          FROM rate_limits
          WHERE tenant_id = ? AND identifier_type = ?
          GROUP BY identifier_type
        `;
        params = [tenantId, identifierType];
      } else {
        query = `
          SELECT 
            identifier_type,
            COUNT(*) as total_records,
            SUM(requests_count) as total_requests,
            AVG(tokens_remaining) as avg_tokens_remaining
          FROM rate_limits
          WHERE tenant_id = ?
          GROUP BY identifier_type
        `;
        params = [tenantId];
      }

      const stats = await this.db.all(query, params);

      return stats;

    } catch (error) {
      logger.error(`[RateLimiter] Error getting stats: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up old rate limit records
   */
  async cleanup(tenantId, olderThanHours = 24) {
    try {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - olderThanHours);

      const query = 'DELETE FROM rate_limits WHERE tenant_id = ? AND updated_at < ?';
      
      const result = await this.db.run(query, [tenantId, cutoff.toISOString()]);

      logger.info(`[RateLimiter] Cleaned up old records for tenant ${tenantId}`);

      return { deleted: result.changes || 0 };

    } catch (error) {
      logger.error(`[RateLimiter] Error during cleanup: ${error.message}`);
      return { deleted: 0 };
    }
  }
}

module.exports = RateLimiter;
