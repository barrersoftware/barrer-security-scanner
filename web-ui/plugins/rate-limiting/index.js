/**
 * Rate Limiting Plugin - Main Entry Point
 * Provides API rate limiting, DDoS protection, and brute force prevention
 */

const path = require('path');
const { logger } = require('../../shared/logger');

// Services
const RateLimiter = require('./rate-limiter');
const IPTracker = require('./ip-tracker');
const BlockingManager = require('./blocking-manager');
const BruteForceDetector = require('./brute-force-detector');
const DDoSProtector = require('./ddos-protector');

// Plugin metadata
const pluginInfo = require('./plugin.json');

class RateLimitingPlugin {
  constructor() {
    this.name = pluginInfo.name;
    this.version = pluginInfo.version;
    this.services = {};
    this.db = null;
  }

  /**
   * Initialize the plugin
   */
  async init(db, app, io) {
    try {
      logger.info('[RateLimitingPlugin] Initializing...');
      
      this.db = db;
      this.app = app;
      this.io = io;

      // Initialize database schema
      await this.initDatabase();

      // Initialize services
      await this.initServices();

      // Register API routes
      this.registerRoutes();

      // Apply rate limiting middleware
      this.applyMiddleware();

      // Start cleanup interval
      this.startCleanupInterval();

      logger.info('[RateLimitingPlugin] ✅ Initialized');
      return true;

    } catch (error) {
      logger.error(`[RateLimitingPlugin] Initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initDatabase() {
    try {
      logger.info('[RateLimitingPlugin] Creating database schema...');

      for (const table of pluginInfo.database.tables) {
        // Create table
        const columns = table.columns.join(', ');
        await this.db.run(`CREATE TABLE IF NOT EXISTS ${table.name} (${columns})`);

        // Create indices
        if (table.indices) {
          for (const index of table.indices) {
            await this.db.run(index);
          }
        }
      }

      logger.info('[RateLimitingPlugin] Database schema created');

    } catch (error) {
      logger.error(`[RateLimitingPlugin] Database init error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize services
   */
  async initServices() {
    try {
      logger.info('[RateLimitingPlugin] Initializing services...');

      // Initialize in correct order (dependencies)
      this.services.rateLimiter = new RateLimiter(this.db);
      await this.services.rateLimiter.init();

      this.services.ipTracker = new IPTracker(this.db);
      await this.services.ipTracker.init();

      this.services.blockingManager = new BlockingManager(this.db);
      await this.services.blockingManager.init();

      this.services.bruteForceDetector = new BruteForceDetector(this.db, this.services.blockingManager);
      await this.services.bruteForceDetector.init();

      this.services.ddosProtector = new DDoSProtector(this.db, this.services.blockingManager, this.services.ipTracker);
      await this.services.ddosProtector.init();

      logger.info('[RateLimitingPlugin] All services initialized');

    } catch (error) {
      logger.error(`[RateLimitingPlugin] Service init error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    const router = this.app;

    // Get status
    router.get('/api/rate-limiting/status', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const config = await this.services.rateLimiter.getConfig(tenantId);
        
        res.json({
          enabled: config.enabled === 1,
          limits: {
            global: `${config.global_limit}/${config.global_window}s`,
            perIP: `${config.per_ip_limit}/${config.per_ip_window}s`,
            perUser: `${config.per_user_limit}/${config.per_user_window}s`
          },
          protection: {
            ddos: config.ddos_threshold > 0,
            bruteForce: config.brute_force_attempts > 0,
            autoBlock: config.auto_block_enabled === 1
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get configuration
    router.get('/api/rate-limiting/config', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const config = await this.services.rateLimiter.getConfig(tenantId);
        res.json(config);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update configuration
    router.put('/api/rate-limiting/config', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const newConfig = req.body;
        
        const query = `
          UPDATE rate_limit_config 
          SET enabled = ?, global_limit = ?, global_window = ?,
              per_ip_limit = ?, per_ip_window = ?,
              per_user_limit = ?, per_user_window = ?,
              burst_allowance = ?, ddos_threshold = ?, ddos_window = ?,
              brute_force_attempts = ?, brute_force_window = ?,
              block_duration = ?, auto_block_enabled = ?,
              updated_at = ?
          WHERE tenant_id = ?
        `;

        await this.db.run(query, [
          newConfig.enabled !== undefined ? newConfig.enabled : 1,
          newConfig.global_limit || 1000,
          newConfig.global_window || 3600,
          newConfig.per_ip_limit || 100,
          newConfig.per_ip_window || 60,
          newConfig.per_user_limit || 1000,
          newConfig.per_user_window || 3600,
          newConfig.burst_allowance || 50,
          newConfig.ddos_threshold || 1000,
          newConfig.ddos_window || 60,
          newConfig.brute_force_attempts || 5,
          newConfig.brute_force_window || 300,
          newConfig.block_duration || 3600,
          newConfig.auto_block_enabled !== undefined ? newConfig.auto_block_enabled : 1,
          new Date().toISOString(),
          tenantId
        ]);

        res.json({ success: true, message: 'Configuration updated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get violations
    router.get('/api/rate-limiting/violations', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const limit = parseInt(req.query.limit) || 100;

        const query = `
          SELECT * FROM rate_limit_violations 
          WHERE tenant_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `;

        const violations = await this.db.all(query, [tenantId, limit]);
        res.json(violations);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get blocked IPs
    router.get('/api/rate-limiting/blocked-ips', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const limit = parseInt(req.query.limit) || 100;
        const blocked = await this.services.blockingManager.getBlockedIPs(tenantId, limit);
        res.json(blocked);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Block IP
    router.post('/api/rate-limiting/block-ip', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { ip, reason, duration } = req.body;
        
        const result = await this.services.blockingManager.blockIP(
          tenantId,
          ip,
          'manual',
          reason || 'Manually blocked',
          duration || 3600,
          req.user?.username || 'admin'
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Unblock IP
    router.post('/api/rate-limiting/unblock-ip', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { ip } = req.body;
        
        const result = await this.services.blockingManager.unblockIP(tenantId, ip);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get whitelist
    router.get('/api/rate-limiting/whitelist', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const limit = parseInt(req.query.limit) || 100;
        const whitelist = await this.services.blockingManager.getWhitelist(tenantId, limit);
        res.json(whitelist);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Add to whitelist
    router.post('/api/rate-limiting/whitelist', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { ip, description, duration } = req.body;
        
        const result = await this.services.blockingManager.addToWhitelist(
          tenantId,
          ip,
          description || '',
          req.user?.username || 'admin',
          duration || null
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Remove from whitelist
    router.delete('/api/rate-limiting/whitelist/:ip', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { ip } = req.params;
        
        const result = await this.services.blockingManager.removeFromWhitelist(tenantId, ip);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get statistics
    router.get('/api/rate-limiting/stats', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        
        const stats = {
          rateLimits: await this.services.rateLimiter.getStats(tenantId),
          topIPs: this.services.ipTracker.getTopIPs(10, 3600),
          ddos: await this.services.ddosProtector.getStats(tenantId, 24),
          bruteForce: this.services.bruteForceDetector.getAttemptStats(tenantId)
        };

        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Reset limits
    router.post('/api/rate-limiting/reset', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { identifier, identifierType, endpoint } = req.body;
        
        const result = await this.services.rateLimiter.resetLimit(
          tenantId,
          identifier,
          identifierType,
          endpoint
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    logger.info('[RateLimitingPlugin] API routes registered');
  }

  /**
   * Apply rate limiting middleware
   */
  applyMiddleware() {
    // Rate limiting middleware
    this.app.use(async (req, res, next) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const ip = req.ip || req.connection.remoteAddress;
        const endpoint = req.path;
        const method = req.method;

        // Check if IP is whitelisted
        if (this.services.blockingManager.isWhitelisted(tenantId, ip)) {
          return next();
        }

        // Check if IP is blocked
        const blockStatus = this.services.blockingManager.isBlocked(tenantId, ip);
        if (blockStatus.blocked) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Your IP address has been blocked',
            reason: blockStatus.reason,
            unblockAt: blockStatus.expiresAt
          });
        }

        // Track request
        this.services.ipTracker.trackRequest(ip, endpoint, method, req.headers['user-agent']);

        // Check rate limits (per IP and per user)
        const ipLimit = await this.services.rateLimiter.checkLimit(
          tenantId,
          ip,
          'ip',
          { endpoint }
        );

        if (!ipLimit.allowed) {
          // Set rate limit headers
          res.set('X-RateLimit-Limit', ipLimit.limit);
          res.set('X-RateLimit-Remaining', 0);
          res.set('X-RateLimit-Reset', new Date(ipLimit.reset).toISOString());
          res.set('Retry-After', ipLimit.retryAfter);

          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: ipLimit.retryAfter
          });
        }

        // Set rate limit headers
        res.set('X-RateLimit-Limit', ipLimit.limit);
        res.set('X-RateLimit-Remaining', ipLimit.remaining);
        res.set('X-RateLimit-Reset', new Date(ipLimit.reset).toISOString());

        // Check for DDoS
        const ddosCheck = await this.services.ddosProtector.checkForDDoS(tenantId);
        if (ddosCheck.underAttack && ddosCheck.mitigated) {
          logger.warn(`[RateLimitingPlugin] DDoS attack mitigated: ${ddosCheck.blockedIPs} IPs blocked`);
        }

        next();

      } catch (error) {
        logger.error(`[RateLimitingPlugin] Middleware error: ${error.message}`);
        // Fail open - allow request on error
        next();
      }
    });

    logger.info('[RateLimitingPlugin] Middleware applied');
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    // Clean up old data every hour
    setInterval(async () => {
      try {
        logger.info('[RateLimitingPlugin] Running cleanup...');
        
        this.services.ipTracker.cleanup();
        this.services.bruteForceDetector.cleanup();
        await this.services.blockingManager.cleanup();
        
        logger.info('[RateLimitingPlugin] Cleanup complete');
      } catch (error) {
        logger.error(`[RateLimitingPlugin] Cleanup error: ${error.message}`);
      }
    }, 3600000); // Every hour

    logger.info('[RateLimitingPlugin] Cleanup interval started');
  }

  /**
   * Cleanup on plugin unload
   */
  async cleanup() {
    logger.info('[RateLimitingPlugin] Cleaning up...');
    // Cleanup resources if needed
    logger.info('[RateLimitingPlugin] Cleanup complete');
  }
}

module.exports = RateLimitingPlugin;
