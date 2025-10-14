/**
 * Compliance Tracker Service
 * 
 * Tracks compliance scores over time
 */

const { v4: uuidv4 } = require('uuid');

class ComplianceTracker {
  constructor(core) {
    this.core = core;
    this.db = core.db;
    this.logger = core.getService('logger');
  }

  /**
   * Initialize database tables
   */
  async init() {
    this.logger?.info('[ComplianceTracker] Creating database tables...');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS compliance_scores (
        id TEXT PRIMARY KEY,
        policy_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        passed INTEGER,
        failed INTEGER,
        warnings INTEGER,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scores_policy ON compliance_scores(policy_id);
      CREATE INDEX IF NOT EXISTS idx_scores_tenant ON compliance_scores(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_scores_recorded ON compliance_scores(recorded_at);
    `);

    this.logger?.info('[ComplianceTracker] ✅ Database tables created');
  }

  /**
   * Record a compliance score
   */
  async recordScore(policyId, tenantId, execution) {
    const { executionId, score, passed, failed, warnings } = execution;

    const id = uuidv4();

    await this.db.run(`
      INSERT INTO compliance_scores (
        id, policy_id, tenant_id, execution_id, score, passed, failed, warnings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, policyId, tenantId, executionId, score, passed, failed, warnings]);

    this.logger?.info(`[ComplianceTracker] Recorded score: ${score} for policy ${policyId}`);

    return id;
  }

  /**
   * Get current (latest) compliance score for a policy
   */
  async getCurrentScore(policyId, tenantId) {
    const result = await this.db.get(`
      SELECT * FROM compliance_scores 
      WHERE policy_id = ? AND tenant_id = ?
      ORDER BY recorded_at DESC 
      LIMIT 1
    `, [policyId, tenantId]);

    if (!result) {
      return {
        score: null,
        message: 'No executions yet'
      };
    }

    return {
      score: result.score,
      passed: result.passed,
      failed: result.failed,
      warnings: result.warnings,
      recordedAt: result.recorded_at,
      executionId: result.execution_id
    };
  }

  /**
   * Get compliance score trend over time
   */
  async getScoreTrend(policyId, tenantId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const scores = await this.db.all(`
      SELECT score, passed, failed, warnings, recorded_at
      FROM compliance_scores 
      WHERE policy_id = ? AND tenant_id = ? AND recorded_at >= ?
      ORDER BY recorded_at ASC
    `, [policyId, tenantId, since.toISOString()]);

    if (scores.length === 0) {
      return {
        trend: [],
        summary: {
          dataPoints: 0,
          averageScore: null,
          improvement: null
        }
      };
    }

    // Calculate statistics
    const averageScore = Math.round(
      scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    );

    const firstScore = scores[0].score;
    const lastScore = scores[scores.length - 1].score;
    const improvement = lastScore - firstScore;

    return {
      trend: scores.map(s => ({
        score: s.score,
        passed: s.passed,
        failed: s.failed,
        warnings: s.warnings,
        date: s.recorded_at
      })),
      summary: {
        dataPoints: scores.length,
        averageScore,
        firstScore,
        lastScore,
        improvement,
        improvementPercent: firstScore > 0 ? Math.round((improvement / firstScore) * 100) : 0
      }
    };
  }

  /**
   * Get compliance report for a tenant
   */
  async getComplianceReport(tenantId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all policies for tenant
    const policyManager = this.core.getService('policy-manager');
    const { data: policies } = await policyManager.listPolicies(
      { tenantId },
      { limit: 1000 }
    );

    const report = {
      tenantId,
      generatedAt: new Date().toISOString(),
      period: `Last ${days} days`,
      policies: []
    };

    for (const policy of policies) {
      const currentScore = await this.getCurrentScore(policy.id, tenantId);
      const trend = await this.getScoreTrend(policy.id, tenantId, days);

      report.policies.push({
        id: policy.id,
        name: policy.name,
        framework: policy.framework,
        currentScore: currentScore.score,
        averageScore: trend.summary.averageScore,
        executionCount: trend.summary.dataPoints,
        improvement: trend.summary.improvement,
        status: this.getComplianceStatus(currentScore.score)
      });
    }

    // Calculate overall statistics
    const validScores = report.policies
      .filter(p => p.currentScore !== null)
      .map(p => p.currentScore);

    report.summary = {
      totalPolicies: policies.length,
      policiesWithScores: validScores.length,
      overallScore: validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : null,
      compliantPolicies: report.policies.filter(p => p.currentScore >= 90).length,
      nonCompliantPolicies: report.policies.filter(p => p.currentScore < 70).length
    };

    return report;
  }

  /**
   * Get compliance status based on score
   */
  getComplianceStatus(score) {
    if (score === null) return 'unknown';
    if (score >= 90) return 'compliant';
    if (score >= 70) return 'partially_compliant';
    return 'non_compliant';
  }

  /**
   * Get score distribution for a policy
   */
  async getScoreDistribution(policyId, tenantId) {
    const scores = await this.db.all(`
      SELECT score FROM compliance_scores 
      WHERE policy_id = ? AND tenant_id = ?
    `, [policyId, tenantId]);

    if (scores.length === 0) {
      return {
        ranges: [],
        total: 0
      };
    }

    // Create distribution buckets
    const ranges = [
      { min: 0, max: 50, count: 0, label: '0-50 (Poor)' },
      { min: 51, max: 70, count: 0, label: '51-70 (Fair)' },
      { min: 71, max: 85, count: 0, label: '71-85 (Good)' },
      { min: 86, max: 95, count: 0, label: '86-95 (Very Good)' },
      { min: 96, max: 100, count: 0, label: '96-100 (Excellent)' }
    ];

    scores.forEach(({ score }) => {
      const range = ranges.find(r => score >= r.min && score <= r.max);
      if (range) {
        range.count++;
      }
    });

    return {
      ranges: ranges.map(r => ({
        ...r,
        percentage: Math.round((r.count / scores.length) * 100)
      })),
      total: scores.length
    };
  }

  /**
   * Get policies requiring attention
   */
  async getPoliciesRequiringAttention(tenantId, threshold = 70) {
    const policyManager = this.core.getService('policy-manager');
    const { data: policies } = await policyManager.listPolicies(
      { tenantId, status: 'active' },
      { limit: 1000 }
    );

    const attention = [];

    for (const policy of policies) {
      const currentScore = await this.getCurrentScore(policy.id, tenantId);
      
      if (currentScore.score !== null && currentScore.score < threshold) {
        attention.push({
          id: policy.id,
          name: policy.name,
          framework: policy.framework,
          score: currentScore.score,
          failed: currentScore.failed,
          warnings: currentScore.warnings,
          lastChecked: currentScore.recordedAt
        });
      }
    }

    // Sort by score (lowest first)
    attention.sort((a, b) => a.score - b.score);

    return attention;
  }

  /**
   * Cleanup old scores
   */
  async cleanupOldScores(retentionDays = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.db.run(`
      DELETE FROM compliance_scores 
      WHERE recorded_at < ?
    `, [cutoffDate.toISOString()]);

    this.logger?.info(`[ComplianceTracker] Cleaned up ${result.changes} old score records`);

    return result.changes;
  }
}

module.exports = ComplianceTracker;
