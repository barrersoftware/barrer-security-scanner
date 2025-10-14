/**
 * Policy Manager Service
 * 
 * Handles CRUD operations for security policies
 */

const { v4: uuidv4 } = require('uuid');

class PolicyManager {
  constructor(core) {
    this.core = core;
    this.db = core.db;
    this.logger = core.getService('logger');
  }

  /**
   * Initialize database tables
   */
  async init() {
    this.logger?.info('[PolicyManager] Creating database tables...');

    // Create policies table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        framework TEXT,
        template_id TEXT,
        schedule TEXT,
        schedule_enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        config TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, name)
      )
    `);

    // Create indexes
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_policies_tenant ON policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
      CREATE INDEX IF NOT EXISTS idx_policies_framework ON policies(framework);
      CREATE INDEX IF NOT EXISTS idx_policies_schedule_enabled ON policies(schedule_enabled);
    `);

    this.logger?.info('[PolicyManager] ✅ Database tables created');
  }

  /**
   * Create a new policy
   */
  async createPolicy(data) {
    const {
      tenantId,
      name,
      description,
      framework,
      templateId,
      schedule,
      scheduleEnabled = true,
      config = {},
      createdBy
    } = data;

    // Validate required fields
    if (!tenantId || !name) {
      throw new Error('tenantId and name are required');
    }

    // Check for duplicate name
    const existing = await this.db.get(
      'SELECT id FROM policies WHERE tenant_id = ? AND name = ?',
      [tenantId, name]
    );

    if (existing) {
      throw new Error(`Policy with name '${name}' already exists`);
    }

    const id = uuidv4();
    const configJson = JSON.stringify(config);

    await this.db.run(`
      INSERT INTO policies (
        id, tenant_id, name, description, framework, template_id,
        schedule, schedule_enabled, config, created_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `, [
      id, tenantId, name, description, framework, templateId,
      schedule, scheduleEnabled ? 1 : 0, configJson, createdBy
    ]);

    this.logger?.info(`[PolicyManager] Created policy: ${name} (${id})`);

    return this.getPolicy(id, tenantId);
  }

  /**
   * List policies with filters and pagination
   */
  async listPolicies(filters = {}, options = {}) {
    const { tenantId, status, framework } = filters;
    const { page = 1, limit = 50 } = options;

    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const offset = (page - 1) * limit;
    const conditions = ['tenant_id = ?'];
    const params = [tenantId];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (framework) {
      conditions.push('framework = ?');
      params.push(framework);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.db.get(
      `SELECT COUNT(*) as total FROM policies WHERE ${whereClause}`,
      params
    );

    const total = countResult.total;

    // Get policies
    const policies = await this.db.all(
      `SELECT * FROM policies WHERE ${whereClause} 
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Parse config JSON
    const parsedPolicies = policies.map(p => ({
      ...p,
      config: p.config ? JSON.parse(p.config) : {},
      scheduleEnabled: p.schedule_enabled === 1
    }));

    return {
      data: parsedPolicies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get a single policy by ID
   */
  async getPolicy(id, tenantId) {
    const policy = await this.db.get(
      'SELECT * FROM policies WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!policy) {
      return null;
    }

    return {
      ...policy,
      config: policy.config ? JSON.parse(policy.config) : {},
      scheduleEnabled: policy.schedule_enabled === 1
    };
  }

  /**
   * Update a policy
   */
  async updatePolicy(id, tenantId, updates) {
    const policy = await this.getPolicy(id, tenantId);
    
    if (!policy) {
      throw new Error('Policy not found');
    }

    const {
      name,
      description,
      schedule,
      scheduleEnabled,
      status,
      config
    } = updates;

    const updateFields = [];
    const params = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      params.push(name);
    }

    if (description !== undefined) {
      updateFields.push('description = ?');
      params.push(description);
    }

    if (schedule !== undefined) {
      updateFields.push('schedule = ?');
      params.push(schedule);
    }

    if (scheduleEnabled !== undefined) {
      updateFields.push('schedule_enabled = ?');
      params.push(scheduleEnabled ? 1 : 0);
    }

    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
    }

    if (config !== undefined) {
      updateFields.push('config = ?');
      params.push(JSON.stringify(config));
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length > 0) {
      params.push(id, tenantId);

      await this.db.run(
        `UPDATE policies SET ${updateFields.join(', ')} 
         WHERE id = ? AND tenant_id = ?`,
        params
      );

      this.logger?.info(`[PolicyManager] Updated policy: ${id}`);
    }

    return this.getPolicy(id, tenantId);
  }

  /**
   * Delete a policy
   */
  async deletePolicy(id, tenantId) {
    const policy = await this.getPolicy(id, tenantId);
    
    if (!policy) {
      throw new Error('Policy not found');
    }

    await this.db.run(
      'DELETE FROM policies WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    this.logger?.info(`[PolicyManager] Deleted policy: ${id}`);
  }

  /**
   * Create policy from template
   */
  async createFromTemplate(templateId, data) {
    const templateManager = this.core.getService('template-manager');
    
    if (!templateManager) {
      throw new Error('TemplateManager service not available');
    }

    const template = templateManager.getTemplate(templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const policyData = {
      ...data,
      framework: template.framework,
      templateId: template.id,
      config: {
        script: template.script,
        scriptArgs: template.framework ? ['--framework', template.framework] : []
      }
    };

    return this.createPolicy(policyData);
  }

  /**
   * Get policies by schedule status
   */
  async getScheduledPolicies(tenantId = null) {
    let query = `
      SELECT * FROM policies 
      WHERE schedule_enabled = 1 
        AND schedule IS NOT NULL 
        AND status = 'active'
    `;
    const params = [];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const policies = await this.db.all(query, params);

    return policies.map(p => ({
      ...p,
      config: p.config ? JSON.parse(p.config) : {},
      scheduleEnabled: true
    }));
  }
}

module.exports = PolicyManager;
