#!/usr/bin/env node
/**
 * AI Security Scanner - Comprehensive Test Suite
 * v4.5.0 - Polish & Testing Phase
 * 
 * Runs all tests in sequence and generates detailed report
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration
const tests = [
  { file: 'test-quick-all-plugins.js', name: 'Quick All Plugins', timeout: 30000, category: 'smoke' },
  { file: 'test-policies-plugin.js', name: 'Policies Plugin', timeout: 45000, category: 'unit' },
  { file: 'test-tenant-isolation-stress.js', name: 'Tenant Isolation Stress', timeout: 60000, category: 'stress' },
  { file: 'test-performance-benchmark.js', name: 'Performance Benchmark', timeout: 60000, category: 'performance' },
  { file: 'test-vpn-security-simple.js', name: 'VPN Security', timeout: 30000, category: 'unit' },
  { file: 'test-api-analytics.js', name: 'API Analytics', timeout: 30000, category: 'unit' },
  { file: 'test-tenants-full-integration.js', name: 'Tenants Full Integration', timeout: 60000, category: 'integration' },
  // Skipping auth-security as it requires dedicated server (tested separately)
  // { file: 'test-auth-security.js', name: 'Authentication Security', timeout: 90000, category: 'integration' },
];

// Results tracking
const results = {
  passed: [],
  failed: [],
  skipped: [],
  startTime: Date.now(),
  endTime: null,
};

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(test) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, test.file);
    
    // Check if test file exists
    if (!fs.existsSync(testPath)) {
      log(`⏭️  SKIPPED: ${test.name} (file not found)`, 'yellow');
      results.skipped.push({ ...test, reason: 'File not found' });
      resolve();
      return;
    }

    log(`\n${'='.repeat(80)}`, 'cyan');
    log(`Running: ${test.name}`, 'cyan');
    log(`File: ${test.file}`, 'blue');
    log('='.repeat(80), 'cyan');

    const startTime = Date.now();
    const proc = spawn('node', [testPath], {
      stdio: 'pipe',
      timeout: test.timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });

    // Timeout handler
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      log(`\n⏱️  TIMEOUT: ${test.name} (exceeded ${test.timeout}ms)`, 'yellow');
      const duration = Date.now() - startTime;
      results.failed.push({ ...test, reason: 'Timeout', duration, stdout, stderr });
      resolve();
    }, test.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (code === 0) {
        log(`\n✅ PASSED: ${test.name} (${duration}ms)`, 'green');
        results.passed.push({ ...test, duration, stdout });
      } else {
        log(`\n❌ FAILED: ${test.name} (exit code: ${code}, ${duration}ms)`, 'red');
        results.failed.push({ ...test, exitCode: code, duration, stdout, stderr });
      }

      resolve();
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      log(`\n❌ ERROR: ${test.name} - ${error.message}`, 'red');
      results.failed.push({ ...test, error: error.message, duration, stdout, stderr });
      resolve();
    });
  });
}

async function runAllTests() {
  log('\n' + '='.repeat(80), 'bold');
  log('AI SECURITY SCANNER - COMPREHENSIVE TEST SUITE v4.5.0', 'bold');
  log('='.repeat(80), 'bold');
  log(`Start Time: ${new Date().toISOString()}`, 'cyan');
  log(`Total Tests: ${tests.length}`, 'cyan');
  log('='.repeat(80) + '\n', 'bold');

  // Run tests sequentially
  for (const test of tests) {
    await runTest(test);
  }

  results.endTime = Date.now();
  const totalDuration = results.endTime - results.startTime;

  // Generate report
  generateReport(totalDuration);
}

function generateReport(totalDuration) {
  log('\n\n' + '='.repeat(80), 'bold');
  log('TEST RESULTS SUMMARY', 'bold');
  log('='.repeat(80), 'bold');

  const total = tests.length;
  const passed = results.passed.length;
  const failed = results.failed.length;
  const skipped = results.skipped.length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  log(`\n📊 Overall Statistics:`, 'cyan');
  log(`   Total Tests: ${total}`);
  log(`   ✅ Passed: ${passed}`, passed > 0 ? 'green' : 'reset');
  log(`   ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
  log(`   ⏭️  Skipped: ${skipped}`, skipped > 0 ? 'yellow' : 'reset');
  log(`   📈 Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : passRate >= 70 ? 'yellow' : 'red');
  log(`   ⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  // Passed tests details
  if (results.passed.length > 0) {
    log(`\n✅ Passed Tests (${results.passed.length}):`, 'green');
    results.passed.forEach((test, idx) => {
      log(`   ${idx + 1}. ${test.name} - ${test.duration}ms`, 'green');
    });
  }

  // Failed tests details
  if (results.failed.length > 0) {
    log(`\n❌ Failed Tests (${results.failed.length}):`, 'red');
    results.failed.forEach((test, idx) => {
      log(`   ${idx + 1}. ${test.name}`, 'red');
      if (test.reason) log(`      Reason: ${test.reason}`, 'red');
      if (test.exitCode) log(`      Exit Code: ${test.exitCode}`, 'red');
      if (test.error) log(`      Error: ${test.error}`, 'red');
      if (test.duration) log(`      Duration: ${test.duration}ms`, 'red');
    });
  }

  // Skipped tests details
  if (results.skipped.length > 0) {
    log(`\n⏭️  Skipped Tests (${results.skipped.length}):`, 'yellow');
    results.skipped.forEach((test, idx) => {
      log(`   ${idx + 1}. ${test.name} - ${test.reason}`, 'yellow');
    });
  }

  // Performance metrics
  if (results.passed.length > 0) {
    const durations = results.passed.map(t => t.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    log(`\n⏱️  Performance Metrics:`, 'cyan');
    log(`   Average Test Duration: ${avgDuration.toFixed(0)}ms`);
    log(`   Fastest Test: ${minDuration}ms`);
    log(`   Slowest Test: ${maxDuration}ms`);
  }

  // Quality assessment
  log(`\n🎯 Quality Assessment:`, 'bold');
  if (passRate === 100) {
    log(`   ⭐⭐⭐⭐⭐ EXCELLENT - All tests passing!`, 'green');
  } else if (passRate >= 90) {
    log(`   ⭐⭐⭐⭐ VERY GOOD - Minor issues`, 'green');
  } else if (passRate >= 70) {
    log(`   ⭐⭐⭐ GOOD - Some issues need attention`, 'yellow');
  } else if (passRate >= 50) {
    log(`   ⭐⭐ FAIR - Multiple issues`, 'yellow');
  } else {
    log(`   ⭐ NEEDS WORK - Significant issues`, 'red');
  }

  log('\n' + '='.repeat(80), 'bold');
  log(`End Time: ${new Date().toISOString()}`, 'cyan');
  log('='.repeat(80) + '\n', 'bold');

  // Save detailed report
  saveDetailedReport(totalDuration, passRate);

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

function saveDetailedReport(totalDuration, passRate) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportPath = path.join(__dirname, `test-report-${timestamp}.json`);

  const report = {
    version: '4.5.0',
    phase: 'Polish & Testing',
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    summary: {
      total: tests.length,
      passed: results.passed.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      passRate: parseFloat(passRate),
    },
    tests: {
      passed: results.passed.map(t => ({
        name: t.name,
        file: t.file,
        duration: t.duration,
      })),
      failed: results.failed.map(t => ({
        name: t.name,
        file: t.file,
        duration: t.duration,
        reason: t.reason || t.error || 'Unknown',
        exitCode: t.exitCode,
      })),
      skipped: results.skipped.map(t => ({
        name: t.name,
        file: t.file,
        reason: t.reason,
      })),
    },
  };

  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`📄 Detailed report saved: ${reportPath}`, 'cyan');
  } catch (error) {
    log(`⚠️  Failed to save detailed report: ${error.message}`, 'yellow');
  }
}

// Run the test suite
runAllTests().catch((error) => {
  log(`\n💥 Fatal error running test suite: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
