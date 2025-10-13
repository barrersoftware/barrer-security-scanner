/**
 * User Manager Service
 * Handles user CRUD operations, role management, and user queries
 */

class UserManager {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.db = this.initDatabase();
  }

  initDatabase() {
    // In-memory database for demo (replace with real DB in production)
    return {
      users: new Map(),
      roles: new Map([
        ['admin', { permissions: ['*'] }],
        ['user', { permissions: ['read', 'scan', 'report:view'] }],
        ['auditor', { permissions: ['read', 'report:*', 'audit:view'] }]
      ]),
      nextId: 1
    };
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    try {
      const { username, email, password, role = 'user', active = true } = userData;

      // Validate input
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
      }

      // Check if user exists
      if (this.findUserByUsername(username)) {
        throw new Error('Username already exists');
      }

      if (this.findUserByEmail(email)) {
        throw new Error('Email already exists');
      }

      // Validate role
      if (!this.db.roles.has(role)) {
        throw new Error(`Invalid role: ${role}`);
      }

      // Hash password (in production, use auth service)
      let hashedPassword = password;
      try {
        const authService = this.core.getService('auth');
        if (authService && authService.hashPassword) {
          hashedPassword = await authService.hashPassword(password);
        } else {
          // Fallback to bcrypt if auth service not available
          const bcrypt = require('bcryptjs');
          hashedPassword = await bcrypt.hash(password, 10);
        }
      } catch (error) {
        // If hashing fails, use bcrypt directly
        const bcrypt = require('bcryptjs');
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const userId = this.db.nextId++;
      const user = {
        id: userId,
        username,
        email,
        password: hashedPassword,
        role,
        active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLogin: null,
        loginCount: 0
      };

      this.db.users.set(userId, user);

      this.logger?.info(`User created: ${username} (${email}) with role ${role}`);

      // Return user without password
      return this.sanitizeUser(user);
    } catch (error) {
      this.logger?.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const user = this.db.users.get(parseInt(userId));
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Get user by username
   */
  findUserByUsername(username) {
    for (const user of this.db.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  /**
   * Get user by email
   */
  findUserByEmail(email) {
    for (const user of this.db.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * List all users with pagination and filters
   */
  async listUsers(options = {}) {
    const {
      page = 1,
      limit = 50,
      role = null,
      active = null,
      search = null
    } = options;

    let users = Array.from(this.db.users.values());

    // Apply filters
    if (role) {
      users = users.filter(u => u.role === role);
    }

    if (active !== null) {
      users = users.filter(u => u.active === active);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => 
        u.username.toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date (newest first)
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = users.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedUsers = users.slice(offset, offset + limit);

    return {
      users: paginatedUsers.map(u => this.sanitizeUser(u)),
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
    try {
      const user = this.db.users.get(parseInt(userId));
      if (!user) {
        throw new Error('User not found');
      }

      // Don't allow updating certain fields
      const allowedFields = ['email', 'role', 'active'];
      
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          // Validate role if updating
          if (key === 'role' && !this.db.roles.has(value)) {
            throw new Error(`Invalid role: ${value}`);
          }
          user[key] = value;
        }
      }

      user.updatedAt = new Date().toISOString();

      this.logger?.info(`User updated: ${user.username}`);

      return this.sanitizeUser(user);
    } catch (error) {
      this.logger?.error(`Error updating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId) {
    const user = this.db.users.get(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    this.db.users.delete(parseInt(userId));
    this.logger?.info(`User deleted: ${user.username}`);

    return { success: true, message: 'User deleted' };
  }

  /**
   * Change user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = this.db.users.get(parseInt(userId));
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date().toISOString();

    this.logger?.info(`Password changed for user: ${user.username}`);

    return { success: true, message: 'Password changed' };
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    const users = Array.from(this.db.users.values());

    const stats = {
      total: users.length,
      active: users.filter(u => u.active).length,
      inactive: users.filter(u => !u.active).length,
      byRole: {},
      recentLogins: users
        .filter(u => u.lastLogin)
        .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin))
        .slice(0, 10)
        .map(u => ({
          username: u.username,
          lastLogin: u.lastLogin,
          loginCount: u.loginCount
        }))
    };

    // Count by role
    for (const role of this.db.roles.keys()) {
      stats.byRole[role] = users.filter(u => u.role === role).length;
    }

    return stats;
  }

  /**
   * List available roles
   */
  async listRoles() {
    const roles = [];
    for (const [name, details] of this.db.roles.entries()) {
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
    const user = this.db.users.get(parseInt(userId));
    if (user) {
      user.lastLogin = new Date().toISOString();
      user.loginCount = (user.loginCount || 0) + 1;
    }
  }

  /**
   * Remove password from user object
   */
  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}

module.exports = UserManager;
