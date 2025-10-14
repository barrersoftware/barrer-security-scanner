/**
 * Template Manager Service
 * 
 * Manages policy templates for compliance frameworks
 */

const path = require('path');
const fs = require('fs').promises;

class TemplateManager {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.templates = [];
  }

  /**
   * Load templates from plugin.json
   */
  async loadTemplates() {
    try {
      const pluginJsonPath = path.join(__dirname, 'plugin.json');
      const content = await fs.readFile(pluginJsonPath, 'utf8');
      const config = JSON.parse(content);

      this.templates = config.templates || [];

      this.logger?.info(`[TemplateManager] Loaded ${this.templates.length} policy templates`);

      return this.templates;
    } catch (error) {
      this.logger?.error('[TemplateManager] Error loading templates:', error);
      this.templates = [];
      return [];
    }
  }

  /**
   * Get all templates or filter by category
   */
  getTemplates(category = null) {
    if (!category) {
      return this.templates;
    }

    return this.templates.filter(t => t.category === category);
  }

  /**
   * Get a specific template by ID
   */
  getTemplate(id) {
    return this.templates.find(t => t.id === id);
  }

  /**
   * Get template categories
   */
  getCategories() {
    const categories = new Set(this.templates.map(t => t.category));
    return Array.from(categories);
  }

  /**
   * Get template by framework
   */
  getTemplateByFramework(framework) {
    return this.templates.find(t => t.framework === framework);
  }

  /**
   * Get script path for template
   */
  getScriptPath(templateId) {
    const template = this.getTemplate(templateId);
    
    if (!template) {
      return null;
    }

    // Compliance scripts are in the compliance directory
    const complianceDir = path.join(__dirname, '..', '..', '..', 'compliance');
    return path.join(complianceDir, template.script);
  }

  /**
   * Validate template script exists
   */
  async validateTemplate(templateId) {
    const scriptPath = this.getScriptPath(templateId);
    
    if (!scriptPath) {
      return { valid: false, error: 'Template not found' };
    }

    try {
      await fs.access(scriptPath, fs.constants.X_OK);
      return { valid: true, scriptPath };
    } catch (error) {
      return { 
        valid: false, 
        error: `Script not executable: ${scriptPath}`,
        scriptPath 
      };
    }
  }

  /**
   * Get template metadata
   */
  getTemplateMetadata() {
    return {
      total: this.templates.length,
      byCategory: this.getCategories().map(cat => ({
        category: cat,
        count: this.getTemplates(cat).length,
        templates: this.getTemplates(cat).map(t => ({
          id: t.id,
          name: t.name,
          framework: t.framework
        }))
      }))
    };
  }
}

module.exports = TemplateManager;
