/**
 * Schedule Manager Service
 * Manages scheduled report generation
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../shared/logger');
const cron = require('node-cron');

class ScheduleManager {
  constructor(db, reportGenerator, notificationManager = null) {
    this.db = db;
    this.reportGenerator = reportGenerator;
    this.notificationManager = notificationManager;
    this.logger = logger;
    this.schedules = new Map(); // Active cron jobs
  }

  /**
   * Initialize database and start existing schedules
   */
  async init() {
    this.logger.info('[ScheduleManager] Initializing...');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        report_config TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        last_run DATETIME,
        next_run DATETIME,
        notification_channels TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON report_schedules(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON report_schedules(enabled);
    `);

    // Load and start active schedules
    await this.loadActiveSchedules();

    this.logger.info('[ScheduleManager] ✅ Initialized');
  }

  /**
   * Load and start all active schedules
   */
  async loadActiveSchedules() {
    const schedules = await this.db.all(
      'SELECT * FROM report_schedules WHERE enabled = 1'
    );

    for (const schedule of schedules) {
      try {
        await this.startSchedule(schedule);
      } catch (error) {
        this.logger.error(`[ScheduleManager] Error starting schedule ${schedule.id}:`, error);
      }
    }

    this.logger.info(`[ScheduleManager] Loaded ${schedules.length} active schedules`);
  }

  /**
   * Create a new schedule
   */
  async createSchedule(tenantId, scheduleData) {
    const scheduleId = uuidv4();
    const {
      name,
      description = '',
      reportConfig,
      cronExpression,
      enabled = true,
      notificationChannels = []
    } = scheduleData;

    // Validate required fields
    if (!name || !reportConfig || !cronExpression) {
      throw new Error('Name, report config, and cron expression are required');
    }

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    // Calculate next run time
    const nextRun = this.getNextRunTime(cronExpression);

    await this.db.run(`
      INSERT INTO report_schedules (
        id, tenant_id, name, description, report_config, cron_expression,
        enabled, next_run, notification_channels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      scheduleId, tenantId, name, description,
      JSON.stringify(reportConfig), cronExpression, enabled ? 1 : 0,
      nextRun, JSON.stringify(notificationChannels)
    ]);

    this.logger.info(`[ScheduleManager] Created schedule: ${name}`);

    // Start the schedule if enabled
    if (enabled) {
      const schedule = await this.getSchedule(tenantId, scheduleId);
      await this.startSchedule(schedule);
    }

    return { id: scheduleId, name, cronExpression, enabled, nextRun };
  }

  /**
   * Start a schedule
   */
  async startSchedule(schedule) {
    if (this.schedules.has(schedule.id)) {
      // Already running
      return;
    }

    const task = cron.schedule(schedule.cron_expression, async () => {
      await this.executeSchedule(schedule);
    });

    this.schedules.set(schedule.id, task);
    
    this.logger.info(`[ScheduleManager] Started schedule: ${schedule.name} (${schedule.cron_expression})`);
  }

  /**
   * Execute a scheduled report
   */
  async executeSchedule(schedule) {
    const tenantId = schedule.tenant_id;
    const reportConfig = JSON.parse(schedule.report_config);

    try {
      this.logger.info(`[ScheduleManager] Executing schedule: ${schedule.name}`);

      // Generate report
      const report = await this.reportGenerator.generateReport(tenantId, {
        ...reportConfig,
        name: `${reportConfig.name} - ${new Date().toISOString()}`,
        generatedBy: 'schedule'
      });

      // Send notifications if configured
      if (this.notificationManager && schedule.notification_channels) {
        const channels = JSON.parse(schedule.notification_channels);
        
        if (channels.length > 0) {
          await this.notificationManager.sendNotification(tenantId, {
            channel_ids: channels,
            subject: `Scheduled Report: ${schedule.name}`,
            message: `Report "${report.name}" has been generated successfully.`,
            priority: 'medium',
            metadata: {
              report_id: report.id,
              schedule_id: schedule.id
            }
          });
        }
      }

      // Update last_run and next_run
      const nextRun = this.getNextRunTime(schedule.cron_expression);
      
      await this.db.run(`
        UPDATE report_schedules
        SET last_run = CURRENT_TIMESTAMP, next_run = ?
        WHERE id = ?
      `, [nextRun, schedule.id]);

      this.logger.info(`[ScheduleManager] Schedule executed successfully: ${schedule.name}`);
    } catch (error) {
      this.logger.error(`[ScheduleManager] Error executing schedule ${schedule.name}:`, error);
    }
  }

  /**
   * Get next run time from cron expression
   */
  getNextRunTime(cronExpression) {
    // Simple calculation - actual cron library handles this
    // This is a placeholder that returns next hour
    const next = new Date();
    next.setHours(next.getHours() + 1);
    return next.toISOString();
  }

  /**
   * List schedules
   */
  async listSchedules(tenantId) {
    const schedules = await this.db.all(
      'SELECT * FROM report_schedules WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );

    return schedules.map(s => ({
      ...s,
      report_config: JSON.parse(s.report_config),
      notification_channels: s.notification_channels ? JSON.parse(s.notification_channels) : []
    }));
  }

  /**
   * Get single schedule
   */
  async getSchedule(tenantId, scheduleId) {
    const schedule = await this.db.get(
      'SELECT * FROM report_schedules WHERE id = ? AND tenant_id = ?',
      [scheduleId, tenantId]
    );

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    return schedule;
  }

  /**
   * Update schedule
   */
  async updateSchedule(tenantId, scheduleId, updates) {
    const schedule = await this.getSchedule(tenantId, scheduleId);

    const {
      name,
      description,
      reportConfig,
      cronExpression,
      enabled,
      notificationChannels
    } = updates;

    // Validate cron expression if provided
    if (cronExpression && !cron.validate(cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    // Stop existing schedule if running
    if (this.schedules.has(scheduleId)) {
      this.schedules.get(scheduleId).stop();
      this.schedules.delete(scheduleId);
    }

    // Update database
    await this.db.run(`
      UPDATE report_schedules
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          report_config = COALESCE(?, report_config),
          cron_expression = COALESCE(?, cron_expression),
          enabled = COALESCE(?, enabled),
          notification_channels = COALESCE(?, notification_channels),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [
      name,
      description,
      reportConfig ? JSON.stringify(reportConfig) : null,
      cronExpression,
      enabled !== undefined ? (enabled ? 1 : 0) : null,
      notificationChannels ? JSON.stringify(notificationChannels) : null,
      scheduleId,
      tenantId
    ]);

    // Restart schedule if enabled
    if (enabled !== false) {
      const updatedSchedule = await this.getSchedule(tenantId, scheduleId);
      if (updatedSchedule.enabled) {
        await this.startSchedule(updatedSchedule);
      }
    }

    this.logger.info(`[ScheduleManager] Updated schedule: ${scheduleId}`);

    return { id: scheduleId, ...updates };
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(tenantId, scheduleId) {
    // Stop schedule if running
    if (this.schedules.has(scheduleId)) {
      this.schedules.get(scheduleId).stop();
      this.schedules.delete(scheduleId);
    }

    await this.db.run(
      'DELETE FROM report_schedules WHERE id = ? AND tenant_id = ?',
      [scheduleId, tenantId]
    );

    this.logger.info(`[ScheduleManager] Deleted schedule: ${scheduleId}`);
  }

  /**
   * Stop all schedules
   */
  async stopAllSchedules() {
    for (const [id, task] of this.schedules) {
      task.stop();
      this.logger.debug(`[ScheduleManager] Stopped schedule: ${id}`);
    }
    
    this.schedules.clear();
    this.logger.info('[ScheduleManager] All schedules stopped');
  }
}

module.exports = ScheduleManager;
