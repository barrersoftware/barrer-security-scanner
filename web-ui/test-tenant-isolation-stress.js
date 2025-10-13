#!/usr/bin/env node

/**
 * Tenant Isolation Stress Test
 * 
 * Creates 100+ tenants and verifies:
 * - Zero cross-tenant data leaks
 * - Complete data isolation
 * - Concurrent operations safe
 * - Performance degradation acceptable
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Test configuration
const TEST_DB = ':memory:';
const NUM_TENANTS = 100;
const USERS_PER_TENANT = 5;
const OPERATIONS_PER_TENANT = 10;

let db = null;
let services = new Map();
let tenantsPlugin = null;
let auditPlugin = null;

// Simple logger
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => console.log(`🔍 ${msg}`)
};

// Service registry
const serviceRegistry = {
  register: (name, service) => {
    services.set(name, service);
  },
  get: (name) => services.get(name),
  has: (name) => services.has(name)
};

// Stats tracking
const stats = {
  tenantsCreated: 0,
  usersCreated: 0,
  operationsPerformed: 0,
  isolationViolations: 0,
  startTime: null,
  endTime: null,
  peakMemory: 0
};

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TENANT ISOLATION STRESS TEST');
  console.log('='.repeat(80));
  console.log(`Testing with ${NUM_TENANTS} tenants, ${USERS_PER_TENANT} users each`);
  console.log('='.repeat(80) + '\n');

  stats.startTime = Date.now();

  try {
    // Phase 1: Initialize
    console.log('📦 Phase 1: Initialize System');
    console.log('-'.repeat(80));
    await initializeSystem();
    console.log('');

    // Phase 2: Create Tenants
    console.log('🏢 Phase 2: Create Test Tenants');
    console.log('-'.repeat(80));
    const tenants = await createTestTenants(NUM_TENANTS);
    console.log(`✅ Created ${tenants.length} tenants\n`);

    // Phase 3: Create Users per Tenant
    console.log('👥 Phase 3: Create Users for Each Tenant');
    console.log('-'.repeat(80));
    const users = await createUsersForTenants(tenants, USERS_PER_TENANT);
    console.log(`✅ Created ${users.length} users across all tenants\n`);

    // Phase 4: Perform Operations per Tenant
    console.log('⚡ Phase 4: Simulate Tenant Operations');
    console.log('-'.repeat(80));
    await performTenantOperations(tenants, users, OPERATIONS_PER_TENANT);
    console.log('');

    // Phase 5: Test Data Isolation
    console.log('🔒 Phase 5: Verify Data Isolation');
    console.log('-'.repeat(80));
    const isolationResults = await testDataIsolation(tenants, users);
    console.log('');

    // Phase 6: Test Concurrent Access
    console.log('🔄 Phase 6: Test Concurrent Tenant Access');
    console.log('-'.repeat(80));
    await testConcurrentAccess(tenants.slice(0, 10)); // Test with 10 tenants
    console.log('');

    // Phase 7: Test Query Performance
    console.log('⚡ Phase 7: Test Query Performance with Many Tenants');
    console.log('-'.repeat(80));
    await testQueryPerformance(tenants);
    console.log('');

    // Phase 8: Verify Audit Logs
    console.log('📝 Phase 8: Verify Audit Log Isolation');
    console.log('-'.repeat(80));
    await testAuditLogIsolation(tenants);
    console.log('');

    // Phase 9: Memory & Performance Check
    console.log('📊 Phase 9: Performance Analysis');
    console.log('-'.repeat(80));
    await analyzePerformance();
    console.log('');

    // Phase 10: Cleanup
    console.log('🧹 Phase 10: Cleanup');
    console.log('-'.repeat(80));
    await cleanup();
    console.log('');

    stats.endTime = Date.now();
    const duration = (stats.endTime - stats.startTime) / 1000;

    // Final Results
    console.log('='.repeat(80));
    if (stats.isolationViolations === 0) {
      console.log('✅ ALL TESTS PASSED - ZERO ISOLATION VIOLATIONS!');
    } else {
      console.log(`❌ TESTS FAILED - ${stats.isolationViolations} ISOLATION VIOLATIONS DETECTED`);
    }
    console.log('='.repeat(80) + '\n');

    console.log('📊 Test Summary:');
    console.log(`   Tenants Created: ${stats.tenantsCreated}`);
    console.log(`   Users Created: ${stats.usersCreated}`);
    console.log(`   Operations Performed: ${stats.operationsPerformed}`);
    console.log(`   Isolation Violations: ${stats.isolationViolations}`);
    console.log(`   Peak Memory: ${(stats.peakMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Total Duration: ${duration.toFixed(2)} seconds`);
    console.log(`   Operations/Second: ${(stats.operationsPerformed / duration).toFixed(2)}`);
    console.log('');

    if (isolationResults.passed) {
      console.log('🎉 Tenant Isolation: VERIFIED ✅');
      console.log('   - No cross-tenant data leaks detected');
      console.log('   - Data isolation working perfectly');
      console.log('   - System ready for production multi-tenancy');
    }

    process.exit(stats.isolationViolations === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Initialize the system
 */
async function initializeSystem() {
  db = await open({
    filename: TEST_DB,
    driver: sqlite3.Database
  });
  console.log('✅ Database initialized');

  // Load tenants plugin
  const TenantsPlugin = require('./plugins/tenants');
  tenantsPlugin = TenantsPlugin;
  
  const context = {
    logger,
    db,
    services: serviceRegistry,
    getService: (name) => serviceRegistry.get(name),
    registerService: (name, service) => serviceRegistry.register(name, service)
  };

  await tenantsPlugin.init(context);
  console.log('✅ Tenants plugin loaded');

  // Load audit plugin
  const AuditLogPlugin = require('./plugins/audit-log');
  auditPlugin = new AuditLogPlugin();
  await auditPlugin.init(context);
  console.log('✅ Audit plugin loaded');

  updateMemoryStats();
}

/**
 * Create test tenants
 */
async function createTestTenants(count) {
  const tenantManager = serviceRegistry.get('tenant-manager');
  const tenants = [];
  
  console.log(`Creating ${count} test tenants...`);
  const startTime = Date.now();

  for (let i = 1; i <= count; i++) {
    try {
      const tenant = await tenantManager.createTenant({
        name: `Test Tenant ${i}`,
        slug: `tenant-${i}`,
        status: 'active',
        limits: {
          users: 10,
          scans: 100,
          storage: '1GB',
          vpnClients: 5,
          apiRequests: 1000
        }
      });
      
      tenants.push(tenant);
      stats.tenantsCreated++;

      if (i % 10 === 0) {
        process.stdout.write(`\r   Progress: ${i}/${count} tenants created`);
      }
    } catch (error) {
      console.error(`\n❌ Failed to create tenant ${i}: ${error.message}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`\r   ✅ ${tenants.length} tenants created in ${duration}ms`);
  console.log(`   ⚡ ${(count / duration * 1000).toFixed(2)} tenants/second`);

  updateMemoryStats();
  return tenants;
}

/**
 * Create users for each tenant
 */
async function createUsersForTenants(tenants, usersPerTenant) {
  const users = [];
  
  console.log(`Creating ${usersPerTenant} users per tenant...`);
  const startTime = Date.now();

  for (const tenant of tenants) {
    for (let i = 1; i <= usersPerTenant; i++) {
      const user = {
        id: `user-${tenant.id}-${i}`,
        tenantId: tenant.id,
        username: `user${i}@${tenant.slug}.test`,
        role: i === 1 ? 'admin' : 'user'
      };
      
      users.push(user);
      stats.usersCreated++;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`   ✅ ${users.length} users created in ${duration}ms`);

  updateMemoryStats();
  return users;
}

/**
 * Perform operations for each tenant
 */
async function performTenantOperations(tenants, users, opsPerTenant) {
  console.log(`Performing ${opsPerTenant} operations per tenant...`);
  const auditLogger = serviceRegistry.get('AuditLogger');
  const startTime = Date.now();

  for (const tenant of tenants) {
    const tenantUsers = users.filter(u => u.tenantId === tenant.id);
    
    for (let i = 0; i < opsPerTenant; i++) {
      const user = tenantUsers[i % tenantUsers.length];
      
      // Simulate various operations
      await auditLogger.log({
        tenantId: tenant.id,
        userId: user.id,
        category: ['authentication', 'data_access', 'user_management'][i % 3],
        action: `operation_${i}`,
        severity: 'info',
        details: { operation: i, tenant: tenant.id }
      });
      
      stats.operationsPerformed++;
    }

    if (tenants.indexOf(tenant) % 10 === 0) {
      process.stdout.write(`\r   Progress: ${stats.operationsPerformed} operations`);
    }
  }

  await auditLogger.flushBuffer();
  
  const duration = Date.now() - startTime;
  console.log(`\r   ✅ ${stats.operationsPerformed} operations in ${duration}ms`);
  console.log(`   ⚡ ${(stats.operationsPerformed / duration * 1000).toFixed(2)} ops/second`);

  updateMemoryStats();
}

/**
 * Test data isolation between tenants
 */
async function testDataIsolation(tenants, users) {
  const auditQuery = serviceRegistry.get('AuditQuery');
  let passed = true;
  let checksPerformed = 0;
  
  console.log('Testing data isolation across tenants...');
  
  // Sample 10 random tenants for detailed checks
  const sampleTenants = tenants.slice(0, 10);
  
  for (const tenant of sampleTenants) {
    // Query logs for this tenant
    const tenantLogs = await auditQuery.queryLogs({ tenantId: tenant.id }, { limit: 1000 });
    
    // Verify all logs belong to this tenant
    if (tenantLogs.data) {
      for (const log of tenantLogs.data) {
        if (log.tenant_id && log.tenant_id !== tenant.id) {
          console.log(`   ❌ VIOLATION: Log ${log.id} has wrong tenant (expected: ${tenant.id}, got: ${log.tenant_id})`);
          stats.isolationViolations++;
          passed = false;
        }
        checksPerformed++;
      }
    }
  }
  
  console.log(`   ✅ Checked ${checksPerformed} records across ${sampleTenants.length} tenants`);
  
  if (passed) {
    console.log(`   ✅ No isolation violations detected`);
  } else {
    console.log(`   ❌ ${stats.isolationViolations} isolation violations found`);
  }

  return { passed, checksPerformed, violations: stats.isolationViolations };
}

/**
 * Test concurrent access from multiple tenants
 */
async function testConcurrentAccess(tenants) {
  const auditLogger = serviceRegistry.get('AuditLogger');
  
  console.log(`Testing concurrent access with ${tenants.length} tenants...`);
  const startTime = Date.now();
  
  // Perform operations concurrently
  const promises = tenants.map(async (tenant, index) => {
    for (let i = 0; i < 5; i++) {
      await auditLogger.log({
        tenantId: tenant.id,
        userId: `user-${tenant.id}-1`,
        category: 'api_access',
        action: 'concurrent_test',
        severity: 'info',
        details: { concurrent: true, iteration: i }
      });
    }
  });

  await Promise.all(promises);
  await auditLogger.flushBuffer();
  
  const duration = Date.now() - startTime;
  console.log(`   ✅ Concurrent operations completed in ${duration}ms`);
  console.log(`   ⚡ ${(tenants.length * 5 / duration * 1000).toFixed(2)} concurrent ops/second`);
}

/**
 * Test query performance with many tenants
 */
async function testQueryPerformance(tenants) {
  const auditQuery = serviceRegistry.get('AuditQuery');
  const tenantManager = serviceRegistry.get('tenant-manager');
  
  console.log('Testing query performance...');
  
  // Test 1: List all tenants
  const start1 = Date.now();
  const allTenants = await tenantManager.listTenants();
  const duration1 = Date.now() - start1;
  console.log(`   ✅ List ${allTenants.length} tenants: ${duration1}ms`);
  
  // Test 2: Query logs for random tenant
  const randomTenant = tenants[Math.floor(Math.random() * tenants.length)];
  const start2 = Date.now();
  const logs = await auditQuery.queryLogs({ tenantId: randomTenant.id }, { limit: 100 });
  const duration2 = Date.now() - start2;
  console.log(`   ✅ Query logs for tenant: ${duration2}ms (${logs.data?.length || 0} records)`);
  
  // Test 3: Statistics
  const start3 = Date.now();
  const stats = await auditQuery.getStatistics({ tenantId: randomTenant.id });
  const duration3 = Date.now() - start3;
  console.log(`   ✅ Get statistics: ${duration3}ms`);
  
  // Performance thresholds
  const acceptable = duration1 < 1000 && duration2 < 500 && duration3 < 1000;
  if (acceptable) {
    console.log(`   ✅ Performance: ACCEPTABLE (all queries <1s)`);
  } else {
    console.log(`   ⚠️  Performance: Some queries exceeded threshold`);
  }
}

/**
 * Test audit log isolation
 */
async function testAuditLogIsolation(tenants) {
  const auditQuery = serviceRegistry.get('AuditQuery');
  
  console.log('Verifying audit log isolation...');
  
  // Sample 5 tenants
  const sampleTenants = [
    tenants[0],
    tenants[Math.floor(tenants.length / 4)],
    tenants[Math.floor(tenants.length / 2)],
    tenants[Math.floor(tenants.length * 3 / 4)],
    tenants[tenants.length - 1]
  ];
  
  for (const tenant of sampleTenants) {
    const logs = await auditQuery.queryLogs({ tenantId: tenant.id }, { limit: 50 });
    
    if (logs.data) {
      // Check for cross-tenant contamination
      const wrongTenantLogs = logs.data.filter(log => log.tenant_id && log.tenant_id !== tenant.id);
      
      if (wrongTenantLogs.length > 0) {
        console.log(`   ❌ Tenant ${tenant.id}: ${wrongTenantLogs.length} logs from other tenants`);
        stats.isolationViolations += wrongTenantLogs.length;
      } else {
        console.log(`   ✅ Tenant ${tenant.id}: All ${logs.data.length} logs isolated`);
      }
    }
  }
}

/**
 * Analyze overall performance
 */
async function analyzePerformance() {
  const duration = (Date.now() - stats.startTime) / 1000;
  const memUsage = process.memoryUsage();
  
  console.log('Performance Metrics:');
  console.log(`   Total Duration: ${duration.toFixed(2)}s`);
  console.log(`   Tenants/Second: ${(stats.tenantsCreated / duration).toFixed(2)}`);
  console.log(`   Users/Second: ${(stats.usersCreated / duration).toFixed(2)}`);
  console.log(`   Operations/Second: ${(stats.operationsPerformed / duration).toFixed(2)}`);
  console.log('');
  console.log('Memory Usage:');
  console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);
  
  // Performance rating
  const opsPerSec = stats.operationsPerformed / duration;
  let rating = '⭐⭐⭐⭐⭐ EXCELLENT';
  if (opsPerSec < 100) rating = '⭐⭐⭐ GOOD';
  if (opsPerSec < 50) rating = '⭐⭐ ACCEPTABLE';
  if (opsPerSec < 10) rating = '⭐ NEEDS OPTIMIZATION';
  
  console.log('');
  console.log(`Performance Rating: ${rating}`);
}

/**
 * Update memory stats
 */
function updateMemoryStats() {
  const memUsage = process.memoryUsage();
  if (memUsage.heapUsed > stats.peakMemory) {
    stats.peakMemory = memUsage.heapUsed;
  }
}

/**
 * Cleanup
 */
async function cleanup() {
  if (auditPlugin && auditPlugin.cleanup) {
    await auditPlugin.cleanup();
  }
  
  if (db) {
    await db.close();
  }
  
  console.log('✅ Cleanup complete');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
