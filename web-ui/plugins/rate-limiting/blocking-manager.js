/**
 * Blocking Manager
 * Manages IP blocking and whitelisting
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class BlockingManager {
  constructor(db) {
    this.db = db;
    this.blockedCache = new Map(); // Cache for quick lookups
    this.whitelistCache = new Map();
  }

  async init() {
    logger.info('[BlockingManager] Initializing...');
    
    // Load blocked IPs into cache
    await this.loadBlockedIPs();
    
    // Load whitelist into cache
    await this.loadWhitelist();
    
    logger.info(`[BlockingManager] Loaded ${this.blockedCache.size} blocked IPs`);
    logger.info(`[BlockingManager] Loaded ${this.whitelistCache.size} whitelisted IPs`);
    logger.info('[BlockingManager] ✅ Initialized');
  }

  /**
   * Load blocked IPs from database
   */
  async loadBlockedIPs() {
    try {
      const now = new Date().toISOString();
      const query = 'SELECT * FROM blocked_ips WHERE expires_at IS NULL OR expires_at > ?';
      const blocked = await this.db.all(query, [now]);

      this.blockedCache.clear();
      blocked.forEach(record => {
        const key = `${record.tenant_id}:${record.ip_address}`;
        this.blockedCache.set(key, record);
      });

    } catch (error) {
      logger.error(`[BlockingManager] Error loading blocked IPs: ${error.message}`);
    }
  }

  /**
   * Load whitelist from database
   */
  async loadWhitelist() {
    try {
      const now = new Date().toISOString();
      const query = 'SELECT * FROM ip_whitelist WHERE expires_at IS NULL OR expires_at > ?';
      const whitelist = await this.db.all(query, [now]);

      this.whitelistCache.clear();
      whitelist.forEach(record => {
        const key = `${record.tenant_id}:${record.ip_address}`;
        this.whitelistCache.set(key, record);
      });

    } catch (error) {
      logger.error(`[BlockingManager] Error loading whitelist: ${error.message}`);
    }
  }

  /**
   * Check if IP is blocked
   */
  isBlocked(tenantId, ip) {
    const key = `${tenantId}:${ip}`;
    const record = this.blockedCache.get(key);

    if (!record) {
      return { blocked: false };
    }

    // Check if block expired
    if (record.expires_at) {
      const expiresAt = new Date(record.expires_at).getTime();
      if (Date.now() > expiresAt) {
        // Block expired, remove from cache
        this.blockedCache.delete(key);
        return { blocked: false };
      }
    }

    return {
      blocked: true,
      reason: record.reason,
      blockType: record.block_type,
      expiresAt: record.expires_at,
      blockedAt: record.blocked_at
    };
  }

  /**
   * Check if IP is whitelisted
   */
  isWhitelisted(tenantId, ip) {
    const key = `${tenantId}:${ip}`;
    const record = this.whitelistCache.get(key);

    if (!record) {
      return false;
    }

    // Check if whitelist expired
    if (record.expires_at) {
      const expiresAt = new Date(record.expires_at).getTime();
      if (Date.now() > expiresAt) {
        // Whitelist expired, remove from cache
        this.whitelistCache.delete(key);
        return false;
      }
    }

    return true;
  }

  /**
   * Block an IP address
   */
  async blockIP(tenantId, ip, blockType = 'manual', reason = '', durationSeconds = null, blockedBy = 'system') {
    try {
      // Don't block if whitelisted
      if (this.isWhitelisted(tenantId, ip)) {
        logger.warn(`[BlockingManager] Cannot block whitelisted IP: ${ip}`);
        return { success: false, reason: 'whitelisted' };
      }

      const now = new Date();
      const expiresAt = durationSeconds 
        ? new Date(now.getTime() + (durationSeconds * 1000)).toISOString()
        : null;

      const record = {
        id: crypto.randomBytes(16).toString('hex'),
        tenant_id: tenantId,
        ip_address: ip,
        reason: reason || `Blocked (${blockType})`,
        block_type: blockType,
        blocked_at: now.toISOString(),
        expires_at: expiresAt,
        blocked_by: blockedBy,
        auto_blocked: blockedBy === 'system' ? 1 : 0,
        violation_count: 1,
        metadata: null,
        created_at: now.toISOString()
      };

      // Check if already blocked
      const existing = this.isBlocked(tenantId, ip);
      if (existing.blocked) {
        // Update violation count
        await this.incrementViolationCount(tenantId, ip);
        return { success: true, existing: true };
      }

      const query = `
        INSERT INTO blocked_ips 
        (id, tenant_id, ip_address, reason, block_type, blocked_at, expires_at,
         blocked_by, auto_blocked, violation_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        record.id, record.tenant_id, record.ip_address, record.reason,
        record.block_type, record.blocked_at, record.expires_at, record.blocked_by,
        record.auto_blocked, record.violation_count, record.created_at
      ]);

      // Add to cache
      const key = `${tenantId}:${ip}`;
      this.blockedCache.set(key, record);

      logger.info(`[BlockingManager] Blocked IP: ${ip} (${blockType})`);

      return {
        success: true,
        blockId: record.id,
        expiresAt: expiresAt
      };

    } catch (error) {
      logger.error(`[BlockingManager] Error blocking IP: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unblock an IP address
   */
  async unblockIP(tenantId, ip) {
    try {
      const query = 'DELETE FROM blocked_ips WHERE tenant_id = ? AND ip_address = ?';
      await this.db.run(query, [tenantId, ip]);

      // Remove from cache
      const key = `${tenantId}:${ip}`;
      this.blockedCache.delete(key);

      logger.info(`[BlockingManager] Unblocked IP: ${ip}`);

      return { success: true };

    } catch (error) {
      logger.error(`[BlockingManager] Error unblocking IP: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Increment violation count for blocked IP
   */
  async incrementViolationCount(tenantId, ip) {
    try {
      const query = `
        UPDATE blocked_ips 
        SET violation_count = violation_count + 1 
        WHERE tenant_id = ? AND ip_address = ?
      `;
      
      await this.db.run(query, [tenantId, ip]);

      // Update cache
      const key = `${tenantId}:${ip}`;
      const cached = this.blockedCache.get(key);
      if (cached) {
        cached.violation_count += 1;
        this.blockedCache.set(key, cached);
      }

    } catch (error) {
      logger.error(`[BlockingManager] Error incrementing violation count: ${error.message}`);
    }
  }

  /**
   * Add IP to whitelist
   */
  async addToWhitelist(tenantId, ip, description = '', addedBy = 'admin', durationSeconds = null) {
    try {
      const now = new Date();
      const expiresAt = durationSeconds 
        ? new Date(now.getTime() + (durationSeconds * 1000)).toISOString()
        : null;

      const record = {
        id: crypto.randomBytes(16).toString('hex'),
        tenant_id: tenantId,
        ip_address: ip,
        description: description,
        added_by: addedBy,
        added_at: now.toISOString(),
        expires_at: expiresAt,
        created_at: now.toISOString()
      };

      const query = `
        INSERT INTO ip_whitelist 
        (id, tenant_id, ip_address, description, added_by, added_at, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        record.id, record.tenant_id, record.ip_address, record.description,
        record.added_by, record.added_at, record.expires_at, record.created_at
      ]);

      // Add to cache
      const key = `${tenantId}:${ip}`;
      this.whitelistCache.set(key, record);

      // If IP was blocked, unblock it
      if (this.isBlocked(tenantId, ip).blocked) {
        await this.unblockIP(tenantId, ip);
      }

      logger.info(`[BlockingManager] Added IP to whitelist: ${ip}`);

      return { success: true, whitelistId: record.id };

    } catch (error) {
      logger.error(`[BlockingManager] Error adding to whitelist: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove IP from whitelist
   */
  async removeFromWhitelist(tenantId, ip) {
    try {
      const query = 'DELETE FROM ip_whitelist WHERE tenant_id = ? AND ip_address = ?';
      await this.db.run(query, [tenantId, ip]);

      // Remove from cache
      const key = `${tenantId}:${ip}`;
      this.whitelistCache.delete(key);

      logger.info(`[BlockingManager] Removed IP from whitelist: ${ip}`);

      return { success: true };

    } catch (error) {
      logger.error(`[BlockingManager] Error removing from whitelist: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get list of blocked IPs
   */
  async getBlockedIPs(tenantId, limit = 100) {
    try {
      const query = `
        SELECT * FROM blocked_ips 
        WHERE tenant_id = ? 
        AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY blocked_at DESC 
        LIMIT ?
      `;

      const blocked = await this.db.all(query, [tenantId, new Date().toISOString(), limit]);
      
      return blocked;

    } catch (error) {
      logger.error(`[BlockingManager] Error getting blocked IPs: ${error.message}`);
      return [];
    }
  }

  /**
   * Get whitelist
   */
  async getWhitelist(tenantId, limit = 100) {
    try {
      const query = `
        SELECT * FROM ip_whitelist 
        WHERE tenant_id = ? 
        AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY added_at DESC 
        LIMIT ?
      `;

      const whitelist = await this.db.all(query, [tenantId, new Date().toISOString(), limit]);
      
      return whitelist;

    } catch (error) {
      logger.error(`[BlockingManager] Error getting whitelist: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up expired blocks and whitelist entries
   */
  async cleanup(tenantId = null) {
    try {
      const now = new Date().toISOString();

      // Clean expired blocks
      const blockQuery = tenantId
        ? 'DELETE FROM blocked_ips WHERE tenant_id = ? AND expires_at IS NOT NULL AND expires_at < ?'
        : 'DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at < ?';
      
      const blockParams = tenantId ? [tenantId, now] : [now];
      const blockResult = await this.db.run(blockQuery, blockParams);

      // Clean expired whitelist entries
      const whitelistQuery = tenantId
        ? 'DELETE FROM ip_whitelist WHERE tenant_id = ? AND expires_at IS NOT NULL AND expires_at < ?'
        : 'DELETE FROM ip_whitelist WHERE expires_at IS NOT NULL AND expires_at < ?';
      
      const whitelistParams = tenantId ? [tenantId, now] : [now];
      const whitelistResult = await this.db.run(whitelistQuery, whitelistParams);

      // Reload caches
      await this.loadBlockedIPs();
      await this.loadWhitelist();

      logger.info(`[BlockingManager] Cleanup complete - Blocks: ${blockResult.changes || 0}, Whitelist: ${whitelistResult.changes || 0}`);

      return {
        blocksRemoved: blockResult.changes || 0,
        whitelistRemoved: whitelistResult.changes || 0
      };

    } catch (error) {
      logger.error(`[BlockingManager] Error during cleanup: ${error.message}`);
      return { blocksRemoved: 0, whitelistRemoved: 0 };
    }
  }
}

module.exports = BlockingManager;
