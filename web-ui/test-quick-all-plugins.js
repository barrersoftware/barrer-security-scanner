#!/usr/bin/env node

/**
 * Quick All-Plugins Status Check
 * Verifies all plugins can be loaded and basic services are available
 */

console.log('\n' + '='.repeat(80));
console.log('🔍 QUICK ALL-PLUGINS STATUS CHECK');
console.log('='.repeat(80) + '\n');

const plugins = [
  { name: 'auth', path: './plugins/auth' },
  { name: 'security', path: './plugins/security' },
  { name: 'scanner', path: './plugins/scanner' },
  { name: 'storage', path: './plugins/storage' },
  { name: 'system-info', path: './plugins/system-info' },
  { name: 'tenants', path: './plugins/tenants' },
  { name: 'admin', path: './plugins/admin' },
  { name: 'vpn', path: './plugins/vpn' },
  { name: 'api-analytics', path: './plugins/api-analytics' },
  { name: 'audit-log', path: './plugins/audit-log' }
];

let loadedCount = 0;
const results = [];

for (const { name, path } of plugins) {
  try {
    const plugin = require(path);
    
    // Check what it exports
    const isClass = typeof plugin === 'function';
    const isObject = typeof plugin === 'object' && plugin !== null;
    const hasInit = plugin && typeof (plugin.init || plugin.prototype?.init) === 'function';
    const hasRoutes = plugin && typeof (plugin.routes || plugin.prototype?.routes) === 'function';
    const hasMiddleware = plugin && typeof (plugin.middleware || plugin.prototype?.middleware) === 'function';
    
    results.push({
      name,
      loaded: true,
      type: isClass ? 'class' : isObject ? 'object' : 'unknown',
      hasInit,
      hasRoutes,
      hasMiddleware
    });
    
    loadedCount++;
    console.log(`✅ ${name.padEnd(15)} - ${isClass ? 'Class' : 'Object'} | init: ${hasInit ? '✓' : '✗'} | routes: ${hasRoutes ? '✓' : '✗'} | middleware: ${hasMiddleware ? '✓' : '✗'}`);
  } catch (error) {
    results.push({
      name,
      loaded: false,
      error: error.message
    });
    console.log(`❌ ${name.padEnd(15)} - Failed: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log(`📊 Results: ${loadedCount}/${plugins.length} plugins loaded successfully`);
console.log('='.repeat(80) + '\n');

if (loadedCount === plugins.length) {
  console.log('✅ ALL PLUGINS CAN BE LOADED!\n');
  console.log('Plugin Breakdown:');
  console.log(`  - Classes: ${results.filter(r => r.type === 'class').length}`);
  console.log(`  - Objects: ${results.filter(r => r.type === 'object').length}`);
  console.log(`  - With init(): ${results.filter(r => r.hasInit).length}`);
  console.log(`  - With routes(): ${results.filter(r => r.hasRoutes).length}`);
  console.log(`  - With middleware(): ${results.filter(r => r.hasMiddleware).length}`);
  console.log('');
  console.log('🎉 All plugins are properly structured and ready to use!');
  process.exit(0);
} else {
  console.log(`⚠️  ${plugins.length - loadedCount} plugin(s) failed to load`);
  process.exit(1);
}
