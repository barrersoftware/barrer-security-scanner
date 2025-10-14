/**
 * Report Generator Service
 * Generates reports in multiple formats (PDF, HTML, JSON, etc.)
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../shared/logger');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');

class ReportGenerator {
  constructor(db, templateManager, chartGenerator, reportsDir) {
    this.db = db;
    this.templateManager = templateManager;
    this.chartGenerator = chartGenerator;
    this.reportsDir = reportsDir;
    this.logger = logger;
    this.browser = null;
  }

  /**
   * Initialize database tables
   */
  async init() {
    this.logger.info('[ReportGenerator] Initializing...');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        template_id TEXT,
        format TEXT DEFAULT 'pdf',
        scan_id TEXT,
        status TEXT DEFAULT 'generating',
        file_path TEXT,
        file_size INTEGER,
        data TEXT,
        options TEXT,
        generated_by TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        error TEXT
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
      CREATE INDEX IF NOT EXISTS idx_reports_scan ON reports(scan_id);
      CREATE INDEX IF NOT EXISTS idx_reports_template ON reports(template_id);
    `);

    // Initialize headless browser for PDF generation
    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.logger.info('[ReportGenerator] Puppeteer browser launched');
    } catch (error) {
      this.logger.warn('[ReportGenerator] Could not launch puppeteer, PDF generation will be limited:', error.message);
    }

    this.logger.info('[ReportGenerator] ✅ Initialized');
  }

  /**
   * Generate a report
   */
  async generateReport(tenantId, reportData) {
    const reportId = uuidv4();
    const {
      name,
      description = '',
      template = 'detailed_technical',
      format = 'pdf',
      scanId,
      data = {},
      options = {},
      generatedBy = 'system'
    } = reportData;

    try {
      // Validate required fields
      if (!name) {
        throw new Error('Report name is required');
      }

      // Save initial report record
      await this.db.run(`
        INSERT INTO reports (
          id, tenant_id, name, description, template_id, format,
          scan_id, status, data, options, generated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        reportId, tenantId, name, description, template, format,
        scanId, 'generating', JSON.stringify(data), JSON.stringify(options), generatedBy
      ]);

      this.logger.info(`[ReportGenerator] Generating report: ${name} (${format})`);

      // Get template
      const templateContent = await this.templateManager.getTemplate(tenantId, template);

      // Generate charts if needed
      let charts = {};
      if (options.includeCharts) {
        charts = await this.chartGenerator.generateCharts(data);
      }

      // Prepare report data
      const reportContext = {
        ...data,
        charts,
        generatedAt: new Date().toISOString(),
        reportName: name,
        description
      };

      // Render template
      const renderedContent = await this.templateManager.render(templateContent, reportContext);

      // Generate file based on format
      let filePath;
      let fileSize;

      switch (format) {
        case 'pdf':
          filePath = await this.generatePDF(reportId, name, renderedContent, options);
          break;
        case 'html':
          filePath = await this.generateHTML(reportId, name, renderedContent);
          break;
        case 'json':
          filePath = await this.generateJSON(reportId, name, reportContext);
          break;
        case 'csv':
          filePath = await this.generateCSV(reportId, name, data);
          break;
        case 'markdown':
          filePath = await this.generateMarkdown(reportId, name, renderedContent);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Get file size
      const stats = await fs.stat(filePath);
      fileSize = stats.size;

      // Update report record
      await this.db.run(`
        UPDATE reports
        SET status = 'completed', file_path = ?, file_size = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `, [filePath, fileSize, reportId, tenantId]);

      this.logger.info(`[ReportGenerator] Report generated: ${reportId} (${fileSize} bytes)`);

      return {
        id: reportId,
        name,
        format,
        status: 'completed',
        file_size: fileSize,
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`[ReportGenerator] Error generating report:`, error);

      // Update report with error
      await this.db.run(`
        UPDATE reports
        SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `, [error.message, reportId, tenantId]);

      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  async generatePDF(reportId, name, htmlContent, options = {}) {
    const filename = `${reportId}.pdf`;
    const filePath = path.join(this.reportsDir, filename);

    if (this.browser) {
      // Use Puppeteer for HTML to PDF conversion (better rendering)
      const page = await this.browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      await page.pdf({
        path: filePath,
        format: options.pageSize || 'A4',
        printBackground: true,
        margin: options.margin || { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
      });
      
      await page.close();
    } else {
      // Fallback to PDFKit (basic PDF generation)
      const doc = new PDFDocument();
      const stream = require('fs').createWriteStream(filePath);
      
      doc.pipe(stream);
      doc.fontSize(20).text(name, 100, 100);
      doc.fontSize(12).text('Generated: ' + new Date().toISOString(), 100, 130);
      doc.moveDown();
      
      // Add content (stripped of HTML)
      const textContent = htmlContent.replace(/<[^>]*>/g, '');
      doc.fontSize(10).text(textContent, { width: 400 });
      
      doc.end();
      
      await new Promise((resolve) => stream.on('finish', resolve));
    }

    return filePath;
  }

  /**
   * Generate HTML report
   */
  async generateHTML(reportId, name, htmlContent) {
    const filename = `${reportId}.html`;
    const filePath = path.join(this.reportsDir, filename);

    const fullHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .meta { color: #777; font-size: 14px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #007bff; color: white; }
        tr:hover { background-color: #f5f5f5; }
        .critical { color: #dc3545; font-weight: bold; }
        .high { color: #fd7e14; font-weight: bold; }
        .medium { color: #ffc107; }
        .low { color: #28a745; }
    </style>
</head>
<body>
    <div class="container">
        ${htmlContent}
    </div>
</body>
</html>
    `;

    await fs.writeFile(filePath, fullHTML, 'utf8');
    return filePath;
  }

  /**
   * Generate JSON report
   */
  async generateJSON(reportId, name, data) {
    const filename = `${reportId}.json`;
    const filePath = path.join(this.reportsDir, filename);

    const jsonData = {
      report: name,
      generated_at: new Date().toISOString(),
      ...data
    };

    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    return filePath;
  }

  /**
   * Generate CSV report
   */
  async generateCSV(reportId, name, data) {
    const filename = `${reportId}.csv`;
    const filePath = path.join(this.reportsDir, filename);

    // Convert data to CSV format
    const rows = [];
    
    // Add header
    if (data.vulnerabilities && data.vulnerabilities.length > 0) {
      const headers = Object.keys(data.vulnerabilities[0]);
      rows.push(headers.join(','));
      
      // Add data rows
      data.vulnerabilities.forEach(vuln => {
        const values = headers.map(h => {
          const val = vuln[h];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        });
        rows.push(values.join(','));
      });
    }

    await fs.writeFile(filePath, rows.join('\n'), 'utf8');
    return filePath;
  }

  /**
   * Generate Markdown report
   */
  async generateMarkdown(reportId, name, content) {
    const filename = `${reportId}.md`;
    const filePath = path.join(this.reportsDir, filename);

    // Convert HTML to Markdown (simple conversion)
    let markdown = content;
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/g, '\n## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/g, '\n### $1\n');
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    markdown = markdown.replace(/<em>(.*?)<\/em>/g, '*$1*');
    markdown = markdown.replace(/<li>(.*?)<\/li>/g, '- $1\n');
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    await fs.writeFile(filePath, markdown, 'utf8');
    return filePath;
  }

  /**
   * List reports
   */
  async listReports(tenantId, filters = {}) {
    const { status, limit = 100, offset = 0 } = filters;

    let query = 'SELECT * FROM reports WHERE tenant_id = ?';
    const params = [tenantId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY generated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const reports = await this.db.all(query, params);
    
    return reports.map(r => ({
      ...r,
      data: r.data ? JSON.parse(r.data) : null,
      options: r.options ? JSON.parse(r.options) : null
    }));
  }

  /**
   * Get single report
   */
  async getReport(tenantId, reportId) {
    const report = await this.db.get(
      'SELECT * FROM reports WHERE id = ? AND tenant_id = ?',
      [reportId, tenantId]
    );

    if (!report) {
      throw new Error('Report not found');
    }

    return {
      ...report,
      data: report.data ? JSON.parse(report.data) : null,
      options: report.options ? JSON.parse(report.options) : null
    };
  }

  /**
   * Get report file for download
   */
  async getReportFile(tenantId, reportId) {
    const report = await this.getReport(tenantId, reportId);

    if (!report.file_path) {
      throw new Error('Report file not found');
    }

    const contentTypes = {
      pdf: 'application/pdf',
      html: 'text/html',
      json: 'application/json',
      csv: 'text/csv',
      markdown: 'text/markdown'
    };

    return {
      filePath: report.file_path,
      filename: `${report.name}.${report.format}`,
      contentType: contentTypes[report.format] || 'application/octet-stream'
    };
  }

  /**
   * Delete report
   */
  async deleteReport(tenantId, reportId) {
    const report = await this.getReport(tenantId, reportId);

    // Delete file
    if (report.file_path) {
      try {
        await fs.unlink(report.file_path);
      } catch (error) {
        this.logger.warn(`[ReportGenerator] Could not delete file: ${error.message}`);
      }
    }

    // Delete database record
    await this.db.run(
      'DELETE FROM reports WHERE id = ? AND tenant_id = ?',
      [reportId, tenantId]
    );

    this.logger.info(`[ReportGenerator] Deleted report: ${reportId}`);
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info('[ReportGenerator] Browser closed');
    }
  }
}

module.exports = ReportGenerator;
