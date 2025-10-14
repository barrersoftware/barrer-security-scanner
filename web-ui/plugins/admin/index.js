/**
 * Admin Plugin
 * User management, system monitoring, settings, and audit logs
 */

const express = require('express');
const UserManager = require('./user-manager');
const SystemMonitor = require('./system-monitor');
const AuditLogger = require('./audit-logger');
const SettingsManager = require('./settings-manager');

module.exports = {
  name: 'admin',
  version: '1.0.0',

  async init(core) {
    this.core = core;
    this.logger = core.getService('logger');

    // Initialize services
    this.userManager = new UserManager(core);
    this.systemMonitor = new SystemMonitor(core);
    this.auditLogger = new AuditLogger(core);
    this.settingsManager = new SettingsManager(core);

    // Initialize database
    try {
      await this.userManager.initDatabase();
      this.logger?.info('User database initialized');
    } catch (error) {
      this.logger?.error(`Failed to initialize user database: ${error.message}`);
      throw error;
    }

    // Register services
    core.registerService('user-manager', this.userManager);
    core.registerService('system-monitor', this.systemMonitor);
    core.registerService('audit-logger', this.auditLogger);
    core.registerService('settings-manager', this.settingsManager);

    // Load settings
    try {
      await this.settingsManager.loadSettings();
    } catch (error) {
      this.logger?.warn('Using default settings');
    }

    // Create default admin user if no users exist
    try {
      const users = await this.userManager.listUsers({ limit: 1 });
      if (users.users.length === 0) {
        await this.userManager.createUser({
          username: 'admin',
          email: 'admin@localhost',
          password: 'admin123',
          role: 'admin'
        });
        this.logger?.info('Default admin user created (username: admin, password: admin123)');
      }
    } catch (error) {
      this.logger?.warn('Could not create default admin user');
    }

    this.logger?.info('Admin plugin initialized');
  },

  routes() {
    const router = express.Router();

    // Get auth plugin and its middleware
    const authPlugin = this.core.pluginManager?.getPlugin('auth');
    
    // Use auth middleware if available, otherwise create fallback
    let requireAuth;
    if (authPlugin && authPlugin.middleware) {
      const authMiddleware = authPlugin.middleware();
      requireAuth = authMiddleware.requireAuth || ((req, res, next) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    } else {
      // Fallback middleware that checks for user object
      requireAuth = (req, res, next) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      };
    }

    const requireAdmin = (req, res, next) => {
      if (!req.user || req.user.role !== 'admin') {
        this.auditLogger.log({
          userId: req.user?.id,
          username: req.user?.username || 'anonymous',
          action: 'permission_denied',
          resource: req.path,
          status: 'failure',
          severity: 'warning',
          ip: req.ip
        });
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    };

    // === Dashboard ===
    router.get('/api/admin/dashboard', requireAuth, requireAdmin, async (req, res) => {
      try {
        const dashboard = await this.systemMonitor.getDashboard();
        res.json({ success: true, data: dashboard });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === System Monitoring ===
    router.get('/api/admin/system/health', requireAuth, requireAdmin, async (req, res) => {
      try {
        const health = await this.systemMonitor.getHealth();
        res.json({ success: true, data: health });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/system/resources', requireAuth, requireAdmin, async (req, res) => {
      try {
        const resources = await this.systemMonitor.getResources();
        res.json({ success: true, data: resources });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/system/logs', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { lines = 100, level } = req.query;
        const logs = await this.systemMonitor.getLogs({ 
          lines: parseInt(lines), 
          level 
        });
        res.json({ success: true, data: logs });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Plugin Management ===
    router.get('/api/admin/plugins', requireAuth, requireAdmin, async (req, res) => {
      try {
        const status = await this.systemMonitor.getPluginStatus();
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/plugins/services', requireAuth, requireAdmin, async (req, res) => {
      try {
        const services = await this.systemMonitor.getServiceStatus();
        res.json({ success: true, data: services });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === User Management ===
    router.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { page, limit, role, active, search } = req.query;
        const result = await this.userManager.listUsers({
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 50,
          role,
          active: active === 'true' ? true : active === 'false' ? false : null,
          search
        });
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'list_users',
          resource: 'users',
          status: 'success',
          ip: req.ip
        });

        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/users/stats', requireAuth, requireAdmin, async (req, res) => {
      try {
        const stats = await this.userManager.getUserStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/users/roles', requireAuth, requireAdmin, async (req, res) => {
      try {
        const roles = await this.userManager.listRoles();
        res.json({ success: true, data: roles });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        const user = await this.userManager.getUserById(req.params.id);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, data: user });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
      try {
        const user = await this.userManager.createUser(req.body);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'user_created',
          resource: `user:${user.id}`,
          details: { newUser: user.username, role: user.role },
          status: 'success',
          severity: 'info',
          ip: req.ip
        });

        res.status(201).json({ success: true, data: user });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        const user = await this.userManager.updateUser(req.params.id, req.body);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'user_updated',
          resource: `user:${user.id}`,
          details: { updates: req.body },
          status: 'success',
          ip: req.ip
        });

        res.json({ success: true, data: user });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
      try {
        // Prevent self-deletion
        if (req.params.id === String(req.user.id)) {
          return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const result = await this.userManager.deleteUser(req.params.id);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'user_deleted',
          resource: `user:${req.params.id}`,
          status: 'success',
          severity: 'warning',
          ip: req.ip
        });

        res.json({ success: true, data: result });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // === Audit Logs ===
    router.get('/api/admin/audit', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { page, limit, userId, username, action, resource, status, severity, startDate, endDate } = req.query;
        const result = await this.auditLogger.getLogs({
          page: page ? parseInt(page) : 1,
          limit: limit ? parseInt(limit) : 50,
          userId,
          username,
          action,
          resource,
          status,
          severity,
          startDate,
          endDate
        });
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/audit/stats', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { days = 7 } = req.query;
        const stats = await this.auditLogger.getStats(parseInt(days));
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/audit/security', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const events = await this.auditLogger.getSecurityEvents(parseInt(limit));
        res.json({ success: true, data: events });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/admin/audit/export', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { format = 'json', startDate, endDate } = req.body;
        const result = await this.auditLogger.exportLogs({ format, startDate, endDate });
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'audit_export',
          resource: 'audit',
          details: { format, count: result.count },
          status: 'success',
          ip: req.ip
        });

        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/admin/audit/clean', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.auditLogger.cleanOldLogs();
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'audit_clean',
          resource: 'audit',
          details: { removed: result.removed },
          status: 'success',
          ip: req.ip
        });

        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Settings Management ===
    router.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
      try {
        const settings = await this.settingsManager.getSettings();
        res.json({ success: true, data: settings });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/admin/settings/:category', requireAuth, requireAdmin, async (req, res) => {
      try {
        const category = await this.settingsManager.getCategory(req.params.category);
        res.json({ success: true, data: category });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    router.put('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
      try {
        const settings = await this.settingsManager.updateSettings(req.body);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'settings_updated',
          resource: 'settings',
          status: 'success',
          severity: 'info',
          ip: req.ip
        });

        res.json({ success: true, data: settings });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.put('/api/admin/settings/:category', requireAuth, requireAdmin, async (req, res) => {
      try {
        const category = await this.settingsManager.updateCategory(req.params.category, req.body);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'settings_updated',
          resource: `settings:${req.params.category}`,
          status: 'success',
          ip: req.ip
        });

        res.json({ success: true, data: category });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.post('/api/admin/settings/reset', requireAuth, requireAdmin, async (req, res) => {
      try {
        const settings = await this.settingsManager.resetSettings();
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'settings_reset',
          resource: 'settings',
          status: 'success',
          severity: 'warning',
          ip: req.ip
        });

        res.json({ success: true, data: settings });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/admin/settings/export', requireAuth, requireAdmin, async (req, res) => {
      try {
        const data = await this.settingsManager.exportSettings();
        res.json({ success: true, data });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/admin/settings/import', requireAuth, requireAdmin, async (req, res) => {
      try {
        const settings = await this.settingsManager.importSettings(req.body);
        
        await this.auditLogger.log({
          userId: req.user.id,
          username: req.user.username,
          action: 'settings_imported',
          resource: 'settings',
          status: 'success',
          severity: 'warning',
          ip: req.ip
        });

        res.json({ success: true, data: settings });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    return router;
  }
};
