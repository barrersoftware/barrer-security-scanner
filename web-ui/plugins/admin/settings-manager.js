/**
 * Settings Manager Service
 * Manages application settings and configuration
 */

const fs = require('fs').promises;
const path = require('path');

class SettingsManager {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.settings = this.getDefaultSettings();
    this.settingsFile = path.join(process.cwd(), 'data', 'config', 'settings.json');
  }

  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      general: {
        appName: 'AI Security Scanner',
        appVersion: '4.0.0',
        timezone: 'UTC',
        language: 'en',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h'
      },
      security: {
        sessionTimeout: 3600000, // 1 hour
        maxLoginAttempts: 5,
        lockoutDuration: 900000, // 15 minutes
        passwordMinLength: 8,
        passwordRequireSpecialChar: true,
        passwordRequireNumber: true,
        passwordRequireUppercase: true,
        enableMFA: false,
        enableIPWhitelist: false,
        ipWhitelist: []
      },
      scanning: {
        defaultScanType: 'comprehensive',
        maxConcurrentScans: 3,
        scanTimeout: 3600000, // 1 hour
        autoScanEnabled: false,
        autoScanSchedule: '0 2 * * *', // 2 AM daily
        saveReportsAutomatically: true,
        notifyOnScanComplete: true
      },
      storage: {
        maxBackups: 10,
        backupRetentionDays: 30,
        reportRetentionDays: 90,
        enableSFTP: false,
        sftpHosts: [],
        autoBackupEnabled: false,
        autoBackupSchedule: '0 3 * * 0' // 3 AM every Sunday
      },
      notifications: {
        enableEmail: false,
        emailServer: '',
        emailPort: 587,
        emailUser: '',
        emailFrom: '',
        enableSlack: false,
        slackWebhook: '',
        notifyOnError: true,
        notifyOnCritical: true,
        notifyOnScanComplete: false
      },
      audit: {
        enableAuditLog: true,
        auditRetentionDays: 90,
        logLevel: 'info',
        logUserActions: true,
        logSystemEvents: true,
        logSecurityEvents: true
      }
    };
  }

  /**
   * Load settings from file
   */
  async loadSettings() {
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      const loaded = JSON.parse(data);
      
      // Merge with defaults (in case new settings were added)
      this.settings = this.deepMerge(this.getDefaultSettings(), loaded);
      
      this.logger?.info('Settings loaded from file');
      return this.settings;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger?.info('Settings file not found, using defaults');
        return this.settings;
      }
      this.logger?.error(`Error loading settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save settings to file
   */
  async saveSettings() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.settingsFile);
      await fs.mkdir(dir, { recursive: true });

      // Write settings
      await fs.writeFile(
        this.settingsFile,
        JSON.stringify(this.settings, null, 2),
        'utf8'
      );

      this.logger?.info('Settings saved to file');
      return true;
    } catch (error) {
      this.logger?.error(`Error saving settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all settings
   */
  async getSettings() {
    return this.settings;
  }

  /**
   * Get settings by category
   */
  async getCategory(category) {
    if (!this.settings[category]) {
      throw new Error(`Category not found: ${category}`);
    }
    return this.settings[category];
  }

  /**
   * Update settings
   */
  async updateSettings(updates) {
    try {
      // Deep merge updates into current settings
      this.settings = this.deepMerge(this.settings, updates);

      // Save to file
      await this.saveSettings();

      this.logger?.info('Settings updated');
      return this.settings;
    } catch (error) {
      this.logger?.error(`Error updating settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update specific category
   */
  async updateCategory(category, updates) {
    try {
      if (!this.settings[category]) {
        throw new Error(`Category not found: ${category}`);
      }

      // Merge updates into category
      this.settings[category] = {
        ...this.settings[category],
        ...updates
      };

      // Save to file
      await this.saveSettings();

      this.logger?.info(`Settings category updated: ${category}`);
      return this.settings[category];
    } catch (error) {
      this.logger?.error(`Error updating category: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset settings to defaults
   */
  async resetSettings() {
    try {
      this.settings = this.getDefaultSettings();
      await this.saveSettings();

      this.logger?.info('Settings reset to defaults');
      return this.settings;
    } catch (error) {
      this.logger?.error(`Error resetting settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset specific category to defaults
   */
  async resetCategory(category) {
    try {
      const defaults = this.getDefaultSettings();
      if (!defaults[category]) {
        throw new Error(`Category not found: ${category}`);
      }

      this.settings[category] = defaults[category];
      await this.saveSettings();

      this.logger?.info(`Settings category reset: ${category}`);
      return this.settings[category];
    } catch (error) {
      this.logger?.error(`Error resetting category: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export settings
   */
  async exportSettings() {
    return {
      exported: new Date().toISOString(),
      version: this.settings.general.appVersion,
      settings: this.settings
    };
  }

  /**
   * Import settings
   */
  async importSettings(data) {
    try {
      if (!data.settings) {
        throw new Error('Invalid settings data');
      }

      // Merge imported settings with defaults
      this.settings = this.deepMerge(this.getDefaultSettings(), data.settings);
      
      await this.saveSettings();

      this.logger?.info('Settings imported');
      return this.settings;
    } catch (error) {
      this.logger?.error(`Error importing settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}

module.exports = SettingsManager;
