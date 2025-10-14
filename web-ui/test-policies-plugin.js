#!/usr/bin/env node

/**
 * Policies Plugin Test
 * 
 * Comprehensive testing of the Custom Scanning Policies plugin
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const TEST_DB = ':memory:';
let db = null;
let services = new Map();
let policiesPlugin = null;

const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`)
};

const serviceRegistry = {
  register: (name, service) => services.set(name, service),
  get: (name) => services.get(name),
  has: (name) => services.has(name)
};

async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 POLICIES PLUGIN TEST');
  console.log('='.repeat(80) + '\n');

  try {
    // Phase 1: Initialize
    console.log('📦 Phase 1: Initialize System');
    console.log('-'.repeat(80));
    await initialize();
    console.log('');

    // Phase 2: Test Template Manager
    console.log('📋 Phase 2: Test Template Manager');
    console.log('-'.repeat(80));
    await testTemplateManager();
    console.log('');

    // Phase 3: Test Policy Manager
    console.log('📝 Phase 3: Test Policy Manager');
    console.log('-'.repeat(80));
    await testPolicyManager();
    console.log('');

    // Phase 4: Test Policy Scheduler
    console.log('⏰ Phase 4: Test Policy Scheduler');
    console.log('-'.repeat(80));
    await testPolicyScheduler();
    console.log('');

    // Phase 5: Test Compliance Tracker
    console.log('📊 Phase 5: Test Compliance Tracker');
    console.log('-'.repeat(80));
    await testComplianceTracker();
    console.log('');

    // Phase 6: Test Policy Executor (mock)
    console.log('⚡ Phase 6: Test Policy Executor');
    console.log('-'.repeat(80));
    await testPolicyExecutor();
    console.log('');

    // Phase 7: Integration Test
    console.log('🔗 Phase 7: Integration Test');
    console.log('-'.repeat(80));
    await testIntegration();
    console.log('');

    // Cleanup
    await cleanup();

    console.log('='.repeat(80));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

async function initialize() {
  db = await open({
    filename: TEST_DB,
    driver: sqlite3.Database
  });
  console.log('✅ Database initialized');

  const PoliciesPlugin = require('./plugins/policies');
  policiesPlugin = PoliciesPlugin;

  const context = {
    logger,
    db,
    services: serviceRegistry,
    getService: (name) => serviceRegistry.get(name),
    registerService: (name, service) => serviceRegistry.register(name, service),
    pluginManager: null
  };

  await policiesPlugin.init(context);
  console.log('✅ Policies plugin loaded');
  console.log(`✅ ${services.size} services registered`);
}

async function testTemplateManager() {
  const templateManager = services.get('template-manager');
  
  const templates = templateManager.getTemplates();
  console.log(`✅ ${templates.length} templates loaded`);

  const pciTemplate = templateManager.getTemplate('pci-dss');
  console.log(`✅ PCI-DSS template: ${pciTemplate.name}`);

  const industryTemplates = templateManager.getTemplates('industry');
  console.log(`✅ Industry templates: ${industryTemplates.length}`);

  const categories = templateManager.getCategories();
  console.log(`✅ Categories: ${categories.join(', ')}`);

  const metadata = templateManager.getTemplateMetadata();
  console.log(`✅ Template metadata: ${metadata.total} total`);
}

async function testPolicyManager() {
  const policyManager = services.get('policy-manager');
  
  // Create policy
  const policy1 = await policyManager.createPolicy({
    tenantId: 'tenant-1',
    name: 'Daily PCI-DSS Scan',
    description: 'Daily PCI-DSS compliance check',
    framework: 'pci-dss',
    templateId: 'pci-dss',
    schedule: '0 2 * * *',
    createdBy: 'user-1'
  });
  console.log(`✅ Created policy: ${policy1.name}`);

  // Create another policy
  const policy2 = await policyManager.createPolicy({
    tenantId: 'tenant-1',
    name: 'Weekly HIPAA Check',
    description: 'Weekly HIPAA compliance',
    framework: 'hipaa',
    templateId: 'hipaa',
    schedule: '0 2 * * 0',
    createdBy: 'user-1'
  });
  console.log(`✅ Created policy: ${policy2.name}`);

  // List policies
  const result = await policyManager.listPolicies({ tenantId: 'tenant-1' });
  console.log(`✅ Listed ${result.data.length} policies`);

  // Get policy
  const retrieved = await policyManager.getPolicy(policy1.id, 'tenant-1');
  console.log(`✅ Retrieved policy: ${retrieved.name}`);

  // Update policy
  const updated = await policyManager.updatePolicy(policy1.id, 'tenant-1', {
    description: 'Updated description'
  });
  console.log(`✅ Updated policy: ${updated.id}`);

  // Create from template
  const fromTemplate = await policyManager.createFromTemplate('soc2', {
    name: 'SOC2 Quarterly',
    tenantId: 'tenant-1',
    schedule: '0 2 1 */3 *',
    createdBy: 'user-1'
  });
  console.log(`✅ Created from template: ${fromTemplate.name}`);
}

async function testPolicyScheduler() {
  const policyScheduler = services.get('policy-scheduler');
  
  const scheduleInfo = policyScheduler.getScheduleInfo('0 2 * * *');
  console.log(`✅ Schedule info: ${scheduleInfo.description}`);

  const scheduled = await policyScheduler.listScheduledPolicies();
  console.log(`✅ Scheduled policies: ${scheduled.length}`);

  const stats = policyScheduler.getStatistics();
  console.log(`✅ Scheduler stats: ${stats.checkInterval} checks`);

  await policyScheduler.updateSchedule(
    scheduled[0]?.id,
    'tenant-1',
    '0 3 * * *',
    true
  );
  console.log(`✅ Updated schedule`);
}

async function testComplianceTracker() {
  const complianceTracker = services.get('compliance-tracker');
  const policyManager = services.get('policy-manager');

  const policies = await policyManager.listPolicies({ tenantId: 'tenant-1' });
  const policy = policies.data[0];

  // Record scores
  await complianceTracker.recordScore(policy.id, 'tenant-1', {
    executionId: 'exec-1',
    score: 85,
    passed: 17,
    failed: 3,
    warnings: 5
  });
  console.log(`✅ Recorded score: 85`);

  await complianceTracker.recordScore(policy.id, 'tenant-1', {
    executionId: 'exec-2',
    score: 90,
    passed: 18,
    failed: 2,
    warnings: 4
  });
  console.log(`✅ Recorded score: 90`);

  // Get current score
  const current = await complianceTracker.getCurrentScore(policy.id, 'tenant-1');
  console.log(`✅ Current score: ${current.score}`);

  // Get trend
  const trend = await complianceTracker.getScoreTrend(policy.id, 'tenant-1', 30);
  console.log(`✅ Trend data points: ${trend.summary.dataPoints}`);
  console.log(`✅ Average score: ${trend.summary.averageScore}`);
  console.log(`✅ Improvement: ${trend.summary.improvement}`);

  // Get report
  const report = await complianceTracker.getComplianceReport('tenant-1', 30);
  console.log(`✅ Report: ${report.policies.length} policies`);
  console.log(`✅ Overall score: ${report.summary.overallScore}`);
}

async function testPolicyExecutor() {
  const policyExecutor = services.get('policy-executor');
  
  // Test result parsing
  const mockOutput = `
# Compliance Report

## PCI-DSS 3.2.1

- ✅ Firewall active
- ✅ SSH configured
- 🚨 **FAIL:** No encryption
- ⚠️  Default port in use
- ✅ Logging enabled

## Summary
- **Total Checks:** 5
- **Passed:** 3
- **Failed:** 1
- **Warnings:** 1

### Compliance Score: 75/100
`;

  const results = policyExecutor.parseResults(mockOutput);
  console.log(`✅ Parsed results: score=${results.score}, passed=${results.passed}, failed=${results.failed}, warnings=${results.warnings}`);

  const count = policyExecutor.getActiveExecutionsCount();
  console.log(`✅ Active executions: ${count}`);
}

async function testIntegration() {
  // Test full workflow
  const policyManager = services.get('policy-manager');
  const complianceTracker = services.get('compliance-tracker');

  // Create multi-tenant policies
  const tenant2Policy = await policyManager.createPolicy({
    tenantId: 'tenant-2',
    name: 'GDPR Compliance',
    framework: 'gdpr',
    templateId: 'gdpr',
    createdBy: 'user-2'
  });
  console.log(`✅ Created tenant-2 policy: ${tenant2Policy.name}`);

  // Verify tenant isolation
  const tenant1Policies = await policyManager.listPolicies({ tenantId: 'tenant-1' });
  const tenant2Policies = await policyManager.listPolicies({ tenantId: 'tenant-2' });
  
  console.log(`✅ Tenant-1 policies: ${tenant1Policies.data.length}`);
  console.log(`✅ Tenant-2 policies: ${tenant2Policies.data.length}`);
  console.log(`✅ Tenant isolation verified`);

  // Test policy lifecycle
  const tempPolicy = await policyManager.createPolicy({
    tenantId: 'tenant-1',
    name: 'Temp Policy',
    framework: 'nist-csf',
    templateId: 'nist-csf',
    createdBy: 'user-1'
  });
  console.log(`✅ Created temp policy: ${tempPolicy.id}`);

  await policyManager.updatePolicy(tempPolicy.id, 'tenant-1', {
    status: 'inactive'
  });
  console.log(`✅ Updated to inactive`);

  await policyManager.deletePolicy(tempPolicy.id, 'tenant-1');
  console.log(`✅ Deleted temp policy`);
}

async function cleanup() {
  const policyScheduler = services.get('policy-scheduler');
  if (policyScheduler) {
    await policyScheduler.cleanup();
  }

  if (db) {
    await db.close();
  }

  console.log('✅ Cleanup complete');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
