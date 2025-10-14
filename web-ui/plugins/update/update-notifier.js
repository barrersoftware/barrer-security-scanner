/**
 * Update Notifier
 * Integration with notifications plugin for update alerts
 */

const { logger } = require('../../shared/logger');

class UpdateNotifier {
  constructor(io, notificationPlugin) {
    this.io = io;
    this.notificationPlugin = notificationPlugin;
    this.enabled = true;
  }

  async init() {
    logger.info('[UpdateNotifier] Initializing...');
    
    // Check if notifications plugin is available
    if (!this.notificationPlugin) {
      logger.warn('[UpdateNotifier] Notifications plugin not available, notifications disabled');
      this.enabled = false;
    }
    
    logger.info('[UpdateNotifier] ✅ Initialized');
  }

  /**
   * Notify about available updates
   */
  async notifyUpdatesAvailable(tenantId, updateInfo) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying updates available for tenant: ${tenantId}`);

      const message = this.formatUpdatesAvailableMessage(updateInfo);

      // Send notification through notifications plugin
      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'update_available',
          priority: updateInfo.criticalCount > 0 ? 'high' : 'normal',
          title: 'Updates Available',
          message: message,
          data: updateInfo
        });
      }

      // Send WebSocket notification
      this.sendWebSocketNotification(tenantId, {
        type: 'updates_available',
        data: updateInfo,
        message: message
      });

      logger.info(`[UpdateNotifier] Notification sent: ${updateInfo.count} updates available`);

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Notify update started
   */
  async notifyUpdateStarted(tenantId, updateInfo) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying update started for tenant: ${tenantId}`);

      const message = `Update installation started: ${updateInfo.packageCount || 1} package(s)`;

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'update_started',
          priority: 'normal',
          title: 'Update Started',
          message: message,
          data: updateInfo
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'update_started',
        data: updateInfo,
        message: message
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Notify update progress
   */
  async notifyUpdateProgress(tenantId, progress) {
    if (!this.enabled) return;

    try {
      // Only send WebSocket for progress (too frequent for notifications plugin)
      this.sendWebSocketNotification(tenantId, {
        type: 'update_progress',
        data: progress
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending progress: ${error.message}`);
    }
  }

  /**
   * Notify update completed
   */
  async notifyUpdateCompleted(tenantId, result) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying update completed for tenant: ${tenantId}`);

      const message = this.formatUpdateCompletedMessage(result);
      const priority = result.rebootRequired ? 'high' : 'normal';

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'update_completed',
          priority: priority,
          title: 'Update Completed',
          message: message,
          data: result
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'update_completed',
        data: result,
        message: message
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Notify update failed
   */
  async notifyUpdateFailed(tenantId, error) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying update failed for tenant: ${tenantId}`);

      const message = `Update failed: ${error.message || 'Unknown error'}`;

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'update_failed',
          priority: 'high',
          title: 'Update Failed',
          message: message,
          data: { error: error.message }
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'update_failed',
        data: { error: error.message },
        message: message
      });

    } catch (notifyError) {
      logger.error(`[UpdateNotifier] Error sending notification: ${notifyError.message}`);
    }
  }

  /**
   * Notify rollback started
   */
  async notifyRollbackStarted(tenantId, updateId) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying rollback started for tenant: ${tenantId}`);

      const message = `Rolling back update: ${updateId}`;

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'rollback_started',
          priority: 'high',
          title: 'Rollback Started',
          message: message,
          data: { updateId }
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'rollback_started',
        data: { updateId },
        message: message
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Notify rollback completed
   */
  async notifyRollbackCompleted(tenantId, result) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying rollback completed for tenant: ${tenantId}`);

      const message = result.success 
        ? 'Rollback completed successfully' 
        : 'Rollback failed';

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'rollback_completed',
          priority: 'high',
          title: result.success ? 'Rollback Successful' : 'Rollback Failed',
          message: message,
          data: result
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'rollback_completed',
        data: result,
        message: message
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Notify reboot required
   */
  async notifyRebootRequired(tenantId, info) {
    if (!this.enabled) return;

    try {
      logger.info(`[UpdateNotifier] Notifying reboot required for tenant: ${tenantId}`);

      const message = info.scheduled 
        ? `System reboot scheduled in ${info.delayMinutes} minutes` 
        : 'System reboot required to complete updates';

      if (this.notificationPlugin && this.notificationPlugin.send) {
        await this.notificationPlugin.send({
          tenantId,
          type: 'reboot_required',
          priority: 'high',
          title: 'Reboot Required',
          message: message,
          data: info
        });
      }

      this.sendWebSocketNotification(tenantId, {
        type: 'reboot_required',
        data: info,
        message: message
      });

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending notification: ${error.message}`);
    }
  }

  /**
   * Send WebSocket notification
   */
  sendWebSocketNotification(tenantId, notification) {
    if (!this.io) return;

    try {
      // Send to specific tenant room
      this.io.to(`tenant-${tenantId}`).emit('update-notification', {
        ...notification,
        timestamp: new Date().toISOString()
      });

      logger.info(`[UpdateNotifier] WebSocket notification sent to tenant: ${tenantId}`);

    } catch (error) {
      logger.error(`[UpdateNotifier] Error sending WebSocket: ${error.message}`);
    }
  }

  /**
   * Format updates available message
   */
  formatUpdatesAvailableMessage(updateInfo) {
    const { count, criticalCount, securityCount, manager } = updateInfo;
    
    let message = `${count} update(s) available`;
    
    if (manager) {
      message += ` for ${manager}`;
    }
    
    const important = [];
    if (criticalCount > 0) important.push(`${criticalCount} critical`);
    if (securityCount > 0) important.push(`${securityCount} security`);
    
    if (important.length > 0) {
      message += ` (${important.join(', ')})`;
    }
    
    return message;
  }

  /**
   * Format update completed message
   */
  formatUpdateCompletedMessage(result) {
    const { installed, failed, rebootRequired } = result;
    
    let message = `Updates completed: ${installed} installed`;
    
    if (failed > 0) {
      message += `, ${failed} failed`;
    }
    
    if (rebootRequired) {
      message += '. Reboot required.';
    }
    
    return message;
  }

  /**
   * Enable/disable notifications
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`[UpdateNotifier] Notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

module.exports = UpdateNotifier;
