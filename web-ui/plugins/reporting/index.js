/**
 * Advanced Reporting Plugin
 * PDF generation, custom templates, scheduled reports, historical analysis
 */

const ReportGenerator = require('./report-generator');
const TemplateManager = require('./template-manager');
const ScheduleManager = require('./schedule-manager');
const HistoricalAnalyzer = require('./historical-analyzer');
const ExportManager = require('./export-manager');
const ChartGenerator = require('./chart-generator');
const { logger } = require('../../shared/logger');
const path = require('path');
const fs = require('fs').promises;

class ReportingPlugin {
  constructor() {
    this.name = 'reporting';
    this.version = '1.0.0';
    this.logger = logger;
    
    // Services
    this.reportGenerator = null;
    this.templateManager = null;
    this.scheduleManager = null;
    this.historicalAnalyzer = null;
    this.exportManager = null;
    this.chartGenerator = null;
    
    // Directories
    this.reportsDir = path.join(__dirname, '../../reports');
    this.templatesDir = path.join(__dirname, 'templates');
  }

  /**
   * Initialize plugin
   */
  async init(db, services = {}) {
    this.logger.info('[ReportingPlugin] Initializing...');

    // Ensure directories exist
    await this.ensureDirectories();

    // Initialize services
    this.templateManager = new TemplateManager(db, this.templatesDir);
    await this.templateManager.init();

    this.chartGenerator = new ChartGenerator();
    await this.chartGenerator.init();

    this.reportGenerator = new ReportGenerator(db, this.templateManager, this.chartGenerator, this.reportsDir);
    await this.reportGenerator.init();

    this.exportManager = new ExportManager(db, this.reportsDir);
    await this.exportManager.init();

    this.historicalAnalyzer = new HistoricalAnalyzer(db);
    await this.historicalAnalyzer.init();

    this.scheduleManager = new ScheduleManager(
      db,
      this.reportGenerator,
      services.notificationManager // Optional integration
    );
    await this.scheduleManager.init();

    this.logger.info('[ReportingPlugin] ✅ Initialized');

    return {
      reportGenerator: this.reportGenerator,
      templateManager: this.templateManager,
      scheduleManager: this.scheduleManager,
      historicalAnalyzer: this.historicalAnalyzer,
      exportManager: this.exportManager,
      chartGenerator: this.chartGenerator
    };
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      await fs.mkdir(this.templatesDir, { recursive: true });
      this.logger.debug('[ReportingPlugin] Directories ensured');
    } catch (error) {
      this.logger.error('[ReportingPlugin] Error creating directories:', error);
      throw error;
    }
  }

  /**
   * Register API routes
   */
  routes(router, authenticateToken, getTenantId) {
    // ============================================
    // Report Generation Routes
    // ============================================

    // Generate report
    router.post('/api/reports/generate', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const report = await this.reportGenerator.generateReport(tenantId, req.body);
        res.json({ success: true, report });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error generating report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // List reports
    router.get('/api/reports', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const reports = await this.reportGenerator.listReports(tenantId, req.query);
        res.json({ success: true, reports });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error listing reports:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get report
    router.get('/api/reports/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const report = await this.reportGenerator.getReport(tenantId, req.params.id);
        res.json({ success: true, report });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error getting report:', error);
        res.status(404).json({ success: false, error: error.message });
      }
    });

    // Delete report
    router.delete('/api/reports/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        await this.reportGenerator.deleteReport(tenantId, req.params.id);
        res.json({ success: true, message: 'Report deleted' });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error deleting report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Download report
    router.get('/api/reports/:id/download', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const { filePath, filename, contentType } = await this.reportGenerator.getReportFile(tenantId, req.params.id);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.sendFile(filePath);
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error downloading report:', error);
        res.status(404).json({ success: false, error: error.message });
      }
    });

    // Export report to different format
    router.post('/api/reports/:id/export', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const exported = await this.exportManager.exportReport(tenantId, req.params.id, req.body.format);
        res.json({ success: true, exported });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error exporting report:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // Template Management Routes
    // ============================================

    // List templates
    router.get('/api/reports/templates', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const templates = await this.templateManager.listTemplates(tenantId);
        res.json({ success: true, templates });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error listing templates:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Create custom template
    router.post('/api/reports/templates', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const template = await this.templateManager.createTemplate(tenantId, req.body);
        res.json({ success: true, template });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error creating template:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update template
    router.put('/api/reports/templates/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const template = await this.templateManager.updateTemplate(tenantId, req.params.id, req.body);
        res.json({ success: true, template });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error updating template:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete template
    router.delete('/api/reports/templates/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        await this.templateManager.deleteTemplate(tenantId, req.params.id);
        res.json({ success: true, message: 'Template deleted' });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // Schedule Management Routes
    // ============================================

    // Create schedule
    router.post('/api/reports/schedule', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const schedule = await this.scheduleManager.createSchedule(tenantId, req.body);
        res.json({ success: true, schedule });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error creating schedule:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // List schedules
    router.get('/api/reports/schedules', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const schedules = await this.scheduleManager.listSchedules(tenantId);
        res.json({ success: true, schedules });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error listing schedules:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update schedule
    router.put('/api/reports/schedules/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const schedule = await this.scheduleManager.updateSchedule(tenantId, req.params.id, req.body);
        res.json({ success: true, schedule });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error updating schedule:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete schedule
    router.delete('/api/reports/schedules/:id', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        await this.scheduleManager.deleteSchedule(tenantId, req.params.id);
        res.json({ success: true, message: 'Schedule deleted' });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error deleting schedule:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // Historical Analysis Routes
    // ============================================

    // Compare reports
    router.post('/api/reports/compare', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const comparison = await this.historicalAnalyzer.compareReports(tenantId, req.body.reportIds);
        res.json({ success: true, comparison });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error comparing reports:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get scan history
    router.get('/api/reports/history/:scanId', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const history = await this.historicalAnalyzer.getScanHistory(tenantId, req.params.scanId);
        res.json({ success: true, history });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error getting history:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get trends
    router.get('/api/reports/trends', authenticateToken, async (req, res) => {
      try {
        const tenantId = await getTenantId(req);
        const trends = await this.historicalAnalyzer.analyzeTrends(tenantId, req.query);
        res.json({ success: true, trends });
      } catch (error) {
        this.logger.error('[ReportingPlugin] Error analyzing trends:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    this.logger.info('[ReportingPlugin] Shutting down...');
    
    if (this.scheduleManager) {
      await this.scheduleManager.stopAllSchedules();
    }
    
    this.logger.info('[ReportingPlugin] Shutdown complete');
  }
}

module.exports = new ReportingPlugin();
