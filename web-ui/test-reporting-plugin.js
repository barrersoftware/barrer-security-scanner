#!/usr/bin/env node
/**
 * Reporting Plugin Test Suite
 * Comprehensive tests for all reporting functionality
 */

const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// Initialize in-memory database for testing
const db = new sqlite3.Database(':memory:');
db.run = promisify(db.run.bind(db));
db.get = promisify(db.get.bind(db));
db.all = promisify(db.all.bind(db));
db.exec = promisify(db.exec.bind(db));

// Load plugin
const reportingPlugin = require('./plugins/reporting');

// Test configuration
const TEST_TENANT = 'tenant-test-reporting';
const testReports = [];
const testTemplates = [];

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTests() {
  console.log('\n' + '='.repeat(80));
  log('🧪 REPORTING PLUGIN TEST SUITE', 'cyan');
  console.log('='.repeat(80) + '\n');

  try {
    // Phase 1: Initialize
    await testInitialization();

    // Phase 2: Template Management
    await testTemplateManagement();

    // Phase 3: Report Generation
    await testReportGeneration();

    // Phase 4: Export Management
    await testExportManagement();

    // Phase 5: Historical Analysis
    await testHistoricalAnalysis();

    // Phase 6: Schedule Management
    await testScheduleManagement();

    // Phase 7: Integration
    await testIntegration();

    console.log('\n' + '='.repeat(80));
    log('✅ ALL TESTS PASSED!', 'green');
    console.log('='.repeat(80) + '\n');

    // Cleanup
    if (reportingPlugin.scheduleManager) {
      await reportingPlugin.scheduleManager.stopAllSchedules();
    }
    process.exit(0);

  } catch (error) {
    console.log('\n' + '='.repeat(80));
    log('❌ TEST FAILED', 'red');
    console.log('='.repeat(80));
    console.error(error);
    process.exit(1);
  }
}

/**
 * Phase 1: Test initialization
 */
async function testInitialization() {
  log('\n📦 Phase 1: Initialize Plugin', 'cyan');
  log('-'.repeat(80));

  const services = await reportingPlugin.init(db);

  if (!services.reportGenerator) throw new Error('ReportGenerator not initialized');
  if (!services.templateManager) throw new Error('TemplateManager not initialized');
  if (!services.scheduleManager) throw new Error('ScheduleManager not initialized');
  if (!services.historicalAnalyzer) throw new Error('HistoricalAnalyzer not initialized');
  if (!services.exportManager) throw new Error('ExportManager not initialized');
  if (!services.chartGenerator) throw new Error('ChartGenerator not initialized');

  log('   ✅ Plugin initialized', 'green');
  log('   ✅ ReportGenerator ready', 'green');
  log('   ✅ TemplateManager ready', 'green');
  log('   ✅ ScheduleManager ready', 'green');
  log('   ✅ HistoricalAnalyzer ready', 'green');
  log('   ✅ ExportManager ready', 'green');
  log('   ✅ ChartGenerator ready', 'green');

  // Verify database tables
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tables.map(t => t.name);

  if (!tableNames.includes('reports')) throw new Error('reports table not created');
  if (!tableNames.includes('report_templates')) throw new Error('report_templates table not created');
  if (!tableNames.includes('report_schedules')) throw new Error('report_schedules table not created');

  log(`   ✅ Database tables created: ${tableNames.length}`, 'green');
}

/**
 * Phase 2: Test template management
 */
async function testTemplateManagement() {
  log('\n📄 Phase 2: Template Management', 'cyan');
  log('-'.repeat(80));

  const templateManager = reportingPlugin.templateManager;

  // List default templates
  const defaultTemplates = await templateManager.listTemplates(TEST_TENANT);
  log(`   ✅ Listed default templates: ${defaultTemplates.length}`, 'green');

  if (defaultTemplates.length < 4) {
    throw new Error('Expected at least 4 default templates');
  }

  // Create custom template
  const customTemplate = await templateManager.createTemplate(TEST_TENANT, {
    name: 'test_template',
    description: 'Test template',
    content: '<h1>{{reportName}}</h1><p>{{description}}</p>',
    format: 'html'
  });

  testTemplates.push(customTemplate);
  log('   ✅ Created custom template', 'green');

  // Get template
  const templateContent = await templateManager.getTemplate(TEST_TENANT, customTemplate.id);
  if (!templateContent.includes('{{reportName}}')) {
    throw new Error('Template content not retrieved correctly');
  }
  log('   ✅ Retrieved template content', 'green');

  // Render template
  const rendered = await templateManager.render(templateContent, {
    reportName: 'Test Report',
    description: 'This is a test'
  });
  if (!rendered.includes('Test Report')) {
    throw new Error('Template rendering failed');
  }
  log('   ✅ Rendered template successfully', 'green');

  // Update template
  await templateManager.updateTemplate(TEST_TENANT, customTemplate.id, {
    description: 'Updated description'
  });
  log('   ✅ Updated template', 'green');

  // List templates again
  const allTemplates = await templateManager.listTemplates(TEST_TENANT);
  if (allTemplates.length !== defaultTemplates.length + 1) {
    throw new Error('Template count mismatch');
  }
  log(`   ✅ Template count correct: ${allTemplates.length}`, 'green');
}

/**
 * Phase 3: Test report generation
 */
async function testReportGeneration() {
  log('\n📊 Phase 3: Report Generation', 'cyan');
  log('-'.repeat(80));

  const reportGenerator = reportingPlugin.reportGenerator;

  // Sample data
  const testData = {
    target: 'example.com',
    totalVulnerabilities: 25,
    criticalCount: 5,
    highCount: 8,
    mediumCount: 7,
    lowCount: 5,
    riskScore: 72,
    vulnerabilities: [
      {
        title: 'SQL Injection',
        severity: 'critical',
        description: 'SQL injection vulnerability found',
        remediation: 'Use prepared statements'
      },
      {
        title: 'XSS Vulnerability',
        severity: 'high',
        description: 'Cross-site scripting vulnerability',
        remediation: 'Sanitize user input'
      }
    ],
    recommendations: [
      'Update all dependencies',
      'Enable security headers',
      'Implement input validation'
    ]
  };

  // Test HTML report
  log('   Testing HTML report generation...', 'yellow');
  const htmlReport = await reportGenerator.generateReport(TEST_TENANT, {
    name: 'Test HTML Report',
    description: 'Testing HTML format',
    template: 'detailed_technical',
    format: 'html',
    data: testData
  });

  if (!htmlReport.id || htmlReport.format !== 'html') {
    throw new Error('HTML report generation failed');
  }
  testReports.push(htmlReport);
  log('   ✅ Generated HTML report', 'green');

  // Test JSON report
  log('   Testing JSON report generation...', 'yellow');
  const jsonReport = await reportGenerator.generateReport(TEST_TENANT, {
    name: 'Test JSON Report',
    description: 'Testing JSON format',
    format: 'json',
    data: testData
  });

  if (!jsonReport.id || jsonReport.format !== 'json') {
    throw new Error('JSON report generation failed');
  }
  testReports.push(jsonReport);
  log('   ✅ Generated JSON report', 'green');

  // Test CSV report
  log('   Testing CSV report generation...', 'yellow');
  const csvReport = await reportGenerator.generateReport(TEST_TENANT, {
    name: 'Test CSV Report',
    description: 'Testing CSV format',
    format: 'csv',
    data: testData
  });

  if (!csvReport.id || csvReport.format !== 'csv') {
    throw new Error('CSV report generation failed');
  }
  testReports.push(csvReport);
  log('   ✅ Generated CSV report', 'green');

  // Test Markdown report
  log('   Testing Markdown report generation...', 'yellow');
  const mdReport = await reportGenerator.generateReport(TEST_TENANT, {
    name: 'Test Markdown Report',
    description: 'Testing Markdown format',
    format: 'markdown',
    data: testData
  });

  if (!mdReport.id || mdReport.format !== 'markdown') {
    throw new Error('Markdown report generation failed');
  }
  testReports.push(mdReport);
  log('   ✅ Generated Markdown report', 'green');

  // List reports
  const reports = await reportGenerator.listReports(TEST_TENANT);
  if (reports.length < 4) {
    throw new Error('Expected at least 4 reports');
  }
  log(`   ✅ Listed reports: ${reports.length}`, 'green');

  // Get single report
  const report = await reportGenerator.getReport(TEST_TENANT, htmlReport.id);
  if (report.name !== 'Test HTML Report') {
    throw new Error('Report retrieval failed');
  }
  log('   ✅ Retrieved single report', 'green');

  // Get report file info
  const fileInfo = await reportGenerator.getReportFile(TEST_TENANT, htmlReport.id);
  if (!fileInfo.filePath || !fileInfo.contentType) {
    throw new Error('Report file info retrieval failed');
  }
  log('   ✅ Got report file information', 'green');
}

/**
 * Phase 4: Test export management
 */
async function testExportManagement() {
  log('\n📤 Phase 4: Export Management', 'cyan');
  log('-'.repeat(80));

  const exportManager = reportingPlugin.exportManager;

  if (testReports.length === 0) {
    log('   ⚠️  Skipping export tests (no reports available)', 'yellow');
    return;
  }

  const reportToExport = testReports[0];

  // Export to JSON
  log('   Testing JSON export...', 'yellow');
  const jsonExport = await exportManager.exportReport(TEST_TENANT, reportToExport.id, 'json');
  if (!jsonExport.file_path) {
    throw new Error('JSON export failed');
  }
  log('   ✅ Exported to JSON', 'green');

  // Export to CSV
  log('   Testing CSV export...', 'yellow');
  const csvExport = await exportManager.exportReport(TEST_TENANT, reportToExport.id, 'csv');
  if (!csvExport.file_path) {
    throw new Error('CSV export failed');
  }
  log('   ✅ Exported to CSV', 'green');

  // Export to XML
  log('   Testing XML export...', 'yellow');
  const xmlExport = await exportManager.exportReport(TEST_TENANT, reportToExport.id, 'xml');
  if (!xmlExport.file_path) {
    throw new Error('XML export failed');
  }
  log('   ✅ Exported to XML', 'green');

  // Export to Markdown
  log('   Testing Markdown export...', 'yellow');
  const mdExport = await exportManager.exportReport(TEST_TENANT, reportToExport.id, 'markdown');
  if (!mdExport.file_path) {
    throw new Error('Markdown export failed');
  }
  log('   ✅ Exported to Markdown', 'green');

  log('   ✅ All export formats working', 'green');
}

/**
 * Phase 5: Test historical analysis
 */
async function testHistoricalAnalysis() {
  log('\n📈 Phase 5: Historical Analysis', 'cyan');
  log('-'.repeat(80));

  const historicalAnalyzer = reportingPlugin.historicalAnalyzer;

  if (testReports.length < 2) {
    log('   ⚠️  Skipping comparison tests (need at least 2 reports)', 'yellow');
  } else {
    // Compare reports
    log('   Testing report comparison...', 'yellow');
    const comparison = await historicalAnalyzer.compareReports(
      TEST_TENANT,
      [testReports[0].id, testReports[1].id]
    );

    if (!comparison.reports || !comparison.metrics) {
      throw new Error('Report comparison failed');
    }
    log('   ✅ Compared reports successfully', 'green');
    log(`   ✅ Comparison includes ${comparison.reports.length} reports`, 'green');
  }

  // Test trends analysis
  log('   Testing trend analysis...', 'yellow');
  const trends = await historicalAnalyzer.analyzeTrends(TEST_TENANT, { days: 30 });
  if (!trends.period || trends.reports_analyzed === undefined) {
    throw new Error('Trend analysis failed');
  }
  log(`   ✅ Analyzed trends (${trends.reports_analyzed} reports)`, 'green');

  // Test scan history (will be empty but should not error)
  log('   Testing scan history...', 'yellow');
  const history = await historicalAnalyzer.getScanHistory(TEST_TENANT, 'test-scan-id');
  log(`   ✅ Retrieved scan history (${history.length} entries)`, 'green');
}

/**
 * Phase 6: Test schedule management
 */
async function testScheduleManagement() {
  log('\n⏰ Phase 6: Schedule Management', 'cyan');
  log('-'.repeat(80));

  const scheduleManager = reportingPlugin.scheduleManager;

  // Create schedule
  log('   Testing schedule creation...', 'yellow');
  const schedule = await scheduleManager.createSchedule(TEST_TENANT, {
    name: 'Daily Report',
    description: 'Generate daily security report',
    reportConfig: {
      name: 'Daily Report',
      template: 'executive_summary',
      format: 'pdf',
      data: {
        totalVulnerabilities: 10,
        criticalCount: 2,
        riskScore: 45
      }
    },
    cronExpression: '0 9 * * *', // Daily at 9 AM
    enabled: false // Disabled for testing
  });

  if (!schedule.id || !schedule.cronExpression) {
    throw new Error('Schedule creation failed');
  }
  log('   ✅ Created schedule', 'green');

  // List schedules
  const schedules = await scheduleManager.listSchedules(TEST_TENANT);
  if (schedules.length < 1) {
    throw new Error('Expected at least 1 schedule');
  }
  log(`   ✅ Listed schedules: ${schedules.length}`, 'green');

  // Get schedule
  const retrievedSchedule = await scheduleManager.getSchedule(TEST_TENANT, schedule.id);
  if (retrievedSchedule.name !== 'Daily Report') {
    throw new Error('Schedule retrieval failed');
  }
  log('   ✅ Retrieved schedule', 'green');

  // Update schedule
  await scheduleManager.updateSchedule(TEST_TENANT, schedule.id, {
    description: 'Updated description'
  });
  log('   ✅ Updated schedule', 'green');

  // Delete schedule
  await scheduleManager.deleteSchedule(TEST_TENANT, schedule.id);
  log('   ✅ Deleted schedule', 'green');

  // Verify deletion
  const remainingSchedules = await scheduleManager.listSchedules(TEST_TENANT);
  if (remainingSchedules.length !== schedules.length - 1) {
    throw new Error('Schedule deletion verification failed');
  }
  log('   ✅ Schedule deletion verified', 'green');
}

/**
 * Phase 7: Test integration
 */
async function testIntegration() {
  log('\n🔗 Phase 7: Integration Testing', 'cyan');
  log('-'.repeat(80));

  // Test chart generation
  log('   Testing chart generation...', 'yellow');
  const chartGenerator = reportingPlugin.chartGenerator;
  const testChartData = {
    criticalCount: 5,
    highCount: 8,
    mediumCount: 7,
    lowCount: 5
  };

  const charts = await chartGenerator.generateCharts(testChartData);
  if (!charts || typeof charts !== 'object') {
    throw new Error('Chart generation failed');
  }
  log(`   ✅ Generated charts: ${Object.keys(charts).length}`, 'green');

  // Test full workflow: Template → Report → Export
  log('   Testing full workflow (Template → Report → Export)...', 'yellow');
  
  const templateManager = reportingPlugin.templateManager;
  const reportGenerator = reportingPlugin.reportGenerator;
  const exportManager = reportingPlugin.exportManager;

  // 1. Create template
  const workflowTemplate = await templateManager.createTemplate(TEST_TENANT, {
    name: 'workflow_template',
    description: 'Template for workflow test',
    content: '<h1>{{reportName}}</h1><p>Total: {{totalVulnerabilities}}</p>'
  });

  // 2. Generate report using template
  const workflowReport = await reportGenerator.generateReport(TEST_TENANT, {
    name: 'Workflow Test Report',
    template: workflowTemplate.id,
    format: 'html',
    data: {
      totalVulnerabilities: 42,
      criticalCount: 10
    }
  });

  // 3. Export report
  const workflowExport = await exportManager.exportReport(
    TEST_TENANT,
    workflowReport.id,
    'json'
  );

  if (!workflowExport.file_path) {
    throw new Error('Workflow test failed');
  }

  log('   ✅ Full workflow completed successfully', 'green');

  // Verify database state
  const reportCount = await db.get('SELECT COUNT(*) as count FROM reports WHERE tenant_id = ?', [TEST_TENANT]);
  const templateCount = await db.get('SELECT COUNT(*) as count FROM report_templates WHERE tenant_id = ?', [TEST_TENANT]);

  log(`   ✅ Database state: ${reportCount.count} reports, ${templateCount.count} templates`, 'green');

  // Test plugin metadata
  if (reportingPlugin.name !== 'reporting') {
    throw new Error('Plugin name mismatch');
  }
  if (reportingPlugin.version !== '1.0.0') {
    throw new Error('Plugin version mismatch');
  }

  log('   ✅ Plugin metadata correct', 'green');
  log(`   ✅ Plugin name: ${reportingPlugin.name}`, 'green');
  log(`   ✅ Plugin version: ${reportingPlugin.version}`, 'green');
}

// Run the tests
runTests();
