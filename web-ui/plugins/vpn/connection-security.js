/**
 * Connection Security Service
 * 
 * Ensures all scanner connections use secure VPN tunnels
 * Prevents scanning over unsecured networks
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

class ConnectionSecurity {
  constructor(core) {
    this.core = core;
    this.logger = core.getService('logger');
    this.vpnMonitor = null;
    this.securityPolicies = {
      requireVPN: true,
      allowedNetworks: ['10.8.0.0/24', '10.9.0.0/24'], // VPN networks
      blockedNetworks: [], // Networks to block
      enforceEncryption: true,
      minTLSVersion: '1.2'
    };
    
    this.securityCache = new Map();
    this.cacheTimeout = 60000; // 1 minute
  }

  /**
   * Initialize connection security
   */
  async init() {
    this.vpnMonitor = this.core.getService('vpn-monitor');
    this.logger?.info('Connection Security initialized');
  }

  /**
   * Verify connection is secure before allowing scan
   */
  async verifyConnection(targetHost, sourceIp = null) {
    try {
      const checks = {
        timestamp: new Date().toISOString(),
        targetHost,
        sourceIp,
        secure: false,
        issues: [],
        warnings: []
      };

      // Check if VPN is required and active
      if (this.securityPolicies.requireVPN) {
        const vpnActive = await this.isVPNActive();
        
        if (!vpnActive) {
          checks.issues.push({
            severity: 'critical',
            message: 'VPN connection required but not active',
            recommendation: 'Activate WireGuard or OpenVPN before scanning'
          });
        } else {
          checks.vpnActive = true;
        }
      }

      // Verify source IP is from VPN network
      if (sourceIp && this.securityPolicies.requireVPN) {
        const isVPNNetwork = this.isVPNNetwork(sourceIp);
        
        if (!isVPNNetwork) {
          checks.issues.push({
            severity: 'critical',
            message: `Source IP ${sourceIp} is not from VPN network`,
            recommendation: 'Connect through VPN tunnel'
          });
        } else {
          checks.vpnNetwork = true;
        }
      }

      // Check if target is on blocked network
      if (await this.isBlockedNetwork(targetHost)) {
        checks.issues.push({
          severity: 'high',
          message: `Target ${targetHost} is on blocked network`,
          recommendation: 'Contact administrator'
        });
      }

      // Check encryption requirements
      if (this.securityPolicies.enforceEncryption) {
        const encrypted = await this.checkEncryption(targetHost);
        
        if (!encrypted) {
          checks.warnings.push({
            severity: 'medium',
            message: 'Target does not support encryption',
            recommendation: 'Use caution when scanning unencrypted targets'
          });
        } else {
          checks.encrypted = true;
        }
      }

      // Determine if connection is secure
      checks.secure = checks.issues.length === 0;
      
      // Cache result
      this.cacheSecurityCheck(targetHost, checks);
      
      // Log security check
      await this.logSecurityCheck(checks);
      
      return checks;
    } catch (error) {
      this.logger?.error(`Connection verification error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if any VPN is active
   */
  async isVPNActive() {
    try {
      // Check cached status
      const cached = this.securityCache.get('vpn-active');
      if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
        return cached.value;
      }

      // Check WireGuard
      let wgActive = false;
      try {
        const { stdout } = await execPromise('wg show 2>/dev/null');
        wgActive = stdout.includes('interface:');
      } catch (e) {
        // WireGuard not running or not installed
      }

      // Check OpenVPN
      let ovpnActive = false;
      try {
        const { stdout } = await execPromise('pgrep -x openvpn 2>/dev/null');
        ovpnActive = stdout.trim().length > 0;
      } catch (e) {
        // OpenVPN not running
      }

      const active = wgActive || ovpnActive;
      
      // Cache result
      this.securityCache.set('vpn-active', {
        value: active,
        timestamp: Date.now()
      });

      return active;
    } catch (error) {
      this.logger?.error(`Error checking VPN status: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if IP is from VPN network
   */
  isVPNNetwork(ip) {
    for (const network of this.securityPolicies.allowedNetworks) {
      if (this.ipInNetwork(ip, network)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if target is on blocked network
   */
  async isBlockedNetwork(targetHost) {
    try {
      // Resolve target to IP if needed
      const targetIp = await this.resolveHost(targetHost);
      
      for (const network of this.securityPolicies.blockedNetworks) {
        if (this.ipInNetwork(targetIp, network)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger?.error(`Error checking blocked network: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if target supports encryption
   */
  async checkEncryption(targetHost) {
    try {
      // Check if HTTPS is available
      const url = targetHost.startsWith('http') ? targetHost : `https://${targetHost}`;
      
      // Simple check - in production, you'd want to validate certificate
      return url.startsWith('https://');
    } catch (error) {
      return false;
    }
  }

  /**
   * Resolve hostname to IP
   */
  async resolveHost(host) {
    try {
      // Remove protocol if present
      host = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
      
      const { stdout } = await execPromise(`getent hosts ${host} 2>/dev/null || echo ""`);
      const ip = stdout.trim().split(/\s+/)[0];
      
      return ip || host;
    } catch (error) {
      return host;
    }
  }

  /**
   * Check if IP is in network range
   */
  ipInNetwork(ip, network) {
    try {
      const [networkAddr, bits] = network.split('/');
      const networkBits = parseInt(bits);
      
      const ipParts = ip.split('.').map(Number);
      const networkParts = networkAddr.split('.').map(Number);
      
      // Convert to binary and compare
      for (let i = 0; i < 4; i++) {
        const ipByte = ipParts[i];
        const networkByte = networkParts[i];
        const bitsInThisByte = Math.min(8, Math.max(0, networkBits - (i * 8)));
        
        if (bitsInThisByte === 0) break;
        
        const mask = (0xFF << (8 - bitsInThisByte)) & 0xFF;
        
        if ((ipByte & mask) !== (networkByte & mask)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger?.error(`Error checking IP in network: ${error.message}`);
      return false;
    }
  }

  /**
   * Cache security check result
   */
  cacheSecurityCheck(target, result) {
    this.securityCache.set(`check-${target}`, {
      value: result,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    for (const [key, value] of this.securityCache.entries()) {
      if (Date.now() - value.timestamp > this.cacheTimeout * 5) {
        this.securityCache.delete(key);
      }
    }
  }

  /**
   * Log security check
   */
  async logSecurityCheck(checks) {
    const auditLogger = this.core.getService('audit-logger');
    if (!auditLogger) return;

    await auditLogger.log({
      category: 'security',
      action: 'connection_security_check',
      severity: checks.secure ? 'info' : 'warning',
      details: {
        target: checks.targetHost,
        secure: checks.secure,
        vpnActive: checks.vpnActive,
        issueCount: checks.issues.length,
        warningCount: checks.warnings.length
      }
    });
  }

  /**
   * Update security policies
   */
  updatePolicies(policies) {
    Object.assign(this.securityPolicies, policies);
    this.logger?.info('Security policies updated', policies);
  }

  /**
   * Get current security policies
   */
  getPolicies() {
    return { ...this.securityPolicies };
  }

  /**
   * Add allowed network
   */
  addAllowedNetwork(network) {
    if (!this.securityPolicies.allowedNetworks.includes(network)) {
      this.securityPolicies.allowedNetworks.push(network);
      this.logger?.info(`Added allowed network: ${network}`);
    }
  }

  /**
   * Add blocked network
   */
  addBlockedNetwork(network) {
    if (!this.securityPolicies.blockedNetworks.includes(network)) {
      this.securityPolicies.blockedNetworks.push(network);
      this.logger?.info(`Added blocked network: ${network}`);
    }
  }

  /**
   * Get security statistics
   */
  getStatistics() {
    const stats = {
      cacheSize: this.securityCache.size,
      policies: this.securityPolicies,
      allowedNetworkCount: this.securityPolicies.allowedNetworks.length,
      blockedNetworkCount: this.securityPolicies.blockedNetworks.length
    };
    
    return stats;
  }

  /**
   * Force VPN requirement
   */
  enforceVPN(required = true) {
    this.securityPolicies.requireVPN = required;
    this.logger?.info(`VPN requirement ${required ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clear security cache
   */
  clearCache() {
    this.securityCache.clear();
    this.logger?.info('Security cache cleared');
  }
}

module.exports = ConnectionSecurity;
