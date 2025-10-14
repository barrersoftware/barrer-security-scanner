/**
 * Update Manager
 * Main orchestration service for the update plugin
 * Coordinates all update operations, services, and workflows
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class UpdateManager {
  constructor(services, db) {
    this.services = services;
    this.db = db;
    this.currentOperations = new Map(); // Track ongoing operations
  }

  async init() {
    logger.info('[UpdateManager] Initializing...');
    
    // Verify required services
    this.verifyServices();
    
    logger.info('[UpdateManager] ✅ Initialized');
  }

  /**
   * Verify all required services are available
   */
  verifyServices() {
    const required = [
      'platformDetector',
      'packageManagerService',
      'verificationService',
      'rollbackManager',
      'updateNotifier'
    ];

    for (const service of required) {
      if (!this.services[service]) {
        logger.warn(`[UpdateManager] Service not available: ${service}`);
      }
    }
  }

  /**
   * Check for available updates
   */
  async checkForUpdates(tenantId, options = {}) {
    try {
      logger.info(`[UpdateManager] Checking for updates - Tenant: ${tenantId}`);

      const { manager = null, includeOptional = false } = options;

      // Get package manager service
      const pmService = this.services.packageManagerService;
      
      // Check updates
      const result = await pmService.checkUpdates(manager);

      // Categorize updates
      const categorized = this.categorizeUpdates(result.updates);

      // Store last check time
      await this.updateLastCheckTime(tenantId);

      // Send notification if updates available
      if (result.count > 0) {
        await this.services.updateNotifier.notifyUpdatesAvailable(tenantId, {
          count: result.count,
          manager: result.manager,
          criticalCount: categorized.critical.length,
          securityCount: categorized.security.length,
          updates: categorized
        });
      }

      logger.info(`[UpdateManager] Check complete: ${result.count} updates available`);

      return {
        available: result.count > 0,
        count: result.count,
        manager: result.manager,
        updates: result.updates,
        categorized: categorized,
        timestamp: result.timestamp
      };

    } catch (error) {
      logger.error(`[UpdateManager] Error checking updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download updates
   */
  async downloadUpdates(tenantId, options = {}) {
    try {
      logger.info(`[UpdateManager] Downloading updates - Tenant: ${tenantId}`);

      const { packages = [], manager = null } = options;

      // For Windows Update
      if (this.services.windowsUpdateService && 
          this.services.windowsUpdateService.isAvailable()) {
        const result = await this.services.windowsUpdateService.downloadUpdates(packages);
        return result;
      }

      // For package managers, download typically happens during install
      return {
        success: true,
        message: 'Downloads will occur during installation',
        packages: packages
      };

    } catch (error) {
      logger.error(`[UpdateManager] Error downloading updates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Install updates with full workflow
   */
  async installUpdates(tenantId, options = {}) {
    const operationId = this.generateOperationId();
    
    try {
      logger.info(`[UpdateManager] Starting update installation - Tenant: ${tenantId}, Operation: ${operationId}`);

      // Track operation
      this.currentOperations.set(operationId, {
        tenantId,
        status: 'starting',
        startedAt: new Date().toISOString()
      });

      const {
        packages = [],
        manager = null,
        createBackup = true,
        autoRollback = true,
        notifyProgress = true
      } = options;

      // Step 1: Notify start
      await this.services.updateNotifier.notifyUpdateStarted(tenantId, {
        operationId,
        packageCount: packages.length || 'all',
        manager
      });

      this.updateOperationStatus(operationId, 'backup');

      // Step 2: Create backup if enabled
      let backupId = null;
      if (createBackup && this.services.rollbackManager) {
        try {
          const backup = await this.services.rollbackManager.createBackup(tenantId, operationId, {
            packages,
            manager
          });
          backupId = backup.backupId;
          logger.info(`[UpdateManager] Backup created: ${backupId}`);
        } catch (backupError) {
          logger.error(`[UpdateManager] Backup failed: ${backupError.message}`);
          
          if (options.requireBackup) {
            throw new Error(`Backup required but failed: ${backupError.message}`);
          }
        }
      }

      this.updateOperationStatus(operationId, 'installing');

      // Step 3: Install updates
      let installResult;
      const pmService = this.services.packageManagerService;
      const wuService = this.services.windowsUpdateService;

      if (wuService && wuService.isAvailable()) {
        // Windows Update
        installResult = await wuService.installUpdates({
          kbNumbers: packages,
          autoReboot: options.autoReboot || false,
          acceptAll: true
        });
      } else {
        // Package Manager
        installResult = await pmService.installUpdates(manager, packages);
      }

      this.updateOperationStatus(operationId, 'verifying');

      // Step 4: Verify installation
      const verified = await this.verifyInstallation(installResult);

      if (!verified && autoRollback && backupId) {
        logger.warn('[UpdateManager] Installation verification failed, initiating rollback');
        
        await this.services.updateNotifier.notifyRollbackStarted(tenantId, operationId);
        
        const rollbackResult = await this.services.rollbackManager.performRollback(tenantId, operationId);
        
        await this.services.updateNotifier.notifyRollbackCompleted(tenantId, rollbackResult);
        
        throw new Error('Installation failed verification, rolled back');
      }

      // Step 5: Record in history
      await this.recordUpdateHistory(tenantId, operationId, {
        packages,
        manager,
        backupId,
        result: installResult,
        status: 'success'
      });

      this.updateOperationStatus(operationId, 'completed');

      // Step 6: Check if reboot required
      let rebootRequired = false;
      if (wuService && wuService.isAvailable()) {
        rebootRequired = await wuService.isRebootRequired();
        
        if (rebootRequired) {
          await this.services.updateNotifier.notifyRebootRequired(tenantId, {
            scheduled: false
          });
        }
      }

      // Step 7: Notify completion
      await this.services.updateNotifier.notifyUpdateCompleted(tenantId, {
        operationId,
        installed: packages.length || 'all',
        failed: 0,
        rebootRequired,
        backupId
      });

      logger.info(`[UpdateManager] Update completed successfully - Operation: ${operationId}`);

      // Cleanup operation tracking
      this.currentOperations.delete(operationId);

      return {
        success: true,
        operationId,
        backupId,
        rebootRequired,
        result: installResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[UpdateManager] Update failed - Operation: ${operationId}, Error: ${error.message}`);

      // Notify failure
      await this.services.updateNotifier.notifyUpdateFailed(tenantId, error);

      // Record failure in history
      await this.recordUpdateHistory(tenantId, operationId, {
        status: 'failed',
        error: error.message
      });

      // Cleanup operation tracking
      this.currentOperations.delete(operationId);

      throw error;
    }
  }

  /**
   * Rollback specific update
   */
  async rollbackUpdate(tenantId, updateId) {
    try {
      logger.info(`[UpdateManager] Rolling back update: ${updateId}`);

      await this.services.updateNotifier.notifyRollbackStarted(tenantId, updateId);

      const result = await this.services.rollbackManager.performRollback(tenantId, updateId);

      await this.services.updateNotifier.notifyRollbackCompleted(tenantId, result);

      // Update history
      await this.updateHistoryStatus(updateId, 'rolled_back');

      return result;

    } catch (error) {
      logger.error(`[UpdateManager] Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get update configuration for tenant
   */
  async getConfiguration(tenantId) {
    try {
      const query = 'SELECT * FROM update_config WHERE tenant_id = ?';
      let config = await this.db.get(query, [tenantId]);

      // Create default config if not exists
      if (!config) {
        config = await this.createDefaultConfiguration(tenantId);
      }

      return config;

    } catch (error) {
      logger.error(`[UpdateManager] Error getting config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update configuration for tenant
   */
  async updateConfiguration(tenantId, newConfig) {
    try {
      logger.info(`[UpdateManager] Updating configuration for tenant: ${tenantId}`);

      const query = `
        UPDATE update_config 
        SET 
          auto_check = ?,
          auto_download = ?,
          auto_install = ?,
          check_interval = ?,
          update_channel = ?,
          package_manager = ?,
          backup_before_update = ?,
          notification_enabled = ?,
          updated_at = ?
        WHERE tenant_id = ?
      `;

      await this.db.run(query, [
        newConfig.auto_check !== undefined ? newConfig.auto_check : 1,
        newConfig.auto_download !== undefined ? newConfig.auto_download : 0,
        newConfig.auto_install !== undefined ? newConfig.auto_install : 0,
        newConfig.check_interval || 86400,
        newConfig.update_channel || 'stable',
        newConfig.package_manager || null,
        newConfig.backup_before_update !== undefined ? newConfig.backup_before_update : 1,
        newConfig.notification_enabled !== undefined ? newConfig.notification_enabled : 1,
        new Date().toISOString(),
        tenantId
      ]);

      return await this.getConfiguration(tenantId);

    } catch (error) {
      logger.error(`[UpdateManager] Error updating config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get update history for tenant
   */
  async getUpdateHistory(tenantId, limit = 50) {
    try {
      const query = `
        SELECT * FROM update_history 
        WHERE tenant_id = ? 
        ORDER BY started_at DESC 
        LIMIT ?
      `;

      const history = await this.db.all(query, [tenantId, limit]);
      return history;

    } catch (error) {
      logger.error(`[UpdateManager] Error getting history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current operation status
   */
  getOperationStatus(operationId) {
    return this.currentOperations.get(operationId) || null;
  }

  /**
   * Get all active operations
   */
  getActiveOperations() {
    return Array.from(this.currentOperations.entries()).map(([id, op]) => ({
      operationId: id,
      ...op
    }));
  }

  // === HELPER METHODS ===

  /**
   * Categorize updates by type
   */
  categorizeUpdates(updates) {
    const categorized = {
      critical: [],
      security: [],
      recommended: [],
      optional: []
    };

    for (const update of updates) {
      const name = (update.name || update.title || '').toLowerCase();
      
      if (name.includes('security') || name.includes('cve')) {
        categorized.security.push(update);
      } else if (name.includes('critical') || name.includes('important')) {
        categorized.critical.push(update);
      } else if (name.includes('recommended')) {
        categorized.recommended.push(update);
      } else {
        categorized.optional.push(update);
      }
    }

    return categorized;
  }

  /**
   * Verify installation success
   */
  async verifyInstallation(installResult) {
    // Basic verification - check if installation reported success
    if (installResult.success === false) {
      return false;
    }

    // Check for failures
    if (installResult.failed && installResult.failed > 0) {
      return false;
    }

    // Additional verification could be added here
    return true;
  }

  /**
   * Record update in history
   */
  async recordUpdateHistory(tenantId, operationId, data) {
    try {
      const query = `
        INSERT INTO update_history 
        (id, tenant_id, from_version, to_version, status, method, started_at, completed_at, error, rollback_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        operationId,
        tenantId,
        'current',
        'updated',
        data.status || 'success',
        data.manager || 'auto',
        new Date().toISOString(),
        data.status === 'success' ? new Date().toISOString() : null,
        data.error || null,
        data.backupId ? 1 : 0
      ]);

    } catch (error) {
      logger.error(`[UpdateManager] Error recording history: ${error.message}`);
    }
  }

  /**
   * Update history status
   */
  async updateHistoryStatus(updateId, status) {
    try {
      const query = 'UPDATE update_history SET status = ?, completed_at = ? WHERE id = ?';
      await this.db.run(query, [status, new Date().toISOString(), updateId]);
    } catch (error) {
      logger.error(`[UpdateManager] Error updating history: ${error.message}`);
    }
  }

  /**
   * Update last check time
   */
  async updateLastCheckTime(tenantId) {
    try {
      const query = 'UPDATE update_config SET last_check_at = ? WHERE tenant_id = ?';
      await this.db.run(query, [new Date().toISOString(), tenantId]);
    } catch (error) {
      logger.error(`[UpdateManager] Error updating check time: ${error.message}`);
    }
  }

  /**
   * Create default configuration
   */
  async createDefaultConfiguration(tenantId) {
    const config = {
      id: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      auto_check: 1,
      auto_download: 0,
      auto_install: 0,
      check_interval: 86400,
      update_channel: 'stable',
      package_manager: this.services.platformDetector.getPrimaryPackageManager(),
      backup_before_update: 1,
      notification_enabled: 1,
      last_check_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const query = `
      INSERT INTO update_config 
      (id, tenant_id, auto_check, auto_download, auto_install, check_interval, 
       update_channel, package_manager, backup_before_update, notification_enabled, 
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      config.id,
      config.tenant_id,
      config.auto_check,
      config.auto_download,
      config.auto_install,
      config.check_interval,
      config.update_channel,
      config.package_manager,
      config.backup_before_update,
      config.notification_enabled,
      config.created_at,
      config.updated_at
    ]);

    return config;
  }

  /**
   * Update operation status
   */
  updateOperationStatus(operationId, status) {
    const operation = this.currentOperations.get(operationId);
    if (operation) {
      operation.status = status;
      operation.updatedAt = new Date().toISOString();
      this.currentOperations.set(operationId, operation);
    }
  }

  /**
   * Generate unique operation ID
   */
  generateOperationId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `op-${timestamp}-${random}`;
  }
}

module.exports = UpdateManager;
