/**
 * DDoS Protector
 * Detects and mitigates DDoS attacks
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class DDoSProtector {
  constructor(db, blockingManager, ipTracker) {
    this.db = db;
    this.blockingManager = blockingManager;
    this.ipTracker = ipTracker;
  }

  async init() {
    logger.info('[DDoSProtector] Initializing...');
    logger.info('[DDoSProtector] ✅ Initialized');
  }

  /**
   * Check if system is under DDoS attack
   */
  async checkForDDoS(tenantId) {
    try {
      const config = await this.getConfig(tenantId);
      
      // Get top IPs
      const topIPs = this.ipTracker.getTopIPs(20, config.ddos_window);
      
      // Calculate total request rate
      const totalRate = topIPs.reduce((sum, ip) => sum + ip.rate, 0);
      
      // Check if threshold exceeded
      const threshold = config.ddos_threshold / config.ddos_window;
      
      if (totalRate > threshold) {
        logger.warn(`[DDoSProtector] Possible DDoS detected - Rate: ${totalRate.toFixed(2)}/s, Threshold: ${threshold.toFixed(2)}/s`);
        
        // Analyze attack pattern
        const analysis = this.analyzeAttack(topIPs, config);
        
        if (analysis.confidence > 0.7) {
          // High confidence DDoS attack
          await this.mitigateDDoS(tenantId, analysis, config);
          
          return {
            underAttack: true,
            confidence: analysis.confidence,
            attackType: analysis.type,
            mitigated: true,
            blockedIPs: analysis.suspiciousIPs.length
          };
        }

        return {
          underAttack: true,
          confidence: analysis.confidence,
          attackType: analysis.type,
          mitigated: false
        };
      }

      return {
        underAttack: false,
        rate: totalRate,
        threshold: threshold
      };

    } catch (error) {
      logger.error(`[DDoSProtector] Error checking for DDoS: ${error.message}`);
      return { underAttack: false, error: error.message };
    }
  }

  /**
   * Analyze attack pattern
   */
  analyzeAttack(topIPs, config) {
    const analysis = {
      type: 'unknown',
      confidence: 0,
      suspiciousIPs: [],
      characteristics: {}
    };

    // Check for distributed attack (many IPs with moderate traffic)
    const moderateTrafficIPs = topIPs.filter(ip => 
      ip.rate > (config.per_ip_limit / config.per_ip_window) * 0.8
    );

    if (moderateTrafficIPs.length > 10) {
      analysis.type = 'distributed';
      analysis.confidence = Math.min(moderateTrafficIPs.length / 20, 1.0);
      analysis.suspiciousIPs = moderateTrafficIPs.map(ip => ip.ip);
      analysis.characteristics.distributedSources = moderateTrafficIPs.length;
    }

    // Check for concentrated attack (few IPs with very high traffic)
    const highTrafficIPs = topIPs.filter(ip => 
      ip.rate > (config.per_ip_limit / config.per_ip_window) * 2
    );

    if (highTrafficIPs.length > 0 && highTrafficIPs.length < 5) {
      analysis.type = 'concentrated';
      analysis.confidence = Math.min(highTrafficIPs[0].rate / 100, 1.0);
      analysis.suspiciousIPs = highTrafficIPs.map(ip => ip.ip);
      analysis.characteristics.highRateSources = highTrafficIPs.length;
    }

    // Check for bot pattern (check IP tracker for suspicious behavior)
    const botLikeIPs = topIPs.filter(ip => {
      const suspicious = this.ipTracker.isSuspicious(ip.ip);
      return suspicious.suspicious;
    });

    if (botLikeIPs.length > 5) {
      analysis.type = 'botnet';
      analysis.confidence = Math.min(botLikeIPs.length / 10, 1.0);
      analysis.suspiciousIPs = botLikeIPs.map(ip => ip.ip);
      analysis.characteristics.botLikeSources = botLikeIPs.length;
    }

    return analysis;
  }

  /**
   * Mitigate DDoS attack
   */
  async mitigateDDoS(tenantId, analysis, config) {
    try {
      logger.info(`[DDoSProtector] Mitigating ${analysis.type} DDoS attack`);

      // Block suspicious IPs
      const blockPromises = analysis.suspiciousIPs.map(ip =>
        this.blockingManager.blockIP(
          tenantId,
          ip,
          'ddos',
          `Auto-blocked during ${analysis.type} DDoS attack (confidence: ${(analysis.confidence * 100).toFixed(1)}%)`,
          config.block_duration
        )
      );

      await Promise.all(blockPromises);

      // Log the mitigation
      await this.logMitigation(tenantId, analysis);

      logger.info(`[DDoSProtector] Blocked ${analysis.suspiciousIPs.length} IPs`);

      return {
        success: true,
        blockedCount: analysis.suspiciousIPs.length
      };

    } catch (error) {
      logger.error(`[DDoSProtector] Error mitigating DDoS: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log DDoS mitigation
   */
  async logMitigation(tenantId, analysis) {
    try {
      const query = `
        INSERT INTO rate_limit_violations
        (id, tenant_id, identifier, identifier_type, ip_address, endpoint, method,
         limit_type, current_rate, limit_rate, timestamp, action_taken, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const ip of analysis.suspiciousIPs) {
        await this.db.run(query, [
          crypto.randomBytes(16).toString('hex'),
          tenantId,
          'system',
          'global',
          ip,
          '*',
          '*',
          'ddos',
          0,
          0,
          new Date().toISOString(),
          `auto_blocked_${analysis.type}`,
          new Date().toISOString()
        ]);
      }

    } catch (error) {
      logger.error(`[DDoSProtector] Error logging mitigation: ${error.message}`);
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
        ddos_threshold: 1000,
        ddos_window: 60,
        per_ip_limit: 100,
        per_ip_window: 60,
        block_duration: 3600,
        auto_block_enabled: 1
      };
    } catch (error) {
      logger.error(`[DDoSProtector] Error getting config: ${error.message}`);
      return {
        ddos_threshold: 1000,
        ddos_window: 60,
        per_ip_limit: 100,
        per_ip_window: 60,
        block_duration: 3600,
        auto_block_enabled: 1
      };
    }
  }

  /**
   * Get DDoS statistics
   */
  async getStats(tenantId, hours = 24) {
    try {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - hours);

      const query = `
        SELECT 
          COUNT(*) as total_ddos_blocks,
          COUNT(DISTINCT ip_address) as unique_ips,
          action_taken
        FROM rate_limit_violations
        WHERE tenant_id = ? 
        AND limit_type = 'ddos'
        AND timestamp > ?
        GROUP BY action_taken
      `;

      const stats = await this.db.all(query, [tenantId, cutoff.toISOString()]);

      return stats;

    } catch (error) {
      logger.error(`[DDoSProtector] Error getting stats: ${error.message}`);
      return [];
    }
  }
}

module.exports = DDoSProtector;
