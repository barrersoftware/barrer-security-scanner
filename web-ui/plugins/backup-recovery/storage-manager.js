/**
 * Storage Manager
 * Backup storage management for local and remote locations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class StorageManager {
  constructor(db) {
    this.db = db;
  }

  async init() {
    logger.info('[StorageManager] Initializing...');
    
    // Ensure backup directories exist
    await this.ensureDirectories();
    
    logger.info('[StorageManager] ✅ Initialized');
  }

  /**
   * Ensure backup directories exist
   */
  async ensureDirectories() {
    const backupRoot = path.join(process.cwd(), 'backups');
    
    try {
      await fs.mkdir(backupRoot, { recursive: true });
      logger.info(`[StorageManager] Backup directory ready: ${backupRoot}`);
    } catch (error) {
      logger.error(`[StorageManager] Failed to create backup directory: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(tenantId) {
    try {
      // Get backup statistics from database
      const query = `
        SELECT 
          COUNT(*) as total_backups,
          SUM(size_bytes) as total_size,
          SUM(compressed_size) as total_compressed_size,
          AVG(size_bytes) as avg_size,
          MAX(size_bytes) as max_size,
          MIN(size_bytes) as min_size
        FROM backups
        WHERE tenant_id = ? AND status = 'completed'
      `;

      const stats = await this.db.get(query, [tenantId]);

      // Get file system stats
      const tenantPath = path.join(process.cwd(), 'backups', tenantId);
      const fsStats = await this.getDirectorySize(tenantPath);

      return {
        totalBackups: stats.total_backups || 0,
        totalSize: stats.total_size || 0,
        totalCompressedSize: stats.total_compressed_size || 0,
        avgSize: stats.avg_size || 0,
        maxSize: stats.max_size || 0,
        minSize: stats.min_size || 0,
        diskUsage: fsStats.size,
        fileCount: fsStats.files,
        compressionRatio: stats.total_size > 0 
          ? ((1 - (stats.total_compressed_size / stats.total_size)) * 100).toFixed(2)
          : 0
      };

    } catch (error) {
      logger.error(`[StorageManager] Failed to get storage stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Get directory size recursively
   */
  async getDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const result = await this.getDirectorySize(fullPath);
          totalSize += result.size;
          fileCount += result.files;
        } else {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
          fileCount++;
        }
      }
    } catch (error) {
      // Directory might not exist
    }

    return { size: totalSize, files: fileCount };
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupExpiredBackups(tenantId = null) {
    try {
      logger.info('[StorageManager] Cleaning up expired backups...');

      const now = new Date().toISOString();
      const query = tenantId
        ? 'SELECT id, storage_path FROM backups WHERE tenant_id = ? AND expires_at < ?'
        : 'SELECT id, storage_path FROM backups WHERE expires_at < ?';

      const params = tenantId ? [tenantId, now] : [now];
      const expiredBackups = await this.db.all(query, params);

      let deletedCount = 0;
      let freedSpace = 0;

      for (const backup of expiredBackups) {
        // Delete backup file
        try {
          const stats = await fs.stat(backup.storage_path);
          await fs.rm(backup.storage_path, { recursive: true, force: true });
          
          freedSpace += stats.size;
          deletedCount++;

          // Delete database record
          await this.db.run('DELETE FROM backups WHERE id = ?', [backup.id]);

        } catch (error) {
          logger.warn(`[StorageManager] Failed to delete backup ${backup.id}: ${error.message}`);
        }
      }

      logger.info(`[StorageManager] Cleaned up ${deletedCount} expired backups (${this.formatBytes(freedSpace)} freed)`);

      return {
        deletedCount,
        freedSpace
      };

    } catch (error) {
      logger.error(`[StorageManager] Cleanup failed: ${error.message}`);
      return { deletedCount: 0, freedSpace: 0 };
    }
  }

  /**
   * Delete specific backup
   */
  async deleteBackup(backupId) {
    try {
      // Get backup info
      const backup = await this.db.get('SELECT * FROM backups WHERE id = ?', [backupId]);
      
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Delete file
      try {
        await fs.rm(backup.storage_path, { recursive: true, force: true });
        logger.info(`[StorageManager] Deleted backup file: ${backup.storage_path}`);
      } catch (error) {
        logger.warn(`[StorageManager] Failed to delete backup file: ${error.message}`);
      }

      // Delete database record
      await this.db.run('DELETE FROM backups WHERE id = ?', [backupId]);

      // Delete associated logs
      await this.db.run('DELETE FROM backup_logs WHERE backup_id = ?', [backupId]);

      logger.info(`[StorageManager] Deleted backup: ${backupId}`);

      return { success: true };

    } catch (error) {
      logger.error(`[StorageManager] Failed to delete backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Archive old backups (move to archive location)
   */
  async archiveOldBackups(tenantId, daysOld = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const query = `
        SELECT id, storage_path, name 
        FROM backups 
        WHERE tenant_id = ? AND created_at < ? AND status = 'completed'
      `;

      const oldBackups = await this.db.all(query, [tenantId, cutoffDate.toISOString()]);

      const archivePath = path.join(process.cwd(), 'backups', tenantId, 'archive');
      await fs.mkdir(archivePath, { recursive: true });

      let archivedCount = 0;

      for (const backup of oldBackups) {
        try {
          const newPath = path.join(archivePath, path.basename(backup.storage_path));
          await fs.rename(backup.storage_path, newPath);

          // Update database
          await this.db.run(
            'UPDATE backups SET storage_path = ? WHERE id = ?',
            [newPath, backup.id]
          );

          archivedCount++;

        } catch (error) {
          logger.warn(`[StorageManager] Failed to archive backup ${backup.id}: ${error.message}`);
        }
      }

      logger.info(`[StorageManager] Archived ${archivedCount} old backups`);

      return { archivedCount };

    } catch (error) {
      logger.error(`[StorageManager] Archive operation failed: ${error.message}`);
      return { archivedCount: 0 };
    }
  }

  /**
   * Check available storage space
   */
  async checkAvailableSpace() {
    try {
      const backupRoot = path.join(process.cwd(), 'backups');
      
      // This is simplified - would use disk usage libraries in production
      const stats = await this.getDirectorySize(backupRoot);

      return {
        usedSpace: stats.size,
        fileCount: stats.files,
        usedSpaceFormatted: this.formatBytes(stats.size)
      };

    } catch (error) {
      logger.error(`[StorageManager] Failed to check available space: ${error.message}`);
      return null;
    }
  }

  /**
   * Verify storage integrity
   */
  async verifyStorageIntegrity(tenantId) {
    try {
      logger.info(`[StorageManager] Verifying storage integrity for tenant ${tenantId}...`);

      const query = 'SELECT id, storage_path FROM backups WHERE tenant_id = ? AND status = "completed"';
      const backups = await this.db.all(query, [tenantId]);

      const results = {
        total: backups.length,
        valid: 0,
        missing: 0,
        missingBackups: []
      };

      for (const backup of backups) {
        try {
          await fs.access(backup.storage_path);
          results.valid++;
        } catch {
          results.missing++;
          results.missingBackups.push(backup.id);

          // Mark as corrupted
          await this.db.run(
            'UPDATE backups SET status = ? WHERE id = ?',
            ['missing', backup.id]
          );
        }
      }

      logger.info(`[StorageManager] Integrity check complete: ${results.valid}/${results.total} valid`);

      return results;

    } catch (error) {
      logger.error(`[StorageManager] Integrity verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get storage location info
   */
  async getStorageLocation(tenantId) {
    try {
      const config = await this.db.get(
        'SELECT storage_location FROM backup_config WHERE tenant_id = ?',
        [tenantId]
      );

      if (!config) {
        return {
          location: path.join(process.cwd(), 'backups', tenantId),
          type: 'local',
          exists: true
        };
      }

      const locationPath = config.storage_location;
      let exists = false;

      try {
        await fs.access(locationPath);
        exists = true;
      } catch {
        exists = false;
      }

      return {
        location: locationPath,
        type: 'local',
        exists
      };

    } catch (error) {
      logger.error(`[StorageManager] Failed to get storage location: ${error.message}`);
      return null;
    }
  }

  /**
   * Update storage statistics in database
   */
  async updateStorageStats(tenantId) {
    try {
      const stats = await this.getStorageStats(tenantId);
      
      if (!stats) {
        return;
      }

      // Check if storage record exists
      const existing = await this.db.get(
        'SELECT id FROM backup_storage WHERE tenant_id = ?',
        [tenantId]
      );

      if (existing) {
        // Update
        await this.db.run(`
          UPDATE backup_storage 
          SET total_size_bytes = ?,
              used_size_bytes = ?,
              backup_count = ?,
              updated_at = ?
          WHERE tenant_id = ?
        `, [
          stats.totalSize,
          stats.diskUsage,
          stats.totalBackups,
          new Date().toISOString(),
          tenantId
        ]);
      } else {
        // Insert
        await this.db.run(`
          INSERT INTO backup_storage 
          (id, tenant_id, name, storage_type, storage_path, 
           total_size_bytes, used_size_bytes, backup_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          crypto.randomBytes(16).toString('hex'),
          tenantId,
          'Default Storage',
          'local',
          path.join(process.cwd(), 'backups', tenantId),
          stats.totalSize,
          stats.diskUsage,
          stats.totalBackups
        ]);
      }

      logger.info(`[StorageManager] Updated storage stats for tenant ${tenantId}`);

    } catch (error) {
      logger.error(`[StorageManager] Failed to update storage stats: ${error.message}`);
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = StorageManager;
