/**
 * Backup & Recovery Plugin - Main Entry Point
 * Automated backup and disaster recovery with encryption and ransomware protection
 */

const path = require('path');
const { logger } = require('../../shared/logger');

// Services
const BackupService = require('./backup-service');
const RestoreService = require('./restore-service');
const EncryptionService = require('./encryption-service');
const IntegrityChecker = require('./integrity-checker');
const ScheduleManager = require('./schedule-manager');
const StorageManager = require('./storage-manager');

// Plugin metadata
const pluginInfo = require('./plugin.json');

class BackupRecoveryPlugin {
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
      logger.info('[BackupRecoveryPlugin] Initializing...');
      
      this.db = db;
      this.app = app;
      this.io = io;

      // Initialize database schema
      await this.initDatabase();

      // Initialize services
      await this.initServices();

      // Register API routes
      this.registerRoutes();

      // Start cleanup interval
      this.startCleanupInterval();

      logger.info('[BackupRecoveryPlugin] ✅ Initialized');
      return true;

    } catch (error) {
      logger.error(`[BackupRecoveryPlugin] Initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initDatabase() {
    try {
      logger.info('[BackupRecoveryPlugin] Creating database schema...');

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

      logger.info('[BackupRecoveryPlugin] Database schema created');

    } catch (error) {
      logger.error(`[BackupRecoveryPlugin] Database init error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initialize services
   */
  async initServices() {
    try {
      logger.info('[BackupRecoveryPlugin] Initializing services...');

      // Initialize in correct order (dependencies)
      this.services.encryptionService = new EncryptionService(this.db);
      await this.services.encryptionService.init();

      this.services.integrityChecker = new IntegrityChecker(this.db);
      await this.services.integrityChecker.init();

      this.services.storageManager = new StorageManager(this.db);
      await this.services.storageManager.init();

      this.services.backupService = new BackupService(
        this.db,
        this.services.encryptionService,
        this.services.integrityChecker
      );
      await this.services.backupService.init();

      this.services.restoreService = new RestoreService(
        this.db,
        this.services.encryptionService,
        this.services.integrityChecker
      );
      await this.services.restoreService.init();

      this.services.scheduleManager = new ScheduleManager(
        this.db,
        this.services.backupService
      );
      await this.services.scheduleManager.init();

      logger.info('[BackupRecoveryPlugin] All services initialized');

    } catch (error) {
      logger.error(`[BackupRecoveryPlugin] Service init error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    const router = this.app;

    // 1. Get backup status
    router.get('/api/backup/status', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const stats = await this.services.storageManager.getStorageStats(tenantId);
        const config = await this.services.backupService.getConfig(tenantId);
        
        res.json({
          enabled: config.enabled === 1,
          totalBackups: stats.totalBackups,
          totalSize: stats.totalSize,
          diskUsage: stats.diskUsage,
          compressionRatio: stats.compressionRatio + '%',
          encryptionEnabled: config.encryption_enabled === 1,
          lastBackup: await this.getLastBackupInfo(tenantId)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 2. List backups
    router.get('/api/backup/list', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status || null;

        const query = status
          ? 'SELECT * FROM backups WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?'
          : 'SELECT * FROM backups WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?';

        const params = status ? [tenantId, status, limit] : [tenantId, limit];
        const backups = await this.db.all(query, params);

        res.json(backups);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 3. Create backup
    router.post('/api/backup/create', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const options = {
          ...req.body,
          createdBy: req.user?.username || 'api'
        };

        const result = await this.services.backupService.createBackup(tenantId, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 4. Restore from backup
    router.post('/api/backup/restore', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { backupId, ...options } = req.body;

        if (!backupId) {
          return res.status(400).json({ error: 'backupId required' });
        }

        options.restoredBy = req.user?.username || 'api';

        const result = await this.services.restoreService.restoreBackup(
          tenantId,
          backupId,
          options
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 5. Delete backup
    router.delete('/api/backup/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.services.storageManager.deleteBackup(id);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 6. Verify backup integrity
    router.get('/api/backup/:id/verify', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.services.integrityChecker.verifyAndUpdateBackup(id);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 7. Download backup
    router.get('/api/backup/:id/download', async (req, res) => {
      try {
        const { id } = req.params;
        const backup = await this.db.get('SELECT * FROM backups WHERE id = ?', [id]);

        if (!backup) {
          return res.status(404).json({ error: 'Backup not found' });
        }

        res.download(backup.storage_path, `${backup.name}.tar.gz`);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 8. Get schedules
    router.get('/api/backup/schedules', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const schedules = await this.services.scheduleManager.getSchedules(tenantId);
        res.json(schedules);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 9. Create schedule
    router.post('/api/backup/schedules', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const options = {
          ...req.body,
          createdBy: req.user?.username || 'api'
        };

        const result = await this.services.scheduleManager.createSchedule(tenantId, options);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 10. Update schedule
    router.put('/api/backup/schedules/:id', async (req, res) => {
      try {
        const { id } = req.params;
        await this.services.scheduleManager.updateSchedule(id, req.body);
        res.json({ success: true, message: 'Schedule updated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 11. Delete schedule
    router.delete('/api/backup/schedules/:id', async (req, res) => {
      try {
        const { id } = req.params;
        await this.services.scheduleManager.deleteSchedule(id);
        res.json({ success: true, message: 'Schedule deleted' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 12. Get configuration
    router.get('/api/backup/config', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const config = await this.services.backupService.getConfig(tenantId);
        res.json(config);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 13. Update configuration
    router.put('/api/backup/config', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const updates = req.body;

        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        const query = `
          UPDATE backup_config 
          SET ${fields}, updated_at = ? 
          WHERE tenant_id = ?
        `;

        await this.db.run(query, [...values, new Date().toISOString(), tenantId]);

        res.json({ success: true, message: 'Configuration updated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 14. Test restore
    router.post('/api/backup/:id/test-restore', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const { id } = req.params;

        const result = await this.services.restoreService.restoreBackup(
          tenantId,
          id,
          { testMode: true, restoredBy: req.user?.username || 'api' }
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // 15. Get storage statistics
    router.get('/api/backup/storage-stats', async (req, res) => {
      try {
        const tenantId = req.user?.tenant_id || 'default';
        const stats = await this.services.storageManager.getStorageStats(tenantId);
        const location = await this.services.storageManager.getStorageLocation(tenantId);
        const integrity = await this.services.integrityChecker.generateIntegrityReport(tenantId);

        res.json({
          storage: stats,
          location: location,
          integrity: integrity
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    logger.info('[BackupRecoveryPlugin] API routes registered');
  }

  /**
   * Get last backup info
   */
  async getLastBackupInfo(tenantId) {
    try {
      const query = `
        SELECT * FROM backups 
        WHERE tenant_id = ? AND status = 'completed' 
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const backup = await this.db.get(query, [tenantId]);

      if (!backup) {
        return null;
      }

      return {
        id: backup.id,
        name: backup.name,
        type: backup.backup_type,
        size: backup.size_bytes,
        createdAt: backup.created_at
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    // Clean up expired backups every 6 hours
    setInterval(async () => {
      try {
        logger.info('[BackupRecoveryPlugin] Running scheduled cleanup...');
        
        await this.services.storageManager.cleanupExpiredBackups();
        
        logger.info('[BackupRecoveryPlugin] Cleanup complete');
      } catch (error) {
        logger.error(`[BackupRecoveryPlugin] Cleanup error: ${error.message}`);
      }
    }, 21600000); // 6 hours

    logger.info('[BackupRecoveryPlugin] Cleanup interval started');
  }

  /**
   * Cleanup on plugin unload
   */
  async cleanup() {
    logger.info('[BackupRecoveryPlugin] Cleaning up...');
    
    // Stop schedule manager
    if (this.services.scheduleManager) {
      this.services.scheduleManager.cleanup();
    }

    logger.info('[BackupRecoveryPlugin] Cleanup complete');
  }
}

module.exports = BackupRecoveryPlugin;
