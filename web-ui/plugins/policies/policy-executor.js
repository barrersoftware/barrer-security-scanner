/**
 * Policy Executor Service
 * 
 * Executes policies and captures results
 */

const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class PolicyExecutor {
  constructor(core) {
    this.core = core;
    this.db = core.db;
    this.logger = core.getService('logger');
    this.activeExecutions = new Map();
  }

  /**
   * Initialize database tables
   */
  async init() {
    this.logger?.info('[PolicyExecutor] Creating database tables...');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS policy_executions (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        status TEXT,
        start_time DATETIME,
        end_time DATETIME,
        duration INTEGER,
        score INTEGER,
        passed INTEGER,
        failed INTEGER,
        warnings INTEGER,
        output TEXT,
        report_path TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_executions_policy ON policy_executions(policy_id);
      CREATE INDEX IF NOT EXISTS idx_executions_tenant ON policy_executions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON policy_executions(status);
      CREATE INDEX IF NOT EXISTS idx_executions_created ON policy_executions(created_at);
    `);

    this.logger?.info('[PolicyExecutor] ✅ Database tables created');
  }

  /**
   * Execute a policy
   */
  async executePolicy(policy, user) {
    const executionId = uuidv4();
    const startTime = new Date();

    // Create execution record
    await this.db.run(`
      INSERT INTO policy_executions (
        id, policy_id, tenant_id, user_id, status, start_time
      ) VALUES (?, ?, ?, ?, 'running', ?)
    `, [executionId, policy.id, policy.tenant_id, user?.id, startTime.toISOString()]);

    this.logger?.info(`[PolicyExecutor] Starting execution: ${executionId} for policy ${policy.name}`);

    // Get template and script
    const templateManager = this.core.getService('template-manager');
    const scriptPath = templateManager.getScriptPath(policy.template_id);

    if (!scriptPath) {
      await this.recordFailure(executionId, 'Template script not found');
      throw new Error('Template script not found');
    }

    // Execute script asynchronously
    this.executeScript(executionId, policy, scriptPath, startTime);

    return {
      id: executionId,
      policyId: policy.id,
      status: 'running',
      startTime
    };
  }

  /**
   * Execute the compliance script
   */
  async executeScript(executionId, policy, scriptPath, startTime) {
    try {
      const config = policy.config || {};
      const args = config.scriptArgs || [];

      const childProcess = spawn(scriptPath, args, {
        cwd: path.dirname(scriptPath),
        env: { ...process.env }
      });

      let output = '';
      let errorOutput = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
        
        // Broadcast progress if available
        if (global.broadcast) {
          global.broadcast({
            type: 'policy_execution_output',
            executionId,
            data: data.toString()
          });
        }
      });

      childProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', async (code) => {
        const endTime = new Date();
        const duration = endTime - startTime;

        if (code === 0) {
          // Parse results
          const results = this.parseResults(output);
          
          // Record success
          await this.db.run(`
            UPDATE policy_executions 
            SET status = 'completed',
                end_time = ?,
                duration = ?,
                score = ?,
                passed = ?,
                failed = ?,
                warnings = ?,
                output = ?
            WHERE id = ?
          `, [
            endTime.toISOString(),
            duration,
            results.score,
            results.passed,
            results.failed,
            results.warnings,
            output.substring(0, 50000), // Limit output size
            executionId
          ]);

          this.logger?.info(`[PolicyExecutor] Execution completed: ${executionId} (score: ${results.score})`);

          // Record score in compliance tracker
          const complianceTracker = this.core.getService('compliance-tracker');
          if (complianceTracker) {
            await complianceTracker.recordScore(policy.id, policy.tenant_id, {
              executionId,
              score: results.score,
              passed: results.passed,
              failed: results.failed,
              warnings: results.warnings
            });
          }

          // Broadcast completion
          if (global.broadcast) {
            global.broadcast({
              type: 'policy_execution_complete',
              executionId,
              policyId: policy.id,
              score: results.score,
              success: true
            });
          }

        } else {
          // Record failure
          await this.recordFailure(executionId, errorOutput || `Script exited with code ${code}`);

          this.logger?.error(`[PolicyExecutor] Execution failed: ${executionId} (code: ${code})`);

          // Broadcast failure
          if (global.broadcast) {
            global.broadcast({
              type: 'policy_execution_failed',
              executionId,
              policyId: policy.id,
              error: errorOutput || `Exit code ${code}`
            });
          }
        }

        this.activeExecutions.delete(executionId);
      });

      this.activeExecutions.set(executionId, childProcess);

    } catch (error) {
      await this.recordFailure(executionId, error.message);
      this.logger?.error(`[PolicyExecutor] Execution error: ${executionId}`, error);
    }
  }

  /**
   * Record execution failure
   */
  async recordFailure(executionId, error) {
    const endTime = new Date();

    await this.db.run(`
      UPDATE policy_executions 
      SET status = 'failed',
          end_time = ?,
          error = ?
      WHERE id = ?
    `, [endTime.toISOString(), error, executionId]);
  }

  /**
   * Parse results from script output
   */
  parseResults(output) {
    const results = {
      score: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    };

    // Parse compliance score (format: "Compliance Score: 85/100")
    const scoreMatch = output.match(/Compliance Score:\s*(\d+)\/100/i);
    if (scoreMatch) {
      results.score = parseInt(scoreMatch[1]);
    }

    // Count passed checks (✅)
    const passedMatches = output.match(/^- ✅/gm);
    if (passedMatches) {
      results.passed = passedMatches.length;
    }

    // Count failed checks (🚨)
    const failedMatches = output.match(/^- 🚨/gm);
    if (failedMatches) {
      results.failed = failedMatches.length;
    }

    // Count warnings (⚠️)
    const warningMatches = output.match(/^- ⚠️/gm);
    if (warningMatches) {
      results.warnings = warningMatches.length;
    }

    // Calculate score if not found
    if (results.score === 0 && (results.passed + results.failed) > 0) {
      const total = results.passed + results.failed;
      results.score = Math.round((results.passed / total) * 100);
    }

    return results;
  }

  /**
   * Get execution history for a policy
   */
  async getExecutionHistory(policyId, tenantId, options = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.db.get(
      'SELECT COUNT(*) as total FROM policy_executions WHERE policy_id = ? AND tenant_id = ?',
      [policyId, tenantId]
    );

    // Get executions
    const executions = await this.db.all(
      `SELECT id, policy_id, tenant_id, user_id, status, start_time, end_time, 
              duration, score, passed, failed, warnings, error
       FROM policy_executions 
       WHERE policy_id = ? AND tenant_id = ?
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [policyId, tenantId, limit, offset]
    );

    return {
      data: executions,
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      }
    };
  }

  /**
   * Get execution details
   */
  async getExecutionDetails(executionId, tenantId) {
    const execution = await this.db.get(
      'SELECT * FROM policy_executions WHERE id = ? AND tenant_id = ?',
      [executionId, tenantId]
    );

    return execution;
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(executionId) {
    const childProcess = this.activeExecutions.get(executionId);
    
    if (childProcess) {
      childProcess.kill('SIGTERM');
      this.activeExecutions.delete(executionId);
      
      await this.db.run(`
        UPDATE policy_executions 
        SET status = 'cancelled', end_time = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [executionId]);

      return true;
    }

    return false;
  }

  /**
   * Get active executions count
   */
  getActiveExecutionsCount() {
    return this.activeExecutions.size;
  }
}

module.exports = PolicyExecutor;
