/**
 * Chart Generator Service
 * Generates charts and graphs for reports
 */

const { logger } = require('../../shared/logger');
const { createCanvas } = require('canvas');
const Chart = require('chart.js/auto');

class ChartGenerator {
  constructor() {
    this.logger = logger;
  }

  /**
   * Initialize
   */
  async init() {
    this.logger.info('[ChartGenerator] Initializing...');
    this.logger.info('[ChartGenerator] ✅ Initialized');
  }

  /**
   * Generate all charts for report data
   */
  async generateCharts(data) {
    const charts = {};

    try {
      // Generate severity distribution pie chart
      if (data.criticalCount !== undefined) {
        charts.severityDistribution = await this.generateSeverityPieChart(data);
      }

      // Generate trend line chart
      if (data.trends) {
        charts.trendAnalysis = await this.generateTrendChart(data.trends);
      }

      // Generate vulnerability types bar chart
      if (data.vulnerabilities && data.vulnerabilities.length > 0) {
        charts.vulnerabilityTypes = await this.generateVulnerabilityTypeChart(data.vulnerabilities);
      }

      this.logger.debug(`[ChartGenerator] Generated ${Object.keys(charts).length} charts`);
    } catch (error) {
      this.logger.warn('[ChartGenerator] Error generating charts:', error.message);
    }

    return charts;
  }

  /**
   * Generate severity distribution pie chart
   */
  async generateSeverityPieChart(data) {
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const chartData = {
      labels: ['Critical', 'High', 'Medium', 'Low'],
      datasets: [{
        data: [
          data.criticalCount || 0,
          data.highCount || 0,
          data.mediumCount || 0,
          data.lowCount || 0
        ],
        backgroundColor: [
          '#dc3545',  // Critical - Red
          '#fd7e14',  // High - Orange
          '#ffc107',  // Medium - Yellow
          '#28a745'   // Low - Green
        ]
      }]
    };

    new Chart(ctx, {
      type: 'pie',
      data: chartData,
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'Vulnerability Severity Distribution'
          },
          legend: {
            position: 'right'
          }
        }
      }
    });

    return canvas.toDataURL();
  }

  /**
   * Generate trend line chart
   */
  async generateTrendChart(trends) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Extract data points
    const labels = trends.map(t => new Date(t.date).toLocaleDateString());
    const criticalData = trends.map(t => t.critical || 0);
    const highData = trends.map(t => t.high || 0);
    const mediumData = trends.map(t => t.medium || 0);
    const lowData = trends.map(t => t.low || 0);

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Critical',
          data: criticalData,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          tension: 0.1
        },
        {
          label: 'High',
          data: highData,
          borderColor: '#fd7e14',
          backgroundColor: 'rgba(253, 126, 20, 0.1)',
          tension: 0.1
        },
        {
          label: 'Medium',
          data: mediumData,
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          tension: 0.1
        },
        {
          label: 'Low',
          data: lowData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.1
        }
      ]
    };

    new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'Vulnerability Trends Over Time'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Vulnerabilities'
            }
          }
        }
      }
    });

    return canvas.toDataURL();
  }

  /**
   * Generate vulnerability type bar chart
   */
  async generateVulnerabilityTypeChart(vulnerabilities) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Count vulnerability types
    const typeCounts = {};
    vulnerabilities.forEach(vuln => {
      const type = vuln.type || 'Other';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Sort by count and take top 10
    const sorted = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const labels = sorted.map(([type]) => type);
    const data = sorted.map(([, count]) => count);

    const chartData = {
      labels,
      datasets: [{
        label: 'Count',
        data,
        backgroundColor: '#007bff'
      }]
    };

    new Chart(ctx, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: 'Top 10 Vulnerability Types'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Count'
            }
          }
        }
      }
    });

    return canvas.toDataURL();
  }

  /**
   * Generate risk score gauge chart
   */
  async generateRiskScoreGauge(riskScore) {
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Simple gauge representation using doughnut chart
    const scorePercent = (riskScore / 100) * 100;
    const remaining = 100 - scorePercent;

    // Color based on score
    let color = '#28a745'; // Green (low risk)
    if (riskScore >= 70) color = '#dc3545'; // Red (high risk)
    else if (riskScore >= 40) color = '#ffc107'; // Yellow (medium risk)

    const chartData = {
      labels: ['Risk Score', 'Remaining'],
      datasets: [{
        data: [scorePercent, remaining],
        backgroundColor: [color, '#e9ecef'],
        circumference: 180,
        rotation: 270
      }]
    };

    new Chart(ctx, {
      type: 'doughnut',
      data: chartData,
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: `Risk Score: ${riskScore}/100`
          },
          legend: {
            display: false
          }
        }
      }
    });

    return canvas.toDataURL();
  }
}

module.exports = ChartGenerator;
