/**
 * Historical Analyzer Service
 * Compares reports and analyzes trends over time
 */

const { logger } = require('../../shared/logger');

class HistoricalAnalyzer {
  constructor(db) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Initialize (no tables needed, uses existing reports)
   */
  async init() {
    this.logger.info('[HistoricalAnalyzer] Initializing...');
    this.logger.info('[HistoricalAnalyzer] ✅ Initialized');
  }

  /**
   * Compare multiple reports
   */
  async compareReports(tenantId, reportIds) {
    if (!reportIds || reportIds.length < 2) {
      throw new Error('At least 2 reports are required for comparison');
    }

    // Fetch all reports
    const reports = [];
    for (const id of reportIds) {
      const report = await this.db.get(
        'SELECT * FROM reports WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (!report) {
        throw new Error(`Report ${id} not found`);
      }

      reports.push({
        ...report,
        data: report.data ? JSON.parse(report.data) : {}
      });
    }

    // Sort by date
    reports.sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at));

    // Extract key metrics for comparison
    const comparison = {
      reports: reports.map(r => ({
        id: r.id,
        name: r.name,
        generated_at: r.generated_at
      })),
      metrics: this.compareMetrics(reports),
      trends: this.calculateTrends(reports),
      changes: this.identifyChanges(reports)
    };

    return comparison;
  }

  /**
   * Compare metrics across reports
   */
  compareMetrics(reports) {
    const metrics = {};
    const keys = ['totalVulnerabilities', 'criticalCount', 'highCount', 'mediumCount', 'lowCount', 'riskScore'];

    for (const key of keys) {
      metrics[key] = reports.map(r => ({
        report_id: r.id,
        value: r.data[key] || 0,
        date: r.generated_at
      }));
    }

    return metrics;
  }

  /**
   * Calculate trends
   */
  calculateTrends(reports) {
    if (reports.length < 2) {
      return {};
    }

    const first = reports[0].data;
    const last = reports[reports.length - 1].data;

    const calculateChange = (oldVal, newVal) => {
      if (!oldVal) return newVal ? 100 : 0;
      return ((newVal - oldVal) / oldVal) * 100;
    };

    return {
      totalVulnerabilities: {
        change: calculateChange(first.totalVulnerabilities, last.totalVulnerabilities),
        direction: last.totalVulnerabilities > first.totalVulnerabilities ? 'increasing' : 'decreasing'
      },
      criticalCount: {
        change: calculateChange(first.criticalCount, last.criticalCount),
        direction: last.criticalCount > first.criticalCount ? 'increasing' : 'decreasing'
      },
      riskScore: {
        change: calculateChange(first.riskScore, last.riskScore),
        direction: last.riskScore > first.riskScore ? 'increasing' : 'decreasing'
      }
    };
  }

  /**
   * Identify significant changes
   */
  identifyChanges(reports) {
    const changes = [];

    for (let i = 1; i < reports.length; i++) {
      const prev = reports[i - 1].data;
      const curr = reports[i].data;

      // Check for new vulnerabilities
      const newVulns = (curr.totalVulnerabilities || 0) - (prev.totalVulnerabilities || 0);
      if (newVulns > 0) {
        changes.push({
          type: 'new_vulnerabilities',
          count: newVulns,
          from_report: reports[i - 1].id,
          to_report: reports[i].id,
          date: curr.generated_at
        });
      }

      // Check for fixed vulnerabilities
      if (newVulns < 0) {
        changes.push({
          type: 'fixed_vulnerabilities',
          count: Math.abs(newVulns),
          from_report: reports[i - 1].id,
          to_report: reports[i].id,
          date: curr.generated_at
        });
      }

      // Check for critical severity increases
      const criticalIncrease = (curr.criticalCount || 0) - (prev.criticalCount || 0);
      if (criticalIncrease > 0) {
        changes.push({
          type: 'critical_increase',
          count: criticalIncrease,
          from_report: reports[i - 1].id,
          to_report: reports[i].id,
          date: curr.generated_at,
          severity: 'high'
        });
      }
    }

    return changes;
  }

  /**
   * Get scan history for a specific scan target
   */
  async getScanHistory(tenantId, scanId) {
    const reports = await this.db.all(`
      SELECT * FROM reports
      WHERE tenant_id = ? AND scan_id = ?
      ORDER BY generated_at DESC
      LIMIT 50
    `, [tenantId, scanId]);

    return reports.map(r => ({
      ...r,
      data: r.data ? JSON.parse(r.data) : {}
    }));
  }

  /**
   * Analyze trends over time period
   */
  async analyzeTrends(tenantId, options = {}) {
    const { days = 30, scanId = null } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query = `
      SELECT * FROM reports
      WHERE tenant_id = ? AND generated_at >= ?
    `;
    const params = [tenantId, cutoffDate.toISOString()];

    if (scanId) {
      query += ' AND scan_id = ?';
      params.push(scanId);
    }

    query += ' ORDER BY generated_at ASC';

    const reports = await this.db.all(query, params);

    if (reports.length === 0) {
      return {
        period: { days, from: cutoffDate, to: new Date() },
        reports_analyzed: 0,
        trends: {}
      };
    }

    // Parse data
    const parsedReports = reports.map(r => ({
      ...r,
      data: r.data ? JSON.parse(r.data) : {}
    }));

    // Calculate overall trends
    const trends = {
      vulnerability_trend: this.calculateVulnerabilityTrend(parsedReports),
      severity_distribution: this.calculateSeverityDistribution(parsedReports),
      risk_score_trend: this.calculateRiskScoreTrend(parsedReports),
      most_common_issues: this.identifyCommonIssues(parsedReports)
    };

    return {
      period: {
        days,
        from: cutoffDate,
        to: new Date()
      },
      reports_analyzed: reports.length,
      trends
    };
  }

  /**
   * Calculate vulnerability trend
   */
  calculateVulnerabilityTrend(reports) {
    return reports.map(r => ({
      date: r.generated_at,
      total: r.data.totalVulnerabilities || 0,
      critical: r.data.criticalCount || 0,
      high: r.data.highCount || 0,
      medium: r.data.mediumCount || 0,
      low: r.data.lowCount || 0
    }));
  }

  /**
   * Calculate severity distribution
   */
  calculateSeverityDistribution(reports) {
    const totals = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    reports.forEach(r => {
      totals.critical += r.data.criticalCount || 0;
      totals.high += r.data.highCount || 0;
      totals.medium += r.data.mediumCount || 0;
      totals.low += r.data.lowCount || 0;
    });

    const total = Object.values(totals).reduce((a, b) => a + b, 0);

    return {
      ...totals,
      percentages: {
        critical: total > 0 ? (totals.critical / total) * 100 : 0,
        high: total > 0 ? (totals.high / total) * 100 : 0,
        medium: total > 0 ? (totals.medium / total) * 100 : 0,
        low: total > 0 ? (totals.low / total) * 100 : 0
      }
    };
  }

  /**
   * Calculate risk score trend
   */
  calculateRiskScoreTrend(reports) {
    const scores = reports
      .filter(r => r.data.riskScore !== undefined)
      .map(r => ({
        date: r.generated_at,
        score: r.data.riskScore
      }));

    if (scores.length === 0) {
      return { average: 0, min: 0, max: 0, trend: [] };
    }

    const values = scores.map(s => s.score);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      average: Math.round(average),
      min,
      max,
      trend: scores
    };
  }

  /**
   * Identify most common issues
   */
  identifyCommonIssues(reports) {
    const issues = {};

    reports.forEach(r => {
      if (r.data.vulnerabilities) {
        r.data.vulnerabilities.forEach(vuln => {
          const key = vuln.title || vuln.type;
          if (key) {
            issues[key] = (issues[key] || 0) + 1;
          }
        });
      }
    });

    // Sort by frequency
    const sorted = Object.entries(issues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10

    return sorted.map(([issue, count]) => ({ issue, count }));
  }
}

module.exports = HistoricalAnalyzer;
