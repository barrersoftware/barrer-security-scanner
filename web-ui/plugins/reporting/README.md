# Advanced Reporting Plugin

Generate professional security reports with PDF export, custom templates, scheduled delivery, and historical analysis.

## Features

### 📄 Multi-Format Reports
- **PDF** - Professional PDF reports with HTML to PDF conversion
- **HTML** - Interactive web-based reports
- **JSON** - Machine-readable data export
- **CSV** - Spreadsheet-compatible format
- **XML** - Structured data export
- **Markdown** - Documentation-friendly format

### 🎨 Custom Templates
- Executive Summary
- Detailed Technical Report
- Compliance Report
- Vulnerability Report
- Custom templates with Handlebars syntax
- Pre-built templates for common use cases

### 📅 Scheduled Reports
- Cron-based scheduling
- Automatic report generation
- Email/notification delivery
- Recurring reports (daily, weekly, monthly)
- Custom schedules

### 📊 Historical Analysis
- Compare multiple reports
- Trend analysis over time
- Identify changes and patterns
- Track vulnerability lifecycle
- Risk score trends

### 📈 Charts & Visualizations
- Severity distribution pie charts
- Vulnerability trends line charts
- Top vulnerability types bar charts
- Risk score gauges
- Embedded in PDF/HTML reports

## Usage

### Generate a Report

```javascript
POST /api/reports/generate
{
  "name": "Monthly Security Report",
  "description": "Comprehensive security scan results",
  "template": "detailed_technical",
  "format": "pdf",
  "scanId": "scan-123",
  "data": {
    "target": "example.com",
    "totalVulnerabilities": 42,
    "criticalCount": 5,
    "highCount": 12,
    "mediumCount": 15,
    "lowCount": 10,
    "riskScore": 68,
    "vulnerabilities": [...]
  },
  "options": {
    "includeCharts": true,
    "pageSize": "A4"
  }
}
```

### Create Custom Template

```javascript
POST /api/reports/templates
{
  "name": "my_custom_template",
  "description": "Custom report template",
  "content": "<h1>{{reportName}}</h1>..."
}
```

### Schedule Recurring Report

```javascript
POST /api/reports/schedule
{
  "name": "Weekly Security Report",
  "reportConfig": {
    "name": "Weekly Report",
    "template": "executive_summary",
    "format": "pdf",
    "scanId": "weekly-scan"
  },
  "cronExpression": "0 9 * * 1",
  "notificationChannels": ["channel-id-1", "channel-id-2"]
}
```

### Compare Reports

```javascript
POST /api/reports/compare
{
  "reportIds": ["report-1", "report-2", "report-3"]
}
```

### Analyze Trends

```javascript
GET /api/reports/trends?days=30&scanId=scan-123
```

## Template Syntax

Templates use Handlebars syntax:

```handlebars
<h1>{{reportName}}</h1>
<p>Generated: {{formatDate generatedAt}}</p>

<h2>Summary</h2>
<table>
  <tr>
    <td>Total Vulnerabilities</td>
    <td>{{totalVulnerabilities}}</td>
  </tr>
  <tr>
    <td>Critical</td>
    <td class="critical">{{criticalCount}}</td>
  </tr>
</table>

<h2>Vulnerabilities</h2>
{{#each vulnerabilities}}
  <div>
    <h3>{{title}} {{{severityBadge severity}}}</h3>
    <p>{{description}}</p>
  </div>
{{/each}}
```

### Available Helpers

- `{{formatDate date}}` - Format ISO date to localized string
- `{{formatNumber num}}` - Format number with thousands separator
- `{{{severityBadge severity}}}` - Generate severity badge HTML
- `{{#ifEquals a b}}...{{/ifEquals}}` - Conditional equality
- `{{add a b}}` - Addition
- `{{subtract a b}}` - Subtraction
- `{{multiply a b}}` - Multiplication
- `{{divide a b}}` - Division

## Cron Expressions

Schedule reports using cron syntax:

- `0 9 * * *` - Daily at 9 AM
- `0 9 * * 1` - Weekly on Monday at 9 AM
- `0 9 1 * *` - Monthly on 1st at 9 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday at midnight

## API Endpoints

### Report Generation
- `POST /api/reports/generate` - Generate new report
- `GET /api/reports` - List reports
- `GET /api/reports/:id` - Get report details
- `DELETE /api/reports/:id` - Delete report
- `GET /api/reports/:id/download` - Download report file
- `POST /api/reports/:id/export` - Export to different format

### Templates
- `GET /api/reports/templates` - List templates
- `POST /api/reports/templates` - Create template
- `PUT /api/reports/templates/:id` - Update template
- `DELETE /api/reports/templates/:id` - Delete template

### Schedules
- `POST /api/reports/schedule` - Create schedule
- `GET /api/reports/schedules` - List schedules
- `PUT /api/reports/schedules/:id` - Update schedule
- `DELETE /api/reports/schedules/:id` - Delete schedule

### Analysis
- `POST /api/reports/compare` - Compare reports
- `GET /api/reports/history/:scanId` - Get scan history
- `GET /api/reports/trends` - Analyze trends

## Configuration

### Plugin Configuration (plugin.json)

```json
{
  "config": {
    "maxReportSize": 52428800,
    "defaultFormat": "pdf",
    "templateDirectory": "./templates",
    "outputDirectory": "./reports",
    "scheduleEnabled": true,
    "historicalRetentionDays": 90
  }
}
```

### Report Options

```javascript
{
  "includeCharts": true,
  "pageSize": "A4",
  "margin": {
    "top": "20mm",
    "right": "15mm",
    "bottom": "20mm",
    "left": "15mm"
  }
}
```

## Services

### ReportGenerator
- Generate reports in multiple formats
- PDF generation with Puppeteer
- HTML rendering
- Format conversion

### TemplateManager
- Manage custom templates
- Handlebars rendering
- Default templates
- Template validation

### ScheduleManager
- Cron-based scheduling
- Automatic execution
- Notification integration
- Schedule management

### HistoricalAnalyzer
- Report comparison
- Trend analysis
- Change detection
- Time-series analysis

### ExportManager
- Format conversion
- Batch export
- XML/CSV/JSON export
- Markdown generation

### ChartGenerator
- Chart.js integration
- Pie charts
- Line charts
- Bar charts
- Embedded images

## Dependencies

- `puppeteer` - PDF generation from HTML
- `handlebars` - Template rendering
- `pdfkit` - Fallback PDF generation
- `node-cron` - Report scheduling
- `chart.js` - Chart generation
- `canvas` - Server-side canvas for charts

## Integration

### With Notifications Plugin

Automatically send reports via configured channels:

```javascript
{
  "scheduleId": "schedule-123",
  "notificationChannels": ["slack-channel", "email-channel"]
}
```

### With Multi-Server Plugin

Generate consolidated reports from multiple servers:

```javascript
{
  "scanId": "multi-server-scan-123",
  "data": {
    "servers": [...],
    "consolidated": {...}
  }
}
```

### With Webhooks Plugin

Trigger webhooks when reports are generated:

```javascript
// Webhook receives:
{
  "event": "report.generated",
  "report_id": "report-123",
  "format": "pdf",
  "status": "completed"
}
```

## Examples

### Executive Summary Report

Generates a high-level overview with key metrics:
- Total vulnerabilities
- Critical/high priority issues
- Risk score
- Recommendations

### Detailed Technical Report

Includes complete vulnerability details:
- Full descriptions
- Remediation steps
- References (CVE, CWE)
- Affected components

### Compliance Report

Focuses on compliance status:
- Framework adherence (PCI-DSS, HIPAA, etc.)
- Policy violations
- Required actions
- Audit trail

### Trend Analysis Report

Shows changes over time:
- Vulnerability trends
- Risk score progression
- Most common issues
- Fix rate analysis

## Multi-Tenant Support

All reports are tenant-isolated:
- Separate report storage per tenant
- Custom templates per tenant
- Independent schedules
- Secure data separation

## Performance

- **PDF Generation**: ~2-5 seconds (with Puppeteer)
- **HTML Generation**: <1 second
- **Chart Generation**: <1 second per chart
- **Historical Analysis**: <1 second for 30-day period
- **Scheduled Reports**: Run in background

## Security

- Reports are tenant-scoped
- File access validated
- Template syntax validated
- No code execution in templates
- Secure file storage

## Troubleshooting

### PDF Generation Issues

If Puppeteer fails to launch:
- Check system dependencies
- Falls back to PDFKit
- Limited styling but functional

### Template Errors

- Validate template syntax before saving
- Use `{{log variable}}` for debugging
- Check Handlebars documentation

### Schedule Not Running

- Verify cron expression is valid
- Check schedule is enabled
- Review logs for errors
- Ensure schedule service is running

## Version

**v1.0.0** - Advanced Reporting Plugin

## License

Part of AI Security Scanner - MIT License
