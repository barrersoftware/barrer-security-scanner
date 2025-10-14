/**
 * User Manager Service
 * Handles user CRUD operations, role management, and user queries
 * Enhanced with SQLite database persistence
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class UserManager {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.db = null;
    this.roles = new Map([
      ['admin', { permissions: ['*'] }],
      ['user', { permissions: ['read', 'scan', 'report:view'] }],
      ['auditor', { permissions: ['read', 'report:*', 'audit:view'] }]
    ]);
    this.initialized = false;
  }

  async initDatabase() {
    if (this.initialized) return;

    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'users.db');
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, async (err) => {
        if (err) {
          this.logger?.error(`Database connection failed: ${err.message}`);
          reject(err);
          return;
        }

        this.logger?.info(`User database connected: ${dbPath}`);

        try {
          await this.createTables();
          await this.createIndexes();
          this.initialized = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        active INTEGER NOT NULL DEFAULT 1,
        tenant_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login TEXT,
        login_count INTEGER DEFAULT 0
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.run(createUsersTable, (err) => {
        if (err) {
          this.logger?.error(`Failed to create users table: ${err.message}`);
          reject(err);
        } else {
          this.logger?.info('Users table ready');
          resolve();
        }
      });
    });
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)'
    ];

    for (const indexSql of indexes) {
      await new Promise((resolve, reject) => {
        this.db.run(indexSql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.logger?.info('Database indexes created');
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initDatabase();
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    await this.ensureInitialized();

    try {
      const { username, email, password, role = 'user', active = true, tenantId } = userData;

      // Validate input
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
      }

      // Check if user exists
      const existingByUsername = await this.findUserByUsername(username);
      if (existingByUsername) {
        throw new Error('Username already exists');
      }

      const existingByEmail = await this.findUserByEmail(email);
      if (existingByEmail) {
        throw new Error('Email already exists');
      }

      // Validate role
      if (!this.roles.has(role)) {
        throw new Error(`Invalid role: ${role}`);
      }

      // Validate tenant if provided
      if (tenantId) {
        const tenantManager = this.core.getService('tenant-manager');
        if (tenantManager) {
          const tenant = await tenantManager.getTenant(tenantId);
          if (!tenant) {
            throw new Error(`Invalid tenant ID: ${tenantId}`);
          }
          if (tenant.status !== 'active') {
            throw new Error(`Tenant is ${tenant.status}, cannot add users`);
          }
        }
      }

      // Hash password
      let hashedPassword = password;
      try {
        const authService = this.core.getService('auth');
        if (authService && authService.hashPassword) {
          hashedPassword = await authService.hashPassword(password);
        } else {
          const bcrypt = require('bcryptjs');
          hashedPassword = await bcrypt.hash(password, 10);
        }
      } catch (error) {
        const bcrypt = require('bcryptjs');
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const now = new Date().toISOString();
      const sql = `
        INSERT INTO users (username, email, password, role, active, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const self = this;
      return new Promise((resolve, reject) => {
        self.db.run(sql, [username, email, hashedPassword, role, active ? 1 : 0, tenantId || null, now, now], function(err) {
          if (err) {
            self.logger?.error(`Error creating user: ${err.message}`);
            reject(err);
            return;
          }

          self.logger?.info(`User created: ${username} (${email}) with role ${role}${tenantId ? ` in tenant ${tenantId}` : ''}`);

          // Fetch the created user
          const insertedId = this.lastID;
          self.db.get('SELECT * FROM users WHERE id = ?', [insertedId], (err, user) => {
            if (err) {
              reject(err);
            } else {
              resolve(self.sanitizeUser(self.rowToUser(user)));
            }
          });
        });
      });
    } catch (error) {
      this.logger?.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? this.sanitizeUser(this.rowToUser(row)) : null);
        }
      });
    });
  }

  /**
   * Get user by username
   */
  async findUserByUsername(username) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? this.rowToUser(row) : null);
        }
      });
    });
  }

  /**
   * Get user by email
   */
  async findUserByEmail(email) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? this.rowToUser(row) : null);
        }
      });
    });
  }

  /**
   * Convert database row to user object
   */
  rowToUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      active: row.active === 1,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLogin: row.last_login,
      loginCount: row.login_count || 0
    };
  }

  /**
   * List all users with pagination and filters
   */
  async listUsers(options = {}) {
    await this.ensureInitialized();

    const {
      page = 1,
      limit = 50,
      role = null,
      active = null,
      search = null,
      tenantId = null
    } = options;

    let whereClauses = [];
    let params = [];

    if (role) {
      whereClauses.push('role = ?');
      params.push(role);
    }

    if (active !== null) {
      whereClauses.push('active = ?');
      params.push(active ? 1 : 0);
    }

    if (tenantId !== null) {
      whereClauses.push('tenant_id = ?');
      params.push(tenantId);
    }

    if (search) {
      whereClauses.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    
    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM users ${whereClause}`;
    const total = await new Promise((resolve, reject) => {
      this.db.get(countSql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    // Get paginated results
    const offset = (page - 1) * limit;
    const dataSql = `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const dataParams = [...params, limit, offset];

    const users = await new Promise((resolve, reject) => {
      this.db.all(dataSql, dataParams, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => this.sanitizeUser(this.rowToUser(row))));
      });
    });

    const totalPages = Math.ceil(total / limit);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    await this.ensureInitialized();

    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const allowedFields = ['email', 'role', 'active', 'tenant_id'];
      let setClauses = [];
      let params = [];

      for (const [key, value] of Object.entries(updates)) {
        // Map camelCase to snake_case for database
        const dbKey = key === 'tenantId' ? 'tenant_id' : key;
        
        if (allowedFields.includes(dbKey)) {
          if (key === 'role' && !this.roles.has(value)) {
            throw new Error(`Invalid role: ${value}`);
          }

          if (key === 'tenantId' && value !== null) {
            const tenantManager = this.core.getService('tenant-manager');
            if (tenantManager) {
              const tenant = await tenantManager.getTenant(value);
              if (!tenant) {
                throw new Error(`Invalid tenant ID: ${value}`);
              }
            }
          }

          setClauses.push(`${dbKey} = ?`);
          params.push(key === 'active' ? (value ? 1 : 0) : value);
        }
      }

      if (setClauses.length === 0) {
        return user;
      }

      setClauses.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(userId);

      const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;

      await new Promise((resolve, reject) => {
        this.db.run(sql, params, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.logger?.info(`User updated: ID ${userId}`);

      return await this.getUserById(userId);
    } catch (error) {
      this.logger?.error(`Error updating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId) {
    await this.ensureInitialized();

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await new Promise((resolve, reject) => {
      this.db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger?.info(`User deleted: ${user.username}`);

    return { success: true, message: 'User deleted' };
  }

  /**
   * Change user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    await this.ensureInitialized();

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get full user with password
    const fullUser = await new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(this.rowToUser(row));
      });
    });

    // Verify old password
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(oldPassword, fullUser.password);
    if (!valid) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();

    await new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET password = ?, updated_at = ? WHERE id = ?', 
        [hashedPassword, now, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger?.info(`Password changed for user: ${user.username}`);

    return { success: true, message: 'Password changed' };
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    await this.ensureInitialized();

    const stats = await new Promise((resolve, reject) => {
      const queries = {
        total: 'SELECT COUNT(*) as count FROM users',
        active: 'SELECT COUNT(*) as count FROM users WHERE active = 1',
        inactive: 'SELECT COUNT(*) as count FROM users WHERE active = 0',
        byRole: 'SELECT role, COUNT(*) as count FROM users GROUP BY role',
        recentLogins: 'SELECT username, last_login, login_count FROM users WHERE last_login IS NOT NULL ORDER BY last_login DESC LIMIT 10'
      };

      Promise.all([
        new Promise((res, rej) => this.db.get(queries.total, (err, row) => err ? rej(err) : res(row.count))),
        new Promise((res, rej) => this.db.get(queries.active, (err, row) => err ? rej(err) : res(row.count))),
        new Promise((res, rej) => this.db.get(queries.inactive, (err, row) => err ? rej(err) : res(row.count))),
        new Promise((res, rej) => this.db.all(queries.byRole, (err, rows) => err ? rej(err) : res(rows))),
        new Promise((res, rej) => this.db.all(queries.recentLogins, (err, rows) => err ? rej(err) : res(rows)))
      ]).then(([total, active, inactive, byRole, recentLogins]) => {
        const byRoleObj = {};
        byRole.forEach(r => { byRoleObj[r.role] = r.count; });

        resolve({
          total,
          active,
          inactive,
          byRole: byRoleObj,
          recentLogins: recentLogins.map(u => ({
            username: u.username,
            lastLogin: u.last_login,
            loginCount: u.login_count
          }))
        });
      }).catch(reject);
    });

    return stats;
  }

  /**
   * List available roles
   */
  async listRoles() {
    const roles = [];
    for (const [name, details] of this.roles.entries()) {
      roles.push({
        name,
        permissions: details.permissions
      });
    }
    return roles;
  }

  /**
   * Record user login
   */
  async recordLogin(userId) {
    await this.ensureInitialized();

    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET last_login = ?, login_count = login_count + 1 WHERE id = ?',
        [now, userId],
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  /**
   * Get users by tenant ID
   */
  async getUsersByTenant(tenantId) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users WHERE tenant_id = ?', [tenantId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => this.sanitizeUser(this.rowToUser(row))));
      });
    });
  }

  /**
   * Count users in a tenant
   */
  async countUsersByTenant(tenantId) {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [tenantId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  /**
   * Move user to different tenant
   */
  async moveUserToTenant(userId, newTenantId) {
    await this.ensureInitialized();

    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate new tenant
    if (newTenantId !== null) {
      const tenantManager = this.core.getService('tenant-manager');
      if (tenantManager) {
        const tenant = await tenantManager.getTenant(newTenantId);
        if (!tenant) {
          throw new Error(`Invalid tenant ID: ${newTenantId}`);
        }
        if (tenant.status !== 'active') {
          throw new Error(`Tenant is ${tenant.status}, cannot move user`);
        }
      }
    }

    const oldTenantId = user.tenantId;
    const now = new Date().toISOString();

    await new Promise((resolve, reject) => {
      this.db.run('UPDATE users SET tenant_id = ?, updated_at = ? WHERE id = ?',
        [newTenantId, now, userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger?.info(`User ${user.username} moved from tenant ${oldTenantId} to ${newTenantId}`);

    return await this.getUserById(userId);
  }

  /**
   * Remove password from user object
   */
  sanitizeUser(user) {
    if (!user) return null;
    const { password, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

module.exports = UserManager;
