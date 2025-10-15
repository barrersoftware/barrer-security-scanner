/**
 * Rollback Manager
 * Handles backup creation and safe rollback on update failure
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');

const execAsync = promisify(exec);

class RollbackManager {
  constructor(platformDetector, db) {
    this.platformDetector = platformDetector;
    this.db = db;
    this.backupDir = null; // Will be set during init
    this.maxBackups = 10;
    this.backupRetentionDays = 30;
  }

  async init() {
    logger.info('[RollbackManager] Initializing...');
    
    // Set backup directory after platform detector is initialized
    this.backupDir = this.getBackupDirectory();
    
    // Ensure backup directory exists
    await this.ensureBackupDirectory();
    
    // Clean old backups
    await this.cleanOldBackups();
    
    logger.info(`[RollbackManager] Backup directory: ${this.backupDir}`);
    logger.info('[RollbackManager] ✅ Initialized');
  }

  /**
   * Get backup directory path
   */
  getBackupDirectory() {
    const platform = this.platformDetector.platform;
    const paths = this.platformDetector.getPaths();
    const baseDir = paths ? paths.data : path.join(process.cwd(), 'data');
    
    return path.join(baseDir, 'backups', 'updates');
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info(`[RollbackManager] Backup directory created: ${this.backupDir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error(`[RollbackManager] Error creating backup directory: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Create backup before update
   */
  async createBackup(tenantId, updateId, packageInfo) {
    try {
      logger.info(`[RollbackManager] Creating backup for update: ${updateId}`);

      const backupId = this.generateBackupId();
      const backupPath = path.join(this.backupDir, backupId);
      
      await fs.mkdir(backupPath, { recursive: true });

      // Backup package list
      const packageList = await this.getInstalledPackages();
      await this.saveBackupMetadata(backupPath, {
        backupId,
        tenantId,
        updateId,
        packageInfo,
        packageList,
        timestamp: new Date().toISOString(),
        platform: this.platformDetector.platform,
        distro: this.platformDetector.distro
      });

      // Backup specific packages if provided
      if (packageInfo && packageInfo.packages) {
        await this.backupPackageVersions(backupPath, packageInfo.packages);
      }

      // Calculate backup size
      const backupSize = await this.calculateBackupSize(backupPath);

      // Store in database
      await this.storeBackupRecord(tenantId, updateId, backupId, backupPath, backupSize);

      logger.info(`[RollbackManager] Backup created: ${backupId} (${this.formatSize(backupSize)})`);

      return {
        backupId,
        backupPath,
        size: backupSize,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[RollbackManager] Error creating backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get list of installed packages
   */
  async getInstalledPackages() {
    try {
      const platform = this.platformDetector.platform;
      let command;

      if (platform === 'linux') {
        const primaryManager = this.platformDetector.getPrimaryPackageManager();
        
        switch (primaryManager) {
          case 'apt':
          case 'apt-get':
            command = 'dpkg --get-selections > /dev/null 2>&1 && dpkg --get-selections';
            break;
          case 'yum':
          case 'dnf':
            command = 'rpm -qa';
            break;
          case 'pacman':
            command = 'pacman -Q';
            break;
          case 'zypper':
            command = 'zypper se -i';
            break;
          default:
            command = 'echo "No primary package manager"';
        }
      } else if (platform === 'darwin') {
        command = 'brew list --versions';
      } else if (platform === 'win32') {
        command = 'wmic product get name,version';
      }

      const { stdout } = await execAsync(command);
      return stdout;

    } catch (error) {
      logger.warn(`[RollbackManager] Could not get package list: ${error.message}`);
      return '';
    }
  }

  /**
   * Backup specific package versions
   */
  async backupPackageVersions(backupPath, packages) {
    const versionsFile = path.join(backupPath, 'package-versions.json');
    
    const versions = {};
    for (const pkg of packages) {
      try {
        const version = await this.getPackageVersion(pkg);
        versions[pkg] = version;
      } catch (error) {
        logger.warn(`[RollbackManager] Could not get version for ${pkg}: ${error.message}`);
        versions[pkg] = 'unknown';
      }
    }

    await fs.writeFile(versionsFile, JSON.stringify(versions, null, 2));
    logger.info(`[RollbackManager] Backed up ${Object.keys(versions).length} package versions`);
  }

  /**
   * Get specific package version
   */
  async getPackageVersion(packageName) {
    try {
      const platform = this.platformDetector.platform;
      let command;

      if (platform === 'linux') {
        const primaryManager = this.platformDetector.getPrimaryPackageManager();
        
        switch (primaryManager) {
          case 'apt':
          case 'apt-get':
            command = `dpkg -s ${packageName} | grep Version`;
            break;
          case 'yum':
          case 'dnf':
            command = `rpm -q ${packageName}`;
            break;
          case 'pacman':
            command = `pacman -Q ${packageName}`;
            break;
          default:
            return 'unknown';
        }
      } else if (platform === 'darwin') {
        command = `brew list --versions ${packageName}`;
      } else if (platform === 'win32') {
        command = `wmic product where name="${packageName}" get version`;
      }

      const { stdout } = await execAsync(command);
      return stdout.trim();

    } catch (error) {
      return 'not-installed';
    }
  }

  /**
   * Save backup metadata
   */
  async saveBackupMetadata(backupPath, metadata) {
    const metadataFile = path.join(backupPath, 'metadata.json');
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
  }

  /**
   * Calculate backup size
   */
  async calculateBackupSize(backupPath) {
    try {
      const files = await fs.readdir(backupPath);
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(backupPath, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      return totalSize;
    } catch (error) {
      logger.warn(`[RollbackManager] Could not calculate backup size: ${error.message}`);
      return 0;
    }
  }

  /**
   * Store backup record in database
   */
  async storeBackupRecord(tenantId, updateId, backupId, backupPath, backupSize) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.backupRetentionDays);

    const query = `
      INSERT INTO update_backups (id, tenant_id, update_id, version, backup_path, backup_size, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      backupId,
      tenantId,
      updateId,
      'snapshot',
      backupPath,
      backupSize,
      expiresAt.toISOString()
    ]);
  }

  /**
   * Perform rollback
   */
  async performRollback(tenantId, updateId) {
    try {
      logger.info(`[RollbackManager] Performing rollback for update: ${updateId}`);

      // Get backup record
      const backup = await this.getBackupForUpdate(tenantId, updateId);
      
      if (!backup) {
        throw new Error(`No backup found for update: ${updateId}`);
      }

      // Load backup metadata
      const metadata = await this.loadBackupMetadata(backup.backup_path);
      
      if (!metadata) {
        throw new Error(`Backup metadata not found: ${backup.id}`);
      }

      logger.info(`[RollbackManager] Restoring from backup: ${backup.id}`);

      // Restore package versions
      if (metadata.packageInfo && metadata.packageInfo.packages) {
        await this.restorePackageVersions(backup.backup_path, metadata.packageInfo.packages);
      }

      logger.info(`[RollbackManager] Rollback completed successfully`);

      return {
        success: true,
        backupId: backup.id,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`[RollbackManager] Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get backup for specific update
   */
  async getBackupForUpdate(tenantId, updateId) {
    const query = `
      SELECT * FROM update_backups 
      WHERE tenant_id = ? AND update_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `;

    const result = await this.db.get(query, [tenantId, updateId]);
    return result;
  }

  /**
   * Load backup metadata
   */
  async loadBackupMetadata(backupPath) {
    try {
      const metadataFile = path.join(backupPath, 'metadata.json');
      const data = await fs.readFile(metadataFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`[RollbackManager] Error loading metadata: ${error.message}`);
      return null;
    }
  }

  /**
   * Restore package versions
   */
  async restorePackageVersions(backupPath, packages) {
    try {
      const versionsFile = path.join(backupPath, 'package-versions.json');
      const data = await fs.readFile(versionsFile, 'utf8');
      const versions = JSON.parse(data);

      logger.info(`[RollbackManager] Restoring ${Object.keys(versions).length} packages...`);

      for (const [pkg, version] of Object.entries(versions)) {
        if (version !== 'unknown' && version !== 'not-installed') {
          try {
            await this.downgradePackage(pkg, version);
            logger.info(`[RollbackManager] Restored ${pkg} to ${version}`);
          } catch (error) {
            logger.warn(`[RollbackManager] Could not restore ${pkg}: ${error.message}`);
          }
        }
      }

    } catch (error) {
      logger.error(`[RollbackManager] Error restoring versions: ${error.message}`);
    }
  }

  /**
   * Downgrade package to specific version
   */
  async downgradePackage(packageName, version) {
    const platform = this.platformDetector.platform;
    const primaryManager = this.platformDetector.getPrimaryPackageManager();
    
    let command;

    if (platform === 'linux') {
      switch (primaryManager) {
        case 'apt':
        case 'apt-get':
          command = `sudo apt-get install --allow-downgrades -y ${packageName}=${version}`;
          break;
        case 'yum':
        case 'dnf':
          command = `sudo ${primaryManager} downgrade -y ${packageName}-${version}`;
          break;
        case 'pacman':
          command = `sudo pacman -U /var/cache/pacman/pkg/${packageName}-${version}*`;
          break;
        default:
          throw new Error(`Downgrade not supported for ${primaryManager}`);
      }
    } else if (platform === 'darwin') {
      command = `brew install ${packageName}@${version}`;
    } else if (platform === 'win32') {
      throw new Error('Downgrade not yet supported on Windows');
    }

    await execAsync(command);
  }

  /**
   * List all backups for tenant
   */
  async listBackups(tenantId, limit = 50) {
    const query = `
      SELECT * FROM update_backups 
      WHERE tenant_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;

    const backups = await this.db.all(query, [tenantId, limit]);
    return backups;
  }

  /**
   * Delete backup
   */
  async deleteBackup(backupId) {
    try {
      logger.info(`[RollbackManager] Deleting backup: ${backupId}`);

      // Get backup record
      const query = 'SELECT * FROM update_backups WHERE id = ?';
      const backup = await this.db.get(query, [backupId]);

      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Delete backup files
      await fs.rm(backup.backup_path, { recursive: true, force: true });

      // Delete database record
      await this.db.run('DELETE FROM update_backups WHERE id = ?', [backupId]);

      logger.info(`[RollbackManager] Backup deleted: ${backupId}`);

      return { success: true };

    } catch (error) {
      logger.error(`[RollbackManager] Error deleting backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean old backups
   */
  async cleanOldBackups() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.backupRetentionDays);

      // Get expired backups
      const query = 'SELECT * FROM update_backups WHERE expires_at < ?';
      const expiredBackups = await this.db.all(query, [cutoffDate.toISOString()]);

      if (expiredBackups.length === 0) {
        logger.info('[RollbackManager] No expired backups to clean');
        return;
      }

      logger.info(`[RollbackManager] Cleaning ${expiredBackups.length} expired backups...`);

      for (const backup of expiredBackups) {
        try {
          await this.deleteBackup(backup.id);
        } catch (error) {
          logger.warn(`[RollbackManager] Could not delete backup ${backup.id}: ${error.message}`);
        }
      }

      logger.info('[RollbackManager] Cleanup completed');

    } catch (error) {
      logger.error(`[RollbackManager] Error cleaning backups: ${error.message}`);
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(tenantId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_backups,
          SUM(backup_size) as total_size,
          MAX(created_at) as last_backup
        FROM update_backups 
        WHERE tenant_id = ?
      `;

      const stats = await this.db.get(query, [tenantId]);

      return {
        totalBackups: stats.total_backups || 0,
        totalSize: stats.total_size || 0,
        totalSizeFormatted: this.formatSize(stats.total_size || 0),
        lastBackup: stats.last_backup
      };

    } catch (error) {
      logger.error(`[RollbackManager] Error getting stats: ${error.message}`);
      return { totalBackups: 0, totalSize: 0, lastBackup: null };
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId) {
    try {
      const query = 'SELECT * FROM update_backups WHERE id = ?';
      const backup = await this.db.get(query, [backupId]);

      if (!backup) {
        return { valid: false, error: 'Backup not found' };
      }

      // Check if backup path exists
      try {
        await fs.access(backup.backup_path);
      } catch {
        return { valid: false, error: 'Backup path does not exist' };
      }

      // Check if metadata exists
      const metadataFile = path.join(backup.backup_path, 'metadata.json');
      try {
        await fs.access(metadataFile);
      } catch {
        return { valid: false, error: 'Metadata file missing' };
      }

      return { valid: true, backup };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // === HELPER METHODS ===

  /**
   * Generate unique backup ID
   */
  generateBackupId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `backup-${timestamp}-${random}`;
  }

  /**
   * Format size in human-readable format
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = RollbackManager;
