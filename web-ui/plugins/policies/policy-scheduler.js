/**
 * Policy Scheduler Service
 * 
 * Schedules and triggers policy executions using cron
 */

const cron = require('node-cron');

class PolicyScheduler {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.scheduledJobs = new Map();
    this.masterScheduler = null;
  }

  /**
   * Initialize scheduler
   */
  async init() {
    this.logger?.info('[PolicyScheduler] Initializing scheduler...');

    // Start master scheduler that checks every minute
    this.masterScheduler = cron.schedule('* * * * *', async () => {
      await this.checkAndExecutePolicies();
    });

    this.logger?.info('[PolicyScheduler] ✅ Scheduler initialized (checking every minute)');
  }

  /**
   * Check for policies that need to run and execute them
   */
  async checkAndExecutePolicies() {
    try {
      const policyManager = this.core.getService('policy-manager');
      const policyExecutor = this.core.getService('policy-executor');

      if (!policyManager || !policyExecutor) {
        return;
      }

      // Get all scheduled policies
      const policies = await policyManager.getScheduledPolicies();

      const now = new Date();

      for (const policy of policies) {
        if (this.shouldExecute(policy, now)) {
          try {
            // Execute policy
            await policyExecutor.executePolicy(policy, {
              id: 'scheduler',
              tenantId: policy.tenant_id
            });

            this.logger?.info(`[PolicyScheduler] Auto-executed policy: ${policy.name}`);

          } catch (error) {
            this.logger?.error(`[PolicyScheduler] Error executing policy ${policy.name}:`, error);
          }
        }
      }

    } catch (error) {
      this.logger?.error('[PolicyScheduler] Error checking policies:', error);
    }
  }

  /**
   * Determine if a policy should execute now
   */
  shouldExecute(policy, now) {
    if (!policy.schedule || !policy.schedule_enabled) {
      return false;
    }

    try {
      // Parse cron expression
      const task = cron.schedule(policy.schedule, () => {}, {
        scheduled: false
      });

      // Check if current time matches the cron schedule
      // This is a simplified check - node-cron doesn't expose a "shouldRun" method
      // In production, you'd want to track last execution time and compare
      
      // For now, we'll use a simple time-based check
      // Get last execution from database
      return this.checkLastExecution(policy, now);

    } catch (error) {
      this.logger?.error(`[PolicyScheduler] Invalid cron expression for policy ${policy.name}:`, error);
      return false;
    }
  }

  /**
   * Check if policy should run based on last execution
   */
  async checkLastExecution(policy, now) {
    try {
      const db = this.core.db;
      
      // Get last execution
      const lastExecution = await db.get(
        `SELECT start_time FROM policy_executions 
         WHERE policy_id = ? AND status IN ('completed', 'failed')
         ORDER BY start_time DESC LIMIT 1`,
        [policy.id]
      );

      if (!lastExecution) {
        // Never executed, should run
        return true;
      }

      const lastRun = new Date(lastExecution.start_time);
      const timeSinceLastRun = now - lastRun;

      // Parse schedule to determine minimum interval
      const interval = this.parseScheduleInterval(policy.schedule);
      
      // Should run if enough time has passed
      return timeSinceLastRun >= interval;

    } catch (error) {
      this.logger?.error('[PolicyScheduler] Error checking last execution:', error);
      return false;
    }
  }

  /**
   * Parse cron schedule to milliseconds
   */
  parseScheduleInterval(schedule) {
    // Simple parsing - in production, use a proper cron parser
    // This is a basic implementation
    
    const parts = schedule.split(' ');
    
    // Daily: 0 2 * * * = 24 hours
    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
      return 24 * 60 * 60 * 1000; // 24 hours
    }
    
    // Weekly: 0 2 * * 0 = 7 days
    if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    }
    
    // Monthly: 0 2 1 * * = 30 days
    if (parts[2] !== '*' && parts[3] === '*' && parts[4] === '*') {
      return 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    
    // Hourly: 0 * * * *
    if (parts[1] === '*') {
      return 60 * 60 * 1000; // 1 hour
    }
    
    // Default to daily
    return 24 * 60 * 60 * 1000;
  }

  /**
   * Update schedule for a policy
   */
  async updateSchedule(policyId, tenantId, schedule, enabled) {
    const policyManager = this.core.getService('policy-manager');
    
    if (!policyManager) {
      throw new Error('PolicyManager service not available');
    }

    // Validate cron expression
    if (schedule && !cron.validate(schedule)) {
      throw new Error('Invalid cron expression');
    }

    // Update policy
    await policyManager.updatePolicy(policyId, tenantId, {
      schedule,
      scheduleEnabled: enabled
    });

    this.logger?.info(`[PolicyScheduler] Updated schedule for policy ${policyId}`);
  }

  /**
   * Get schedule info for a policy
   */
  getScheduleInfo(cronExpression) {
    if (!cronExpression || !cron.validate(cronExpression)) {
      return null;
    }

    // Parse and describe the schedule
    const parts = cronExpression.split(' ');
    
    return {
      expression: cronExpression,
      valid: true,
      description: this.describeCron(cronExpression),
      nextRun: this.getNextRun(cronExpression)
    };
  }

  /**
   * Describe cron expression in human-readable format
   */
  describeCron(cronExpression) {
    const parts = cronExpression.split(' ');
    
    // Common patterns
    if (cronExpression === '0 2 * * *') return 'Daily at 2:00 AM';
    if (cronExpression === '0 2 * * 0') return 'Weekly on Sunday at 2:00 AM';
    if (cronExpression === '0 2 1 * *') return 'Monthly on the 1st at 2:00 AM';
    if (cronExpression === '0 2 1 */3 *') return 'Quarterly on the 1st at 2:00 AM';
    if (cronExpression === '0 * * * *') return 'Every hour';
    if (cronExpression === '*/30 * * * *') return 'Every 30 minutes';
    
    return 'Custom schedule: ' + cronExpression;
  }

  /**
   * Get next run time for a cron expression
   */
  getNextRun(cronExpression) {
    // This would require a cron parser library for accurate results
    // For now, return approximate next run based on current time
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    
    return tomorrow.toISOString();
  }

  /**
   * List all scheduled policies
   */
  async listScheduledPolicies() {
    const policyManager = this.core.getService('policy-manager');
    
    if (!policyManager) {
      return [];
    }

    return policyManager.getScheduledPolicies();
  }

  /**
   * Get scheduler statistics
   */
  getStatistics() {
    return {
      masterSchedulerActive: this.masterScheduler ? true : false,
      scheduledPoliciesCount: this.scheduledJobs.size,
      checkInterval: '1 minute'
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.masterScheduler) {
      this.masterScheduler.stop();
    }

    this.scheduledJobs.forEach(job => job.stop());
    this.scheduledJobs.clear();

    this.logger?.info('[PolicyScheduler] Cleanup complete');
  }
}

module.exports = PolicyScheduler;
