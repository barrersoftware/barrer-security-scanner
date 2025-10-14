/**
 * VPN Plugin
 * WireGuard and OpenVPN management with client configuration generation
 */

const express = require('express');
const WireGuardManager = require('./wireguard-manager');
const OpenVPNManager = require('./openvpn-manager');
const VPNMonitor = require('./vpn-monitor');
const ConnectionSecurity = require('./connection-security');

module.exports = {
  name: 'vpn',
  version: '1.1.0',

  async init(core) {
    this.core = core;
    this.logger = core.getService('logger');

    // Initialize VPN managers
    this.wireguardManager = new WireGuardManager(core);
    this.openvpnManager = new OpenVPNManager(core);
    this.vpnMonitor = new VPNMonitor(core);
    this.connectionSecurity = new ConnectionSecurity(core);

    // Register services
    core.registerService('wireguard-manager', this.wireguardManager);
    core.registerService('openvpn-manager', this.openvpnManager);
    core.registerService('vpn-monitor', this.vpnMonitor);
    core.registerService('connection-security', this.connectionSecurity);
    
    // Initialize connection security
    await this.connectionSecurity.init();

    // Check VPN software installation
    const wgInstalled = await this.wireguardManager.isInstalled();
    const ovpnInstalled = await this.openvpnManager.isInstalled();

    if (!wgInstalled && !ovpnInstalled) {
      this.logger?.warn('No VPN software installed. Please run the VPN installer.');
    } else {
      if (wgInstalled) {
        this.logger?.info('WireGuard detected');
      }
      if (ovpnInstalled) {
        this.logger?.info('OpenVPN detected');
      }
    }

    this.logger?.info('VPN plugin initialized');
  },

  routes() {
    const router = express.Router();

    // Get auth plugin and its middleware
    const authPlugin = this.core.pluginManager?.getPlugin('auth');
    
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
      requireAuth = (req, res, next) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      };
    }

    const requireAdmin = (req, res, next) => {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    };

    // === Overall Status ===
    router.get('/api/vpn/status', requireAuth, async (req, res) => {
      try {
        const status = await this.vpnMonitor.getOverallStatus(
          this.wireguardManager,
          this.openvpnManager
        );
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Health Check ===
    router.get('/api/vpn/health', requireAuth, async (req, res) => {
      try {
        const health = await this.vpnMonitor.getHealthCheck(
          this.wireguardManager,
          this.openvpnManager
        );
        res.json({ success: true, data: health });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Traffic Stats ===
    router.get('/api/vpn/traffic', requireAuth, async (req, res) => {
      try {
        const stats = await this.vpnMonitor.getTrafficStats();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // === Connection History ===
    router.get('/api/vpn/connections', requireAuth, async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const history = await this.vpnMonitor.getConnectionHistory(parseInt(limit));
        res.json({ success: true, data: history });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ==================== WireGuard Routes ====================

    router.get('/api/vpn/wireguard/status', requireAuth, async (req, res) => {
      try {
        const status = await this.wireguardManager.getStatus();
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/vpn/wireguard/statistics', requireAuth, async (req, res) => {
      try {
        const stats = await this.wireguardManager.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/wireguard/start', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.wireguardManager.start();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/wireguard/stop', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.wireguardManager.stop();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/wireguard/restart', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.wireguardManager.restart();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/vpn/wireguard/clients', requireAuth, async (req, res) => {
      try {
        const clients = await this.wireguardManager.listClients();
        res.json({ success: true, data: clients });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/wireguard/clients', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { clientName, serverEndpoint } = req.body;
        
        if (!clientName || !serverEndpoint) {
          return res.status(400).json({ error: 'clientName and serverEndpoint required' });
        }
        
        // Check VPN client limit for tenant
        const tenantId = req.tenantId || req.user?.tenantId;
        if (tenantId) {
          const resourceLimiter = this.core.getService('resource-limiter');
          if (resourceLimiter) {
            const canAddClient = await resourceLimiter.checkLimit(tenantId, 'vpnClients');
            if (!canAddClient) {
              return res.status(429).json({
                error: 'VPN client limit reached for your organization'
              });
            }
          }
        }
        
        const client = await this.wireguardManager.generateClientConfig(clientName, serverEndpoint);
        
        // Track VPN client usage
        if (tenantId) {
          const usageTracker = this.core.getService('usage-tracker');
          if (usageTracker) {
            await usageTracker.trackUsage(tenantId, 'vpnClients', 1);
          }
        }
        
        // Log audit event
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'wireguard_client_created',
            resource: `vpn:wireguard:${clientName}`,
            status: 'success',
            tenantId: tenantId || null,
            ip: req.ip
          });
        }
        
        res.json({ success: true, data: client, tenantId: tenantId || null });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.get('/api/vpn/wireguard/clients/:name', requireAuth, async (req, res) => {
      try {
        const config = await this.wireguardManager.getClientConfig(req.params.name);
        res.json({ success: true, data: { config } });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    router.delete('/api/vpn/wireguard/clients/:name', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.wireguardManager.removeClient(req.params.name);
        
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'wireguard_client_deleted',
            resource: `vpn:wireguard:${req.params.name}`,
            status: 'success',
            ip: req.ip
          });
        }
        
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    // ==================== OpenVPN Routes ====================

    router.get('/api/vpn/openvpn/status', requireAuth, async (req, res) => {
      try {
        const status = await this.openvpnManager.getStatus();
        res.json({ success: true, data: status });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/vpn/openvpn/statistics', requireAuth, async (req, res) => {
      try {
        const stats = await this.openvpnManager.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/openvpn/start', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.openvpnManager.start();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/openvpn/stop', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.openvpnManager.stop();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/openvpn/restart', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.openvpnManager.restart();
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.get('/api/vpn/openvpn/clients', requireAuth, async (req, res) => {
      try {
        const clients = await this.openvpnManager.listClients();
        res.json({ success: true, data: clients });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    router.post('/api/vpn/openvpn/clients', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { clientName, serverEndpoint } = req.body;
        
        if (!clientName || !serverEndpoint) {
          return res.status(400).json({ error: 'clientName and serverEndpoint required' });
        }
        
        // Check VPN client limit for tenant
        const tenantId = req.tenantId || req.user?.tenantId;
        if (tenantId) {
          const resourceLimiter = this.core.getService('resource-limiter');
          if (resourceLimiter) {
            const canAddClient = await resourceLimiter.checkLimit(tenantId, 'vpnClients');
            if (!canAddClient) {
              return res.status(429).json({
                error: 'VPN client limit reached for your organization'
              });
            }
          }
        }
        
        const client = await this.openvpnManager.generateClientConfig(clientName, serverEndpoint);
        
        // Track VPN client usage
        if (tenantId) {
          const usageTracker = this.core.getService('usage-tracker');
          if (usageTracker) {
            await usageTracker.trackUsage(tenantId, 'vpnClients', 1);
          }
        }
        
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'openvpn_client_created',
            resource: `vpn:openvpn:${clientName}`,
            status: 'success',
            tenantId: tenantId || null,
            ip: req.ip
          });
        }
        
        res.json({ success: true, data: client });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.get('/api/vpn/openvpn/clients/:name', requireAuth, async (req, res) => {
      try {
        const config = await this.openvpnManager.getClientConfig(req.params.name);
        res.json({ success: true, data: { config } });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    router.delete('/api/vpn/openvpn/clients/:name', requireAuth, requireAdmin, async (req, res) => {
      try {
        const result = await this.openvpnManager.removeClient(req.params.name);
        
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'openvpn_client_deleted',
            resource: `vpn:openvpn:${req.params.name}`,
            status: 'success',
            ip: req.ip
          });
        }
        
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(404).json({ error: error.message });
      }
    });

    // ==================== Connection Security Routes ====================

    // Verify connection security
    router.post('/api/vpn/security/verify', requireAuth, async (req, res) => {
      try {
        const { targetHost, sourceIp } = req.body;
        
        if (!targetHost) {
          return res.status(400).json({ error: 'targetHost required' });
        }
        
        const verification = await this.connectionSecurity.verifyConnection(
          targetHost,
          sourceIp || req.ip
        );
        
        res.json({ success: true, data: verification });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get security policies
    router.get('/api/vpn/security/policies', requireAuth, async (req, res) => {
      try {
        const policies = this.connectionSecurity.getPolicies();
        res.json({ success: true, data: policies });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update security policies
    router.put('/api/vpn/security/policies', requireAuth, requireAdmin, async (req, res) => {
      try {
        this.connectionSecurity.updatePolicies(req.body);
        
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'security_policies_updated',
            resource: 'vpn:security:policies',
            status: 'success',
            details: req.body,
            ip: req.ip
          });
        }
        
        res.json({ success: true, message: 'Security policies updated' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Add allowed network
    router.post('/api/vpn/security/allowed-networks', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { network } = req.body;
        
        if (!network) {
          return res.status(400).json({ error: 'network required (e.g., 10.8.0.0/24)' });
        }
        
        this.connectionSecurity.addAllowedNetwork(network);
        res.json({ success: true, message: `Network ${network} added to allowed list` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Add blocked network
    router.post('/api/vpn/security/blocked-networks', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { network } = req.body;
        
        if (!network) {
          return res.status(400).json({ error: 'network required (e.g., 192.168.1.0/24)' });
        }
        
        this.connectionSecurity.addBlockedNetwork(network);
        res.json({ success: true, message: `Network ${network} added to blocked list` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get security statistics
    router.get('/api/vpn/security/statistics', requireAuth, async (req, res) => {
      try {
        const stats = this.connectionSecurity.getStatistics();
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Enforce VPN requirement
    router.put('/api/vpn/security/enforce-vpn', requireAuth, requireAdmin, async (req, res) => {
      try {
        const { required } = req.body;
        
        if (typeof required !== 'boolean') {
          return res.status(400).json({ error: 'required must be true or false' });
        }
        
        this.connectionSecurity.enforceVPN(required);
        
        const auditLogger = this.core.getService('audit-logger');
        if (auditLogger) {
          await auditLogger.log({
            userId: req.user.id,
            username: req.user.username,
            action: 'vpn_enforcement_changed',
            resource: 'vpn:security:enforcement',
            status: 'success',
            details: { required },
            ip: req.ip
          });
        }
        
        res.json({ 
          success: true, 
          message: `VPN requirement ${required ? 'enabled' : 'disabled'}` 
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }
};
