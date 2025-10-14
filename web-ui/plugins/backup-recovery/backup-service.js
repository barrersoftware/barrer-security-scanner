/**
 * Backup Service
 * Core backup operations for files, databases, and configurations
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { logger } = require('../../shared/logger');

class BackupService {
  constructor(db, encryptionService, integrityChecker) {
    this.db = db;
    this.encryptionService = encryptionService;
    this.integrityChecker = integrityChecker;
  }

  async init() {
    logger.info('[BackupService] Initializing...');
    logger.info('[BackupService] ✅ Initialized');
  }

  /**
   * Create a backup
   */
  async createBackup(tenantId, options = {}) {
    const backupId = crypto.randomBytes(16).toString('hex');
    const startTime = Date.now();

    try {
      const {
        name = `backup_${Date.now()}`,
        description = '',
        backupType = 'full',
        includeFiles = true,
        includeDatabase = true,
        includeConfig = true,
        encryptionEnabled = true,
        compressionEnabled = true,
        createdBy = 'system'
      } = options;

      logger.info(`[BackupService] Creating ${backupType} backup for tenant ${tenantId}`);

      // Get configuration
      const config = await this.getConfig(tenantId);

      // Create backup directory
      const backupPath = await this.createBackupDirectory(tenantId, backupId);

      // Initialize backup record
      await this.createBackupRecord(backupId, tenantId, {
        name,
        description,
        backupType,
        status: 'in_progress',
        storage_path: backupPath,
        encryption_enabled: encryptionEnabled ? 1 : 0,
        encryption_algorithm: encryptionEnabled ? config.encryption_algorithm : null,
        started_at: new Date().toISOString(),
        created_by: createdBy,
        retention_days: config.default_retention_days
      });

      // Perform backup based on type
      let result;
      switch (backupType) {
        case 'full':
          result = await this.createFullBackup(tenantId, backupId, backupPath, {
            includeFiles,
            includeDatabase,
            includeConfig
          });
          break;
        case 'incremental':
          result = await this.createIncrementalBackup(tenantId, backupId, backupPath);
          break;
        case 'database':
          result = await this.backupDatabase(tenantId, backupId, backupPath);
          break;
        case 'files':
          result = await this.backupFiles(tenantId, backupId, backupPath);
          break;
        case 'config':
          result = await this.backupConfig(tenantId, backupId, backupPath);
          break;
        default:
          throw new Error(`Unknown backup type: ${backupType}`);
      }

      // Compress if enabled
      let finalPath = result.path;
      let compressedSize = result.size;

      if (compressionEnabled) {
        const compressed = await this.compressBackup(backupPath, backupId);
        finalPath = compressed.path;
        compressedSize = compressed.size;
      }

      // Encrypt if enabled
      if (encryptionEnabled) {
        const encrypted = await this.encryptionService.encryptFile(
          finalPath,
          tenantId,
          backupId
        );
        finalPath = encrypted.path;
      }

      // Calculate checksum
      const checksum = await this.integrityChecker.calculateChecksum(finalPath);

      // Update backup record
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await this.updateBackupRecord(backupId, {
        status: 'completed',
        size_bytes: result.size,
        compressed_size: compressedSize,
        file_count: result.fileCount || 0,
        checksum: checksum,
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
        storage_path: finalPath
      });

      // Verify backup integrity
      if (config.verify_on_create) {
        const verified = await this.integrityChecker.verifyBackup(backupId, finalPath, checksum);
        if (!verified) {
          logger.error(`[BackupService] Backup verification failed: ${backupId}`);
          await this.updateBackupRecord(backupId, { status: 'failed' });
          throw new Error('Backup verification failed');
        }
      }

      // Log success
      await this.logBackupOperation(tenantId, backupId, null, 'create', 'success', 
        `Backup created successfully (${this.formatBytes(result.size)})`, startTime);

      logger.info(`[BackupService] Backup created successfully: ${backupId} (${duration}s)`);

      return {
        success: true,
        backupId,
        size: result.size,
        compressedSize,
        duration,
        checksum
      };

    } catch (error) {
      logger.error(`[BackupService] Backup failed: ${error.message}`);
      
      // Update backup record as failed
      await this.updateBackupRecord(backupId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - startTime) / 1000)
      });

      // Log failure
      await this.logBackupOperation(tenantId, backupId, null, 'create', 'failed', 
        error.message, startTime);

      throw error;
    }
  }

  /**
   * Create full backup
   */
  async createFullBackup(tenantId, backupId, backupPath, options) {
    logger.info(`[BackupService] Creating full backup...`);

    let totalSize = 0;
    let fileCount = 0;

    const results = {
      files: null,
      database: null,
      config: null
    };

    // Backup files
    if (options.includeFiles) {
      results.files = await this.backupFiles(tenantId, backupId, path.join(backupPath, 'files'));
      totalSize += results.files.size;
      fileCount += results.files.fileCount;
    }

    // Backup database
    if (options.includeDatabase) {
      results.database = await this.backupDatabase(tenantId, backupId, path.join(backupPath, 'database'));
      totalSize += results.database.size;
      fileCount += results.database.fileCount;
    }

    // Backup configuration
    if (options.includeConfig) {
      results.config = await this.backupConfig(tenantId, backupId, path.join(backupPath, 'config'));
      totalSize += results.config.size;
      fileCount += results.config.fileCount;
    }

    return {
      path: backupPath,
      size: totalSize,
      fileCount: fileCount,
      results
    };
  }

  /**
   * Create incremental backup
   */
  async createIncrementalBackup(tenantId, backupId, backupPath) {
    logger.info(`[BackupService] Creating incremental backup...`);

    // Get last full backup
    const lastBackup = await this.getLastBackup(tenantId, 'full');
    if (!lastBackup) {
      throw new Error('No full backup found. Create a full backup first.');
    }

    // Find changed files since last backup
    const changedFiles = await this.findChangedFiles(tenantId, new Date(lastBackup.created_at));

    // Backup only changed files
    const result = await this.backupSpecificFiles(tenantId, backupId, backupPath, changedFiles);

    return result;
  }

  /**
   * Backup database
   */
  async backupDatabase(tenantId, backupId, backupPath) {
    logger.info(`[BackupService] Backing up database...`);

    await fs.mkdir(backupPath, { recursive: true });

    // Export database
    const dbPath = path.join(backupPath, 'database.db');
    
    // Get all tables
    const tables = await this.db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    let totalSize = 0;
    let exportedTables = [];

    for (const table of tables) {
      const tableName = table.name;
      const rows = await this.db.all(`SELECT * FROM ${tableName}`);
      
      const tableFile = path.join(backupPath, `${tableName}.json`);
      const data = JSON.stringify({ table: tableName, rows, count: rows.length }, null, 2);
      
      await fs.writeFile(tableFile, data);
      const stats = await fs.stat(tableFile);
      
      totalSize += stats.size;
      exportedTables.push(tableName);
    }

    // Write metadata
    const metadata = {
      backup_id: backupId,
      tenant_id: tenantId,
      tables: exportedTables,
      table_count: exportedTables.length,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(backupPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    logger.info(`[BackupService] Database backed up: ${exportedTables.length} tables`);

    return {
      path: backupPath,
      size: totalSize,
      fileCount: exportedTables.length + 1,
      tables: exportedTables
    };
  }

  /**
   * Backup files
   */
  async backupFiles(tenantId, backupId, backupPath) {
    logger.info(`[BackupService] Backing up files...`);

    await fs.mkdir(backupPath, { recursive: true });

    // Get files to backup (scan data directory)
    const dataDir = path.join(process.cwd(), 'data', tenantId);
    
    let totalSize = 0;
    let fileCount = 0;

    // Check if directory exists
    try {
      await fs.access(dataDir);
      
      // Copy files recursively
      const result = await this.copyDirectory(dataDir, backupPath);
      totalSize = result.size;
      fileCount = result.count;
      
    } catch (error) {
      logger.warn(`[BackupService] No data directory found for tenant ${tenantId}`);
    }

    return {
      path: backupPath,
      size: totalSize,
      fileCount: fileCount
    };
  }

  /**
   * Backup configuration
   */
  async backupConfig(tenantId, backupId, backupPath) {
    logger.info(`[BackupService] Backing up configuration...`);

    await fs.mkdir(backupPath, { recursive: true });

    // Get tenant configuration
    const config = await this.getConfig(tenantId);
    
    const configFile = path.join(backupPath, 'config.json');
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));

    const stats = await fs.stat(configFile);

    return {
      path: backupPath,
      size: stats.size,
      fileCount: 1
    };
  }

  /**
   * Compress backup
   */
  async compressBackup(sourcePath, backupId) {
    logger.info(`[BackupService] Compressing backup...`);

    const outputPath = `${sourcePath}.tar.gz`;
    const output = createWriteStream(outputPath);
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        const stats = await fs.stat(outputPath);
        logger.info(`[BackupService] Backup compressed: ${this.formatBytes(stats.size)}`);
        resolve({ path: outputPath, size: stats.size });
      });

      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Helper methods
   */

  async createBackupDirectory(tenantId, backupId) {
    const backupDir = path.join(process.cwd(), 'backups', tenantId, backupId);
    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
  }

  async createBackupRecord(backupId, tenantId, data) {
    const query = `
      INSERT INTO backups 
      (id, tenant_id, name, description, backup_type, status, storage_path,
       encryption_enabled, encryption_algorithm, started_at, created_by, retention_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      backupId, tenantId, data.name, data.description, data.backupType,
      data.status, data.storage_path, data.encryption_enabled, data.encryption_algorithm,
      data.started_at, data.created_by, data.retention_days
    ]);
  }

  async updateBackupRecord(backupId, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    
    const query = `UPDATE backups SET ${fields}, updated_at = ? WHERE id = ?`;
    await this.db.run(query, [...values, new Date().toISOString(), backupId]);
  }

  async getConfig(tenantId) {
    const query = 'SELECT * FROM backup_config WHERE tenant_id = ?';
    let config = await this.db.get(query, [tenantId]);

    if (!config) {
      config = await this.createDefaultConfig(tenantId);
    }

    return config;
  }

  async createDefaultConfig(tenantId) {
    const config = {
      id: crypto.randomBytes(16).toString('hex'),
      tenant_id: tenantId,
      enabled: 1,
      default_retention_days: 30,
      max_backup_size_mb: 10240,
      compression_enabled: 1,
      compression_level: 6,
      encryption_enabled: 1,
      encryption_algorithm: 'aes-256-gcm',
      storage_location: path.join(process.cwd(), 'backups', tenantId),
      verify_on_create: 1,
      auto_cleanup_enabled: 1,
      max_concurrent_backups: 2
    };

    const query = `
      INSERT INTO backup_config 
      (id, tenant_id, enabled, default_retention_days, max_backup_size_mb,
       compression_enabled, compression_level, encryption_enabled, encryption_algorithm,
       storage_location, verify_on_create, auto_cleanup_enabled, max_concurrent_backups)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      config.id, config.tenant_id, config.enabled, config.default_retention_days,
      config.max_backup_size_mb, config.compression_enabled, config.compression_level,
      config.encryption_enabled, config.encryption_algorithm, config.storage_location,
      config.verify_on_create, config.auto_cleanup_enabled, config.max_concurrent_backups
    ]);

    return config;
  }

  async getLastBackup(tenantId, backupType = null) {
    const query = backupType
      ? 'SELECT * FROM backups WHERE tenant_id = ? AND backup_type = ? AND status = "completed" ORDER BY created_at DESC LIMIT 1'
      : 'SELECT * FROM backups WHERE tenant_id = ? AND status = "completed" ORDER BY created_at DESC LIMIT 1';

    const params = backupType ? [tenantId, backupType] : [tenantId];
    return await this.db.get(query, params);
  }

  async findChangedFiles(tenantId, sinceDate) {
    // Simplified - would need more complex logic in production
    return [];
  }

  async backupSpecificFiles(tenantId, backupId, backupPath, files) {
    // Simplified backup of specific files
    return {
      path: backupPath,
      size: 0,
      fileCount: files.length
    };
  }

  async copyDirectory(source, destination) {
    let totalSize = 0;
    let fileCount = 0;

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        const result = await this.copyDirectory(srcPath, destPath);
        totalSize += result.size;
        fileCount += result.count;
      } else {
        await fs.copyFile(srcPath, destPath);
        const stats = await fs.stat(destPath);
        totalSize += stats.size;
        fileCount++;
      }
    }

    return { size: totalSize, count: fileCount };
  }

  async logBackupOperation(tenantId, backupId, scheduleId, operation, status, message, startTime) {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    
    const query = `
      INSERT INTO backup_logs 
      (id, tenant_id, backup_id, schedule_id, operation, status, message, started_at, completed_at, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.run(query, [
      crypto.randomBytes(16).toString('hex'),
      tenantId,
      backupId,
      scheduleId,
      operation,
      status,
      message,
      new Date(startTime).toISOString(),
      new Date().toISOString(),
      duration
    ]);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = BackupService;
