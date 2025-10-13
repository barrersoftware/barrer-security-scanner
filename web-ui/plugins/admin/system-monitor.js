/**
 * System Monitor Service
 * Monitors system health, resources, plugins, and services
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class SystemMonitor {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.startTime = Date.now();
    this.metrics = {
      requests: 0,
      errors: 0,
      lastError: null
    };
  }

  /**
   * Get system health status
   */
  async getHealth() {
    try {
      const pluginManager = this.core.pluginManager;
      const serviceRegistry = this.core.serviceRegistry;

      const plugins = pluginManager ? pluginManager.plugins : new Map();
      const services = serviceRegistry ? serviceRegistry.services : new Map();

      // Check critical services
      const criticalServices = ['auth', 'logger', 'platform'];
      const missingServices = criticalServices.filter(s => !this.core.getService(s));

      const health = {
        status: missingServices.length === 0 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        system: {
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          nodeVersion: process.version
        },
        plugins: {
          total: plugins.size,
          loaded: Array.from(plugins.values()).filter(p => p.enabled !== false).length,
          list: Array.from(plugins.keys())
        },
        services: {
          total: services.size,
          list: Array.from(services.keys()),
          missing: missingServices
        },
        metrics: {
          requests: this.metrics.requests,
          errors: this.metrics.errors,
          lastError: this.metrics.lastError
        }
      };

      return health;
    } catch (error) {
      this.logger?.error(`Error getting health status: ${error.message}`);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get system resources (CPU, memory, disk)
   */
  async getResources() {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;

      const cpus = os.cpus();
      const loadAvg = os.loadavg();

      // Get disk space (Linux/Unix)
      let diskSpace = null;
      try {
        const platform = this.core.getService('platform');
        if (platform?.isLinux() || platform?.isMac()) {
          diskSpace = await this.getDiskSpace();
        }
      } catch (err) {
        // Disk space not available
      }

      return {
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
          totalGB: (totalMem / 1024 / 1024 / 1024).toFixed(2),
          usedGB: (usedMem / 1024 / 1024 / 1024).toFixed(2),
          freeGB: (freeMem / 1024 / 1024 / 1024).toFixed(2)
        },
        cpu: {
          count: cpus.length,
          model: cpus[0]?.model || 'Unknown',
          speed: cpus[0]?.speed || 0,
          loadAverage: {
            '1min': loadAvg[0].toFixed(2),
            '5min': loadAvg[1].toFixed(2),
            '15min': loadAvg[2].toFixed(2)
          }
        },
        disk: diskSpace,
        uptime: this.getUptime()
      };
    } catch (error) {
      this.logger?.error(`Error getting resources: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get disk space (Linux/Unix only)
   */
  async getDiskSpace() {
    try {
      const { execSync } = require('child_process');
      const output = execSync('df -k / | tail -1').toString();
      const parts = output.split(/\s+/);
      
      if (parts.length >= 6) {
        const total = parseInt(parts[1]) * 1024;
        const used = parseInt(parts[2]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        
        return {
          total,
          used,
          available,
          usagePercent: parts[4],
          totalGB: (total / 1024 / 1024 / 1024).toFixed(2),
          usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
          availableGB: (available / 1024 / 1024 / 1024).toFixed(2)
        };
      }
    } catch (error) {
      // Disk space check failed
    }
    return null;
  }

  /**
   * Get plugin status
   */
  async getPluginStatus() {
    try {
      const pluginManager = this.core.pluginManager;
      if (!pluginManager) {
        return { error: 'Plugin manager not available' };
      }

      const plugins = [];
      for (const [name, plugin] of pluginManager.plugins.entries()) {
        const config = plugin.config || {};
        plugins.push({
          name,
          version: config.version || '1.0.0',
          description: config.description || '',
          enabled: plugin.enabled !== false,
          priority: config.priority || 100,
          provides: config.provides || {},
          requires: config.requires || {}
        });
      }

      // Sort by priority
      plugins.sort((a, b) => (b.priority || 100) - (a.priority || 100));

      return {
        total: plugins.length,
        enabled: plugins.filter(p => p.enabled).length,
        disabled: plugins.filter(p => !p.enabled).length,
        plugins
      };
    } catch (error) {
      this.logger?.error(`Error getting plugin status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get service status
   */
  async getServiceStatus() {
    try {
      const serviceRegistry = this.core.serviceRegistry;
      if (!serviceRegistry) {
        return { error: 'Service registry not available' };
      }

      const services = [];
      for (const [name, service] of serviceRegistry.services.entries()) {
        services.push({
          name,
          type: typeof service,
          available: service !== null && service !== undefined,
          methods: this.getServiceMethods(service)
        });
      }

      return {
        total: services.length,
        services
      };
    } catch (error) {
      this.logger?.error(`Error getting service status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get methods available in a service
   */
  getServiceMethods(service) {
    if (!service || typeof service !== 'object') {
      return [];
    }

    const methods = [];
    const proto = Object.getPrototypeOf(service);
    
    // Get methods from instance
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== 'constructor' && typeof service[key] === 'function') {
        methods.push(key);
      }
    }

    return methods.slice(0, 10); // Limit to 10 methods
  }

  /**
   * Get application logs
   */
  async getLogs(options = {}) {
    try {
      const { lines = 100, level = null } = options;

      const logger = this.core.getService('logger');
      if (!logger || !logger.getRecentLogs) {
        return { error: 'Logger service does not support log retrieval' };
      }

      const logs = logger.getRecentLogs(lines, level);

      return {
        count: logs.length,
        logs
      };
    } catch (error) {
      this.logger?.error(`Error getting logs: ${error.message}`);
      return {
        error: error.message,
        logs: []
      };
    }
  }

  /**
   * Get dashboard overview
   */
  async getDashboard() {
    try {
      const [health, resources, plugins, services] = await Promise.all([
        this.getHealth(),
        this.getResources(),
        this.getPluginStatus(),
        this.getServiceStatus()
      ]);

      return {
        timestamp: new Date().toISOString(),
        health,
        resources,
        plugins: {
          total: plugins.total,
          enabled: plugins.enabled,
          disabled: plugins.disabled
        },
        services: {
          total: services.total
        }
      };
    } catch (error) {
      this.logger?.error(`Error getting dashboard: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record metrics
   */
  recordRequest() {
    this.metrics.requests++;
  }

  recordError(error) {
    this.metrics.errors++;
    this.metrics.lastError = {
      message: error.message || String(error),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get uptime in human-readable format
   */
  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSec = Math.floor(uptimeMs / 1000);
    
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    return {
      milliseconds: uptimeMs,
      seconds: uptimeSec,
      formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
    };
  }
}

module.exports = SystemMonitor;
