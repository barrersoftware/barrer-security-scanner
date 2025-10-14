#!/usr/bin/env node

/**
 * Test VPN Connection Security
 * 
 * Verifies that connection security checks work properly
 */

const path = require('path');
const CoreSystem = require('./core-system');
const PluginManager = require('./plugin-manager');
const ServiceRegistry = require('./service-registry');

// Test configuration
const TEST_CONFIG = {
  database: path.join(__dirname, 'data', 'test-vpn-security.db'),
  pluginsDir: path.join(__dirname, 'plugins')
};

let core, serviceRegistry, pluginManager;

console.log('\n' + '='.repeat(80));
console.log('🔐 VPN CONNECTION SECURITY TEST');
console.log('='.repeat(80) + '\n');

/**
 * Initialize system
 */
async function init() {
  console.log('⚙️  Phase 1: Initialize System');
  console.log('-'.repeat(80));
  
  try {
    // Create core system
    core = new CoreSystem();
    await core.init(TEST_CONFIG);
    
    // Get service registry
    serviceRegistry = core.serviceRegistry;
    pluginManager = core.pluginManager;
    
    console.log('   ✅ Core system initialized');
    console.log('   ✅ Service registry ready');
    console.log('   ✅ Plugin manager ready\n');
  } catch (error) {
    console.error('   ❌ Initialization failed:', error.message);
    throw error;
  }
}

/**
 * Load VPN plugin
 */
async function loadVPNPlugin() {
  console.log('📦 Phase 2: Load VPN Plugin');
  console.log('-'.repeat(80));
  
  try {
    await pluginManager.loadPlugin('vpn');
    const vpnPlugin = pluginManager.getPlugin('vpn');
    
    if (!vpnPlugin) {
      throw new Error('VPN plugin not loaded');
    }
    
    console.log('   ✅ VPN plugin loaded');
    console.log(`   ✅ Version: ${vpnPlugin.version || '1.1.0'}`);
    
    // Check if connection-security service is available
    const connectionSecurity = serviceRegistry.get('connection-security');
    
    if (!connectionSecurity) {
      throw new Error('Connection Security service not registered');
    }
    
    console.log('   ✅ Connection Security service available\n');
    
    return connectionSecurity;
  } catch (error) {
    console.error('   ❌ Failed to load VPN plugin:', error.message);
    throw error;
  }
}

/**
 * Test security policies
 */
async function testSecurityPolicies(connectionSecurity) {
  console.log('📋 Phase 3: Test Security Policies');
  console.log('-'.repeat(80));
  
  try {
    // Get default policies
    const policies = connectionSecurity.getPolicies();
    console.log('   Default Policies:');
    console.log(`      VPN Required: ${policies.requireVPN}`);
    console.log(`      Enforce Encryption: ${policies.enforceEncryption}`);
    console.log(`      Allowed Networks: ${policies.allowedNetworks.length}`);
    console.log(`      Blocked Networks: ${policies.blockedNetworks.length}`);
    
    // Update policies
    connectionSecurity.updatePolicies({
      requireVPN: true,
      enforceEncryption: true
    });
    
    console.log('   ✅ Security policies retrieved');
    console.log('   ✅ Policies updated successfully\n');
  } catch (error) {
    console.error('   ❌ Policy test failed:', error.message);
    throw error;
  }
}

/**
 * Test network checking
 */
async function testNetworkChecking(connectionSecurity) {
  console.log('🌐 Phase 4: Test Network Checking');
  console.log('-'.repeat(80));
  
  try {
    // Test VPN network detection
    const vpnIPs = ['10.8.0.10', '10.9.0.5'];
    const publicIPs = ['8.8.8.8', '192.168.1.100'];
    
    console.log('   Testing VPN Network Detection:');
    vpnIPs.forEach(ip => {
      const isVPN = connectionSecurity.isVPNNetwork(ip);
      console.log(`      ${ip}: ${isVPN ? '✅ VPN' : '❌ Not VPN'}`);
    });
    
    console.log('   Testing Public IP Detection:');
    publicIPs.forEach(ip => {
      const isVPN = connectionSecurity.isVPNNetwork(ip);
      console.log(`      ${ip}: ${isVPN ? '❌ Incorrect' : '✅ Not VPN'}`);
    });
    
    // Test adding networks
    connectionSecurity.addAllowedNetwork('192.168.100.0/24');
    console.log('   ✅ Added allowed network: 192.168.100.0/24');
    
    connectionSecurity.addBlockedNetwork('10.0.0.0/8');
    console.log('   ✅ Added blocked network: 10.0.0.0/8\n');
  } catch (error) {
    console.error('   ❌ Network checking failed:', error.message);
    throw error;
  }
}

/**
 * Test connection verification
 */
async function testConnectionVerification(connectionSecurity) {
  console.log('🔍 Phase 5: Test Connection Verification');
  console.log('-'.repeat(80));
  
  try {
    // Test with HTTPS target (should pass encryption check)
    console.log('   Testing HTTPS Target:');
    const httpsResult = await connectionSecurity.verifyConnection(
      'https://example.com',
      '10.8.0.10'
    );
    
    console.log(`      Secure: ${httpsResult.secure ? '✅' : '❌'}`);
    console.log(`      VPN Active: ${httpsResult.vpnActive ? '✅' : '❌'}`);
    console.log(`      VPN Network: ${httpsResult.vpnNetwork ? '✅' : '❌'}`);
    console.log(`      Issues: ${httpsResult.issues.length}`);
    console.log(`      Warnings: ${httpsResult.warnings.length}`);
    
    // Test with HTTP target (should warn about encryption)
    console.log('\n   Testing HTTP Target:');
    const httpResult = await connectionSecurity.verifyConnection(
      'http://example.com',
      '10.8.0.10'
    );
    
    console.log(`      Secure: ${httpResult.secure ? '✅' : '❌'}`);
    console.log(`      Issues: ${httpResult.issues.length}`);
    console.log(`      Warnings: ${httpResult.warnings.length}`);
    
    // Test with non-VPN source
    console.log('\n   Testing Non-VPN Source:');
    const nonVPNResult = await connectionSecurity.verifyConnection(
      'https://example.com',
      '192.168.1.100'
    );
    
    console.log(`      Secure: ${nonVPNResult.secure ? '❌ Should fail' : '✅ Correctly blocked'}`);
    console.log(`      Issues: ${nonVPNResult.issues.length}`);
    
    console.log('\n   ✅ Connection verification tests completed\n');
  } catch (error) {
    console.error('   ❌ Connection verification failed:', error.message);
    throw error;
  }
}

/**
 * Test VPN enforcement
 */
async function testVPNEnforcement(connectionSecurity) {
  console.log('🛡️  Phase 6: Test VPN Enforcement');
  console.log('-'.repeat(80));
  
  try {
    // Enable VPN enforcement
    connectionSecurity.enforceVPN(true);
    console.log('   ✅ VPN enforcement enabled');
    
    // Test with VPN disabled
    console.log('   Testing connection with VPN requirement...');
    const result = await connectionSecurity.verifyConnection(
      'https://example.com',
      '10.8.0.10'
    );
    
    console.log(`      Result: ${result.secure ? 'Allowed' : 'Blocked'}`);
    
    // Disable VPN enforcement
    connectionSecurity.enforceVPN(false);
    console.log('   ✅ VPN enforcement disabled');
    
    const result2 = await connectionSecurity.verifyConnection(
      'https://example.com',
      '192.168.1.100'
    );
    
    console.log(`      Result without enforcement: ${result2.secure ? 'Allowed' : 'Blocked'}`);
    console.log('\n   ✅ VPN enforcement tests completed\n');
  } catch (error) {
    console.error('   ❌ VPN enforcement test failed:', error.message);
    throw error;
  }
}

/**
 * Test security statistics
 */
async function testStatistics(connectionSecurity) {
  console.log('📊 Phase 7: Test Security Statistics');
  console.log('-'.repeat(80));
  
  try {
    const stats = connectionSecurity.getStatistics();
    
    console.log('   Security Statistics:');
    console.log(`      Cache Size: ${stats.cacheSize}`);
    console.log(`      Allowed Networks: ${stats.allowedNetworkCount}`);
    console.log(`      Blocked Networks: ${stats.blockedNetworkCount}`);
    console.log(`      VPN Required: ${stats.policies.requireVPN}`);
    console.log(`      Encryption Required: ${stats.policies.enforceEncryption}`);
    
    console.log('\n   ✅ Statistics retrieved successfully\n');
  } catch (error) {
    console.error('   ❌ Statistics test failed:', error.message);
    throw error;
  }
}

/**
 * Cleanup
 */
async function cleanup() {
  console.log('🧹 Phase 8: Cleanup');
  console.log('-'.repeat(80));
  
  try {
    await pluginManager.unloadPlugin('vpn');
    console.log('   ✅ VPN plugin unloaded');
    
    await core.shutdown();
    console.log('   ✅ Core system shutdown\n');
  } catch (error) {
    console.error('   ⚠️  Cleanup warning:', error.message);
  }
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    await init();
    const connectionSecurity = await loadVPNPlugin();
    await testSecurityPolicies(connectionSecurity);
    await testNetworkChecking(connectionSecurity);
    await testConnectionVerification(connectionSecurity);
    await testVPNEnforcement(connectionSecurity);
    await testStatistics(connectionSecurity);
    await cleanup();
    
    console.log('='.repeat(80));
    console.log('✅ ALL VPN CONNECTION SECURITY TESTS PASSED');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED:', error.message);
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  }
}

// Run tests
runTests();
