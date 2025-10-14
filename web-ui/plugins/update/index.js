/**
 * Update Plugin - Main Entry Point
 * Provides system update management with multi-platform support
 */

const path = require('path');
const logger = require('../../../utils/logger');

// Services
const PlatformDetector = require('./platform-detector');
const VerificationService = require('./verification-service');
const PackageManagerService = require('./package-manager-service');
const WindowsUpdateService = require('./windows-update-service');
const RollbackManager = require('./rollback-manager');
const UpdateNotifier = require('./update-notifier');
const UpdateManager = require('./update-manager');

// Plugin metadata
const pluginInfo = require('./plugin.json');

class UpdatePlugin {
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
      logger.info('[UpdatePlugin] Initializing...');
      
      this.db = db;
      this.app = app;
      this.io = io;

      // Initialize database schema
      await this.initDatabase();

      // Initialize services
      await this.initServices();

      // Register API routes
      this.registerRoutes();

      logger.info('[UpdatePlugin] ✅ Initialized');
      
      return this.services;
      
    } catch (error) {
      logger.error('[UpdatePlugin] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initDatabase() {
    logger.info('[UpdatePlugin] Initializing database schema...');

    try {
      // Create tables
      for (const table of pluginInfo.database.tables) {
        const columns = table.columns.join(', ');
        await this.db.run(`CREATE TABLE IF NOT EXISTS ${table.name} (${columns})`);
        
        // Create indices
        if (table.indices) {
          for (const index of table.indices) {
            await this.db.run(index);
          }
        }
      }

      logger.info('[UpdatePlugin] Database schema created');
    } catch (error) {
      logger.error('[UpdatePlugin] Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all services
   */
  async initServices() {
    logger.info('[UpdatePlugin] Initializing services...');

    try {
      // Initialize services in order
      this.services.platformDetector = new PlatformDetector();
      await this.services.platformDetector.init();

      this.services.verificationService = new VerificationService();
      await this.services.verificationService.init();

      this.services.packageManagerService = new PackageManagerService(
        this.services.platformDetector
      );
      await this.services.packageManagerService.init();

      this.services.windowsUpdateService = new WindowsUpdateService();
      await this.services.windowsUpdateService.init();

      this.services.rollbackManager = new RollbackManager(this.db);
      await this.services.rollbackManager.init();

      this.services.updateNotifier = new UpdateNotifier(this.io);
      await this.services.updateNotifier.init();

      this.services.updateManager = new UpdateManager(
        this.db,
        this.services.platformDetector,
        this.services.verificationService,
        this.services.packageManagerService,
        this.services.windowsUpdateService,
        this.services.rollbackManager,
        this.services.updateNotifier
      );
      await this.services.updateManager.init();

      logger.info('[UpdatePlugin] All services initialized');
    } catch (error) {
      logger.error('[UpdatePlugin] Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    const router = require('express').Router();
    const { authenticateToken, checkPermission } = require('../../middleware/auth');

    // Check for updates
    router.get('/check', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const updates = await this.services.updateManager.checkForUpdates(req.user.tenantId);
        res.json({ success: true, updates });
      } catch (error) {
        logger.error('[UpdatePlugin] Check updates failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get update status
    router.get('/status', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const status = await this.services.updateManager.getStatus(req.user.tenantId);
        res.json({ success: true, status });
      } catch (error) {
        logger.error('[UpdatePlugin] Get status failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Download updates
    router.post('/download', authenticateToken, checkPermission('updates:write'), async (req, res) => {
      try {
        const { version } = req.body;
        const result = await this.services.updateManager.downloadUpdate(req.user.tenantId, version);
        res.json({ success: true, result });
      } catch (error) {
        logger.error('[UpdatePlugin] Download failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Install updates
    router.post('/install', authenticateToken, checkPermission('updates:write'), async (req, res) => {
      try {
        const { version, backup } = req.body;
        const result = await this.services.updateManager.installUpdate(
          req.user.tenantId,
          version,
          backup !== false
        );
        res.json({ success: true, result });
      } catch (error) {
        logger.error('[UpdatePlugin] Install failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Rollback update
    router.post('/rollback', authenticateToken, checkPermission('updates:write'), async (req, res) => {
      try {
        const { updateId } = req.body;
        const result = await this.services.rollbackManager.rollback(req.user.tenantId, updateId);
        res.json({ success: true, result });
      } catch (error) {
        logger.error('[UpdatePlugin] Rollback failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get update history
    router.get('/history', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const history = await this.services.updateManager.getHistory(req.user.tenantId);
        res.json({ success: true, history });
      } catch (error) {
        logger.error('[UpdatePlugin] Get history failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get configuration
    router.get('/config', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const config = await this.services.updateManager.getConfig(req.user.tenantId);
        res.json({ success: true, config });
      } catch (error) {
        logger.error('[UpdatePlugin] Get config failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update configuration
    router.put('/config', authenticateToken, checkPermission('updates:write'), async (req, res) => {
      try {
        const result = await this.services.updateManager.updateConfig(req.user.tenantId, req.body);
        res.json({ success: true, result });
      } catch (error) {
        logger.error('[UpdatePlugin] Update config failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get detected platforms
    router.get('/platforms', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const platforms = await this.services.platformDetector.detectAll();
        res.json({ success: true, platforms });
      } catch (error) {
        logger.error('[UpdatePlugin] Get platforms failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available package managers
    router.get('/managers', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const managers = await this.services.packageManagerService.getAvailableManagers();
        res.json({ success: true, managers });
      } catch (error) {
        logger.error('[UpdatePlugin] Get managers failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Verify update package
    router.post('/verify', authenticateToken, checkPermission('updates:read'), async (req, res) => {
      try {
        const { filePath, signature, checksum } = req.body;
        const result = await this.services.verificationService.verify(filePath, signature, checksum);
        res.json({ success: true, verified: result });
      } catch (error) {
        logger.error('[UpdatePlugin] Verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get changelog (public)
    router.get('/changelog/:version', async (req, res) => {
      try {
        const changelog = await this.services.updateManager.getChangelog(req.params.version);
        res.json({ success: true, changelog });
      } catch (error) {
        logger.error('[UpdatePlugin] Get changelog failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Mount router
    this.app.use('/api/updates', router);
    logger.info('[UpdatePlugin] Routes registered');
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    logger.info('[UpdatePlugin] Cleaning up...');
    
    try {
      // Stop any pending operations
      if (this.services.updateManager) {
        await this.services.updateManager.cleanup();
      }

      logger.info('[UpdatePlugin] Cleanup complete');
    } catch (error) {
      logger.error('[UpdatePlugin] Cleanup error:', error);
    }
  }
}

// Export plugin instance
module.exports = new UpdatePlugin();
module.exports.UpdatePlugin = UpdatePlugin;
