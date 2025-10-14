/**
 * Integrity Checker
 * Backup integrity verification with checksums
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const { createReadStream } = require('fs');
const { logger } = require('../../shared/logger');

class IntegrityChecker {
  constructor(db) {
    this.db = db;
    this.algorithm = 'sha256';
  }

  async init() {
    logger.info('[IntegrityChecker] Initializing...');
    logger.info(`[IntegrityChecker] Algorithm: ${this.algorithm}`);
    logger.info('[IntegrityChecker] ✅ Initialized');
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(this.algorithm);
      const stream = createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId, filePath, expectedChecksum) {
    try {
      logger.info(`[IntegrityChecker] Verifying backup ${backupId}...`);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        logger.error(`[IntegrityChecker] Backup file not found: ${filePath}`);
        return false;
      }

      // Calculate current checksum
      const actualChecksum = await this.calculateChecksum(filePath);

      // Compare checksums
      const verified = actualChecksum === expectedChecksum;

      if (verified) {
        logger.info(`[IntegrityChecker] Backup verified successfully: ${backupId}`);
      } else {
        logger.error(`[IntegrityChecker] Checksum mismatch for backup ${backupId}`);
        logger.error(`Expected: ${expectedChecksum}`);
        logger.error(`Actual: ${actualChecksum}`);
      }

      // Log verification
      await this.logVerification(backupId, verified, actualChecksum, expectedChecksum);

      return verified;

    } catch (error) {
      logger.error(`[IntegrityChecker] Verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify backup and update status
   */
  async verifyAndUpdateBackup(backupId) {
    try {
      // Get backup
      const backup = await this.getBackup(backupId);
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Verify
      const verified = await this.verifyBackup(
        backupId,
        backup.storage_path,
        backup.checksum
      );

      // Update backup record
      await this.updateBackupVerification(backupId, verified);

      return {
        backupId,
        verified,
        checksum: backup.checksum
      };

    } catch (error) {
      logger.error(`[IntegrityChecker] Verification update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for corrupted backups
   */
  async checkCorruptedBackups(tenantId) {
    try {
      logger.info(`[IntegrityChecker] Checking for corrupted backups...`);

      const query = `
        SELECT id, storage_path, checksum 
        FROM backups 
        WHERE tenant_id = ? AND status = 'completed'
      `;

      const backups = await this.db.all(query, [tenantId]);
      const results = [];

      for (const backup of backups) {
        const verified = await this.verifyBackup(
          backup.id,
          backup.storage_path,
          backup.checksum
        );

        if (!verified) {
          results.push({
            backupId: backup.id,
            path: backup.storage_path,
            corrupted: true
          });

          // Mark as corrupted
          await this.db.run(
            'UPDATE backups SET status = ? WHERE id = ?',
            ['corrupted', backup.id]
          );
        }
      }

      logger.info(`[IntegrityChecker] Found ${results.length} corrupted backups`);

      return results;

    } catch (error) {
      logger.error(`[IntegrityChecker] Corruption check failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate directory checksum (recursive)
   */
  async calculateDirectoryChecksum(dirPath) {
    try {
      const hash = crypto.createHash(this.algorithm);
      
      async function processDirectory(currentPath) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        // Sort entries for consistent hashing
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            await processDirectory(fullPath);
          } else {
            const fileHash = await this.calculateChecksum(fullPath);
            hash.update(fileHash);
            hash.update(entry.name);
          }
        }
      }

      await processDirectory(dirPath);

      return hash.digest('hex');

    } catch (error) {
      logger.error(`[IntegrityChecker] Directory checksum failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify file integrity with metadata
   */
  async verifyFileIntegrity(filePath, metadata) {
    try {
      // Check file exists
      const stats = await fs.stat(filePath);

      // Verify size
      if (metadata.size && stats.size !== metadata.size) {
        logger.warn(`[IntegrityChecker] Size mismatch: expected ${metadata.size}, got ${stats.size}`);
        return false;
      }

      // Verify checksum
      if (metadata.checksum) {
        const actualChecksum = await this.calculateChecksum(filePath);
        
        if (actualChecksum !== metadata.checksum) {
          logger.warn(`[IntegrityChecker] Checksum mismatch`);
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error(`[IntegrityChecker] File verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate integrity report
   */
  async generateIntegrityReport(tenantId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_backups,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'corrupted' THEN 1 ELSE 0 END) as corrupted,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(size_bytes) as total_size
        FROM backups
        WHERE tenant_id = ?
      `;

      const stats = await this.db.get(query, [tenantId]);

      return {
        totalBackups: stats.total_backups || 0,
        completed: stats.completed || 0,
        corrupted: stats.corrupted || 0,
        failed: stats.failed || 0,
        totalSize: stats.total_size || 0,
        integrityRate: stats.total_backups > 0 
          ? ((stats.completed / stats.total_backups) * 100).toFixed(2)
          : 0
      };

    } catch (error) {
      logger.error(`[IntegrityChecker] Report generation failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Helper methods
   */

  async getBackup(backupId) {
    const query = 'SELECT * FROM backups WHERE id = ?';
    return await this.db.get(query, [backupId]);
  }

  async updateBackupVerification(backupId, verified) {
    const status = verified ? 'verified' : 'corrupted';
    const query = `
      UPDATE backups 
      SET metadata = json_set(
        COALESCE(metadata, '{}'),
        '$.last_verified',
        ?
      )
      WHERE id = ?
    `;

    await this.db.run(query, [new Date().toISOString(), backupId]);
  }

  async logVerification(backupId, verified, actualChecksum, expectedChecksum) {
    try {
      const query = `
        INSERT INTO backup_logs 
        (id, tenant_id, backup_id, operation, status, message, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const message = verified
        ? 'Backup integrity verified successfully'
        : `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`;

      await this.db.run(query, [
        crypto.randomBytes(16).toString('hex'),
        'system',
        backupId,
        'verify',
        verified ? 'success' : 'failed',
        message,
        new Date().toISOString(),
        new Date().toISOString()
      ]);

    } catch (error) {
      logger.error(`[IntegrityChecker] Failed to log verification: ${error.message}`);
    }
  }
}

module.exports = IntegrityChecker;
