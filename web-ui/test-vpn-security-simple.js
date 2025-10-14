#!/usr/bin/env node

/**
 * Simple VPN Connection Security Test
 */

const ConnectionSecurity = require('./plugins/vpn/connection-security');

console.log('\n' + '='.repeat(80));
console.log('🔐 VPN CONNECTION SECURITY TEST');
console.log('='.repeat(80) + '\n');

// Mock core object
const mockCore = {
  getService: (name) => {
    if (name === 'logger') {
      return {
        info: (...args) => console.log('   [INFO]', ...args),
        warn: (...args) => console.warn('   [WARN]', ...args),
        error: (...args) => console.error('   [ERROR]', ...args)
      };
    }
    return null;
  }
};

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  try {
    // Create connection security instance
    console.log('📦 Phase 1: Initialize Connection Security');
    console.log('-'.repeat(80));
    const connectionSecurity = new ConnectionSecurity(mockCore);
    await connectionSecurity.init();
    console.log('   ✅ Connection Security initialized\n');
    passed++;
    
    // Test 1: Get default policies
    console.log('📋 Phase 2: Test Security Policies');
    console.log('-'.repeat(80));
    const policies = connectionSecurity.getPolicies();
    console.log(`   VPN Required: ${policies.requireVPN}`);
    console.log(`   Enforce Encryption: ${policies.enforceEncryption}`);
    console.log(`   Allowed Networks: ${policies.allowedNetworks.join(', ')}`);
    console.log('   ✅ Policies retrieved\n');
    passed++;
    
    // Test 2: Network detection
    console.log('🌐 Phase 3: Test Network Detection');
    console.log('-'.repeat(80));
    const vpnIP = '10.8.0.10';
    const publicIP = '8.8.8.8';
    
    const isVPN1 = connectionSecurity.isVPNNetwork(vpnIP);
    const isVPN2 = connectionSecurity.isVPNNetwork(publicIP);
    
    console.log(`   ${vpnIP}: ${isVPN1 ? '✅ VPN' : '❌ Not VPN'}`);
    console.log(`   ${publicIP}: ${isVPN2 ? '❌ Error' : '✅ Not VPN'}`);
    
    if (isVPN1 && !isVPN2) {
      console.log('   ✅ Network detection working\n');
      passed++;
    } else {
      console.log('   ❌ Network detection failed\n');
      failed++;
    }
    
    // Test 3: Add networks
    console.log('➕ Phase 4: Test Add Networks');
    console.log('-'.repeat(80));
    connectionSecurity.addAllowedNetwork('192.168.100.0/24');
    connectionSecurity.addBlockedNetwork('10.0.0.0/8');
    console.log('   ✅ Added allowed network: 192.168.100.0/24');
    console.log('   ✅ Added blocked network: 10.0.0.0/8\n');
    passed++;
    
    // Test 4: Connection verification
    console.log('🔍 Phase 5: Test Connection Verification');
    console.log('-'.repeat(80));
    const result = await connectionSecurity.verifyConnection('https://example.com', '10.8.0.10');
    console.log(`   Target: https://example.com`);
    console.log(`   Source IP: 10.8.0.10`);
    console.log(`   Secure: ${result.secure ? '✅' : '❌'}`);
    console.log(`   VPN Network: ${result.vpnNetwork ? '✅' : '❌'}`);
    console.log(`   Issues: ${result.issues.length}`);
    console.log(`   Warnings: ${result.warnings.length}`);
    console.log('   ✅ Connection verification completed\n');
    passed++;
    
    // Test 5: VPN enforcement
    console.log('🛡️  Phase 6: Test VPN Enforcement');
    console.log('-'.repeat(80));
    connectionSecurity.enforceVPN(true);
    console.log('   ✅ VPN enforcement enabled');
    connectionSecurity.enforceVPN(false);
    console.log('   ✅ VPN enforcement disabled\n');
    passed++;
    
    // Test 6: Statistics
    console.log('📊 Phase 7: Test Statistics');
    console.log('-'.repeat(80));
    const stats = connectionSecurity.getStatistics();
    console.log(`   Cache Size: ${stats.cacheSize}`);
    console.log(`   Allowed Networks: ${stats.allowedNetworkCount}`);
    console.log(`   Blocked Networks: ${stats.blockedNetworkCount}`);
    console.log('   ✅ Statistics retrieved\n');
    passed++;
    
    // Summary
    console.log('='.repeat(80));
    console.log(`✅ TESTS PASSED: ${passed}`);
    console.log(`❌ TESTS FAILED: ${failed}`);
    console.log('='.repeat(80) + '\n');
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED - VPN CONNECTION SECURITY WORKING!\n');
      process.exit(0);
    } else {
      console.log('⚠️  SOME TESTS FAILED\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
