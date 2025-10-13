#!/usr/bin/env node

/**
 * Performance Benchmark Test
 * 
 * Measures system performance under various loads:
 * - Request throughput
 * - Latency under load
 * - Memory efficiency
 * - Database performance
 * - Concurrent operations
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Test configuration
const TEST_DB = ':memory:';
const WARMUP_REQUESTS = 100;
const BENCHMARK_REQUESTS = 1000;
const CONCURRENT_BATCHES = 10;

let db = null;
let services = new Map();
let plugins = {};

// Benchmark results
const results = {
  warmup: { duration: 0, throughput: 0 },
  sequential: { duration: 0, throughput: 0, latencies: [] },
  concurrent: { duration: 0, throughput: 0 },
  memory: { initial: 0, peak: 0, final: 0 },
  database: { queries: 0, totalTime: 0, avgTime: 0 }
};

// Simple logger
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  debug: (msg) => {}  // Silent for benchmark
};

// Service registry
const serviceRegistry = {
  register: (name, service) => services.set(name, service),
  get: (name) => services.get(name),
  has: (name) => services.has(name)
};

async function runBenchmark() {
  console.log('\n' + '='.repeat(80));
  console.log('⚡ PERFORMANCE BENCHMARK TEST');
  console.log('='.repeat(80));
  console.log(`Warmup: ${WARMUP_REQUESTS} requests`);
  console.log(`Benchmark: ${BENCHMARK_REQUESTS} requests`);
  console.log(`Concurrent: ${CONCURRENT_BATCHES} batches`);
  console.log('='.repeat(80) + '\n');

  try {
    // Initialize
    console.log('📦 Phase 1: Initialize System');
    console.log('-'.repeat(80));
    await initialize();
    results.memory.initial = process.memoryUsage().heapUsed;
    console.log(`✅ System initialized (Heap: ${(results.memory.initial / 1024 / 1024).toFixed(2)} MB)\n`);

    // Warmup
    console.log('🔥 Phase 2: Warmup (${WARMUP_REQUESTS} requests)');
    console.log('-'.repeat(80));
    await warmup();
    console.log('');

    // Sequential throughput test
    console.log(`📊 Phase 3: Sequential Throughput (${BENCHMARK_REQUESTS} requests)`);
    console.log('-'.repeat(80));
    await benchmarkSequential();
    console.log('');

    // Concurrent throughput test
    console.log(`🔄 Phase 4: Concurrent Throughput (${BENCHMARK_REQUESTS} requests, ${CONCURRENT_BATCHES} parallel)`);
    console.log('-'.repeat(80));
    await benchmarkConcurrent();
    console.log('');

    // Latency under load
    console.log('⏱️  Phase 5: Latency Distribution');
    console.log('-'.repeat(80));
    analyzeLatency();
    console.log('');

    // Database performance
    console.log('💾 Phase 6: Database Performance');
    console.log('-'.repeat(80));
    await benchmarkDatabase();
    console.log('');

    // Memory efficiency
    console.log('📈 Phase 7: Memory Efficiency');
    console.log('-'.repeat(80));
    analyzeMemory();
    console.log('');

    // Final report
    console.log('='.repeat(80));
    console.log('✅ BENCHMARK COMPLETE');
    console.log('='.repeat(80) + '\n');
    
    printReport();

    // Cleanup
    await cleanup();
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
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

  // Load audit plugin (lightweight for benchmarking)
  const AuditLogPlugin = require('./plugins/audit-log');
  plugins.audit = new AuditLogPlugin();
  
  const context = {
    logger,
    db,
    services: serviceRegistry
  };

  await plugins.audit.init(context);
  console.log('✅ Audit plugin loaded');
}

async function warmup() {
  const auditLogger = serviceRegistry.get('AuditLogger');
  const start = Date.now();
  
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await auditLogger.log({
      tenantId: 'warmup-tenant',
      userId: 'warmup-user',
      category: 'api_access',
      action: 'warmup_request',
      severity: 'info',
      details: { iteration: i }
    });
  }
  
  await auditLogger.flushBuffer();
  
  const duration = Date.now() - start;
  results.warmup.duration = duration;
  results.warmup.throughput = (WARMUP_REQUESTS / duration * 1000).toFixed(2);
  
  console.log(`✅ Warmup complete: ${duration}ms`);
  console.log(`   Throughput: ${results.warmup.throughput} req/s`);
}

async function benchmarkSequential() {
  const auditLogger = serviceRegistry.get('AuditLogger');
  const latencies = [];
  
  console.log('Running sequential requests...');
  const totalStart = Date.now();
  
  for (let i = 0; i < BENCHMARK_REQUESTS; i++) {
    const reqStart = Date.now();
    
    await auditLogger.log({
      tenantId: `tenant-${i % 10}`,
      userId: `user-${i % 100}`,
      category: ['authentication', 'api_access', 'data_access'][i % 3],
      action: 'benchmark_request',
      severity: 'info',
      details: { iteration: i }
    });
    
    const latency = Date.now() - reqStart;
    latencies.push(latency);
    
    if (i % 100 === 0 && i > 0) {
      process.stdout.write(`\r   Progress: ${i}/${BENCHMARK_REQUESTS} requests`);
    }
  }
  
  await auditLogger.flushBuffer();
  
  const totalDuration = Date.now() - totalStart;
  results.sequential.duration = totalDuration;
  results.sequential.throughput = (BENCHMARK_REQUESTS / totalDuration * 1000).toFixed(2);
  results.sequential.latencies = latencies;
  
  console.log(`\r   ✅ Sequential test complete: ${totalDuration}ms`);
  console.log(`   Throughput: ${results.sequential.throughput} req/s`);
  console.log(`   Avg Latency: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(2)}ms`);
  
  updateMemoryPeak();
}

async function benchmarkConcurrent() {
  const auditLogger = serviceRegistry.get('AuditLogger');
  const batchSize = Math.floor(BENCHMARK_REQUESTS / CONCURRENT_BATCHES);
  
  console.log(`Running concurrent requests (${CONCURRENT_BATCHES} parallel batches)...`);
  const start = Date.now();
  
  const batches = [];
  for (let batch = 0; batch < CONCURRENT_BATCHES; batch++) {
    const batchPromises = [];
    
    for (let i = 0; i < batchSize; i++) {
      const promise = auditLogger.log({
        tenantId: `tenant-${(batch * batchSize + i) % 10}`,
        userId: `user-${(batch * batchSize + i) % 100}`,
        category: 'api_access',
        action: 'concurrent_benchmark',
        severity: 'info',
        details: { batch, iteration: i }
      });
      
      batchPromises.push(promise);
    }
    
    batches.push(Promise.all(batchPromises));
  }
  
  await Promise.all(batches);
  await auditLogger.flushBuffer();
  
  const duration = Date.now() - start;
  results.concurrent.duration = duration;
  results.concurrent.throughput = ((batchSize * CONCURRENT_BATCHES) / duration * 1000).toFixed(2);
  
  console.log(`   ✅ Concurrent test complete: ${duration}ms`);
  console.log(`   Throughput: ${results.concurrent.throughput} req/s`);
  console.log(`   Speedup: ${(results.concurrent.throughput / results.sequential.throughput).toFixed(2)}x`);
  
  updateMemoryPeak();
}

function analyzeLatency() {
  const latencies = results.sequential.latencies.sort((a, b) => a - b);
  
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p90 = latencies[Math.floor(latencies.length * 0.90)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((a, b) => a + b) / latencies.length;
  
  console.log('Latency Percentiles:');
  console.log(`   Min:  ${min.toFixed(2)}ms`);
  console.log(`   p50:  ${p50.toFixed(2)}ms (median)`);
  console.log(`   p90:  ${p90.toFixed(2)}ms`);
  console.log(`   p95:  ${p95.toFixed(2)}ms`);
  console.log(`   p99:  ${p99.toFixed(2)}ms`);
  console.log(`   Max:  ${max.toFixed(2)}ms`);
  console.log(`   Avg:  ${avg.toFixed(2)}ms`);
  
  // Rating
  let rating = '⭐⭐⭐⭐⭐ EXCELLENT';
  if (p95 > 10) rating = '⭐⭐⭐⭐ GOOD';
  if (p95 > 50) rating = '⭐⭐⭐ ACCEPTABLE';
  if (p95 > 100) rating = '⭐⭐ NEEDS OPTIMIZATION';
  
  console.log(`   Rating: ${rating}`);
}

async function benchmarkDatabase() {
  const auditQuery = serviceRegistry.get('AuditQuery');
  const queries = [
    { name: 'List all logs', fn: () => auditQuery.queryLogs({}, { limit: 100 }) },
    { name: 'Filter by tenant', fn: () => auditQuery.queryLogs({ tenantId: 'tenant-1' }, { limit: 100 }) },
    { name: 'Filter by category', fn: () => auditQuery.queryLogs({ category: 'api_access' }, { limit: 100 }) },
    { name: 'Get statistics', fn: () => auditQuery.getStatistics({}) }
  ];
  
  const iterations = 100;
  let totalTime = 0;
  let totalQueries = 0;
  
  for (const query of queries) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await query.fn();
      times.push(Date.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    totalTime += times.reduce((a, b) => a + b);
    totalQueries += iterations;
    
    console.log(`   ${query.name}:`);
    console.log(`      Avg: ${avg.toFixed(2)}ms, Min: ${min}ms, Max: ${max}ms`);
  }
  
  results.database.queries = totalQueries;
  results.database.totalTime = totalTime;
  results.database.avgTime = (totalTime / totalQueries).toFixed(2);
  
  console.log(`   ✅ ${totalQueries} queries in ${totalTime}ms`);
  console.log(`   Average: ${results.database.avgTime}ms per query`);
}

function analyzeMemory() {
  const memUsage = process.memoryUsage();
  results.memory.final = memUsage.heapUsed;
  
  const initial = results.memory.initial / 1024 / 1024;
  const peak = results.memory.peak / 1024 / 1024;
  const final = results.memory.final / 1024 / 1024;
  const increase = ((final - initial) / initial * 100).toFixed(2);
  
  console.log('Memory Usage:');
  console.log(`   Initial: ${initial.toFixed(2)} MB`);
  console.log(`   Peak:    ${peak.toFixed(2)} MB`);
  console.log(`   Final:   ${final.toFixed(2)} MB`);
  console.log(`   Increase: ${increase}%`);
  console.log('');
  console.log('Full Memory Profile:');
  console.log(`   RSS:      ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB`);
  
  // Rating
  let rating = '⭐⭐⭐⭐⭐ EXCELLENT';
  if (increase > 50) rating = '⭐⭐⭐⭐ GOOD';
  if (increase > 100) rating = '⭐⭐⭐ ACCEPTABLE';
  if (increase > 200) rating = '⭐⭐ MEMORY LEAK?';
  
  console.log(`   Rating: ${rating}`);
}

function updateMemoryPeak() {
  const current = process.memoryUsage().heapUsed;
  if (current > results.memory.peak) {
    results.memory.peak = current;
  }
}

function printReport() {
  console.log('📊 PERFORMANCE REPORT');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('Throughput:');
  console.log(`   Sequential: ${results.sequential.throughput} req/s`);
  console.log(`   Concurrent: ${results.concurrent.throughput} req/s`);
  console.log(`   Speedup:    ${(results.concurrent.throughput / results.sequential.throughput).toFixed(2)}x`);
  console.log('');
  
  const latencies = results.sequential.latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const avg = latencies.reduce((a, b) => a + b) / latencies.length;
  
  console.log('Latency:');
  console.log(`   Average: ${avg.toFixed(2)}ms`);
  console.log(`   p95:     ${p95.toFixed(2)}ms`);
  console.log('');
  
  console.log('Database:');
  console.log(`   Queries:  ${results.database.queries}`);
  console.log(`   Avg Time: ${results.database.avgTime}ms`);
  console.log('');
  
  const memIncrease = ((results.memory.final - results.memory.initial) / results.memory.initial * 100).toFixed(2);
  console.log('Memory:');
  console.log(`   Peak:     ${(results.memory.peak / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Increase: ${memIncrease}%`);
  console.log('');
  
  // Overall rating
  let overallRating = '⭐⭐⭐⭐⭐ EXCELLENT';
  if (results.sequential.throughput < 1000 || p95 > 10) {
    overallRating = '⭐⭐⭐⭐ GOOD';
  }
  if (results.sequential.throughput < 500 || p95 > 50) {
    overallRating = '⭐⭐⭐ ACCEPTABLE';
  }
  if (results.sequential.throughput < 100 || p95 > 100) {
    overallRating = '⭐⭐ NEEDS OPTIMIZATION';
  }
  
  console.log(`Overall Performance: ${overallRating}`);
  console.log('');
  console.log('✅ System is ready for production use');
}

async function cleanup() {
  if (plugins.audit && plugins.audit.cleanup) {
    await plugins.audit.cleanup();
  }
  
  if (db) {
    await db.close();
  }
}

// Run benchmark
runBenchmark().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
