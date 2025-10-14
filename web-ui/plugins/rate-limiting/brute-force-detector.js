/**
 * Brute Force Detector
 * Detects and prevents brute force attacks
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class BruteForceDetector {
  constructor(db, blockingManager) {
    this.db = db;
    this.blockingManager = blockingManager;
    this.loginAttempts = new Map(); // In-memory tracking
  }

  async init() {
    logger.info('[BruteForceDetector] Initializing...');
    logger.info('[BruteForceDetector] ✅ Initialized');
  }

  /**
   * Track login attempt
   */
  async trackAttempt(tenantId, identifier, ip, success, endpoint = '/login') {
    try {
      const key = `${tenantId}:${identifier}:${ip}`;
      const now = Date.now();

      if (!this.loginAttempts.has(key)) {
        this.loginAttempts.set(key, []);
      }

      const attempts = this.loginAttempts.get(key);
      attempts.push({
        timestamp: now,
        success,
        endpoint
      });

      // Keep only recent attempts
      const config = await this.getConfig(tenantId);
      const windowStart = now - (config.brute_force_window * 1000);
      
      const recentAttempts = attempts.filter(a => a.timestamp > windowStart);
      this.loginAttempts.set(key, recentAttempts);

      // Check if threshold exceeded
      const failedAttempts = recentAttempts.filter(a => !a.success).length;
      
      if (failedAttempts >= config.brute_force_attempts) {
        logger.warn(`[BruteForceDetector] Brute force detected: ${identifier} from ${ip}`);
        
        // Auto-block if enabled
        if (config.auto_block_enabled) {
          await this.blockingManager.blockIP(
            tenantId,
            ip,
            'brute_force',
            `${failedAttempts} failed login attempts`,
            config.block_duration
          );
          
          logger.info(`[BruteForceDetector] Auto-blocked IP: ${ip}`);
        }

        // Log violation
        await this.logViolation(tenantId, identifier, ip, failedAttempts, config.brute_force_attempts, endpoint);

        return {
          blocked: config.auto_block_enabled,
          attempts: failedAttempts,
          threshold: config.brute_force_attempts
        };
      }

      return {
        blocked: false,
        attempts: failedAttempts,
        threshold: config.brute_force_attempts
      };

    } catch (error) {
      logger.error(`[BruteForceDetector] Error tracking attempt: ${error.message}`);
      return { blocked: false, attempts: 0 };
    }
  }

  /**
   * Check if identifier/IP is under attack
   */
  isUnderAttack(tenantId, identifier, ip) {
    const key = `${tenantId}:${identifier}:${ip}`;
    const attempts = this.loginAttempts.get(key) || [];
    
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);
    
    const recentAttempts = attempts.filter(a => a.timestamp > oneMinuteAgo);
    const failedAttempts = recentAttempts.filter(a => !a.success);

    return {
      underAttack: failedAttempts.length >= 3, // 3 failures in 1 minute
      failedAttempts: failedAttempts.length,
      totalAttempts: recentAttempts.length
    };
  }

  /**
   * Get attempt statistics
   */
  getAttemptStats(tenantId, identifier = null, ip = null) {
    const stats = {
      totalAttempts: 0,
      failedAttempts: 0,
      successfulAttempts: 0,
      uniqueIPs: new Set(),
      uniqueIdentifiers: new Set()
    };

    for (const [key, attempts] of this.loginAttempts.entries()) {
      const [keyTenant, keyIdentifier, keyIP] = key.split(':');
      
      if (keyTenant !== tenantId) continue;
      if (identifier && keyIdentifier !== identifier) continue;
      if (ip && keyIP !== ip) continue;

      stats.uniqueIPs.add(keyIP);
      stats.uniqueIdentifiers.add(keyIdentifier);

      attempts.forEach(a => {
        stats.totalAttempts++;
        if (a.success) {
          stats.successfulAttempts++;
        } else {
          stats.failedAttempts++;
        }
      });
    }

    return {
      ...stats,
      uniqueIPs: stats.uniqueIPs.size,
      uniqueIdentifiers: stats.uniqueIdentifiers.size
    };
  }

  /**
   * Log violation to database
   */
  async logViolation(tenantId, identifier, ip, currentRate, limitRate, endpoint) {
    try {
      const query = `
        INSERT INTO rate_limit_violations
        (id, tenant_id, identifier, identifier_type, ip_address, endpoint, method,
         limit_type, current_rate, limit_rate, timestamp, action_taken, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        crypto.randomBytes(16).toString('hex'),
        tenantId,
        identifier,
        'user',
        ip,
        endpoint,
        'POST',
        'brute_force',
        currentRate,
        limitRate,
        new Date().toISOString(),
        'auto_blocked',
        new Date().toISOString()
      ]);

    } catch (error) {
      logger.error(`[BruteForceDetector] Error logging violation: ${error.message}`);
    }
  }

  /**
   * Get configuration
   */
  async getConfig(tenantId) {
    try {
      const query = 'SELECT * FROM rate_limit_config WHERE tenant_id = ?';
      const config = await this.db.get(query, [tenantId]);
      
      return config || {
        brute_force_attempts: 5,
        brute_force_window: 300,
        block_duration: 3600,
        auto_block_enabled: 1
      };
    } catch (error) {
      logger.error(`[BruteForceDetector] Error getting config: ${error.message}`);
      return {
        brute_force_attempts: 5,
        brute_force_window: 300,
        block_duration: 3600,
        auto_block_enabled: 1
      };
    }
  }

  /**
   * Clear attempts for identifier/IP
   */
  clearAttempts(tenantId, identifier = null, ip = null) {
    let clearedCount = 0;

    for (const key of this.loginAttempts.keys()) {
      const [keyTenant, keyIdentifier, keyIP] = key.split(':');
      
      if (keyTenant !== tenantId) continue;
      if (identifier && keyIdentifier !== identifier) continue;
      if (ip && keyIP !== ip) continue;

      this.loginAttempts.delete(key);
      clearedCount++;
    }

    logger.info(`[BruteForceDetector] Cleared ${clearedCount} attempt records`);
    
    return { cleared: clearedCount };
  }

  /**
   * Cleanup old attempts
   */
  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - (3600 * 1000);
    let cleanedCount = 0;

    for (const [key, attempts] of this.loginAttempts.entries()) {
      const filtered = attempts.filter(a => a.timestamp > oneHourAgo);
      
      if (filtered.length === 0) {
        this.loginAttempts.delete(key);
        cleanedCount++;
      } else if (filtered.length !== attempts.length) {
        this.loginAttempts.set(key, filtered);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`[BruteForceDetector] Cleaned up ${cleanedCount} old records`);
    }

    return { cleaned: cleanedCount };
  }
}

module.exports = BruteForceDetector;
