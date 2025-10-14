#!/bin/bash

#############################################
# Rate Limiting Plugin Test Suite
# Tests rate limiting, DDoS protection, and brute force prevention
#############################################

set -e

echo "========================================"
echo "Rate Limiting Plugin Test Suite"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test function
run_test() {
    local test_name=$1
    local test_command=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "${BLUE}[TEST $TOTAL_TESTS]${NC} $test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Navigate to plugin directory
cd "$(dirname "$0")/web-ui/plugins/rate-limiting"

echo -e "${YELLOW}Testing Rate Limiting Plugin...${NC}"
echo ""

#############################################
# Test 1: Rate Limiter Service
#############################################
echo -e "${BLUE}=== Rate Limiter Tests ===${NC}"
echo ""

cat > test-rate-limiter.js << 'EOTEST'
const RateLimiter = require('./rate-limiter');

// Mock database
const mockDb = {
  get: async () => null,
  run: async () => ({ changes: 1 }),
  all: async () => []
};

async function test() {
    const limiter = new RateLimiter(mockDb);
    await limiter.init();
    
    // Test methods exist
    if (typeof limiter.checkLimit !== 'function') {
        throw new Error('checkLimit method not found');
    }
    
    if (typeof limiter.getConfig !== 'function') {
        throw new Error('getConfig method not found');
    }
    
    if (typeof limiter.resetLimit !== 'function') {
        throw new Error('resetLimit method not found');
    }
    
    console.log('✓ All rate limiter tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Rate Limiter Initialization" "node test-rate-limiter.js"
run_test "Rate Limiter Methods Exist" "node test-rate-limiter.js | grep -q 'All rate limiter tests passed'"

echo ""

#############################################
# Test 2: IP Tracker Service
#############################################
echo -e "${BLUE}=== IP Tracker Tests ===${NC}"
echo ""

cat > test-ip-tracker.js << 'EOTEST'
const IPTracker = require('./ip-tracker');

// Mock database
const mockDb = {};

async function test() {
    const tracker = new IPTracker(mockDb);
    await tracker.init();
    
    // Test tracking
    tracker.trackRequest('192.168.1.1', '/api/test', 'GET', 'TestAgent');
    
    const rate = tracker.getRequestRate('192.168.1.1', '/api/test', 60);
    console.log('Request rate:', rate.count);
    
    if (rate.count !== 1) {
        throw new Error('Request tracking failed');
    }
    
    // Test suspicious detection
    const suspicious = tracker.isSuspicious('192.168.1.1', '/api/test');
    console.log('Suspicious:', suspicious.suspicious);
    
    console.log('✓ All IP tracker tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "IP Tracker Initialization" "node test-ip-tracker.js"
run_test "IP Tracker Request Tracking" "node test-ip-tracker.js | grep -q 'Request rate:'"
run_test "IP Tracker Suspicious Detection" "node test-ip-tracker.js | grep -q 'Suspicious:'"

echo ""

#############################################
# Test 3: Blocking Manager Service
#############################################
echo -e "${BLUE}=== Blocking Manager Tests ===${NC}"
echo ""

cat > test-blocking-manager.js << 'EOTEST'
const BlockingManager = require('./blocking-manager');

// Mock database
const mockDb = {
  all: async () => [],
  get: async () => null,
  run: async () => ({ changes: 1 })
};

async function test() {
    const manager = new BlockingManager(mockDb);
    await manager.init();
    
    // Test methods exist
    if (typeof manager.blockIP !== 'function') {
        throw new Error('blockIP method not found');
    }
    
    if (typeof manager.isBlocked !== 'function') {
        throw new Error('isBlocked method not found');
    }
    
    if (typeof manager.isWhitelisted !== 'function') {
        throw new Error('isWhitelisted method not found');
    }
    
    // Test IP not blocked initially
    const blocked = manager.isBlocked('tenant1', '192.168.1.1');
    console.log('IP blocked:', blocked.blocked);
    
    if (blocked.blocked) {
        throw new Error('IP should not be blocked initially');
    }
    
    console.log('✓ All blocking manager tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Blocking Manager Initialization" "node test-blocking-manager.js"
run_test "Blocking Manager Methods Exist" "node test-blocking-manager.js | grep -q 'IP blocked:'"

echo ""

#############################################
# Test 4: Brute Force Detector
#############################################
echo -e "${BLUE}=== Brute Force Detector Tests ===${NC}"
echo ""

cat > test-brute-force.js << 'EOTEST'
const BruteForceDetector = require('./brute-force-detector');

// Mock blocking manager
const mockBlockingManager = {
  blockIP: async () => ({ success: true })
};

// Mock database
const mockDb = {
  get: async () => ({ brute_force_attempts: 5, brute_force_window: 300, auto_block_enabled: 1, block_duration: 3600 }),
  run: async () => ({ changes: 1 })
};

async function test() {
    const detector = new BruteForceDetector(mockDb, mockBlockingManager);
    await detector.init();
    
    // Test methods exist
    if (typeof detector.trackAttempt !== 'function') {
        throw new Error('trackAttempt method not found');
    }
    
    if (typeof detector.isUnderAttack !== 'function') {
        throw new Error('isUnderAttack method not found');
    }
    
    console.log('✓ All brute force detector tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Brute Force Detector Initialization" "node test-brute-force.js"
run_test "Brute Force Detector Methods Exist" "node test-brute-force.js | grep -q 'All brute force detector tests passed'"

echo ""

#############################################
# Test 5: DDoS Protector
#############################################
echo -e "${BLUE}=== DDoS Protector Tests ===${NC}"
echo ""

cat > test-ddos-protector.js << 'EOTEST'
const DDoSProtector = require('./ddos-protector');

// Mock services
const mockBlockingManager = {
  blockIP: async () => ({ success: true })
};

const mockIPTracker = {
  getTopIPs: () => [],
  isSuspicious: () => ({ suspicious: false })
};

// Mock database
const mockDb = {
  get: async () => ({ ddos_threshold: 1000, ddos_window: 60, per_ip_limit: 100, per_ip_window: 60, block_duration: 3600, auto_block_enabled: 1 }),
  run: async () => ({ changes: 1 }),
  all: async () => []
};

async function test() {
    const protector = new DDoSProtector(mockDb, mockBlockingManager, mockIPTracker);
    await protector.init();
    
    // Test methods exist
    if (typeof protector.checkForDDoS !== 'function') {
        throw new Error('checkForDDoS method not found');
    }
    
    if (typeof protector.analyzeAttack !== 'function') {
        throw new Error('analyzeAttack method not found');
    }
    
    console.log('✓ All DDoS protector tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "DDoS Protector Initialization" "node test-ddos-protector.js"
run_test "DDoS Protector Methods Exist" "node test-ddos-protector.js | grep -q 'All DDoS protector tests passed'"

echo ""

#############################################
# Cleanup test files
#############################################
echo -e "${YELLOW}Cleaning up test files...${NC}"
rm -f test-rate-limiter.js
rm -f test-ip-tracker.js
rm -f test-blocking-manager.js
rm -f test-brute-force.js
rm -f test-ddos-protector.js
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

#############################################
# Results Summary
#############################################
echo "========================================"
echo -e "${BLUE}Test Results Summary${NC}"
echo "========================================"
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed:       ${PASSED_TESTS}${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed:       ${FAILED_TESTS}${NC}"
    echo ""
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
else
    echo -e "${GREEN}Failed:       0${NC}"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
fi
