/**
 * Template Manager Service
 * Manages report templates and rendering
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../shared/logger');
const Handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

class TemplateManager {
  constructor(db, templatesDir) {
    this.db = db;
    this.templatesDir = templatesDir;
    this.logger = logger;
    this.templates = new Map();
  }

  /**
   * Initialize database and load default templates
   */
  async init() {
    this.logger.info('[TemplateManager] Initializing...');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        format TEXT DEFAULT 'html',
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
      )
    `);

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_templates_tenant ON report_templates(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_templates_default ON report_templates(is_default);
    `);

    // Load default templates
    await this.loadDefaultTemplates();

    // Register Handlebars helpers
    this.registerHelpers();

    this.logger.info('[TemplateManager] ✅ Initialized');
  }

  /**
   * Register Handlebars helpers
   */
  registerHelpers() {
    // Format date
    Handlebars.registerHelper('formatDate', (date) => {
      return new Date(date).toLocaleString();
    });

    // Format number
    Handlebars.registerHelper('formatNumber', (num) => {
      return new Intl.NumberFormat().format(num);
    });

    // Severity badge
    Handlebars.registerHelper('severityBadge', (severity) => {
      const classes = {
        critical: 'critical',
        high: 'high',
        medium: 'medium',
        low: 'low'
      };
      return new Handlebars.SafeString(`<span class="${classes[severity]}">${severity.toUpperCase()}</span>`);
    });

    // Conditional
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // Math operations
    Handlebars.registerHelper('add', (a, b) => a + b);
    Handlebars.registerHelper('subtract', (a, b) => a - b);
    Handlebars.registerHelper('multiply', (a, b) => a * b);
    Handlebars.registerHelper('divide', (a, b) => b !== 0 ? a / b : 0);
  }

  /**
   * Load default templates
   */
  async loadDefaultTemplates() {
    const defaults = [
      {
        name: 'executive_summary',
        description: 'High-level executive summary report',
        content: await this.getDefaultTemplate('executive_summary')
      },
      {
        name: 'detailed_technical',
        description: 'Detailed technical report with all findings',
        content: await this.getDefaultTemplate('detailed_technical')
      },
      {
        name: 'compliance_report',
        description: 'Compliance-focused report',
        content: await this.getDefaultTemplate('compliance_report')
      },
      {
        name: 'vulnerability_report',
        description: 'Vulnerability-focused report',
        content: await this.getDefaultTemplate('vulnerability_report')
      }
    ];

    for (const template of defaults) {
      const existing = await this.db.get(
        'SELECT id FROM report_templates WHERE name = ? AND is_default = 1',
        [template.name]
      );

      if (!existing) {
        const id = uuidv4();
        await this.db.run(`
          INSERT INTO report_templates (id, tenant_id, name, description, content, is_default)
          VALUES (?, ?, ?, ?, ?, 1)
        `, [id, 'system', template.name, template.description, template.content]);
        
        this.logger.debug(`[TemplateManager] Loaded default template: ${template.name}`);
      }
    }
  }

  /**
   * Get default template content
   */
  async getDefaultTemplate(name) {
    const templates = {
      executive_summary: `
<h1>{{reportName}}</h1>
<div class="meta">Generated: {{formatDate generatedAt}}</div>

<h2>Executive Summary</h2>
<p>{{description}}</p>

<h2>Key Findings</h2>
<table>
  <tr>
    <th>Metric</th>
    <th>Value</th>
  </tr>
  <tr>
    <td>Total Vulnerabilities</td>
    <td>{{totalVulnerabilities}}</td>
  </tr>
  <tr>
    <td>Critical Issues</td>
    <td class="critical">{{criticalCount}}</td>
  </tr>
  <tr>
    <td>High Priority</td>
    <td class="high">{{highCount}}</td>
  </tr>
  <tr>
    <td>Risk Score</td>
    <td>{{riskScore}}/100</td>
  </tr>
</table>

<h2>Recommendations</h2>
<ul>
{{#each recommendations}}
  <li>{{this}}</li>
{{/each}}
</ul>
      `,
      detailed_technical: `
<h1>{{reportName}}</h1>
<div class="meta">Generated: {{formatDate generatedAt}}</div>

<h2>Scan Overview</h2>
<table>
  <tr><td>Target</td><td>{{target}}</td></tr>
  <tr><td>Scan Duration</td><td>{{scanDuration}}</td></tr>
  <tr><td>Scanner Version</td><td>{{scannerVersion}}</td></tr>
</table>

<h2>Vulnerabilities</h2>
{{#each vulnerabilities}}
<div class="vulnerability">
  <h3>{{title}} {{{severityBadge severity}}}</h3>
  <p><strong>Description:</strong> {{description}}</p>
  <p><strong>Impact:</strong> {{impact}}</p>
  <p><strong>Remediation:</strong> {{remediation}}</p>
  <p><strong>References:</strong> {{references}}</p>
</div>
{{/each}}

<h2>Statistics</h2>
<table>
  <tr><th>Severity</th><th>Count</th></tr>
  <tr><td>Critical</td><td class="critical">{{criticalCount}}</td></tr>
  <tr><td>High</td><td class="high">{{highCount}}</td></tr>
  <tr><td>Medium</td><td class="medium">{{mediumCount}}</td></tr>
  <tr><td>Low</td><td class="low">{{lowCount}}</td></tr>
</table>
      `,
      compliance_report: `
<h1>{{reportName}}</h1>
<div class="meta">Generated: {{formatDate generatedAt}}</div>

<h2>Compliance Status</h2>
<table>
  <tr><th>Framework</th><th>Status</th><th>Score</th></tr>
{{#each complianceFrameworks}}
  <tr>
    <td>{{this.name}}</td>
    <td>{{this.status}}</td>
    <td>{{this.score}}%</td>
  </tr>
{{/each}}
</table>

<h2>Policy Violations</h2>
{{#each violations}}
<div class="violation">
  <h3>{{policy}}</h3>
  <p>{{description}}</p>
  <p><strong>Required Action:</strong> {{action}}</p>
</div>
{{/each}}
      `,
      vulnerability_report: `
<h1>{{reportName}}</h1>
<div class="meta">Generated: {{formatDate generatedAt}}</div>

<h2>Vulnerability Summary</h2>
<table>
  <tr><th>Severity</th><th>Count</th><th>% of Total</th></tr>
  <tr><td>Critical</td><td class="critical">{{criticalCount}}</td><td>{{criticalPercent}}%</td></tr>
  <tr><td>High</td><td class="high">{{highCount}}</td><td>{{highPercent}}%</td></tr>
  <tr><td>Medium</td><td class="medium">{{mediumCount}}</td><td>{{mediumPercent}}%</td></tr>
  <tr><td>Low</td><td class="low">{{lowCount}}</td><td>{{lowPercent}}%</td></tr>
</table>

<h2>Detailed Findings</h2>
{{#each vulnerabilities}}
<div class="vulnerability">
  <h3>{{title}} {{{severityBadge severity}}}</h3>
  <table>
    <tr><td>CVE ID</td><td>{{cveId}}</td></tr>
    <tr><td>CVSS Score</td><td>{{cvssScore}}</td></tr>
    <tr><td>Affected Component</td><td>{{component}}</td></tr>
    <tr><td>First Detected</td><td>{{formatDate firstDetected}}</td></tr>
  </table>
  <p><strong>Description:</strong> {{description}}</p>
  <p><strong>Fix:</strong> {{fix}}</p>
</div>
{{/each}}
      `
    };

    return templates[name] || templates.detailed_technical;
  }

  /**
   * Create custom template
   */
  async createTemplate(tenantId, templateData) {
    const templateId = uuidv4();
    const { name, description = '', content, format = 'html' } = templateData;

    if (!name || !content) {
      throw new Error('Template name and content are required');
    }

    // Validate template syntax
    try {
      Handlebars.compile(content);
    } catch (error) {
      throw new Error(`Invalid template syntax: ${error.message}`);
    }

    await this.db.run(`
      INSERT INTO report_templates (id, tenant_id, name, description, content, format)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [templateId, tenantId, name, description, content, format]);

    this.logger.info(`[TemplateManager] Created template: ${name}`);

    return { id: templateId, name, description, format };
  }

  /**
   * Get template
   */
  async getTemplate(tenantId, templateId) {
    // Try tenant-specific first
    let template = await this.db.get(
      'SELECT * FROM report_templates WHERE (id = ? OR name = ?) AND tenant_id = ?',
      [templateId, templateId, tenantId]
    );

    // Fall back to default
    if (!template) {
      template = await this.db.get(
        'SELECT * FROM report_templates WHERE (id = ? OR name = ?) AND is_default = 1',
        [templateId, templateId]
      );
    }

    if (!template) {
      throw new Error('Template not found');
    }

    return template.content;
  }

  /**
   * Render template
   */
  async render(templateContent, data) {
    try {
      const template = Handlebars.compile(templateContent);
      return template(data);
    } catch (error) {
      this.logger.error('[TemplateManager] Error rendering template:', error);
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  /**
   * List templates
   */
  async listTemplates(tenantId) {
    const templates = await this.db.all(`
      SELECT id, name, description, format, is_default, created_at, updated_at
      FROM report_templates
      WHERE tenant_id = ? OR is_default = 1
      ORDER BY is_default DESC, name ASC
    `, [tenantId]);

    return templates;
  }

  /**
   * Update template
   */
  async updateTemplate(tenantId, templateId, updates) {
    const template = await this.db.get(
      'SELECT * FROM report_templates WHERE id = ? AND tenant_id = ?',
      [templateId, tenantId]
    );

    if (!template) {
      throw new Error('Template not found or access denied');
    }

    const { name, description, content } = updates;

    // Validate new content if provided
    if (content) {
      try {
        Handlebars.compile(content);
      } catch (error) {
        throw new Error(`Invalid template syntax: ${error.message}`);
      }
    }

    await this.db.run(`
      UPDATE report_templates
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          content = COALESCE(?, content),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [name, description, content, templateId, tenantId]);

    this.logger.info(`[TemplateManager] Updated template: ${templateId}`);

    return { id: templateId, name, description };
  }

  /**
   * Delete template
   */
  async deleteTemplate(tenantId, templateId) {
    const template = await this.db.get(
      'SELECT * FROM report_templates WHERE id = ? AND tenant_id = ?',
      [templateId, tenantId]
    );

    if (!template) {
      throw new Error('Template not found or access denied');
    }

    if (template.is_default) {
      throw new Error('Cannot delete default template');
    }

    await this.db.run(
      'DELETE FROM report_templates WHERE id = ? AND tenant_id = ?',
      [templateId, tenantId]
    );

    this.logger.info(`[TemplateManager] Deleted template: ${templateId}`);
  }
}

module.exports = TemplateManager;
