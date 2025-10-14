/**
 * Export Manager Service
 * Handles exporting reports to different formats
 */

const { logger } = require('../../shared/logger');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ExportManager {
  constructor(db, reportsDir) {
    this.db = db;
    this.reportsDir = reportsDir;
    this.logger = logger;
  }

  /**
   * Initialize
   */
  async init() {
    this.logger.info('[ExportManager] Initializing...');
    this.logger.info('[ExportManager] ✅ Initialized');
  }

  /**
   * Export report to different format
   */
  async exportReport(tenantId, reportId, targetFormat) {
    // Get original report
    const report = await this.db.get(
      'SELECT * FROM reports WHERE id = ? AND tenant_id = ?',
      [reportId, tenantId]
    );

    if (!report) {
      throw new Error('Report not found');
    }

    const reportData = report.data ? JSON.parse(report.data) : {};

    // Export based on target format
    let exportedPath;
    
    switch (targetFormat) {
      case 'json':
        exportedPath = await this.exportToJSON(reportId, reportData);
        break;
      case 'csv':
        exportedPath = await this.exportToCSV(reportId, reportData);
        break;
      case 'xml':
        exportedPath = await this.exportToXML(reportId, reportData);
        break;
      case 'markdown':
        exportedPath = await this.exportToMarkdown(reportId, reportData);
        break;
      default:
        throw new Error(`Unsupported export format: ${targetFormat}`);
    }

    this.logger.info(`[ExportManager] Exported report ${reportId} to ${targetFormat}`);

    return {
      original_report_id: reportId,
      format: targetFormat,
      file_path: exportedPath,
      exported_at: new Date().toISOString()
    };
  }

  /**
   * Export to JSON
   */
  async exportToJSON(reportId, data) {
    const filename = `${reportId}_export_${Date.now()}.json`;
    const filePath = path.join(this.reportsDir, filename);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return filePath;
  }

  /**
   * Export to CSV
   */
  async exportToCSV(reportId, data) {
    const filename = `${reportId}_export_${Date.now()}.csv`;
    const filePath = path.join(this.reportsDir, filename);

    const rows = [];

    // Export vulnerabilities if available
    if (data.vulnerabilities && Array.isArray(data.vulnerabilities)) {
      if (data.vulnerabilities.length > 0) {
        // Header row
        const headers = Object.keys(data.vulnerabilities[0]);
        rows.push(headers.join(','));

        // Data rows
        data.vulnerabilities.forEach(vuln => {
          const values = headers.map(h => {
            const val = vuln[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          });
          rows.push(values.join(','));
        });
      }
    } else {
      // Export summary data
      rows.push('Metric,Value');
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          rows.push(`${key},${value}`);
        }
      });
    }

    await fs.writeFile(filePath, rows.join('\n'), 'utf8');
    
    return filePath;
  }

  /**
   * Export to XML
   */
  async exportToXML(reportId, data) {
    const filename = `${reportId}_export_${Date.now()}.xml`;
    const filePath = path.join(this.reportsDir, filename);

    const xml = this.convertToXML(data, 'report');

    await fs.writeFile(filePath, xml, 'utf8');
    
    return filePath;
  }

  /**
   * Convert object to XML
   */
  convertToXML(obj, rootName = 'root') {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootName}>\n`;
    xml += this.objectToXML(obj, 1);
    xml += `</${rootName}>\n`;
    return xml;
  }

  /**
   * Recursive object to XML converter
   */
  objectToXML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let xml = '';

    for (const [key, value] of Object.entries(obj)) {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');

      if (value === null || value === undefined) {
        xml += `${spaces}<${safeKey} />\n`;
      } else if (Array.isArray(value)) {
        xml += `${spaces}<${safeKey}>\n`;
        value.forEach((item, index) => {
          xml += `${spaces}  <item index="${index}">\n`;
          if (typeof item === 'object') {
            xml += this.objectToXML(item, indent + 2);
          } else {
            xml += `${spaces}    ${this.escapeXML(String(item))}\n`;
          }
          xml += `${spaces}  </item>\n`;
        });
        xml += `${spaces}</${safeKey}>\n`;
      } else if (typeof value === 'object') {
        xml += `${spaces}<${safeKey}>\n`;
        xml += this.objectToXML(value, indent + 1);
        xml += `${spaces}</${safeKey}>\n`;
      } else {
        xml += `${spaces}<${safeKey}>${this.escapeXML(String(value))}</${safeKey}>\n`;
      }
    }

    return xml;
  }

  /**
   * Escape XML special characters
   */
  escapeXML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Export to Markdown
   */
  async exportToMarkdown(reportId, data) {
    const filename = `${reportId}_export_${Date.now()}.md`;
    const filePath = path.join(this.reportsDir, filename);

    let markdown = `# ${data.reportName || 'Security Report'}\n\n`;
    markdown += `**Generated:** ${data.generatedAt || new Date().toISOString()}\n\n`;

    if (data.description) {
      markdown += `${data.description}\n\n`;
    }

    // Summary section
    markdown += `## Summary\n\n`;
    markdown += `| Metric | Value |\n`;
    markdown += `|--------|-------|\n`;
    
    const summaryFields = [
      'totalVulnerabilities',
      'criticalCount',
      'highCount',
      'mediumCount',
      'lowCount',
      'riskScore'
    ];

    summaryFields.forEach(field => {
      if (data[field] !== undefined) {
        const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        markdown += `| ${label} | ${data[field]} |\n`;
      }
    });

    markdown += `\n`;

    // Vulnerabilities section
    if (data.vulnerabilities && data.vulnerabilities.length > 0) {
      markdown += `## Vulnerabilities\n\n`;
      
      data.vulnerabilities.forEach((vuln, index) => {
        markdown += `### ${index + 1}. ${vuln.title || 'Vulnerability'}\n\n`;
        markdown += `**Severity:** ${vuln.severity || 'Unknown'}\n\n`;
        
        if (vuln.description) {
          markdown += `**Description:** ${vuln.description}\n\n`;
        }
        
        if (vuln.remediation) {
          markdown += `**Remediation:** ${vuln.remediation}\n\n`;
        }
        
        markdown += `---\n\n`;
      });
    }

    // Recommendations section
    if (data.recommendations && data.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      
      data.recommendations.forEach((rec, index) => {
        markdown += `${index + 1}. ${rec}\n`;
      });
      
      markdown += `\n`;
    }

    await fs.writeFile(filePath, markdown, 'utf8');
    
    return filePath;
  }

  /**
   * Batch export multiple reports
   */
  async batchExport(tenantId, reportIds, format) {
    const results = [];

    for (const reportId of reportIds) {
      try {
        const result = await this.exportReport(tenantId, reportId, format);
        results.push({ success: true, reportId, ...result });
      } catch (error) {
        results.push({
          success: false,
          reportId,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = ExportManager;
