/**
 * Audit Logger Service
 * Tracks user actions, security events, and system changes
 */

class AuditLogger {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.auditLogs = [];
    this.maxLogs = 10000; // Keep last 10k audit logs in memory
    this.retentionDays = 90;
  }

  /**
   * Log an audit event
   */
  async log(event) {
    try {
      const auditEntry = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        userId: event.userId || null,
        username: event.username || 'system',
        action: event.action,
        resource: event.resource || null,
        details: event.details || {},
        ip: event.ip || null,
        userAgent: event.userAgent || null,
        status: event.status || 'success',
        severity: event.severity || 'info'
      };

      this.auditLogs.push(auditEntry);

      // Trim if exceeded max
      if (this.auditLogs.length > this.maxLogs) {
        this.auditLogs = this.auditLogs.slice(-this.maxLogs);
      }

      this.logger?.info(`Audit: ${auditEntry.username} - ${auditEntry.action} - ${auditEntry.status}`);

      return auditEntry;
    } catch (error) {
      this.logger?.error(`Error logging audit event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getLogs(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        userId = null,
        username = null,
        action = null,
        resource = null,
        status = null,
        severity = null,
        startDate = null,
        endDate = null
      } = options;

      let logs = [...this.auditLogs];

      // Apply filters
      if (userId) {
        logs = logs.filter(l => l.userId === userId);
      }

      if (username) {
        logs = logs.filter(l => l.username.toLowerCase().includes(username.toLowerCase()));
      }

      if (action) {
        logs = logs.filter(l => l.action.toLowerCase().includes(action.toLowerCase()));
      }

      if (resource) {
        logs = logs.filter(l => l.resource && l.resource.toLowerCase().includes(resource.toLowerCase()));
      }

      if (status) {
        logs = logs.filter(l => l.status === status);
      }

      if (severity) {
        logs = logs.filter(l => l.severity === severity);
      }

      if (startDate) {
        logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
      }

      if (endDate) {
        logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
      }

      // Sort by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Pagination
      const total = logs.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedLogs = logs.slice(offset, offset + limit);

      return {
        logs: paginatedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      this.logger?.error(`Error getting audit logs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(days = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const recentLogs = this.auditLogs.filter(l => 
        new Date(l.timestamp) >= cutoffDate
      );

      const stats = {
        total: this.auditLogs.length,
        recent: recentLogs.length,
        period: `${days} days`,
        byAction: {},
        byUser: {},
        bySeverity: {
          info: 0,
          warning: 0,
          error: 0,
          critical: 0
        },
        byStatus: {
          success: 0,
          failure: 0,
          error: 0
        },
        topUsers: [],
        topActions: []
      };

      // Count by action
      for (const log of recentLogs) {
        stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
        
        if (log.username !== 'system') {
          stats.byUser[log.username] = (stats.byUser[log.username] || 0) + 1;
        }

        if (stats.bySeverity[log.severity] !== undefined) {
          stats.bySeverity[log.severity]++;
        }

        if (stats.byStatus[log.status] !== undefined) {
          stats.byStatus[log.status]++;
        }
      }

      // Top users
      stats.topUsers = Object.entries(stats.byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([username, count]) => ({ username, count }));

      // Top actions
      stats.topActions = Object.entries(stats.byAction)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

      return stats;
    } catch (error) {
      this.logger?.error(`Error getting audit stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent security events
   */
  async getSecurityEvents(limit = 50) {
    try {
      const securityActions = [
        'login',
        'logout',
        'failed_login',
        'password_change',
        'user_created',
        'user_deleted',
        'role_changed',
        'permission_denied',
        'suspicious_activity'
      ];

      const securityLogs = this.auditLogs
        .filter(l => securityActions.includes(l.action))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);

      return {
        count: securityLogs.length,
        events: securityLogs
      };
    } catch (error) {
      this.logger?.error(`Error getting security events: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean old audit logs
   */
  async cleanOldLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const beforeCount = this.auditLogs.length;
      this.auditLogs = this.auditLogs.filter(l => 
        new Date(l.timestamp) >= cutoffDate
      );
      const afterCount = this.auditLogs.length;
      const removed = beforeCount - afterCount;

      this.logger?.info(`Cleaned ${removed} old audit logs (retention: ${this.retentionDays} days)`);

      return {
        removed,
        remaining: afterCount
      };
    } catch (error) {
      this.logger?.error(`Error cleaning audit logs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(options = {}) {
    try {
      const { format = 'json', startDate = null, endDate = null } = options;

      let logs = [...this.auditLogs];

      // Apply date filters
      if (startDate) {
        logs = logs.filter(l => new Date(l.timestamp) >= new Date(startDate));
      }

      if (endDate) {
        logs = logs.filter(l => new Date(l.timestamp) <= new Date(endDate));
      }

      if (format === 'json') {
        return {
          format: 'json',
          count: logs.length,
          data: JSON.stringify(logs, null, 2)
        };
      } else if (format === 'csv') {
        // Convert to CSV
        const headers = ['timestamp', 'username', 'action', 'resource', 'status', 'severity', 'ip'];
        const csv = [
          headers.join(','),
          ...logs.map(log => 
            headers.map(h => JSON.stringify(log[h] || '')).join(',')
          )
        ].join('\n');

        return {
          format: 'csv',
          count: logs.length,
          data: csv
        };
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }
    } catch (error) {
      this.logger?.error(`Error exporting audit logs: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AuditLogger;
