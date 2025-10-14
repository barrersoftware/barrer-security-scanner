/**
 * Schedule Manager
 * Automated backup scheduling and management
 */

const crypto = require('crypto');
const { logger } = require('../../shared/logger');

class ScheduleManager {
  constructor(db, backupService) {
    this.db = db;
    this.backupService = backupService;
    this.scheduledJobs = new Map();
    this.intervals = new Map();
  }

  async init() {
    logger.info('[ScheduleManager] Initializing...');
    
    // Load and start all enabled schedules
    await this.loadSchedules();
    
    logger.info(`[ScheduleManager] Loaded ${this.scheduledJobs.size} active schedules`);
    logger.info('[ScheduleManager] ✅ Initialized');
  }

  /**
   * Load all schedules from database
   */
  async loadSchedules() {
    try {
      const query = 'SELECT * FROM backup_schedules WHERE enabled = 1';
      const schedules = await this.db.all(query);

      for (const schedule of schedules) {
        await this.startSchedule(schedule);
      }

    } catch (error) {
      logger.error(`[ScheduleManager] Failed to load schedules: ${error.message}`);
    }
  }

  /**
   * Create backup schedule
   */
  async createSchedule(tenantId, options = {}) {
    try {
      const {
        name = `Schedule ${Date.now()}`,
        description = '',
        backupType = 'full',
        scheduleType = 'daily',
        cronExpression = null,
        intervalMinutes = null,
        retentionDays = 30,
        maxBackups = 10,
        encryptionEnabled = true,
        compressionEnabled = true,
        includeFiles = true,
        includeDatabase = true,
        includeConfig = true,
        storageLocation = 'local',
        notifyOnSuccess = false,
        notifyOnFailure = true,
        createdBy = 'system'
      } = options;

      const scheduleId = crypto.randomBytes(16).toString('hex');

      // Calculate next run time
      const nextRunAt = this.calculateNextRun(scheduleType, cronExpression, intervalMinutes);

      const query = `
        INSERT INTO backup_schedules 
        (id, tenant_id, name, description, enabled, backup_type, schedule_type,
         cron_expression, interval_minutes, retention_days, max_backups,
         encryption_enabled, compression_enabled, include_files, include_database,
         include_config, storage_location, notify_on_success, notify_on_failure,
         next_run_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db.run(query, [
        scheduleId, tenantId, name, description, 1, backupType, scheduleType,
        cronExpression, intervalMinutes, retentionDays, maxBackups,
        encryptionEnabled ? 1 : 0, compressionEnabled ? 1 : 0,
        includeFiles ? 1 : 0, includeDatabase ? 1 : 0, includeConfig ? 1 : 0,
        storageLocation, notifyOnSuccess ? 1 : 0, notifyOnFailure ? 1 : 0,
        nextRunAt.toISOString(), createdBy
      ]);

      // Start the schedule
      const schedule = await this.getSchedule(scheduleId);
      await this.startSchedule(schedule);

      logger.info(`[ScheduleManager] Created schedule: ${scheduleId} (${scheduleType})`);

      return {
        success: true,
        scheduleId,
        nextRunAt
      };

    } catch (error) {
      logger.error(`[ScheduleManager] Failed to create schedule: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start a schedule
   */
  async startSchedule(schedule) {
    try {
      if (this.scheduledJobs.has(schedule.id)) {
        logger.warn(`[ScheduleManager] Schedule ${schedule.id} already running`);
        return;
      }

      // Calculate interval in milliseconds
      let intervalMs;
      
      switch (schedule.schedule_type) {
        case 'hourly':
          intervalMs = 3600000; // 1 hour
          break;
        case 'daily':
          intervalMs = 86400000; // 24 hours
          break;
        case 'weekly':
          intervalMs = 604800000; // 7 days
          break;
        case 'monthly':
          intervalMs = 2592000000; // 30 days
          break;
        case 'interval':
          intervalMs = schedule.interval_minutes * 60000;
          break;
        default:
          logger.warn(`[ScheduleManager] Unknown schedule type: ${schedule.schedule_type}`);
          return;
      }

      // Check if should run now
      const now = new Date();
      const nextRun = new Date(schedule.next_run_at);
      
      if (nextRun <= now) {
        // Run immediately
        await this.executeScheduledBackup(schedule);
      }

      // Set up interval
      const interval = setInterval(async () => {
        await this.executeScheduledBackup(schedule);
      }, intervalMs);

      this.intervals.set(schedule.id, interval);
      this.scheduledJobs.set(schedule.id, schedule);

      logger.info(`[ScheduleManager] Started schedule: ${schedule.id} (every ${intervalMs / 1000}s)`);

    } catch (error) {
      logger.error(`[ScheduleManager] Failed to start schedule: ${error.message}`);
    }
  }

  /**
   * Stop a schedule
   */
  stopSchedule(scheduleId) {
    const interval = this.intervals.get(scheduleId);
    
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(scheduleId);
      this.scheduledJobs.delete(scheduleId);
      
      logger.info(`[ScheduleManager] Stopped schedule: ${scheduleId}`);
    }
  }

  /**
   * Execute scheduled backup
   */
  async executeScheduledBackup(schedule) {
    try {
      logger.info(`[ScheduleManager] Executing scheduled backup: ${schedule.name}`);

      const startTime = Date.now();

      // Run backup
      const result = await this.backupService.createBackup(schedule.tenant_id, {
        name: `${schedule.name}_${Date.now()}`,
        description: `Scheduled backup (${schedule.schedule_type})`,
        backupType: schedule.backup_type,
        includeFiles: schedule.include_files === 1,
        includeDatabase: schedule.include_database === 1,
        includeConfig: schedule.include_config === 1,
        encryptionEnabled: schedule.encryption_enabled === 1,
        compressionEnabled: schedule.compression_enabled === 1,
        createdBy: 'scheduler'
      });

      // Update schedule
      const nextRunAt = this.calculateNextRun(
        schedule.schedule_type,
        schedule.cron_expression,
        schedule.interval_minutes
      );

      await this.updateSchedule(schedule.id, {
        last_run_at: new Date().toISOString(),
        last_run_status: 'success',
        next_run_at: nextRunAt.toISOString()
      });

      // Clean up old backups if max exceeded
      await this.cleanupOldBackups(schedule.tenant_id, schedule.max_backups);

      // Notify if enabled
      if (schedule.notify_on_success) {
        // TODO: Send notification
        logger.info(`[ScheduleManager] Backup completed successfully: ${result.backupId}`);
      }

      logger.info(`[ScheduleManager] Scheduled backup completed: ${result.backupId}`);

    } catch (error) {
      logger.error(`[ScheduleManager] Scheduled backup failed: ${error.message}`);

      // Update schedule with failure
      await this.updateSchedule(schedule.id, {
        last_run_at: new Date().toISOString(),
        last_run_status: 'failed'
      });

      // Notify if enabled
      if (schedule.notify_on_failure) {
        // TODO: Send notification
        logger.error(`[ScheduleManager] Backup failed: ${error.message}`);
      }
    }
  }

  /**
   * Calculate next run time
   */
  calculateNextRun(scheduleType, cronExpression, intervalMinutes) {
    const now = new Date();

    switch (scheduleType) {
      case 'once':
        return now;
      
      case 'hourly':
        return new Date(now.getTime() + 3600000);
      
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0); // 2 AM
        return tomorrow;
      
      case 'weekly':
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(2, 0, 0, 0);
        return nextWeek;
      
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(2, 0, 0, 0);
        return nextMonth;
      
      case 'interval':
        return new Date(now.getTime() + (intervalMinutes * 60000));
      
      case 'cron':
        // Simplified cron parsing - would use a library in production
        return new Date(now.getTime() + 3600000);
      
      default:
        return now;
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupOldBackups(tenantId, maxBackups) {
    try {
      // Get backup count
      const countQuery = 'SELECT COUNT(*) as count FROM backups WHERE tenant_id = ? AND status = "completed"';
      const result = await this.db.get(countQuery, [tenantId]);

      if (result.count > maxBackups) {
        // Delete oldest backups
        const deleteCount = result.count - maxBackups;
        
        const deleteQuery = `
          DELETE FROM backups 
          WHERE id IN (
            SELECT id FROM backups 
            WHERE tenant_id = ? AND status = "completed"
            ORDER BY created_at ASC 
            LIMIT ?
          )
        `;

        await this.db.run(deleteQuery, [tenantId, deleteCount]);

        logger.info(`[ScheduleManager] Cleaned up ${deleteCount} old backups`);
      }

    } catch (error) {
      logger.error(`[ScheduleManager] Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Get schedule
   */
  async getSchedule(scheduleId) {
    const query = 'SELECT * FROM backup_schedules WHERE id = ?';
    return await this.db.get(query, [scheduleId]);
  }

  /**
   * Update schedule
   */
  async updateSchedule(scheduleId, updates) {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    const query = `UPDATE backup_schedules SET ${fields}, updated_at = ? WHERE id = ?`;
    await this.db.run(query, [...values, new Date().toISOString(), scheduleId]);
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(scheduleId) {
    // Stop the schedule
    this.stopSchedule(scheduleId);

    // Delete from database
    const query = 'DELETE FROM backup_schedules WHERE id = ?';
    await this.db.run(query, [scheduleId]);

    logger.info(`[ScheduleManager] Deleted schedule: ${scheduleId}`);
  }

  /**
   * Get all schedules for tenant
   */
  async getSchedules(tenantId) {
    const query = 'SELECT * FROM backup_schedules WHERE tenant_id = ? ORDER BY created_at DESC';
    return await this.db.all(query, [tenantId]);
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    // Stop all intervals
    for (const [scheduleId, interval] of this.intervals.entries()) {
      clearInterval(interval);
      logger.info(`[ScheduleManager] Stopped schedule: ${scheduleId}`);
    }

    this.intervals.clear();
    this.scheduledJobs.clear();

    logger.info('[ScheduleManager] Cleanup complete');
  }
}

module.exports = ScheduleManager;
