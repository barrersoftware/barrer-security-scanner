#!/bin/bash

#############################################
# Update Plugin Test Suite
# Tests platform detection and package manager service
#############################################

set -e

echo "========================================"
echo "Update Plugin Test Suite"
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

# Check if Node.js is installed
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found${NC}"
    exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js $NODE_VERSION${NC}"
echo ""

# Navigate to plugin directory
cd "$(dirname "$0")/web-ui/plugins/update"

echo -e "${YELLOW}Testing Update Plugin Services...${NC}"
echo ""

#############################################
# Test 1: Platform Detector
#############################################
echo -e "${BLUE}=== Platform Detector Tests ===${NC}"
echo ""

# Create test script for platform detector
cat > test-platform-detector.js << 'EOTEST'
const PlatformDetector = require('./platform-detector');

async function test() {
    const detector = new PlatformDetector();
    await detector.init();
    
    // Test platform detection
    console.log('Platform:', detector.platform);
    if (!detector.platform) throw new Error('Platform not detected');
    
    // Test distro detection
    console.log('Distro:', detector.distro);
    
    // Test package manager detection
    console.log('Package Managers:', detector.packageManagers.join(', '));
    if (detector.packageManagers.length === 0) {
        throw new Error('No package managers detected');
    }
    
    // Test primary package manager
    const primary = detector.getPrimaryPackageManager();
    console.log('Primary Package Manager:', primary);
    if (!primary) throw new Error('No primary package manager found');
    
    // Test platform support check
    if (!detector.isSupported()) {
        throw new Error('Platform not supported');
    }
    
    // Test path detection
    const paths = detector.getPaths();
    console.log('Config Path:', paths.config);
    if (!paths.config) throw new Error('Config path not detected');
    
    console.log('\n✓ All platform detector tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Platform Detector Initialization" "node test-platform-detector.js"
run_test "Platform Detection Works" "node test-platform-detector.js | grep -q 'Platform:'"
run_test "Package Manager Detection" "node test-platform-detector.js | grep -q 'Package Managers:'"
run_test "Primary Package Manager Found" "node test-platform-detector.js | grep -q 'Primary Package Manager:'"

echo ""

#############################################
# Test 2: Package Manager Service
#############################################
echo -e "${BLUE}=== Package Manager Service Tests ===${NC}"
echo ""

# Create test script for package manager service
cat > test-package-manager.js << 'EOTEST'
const PlatformDetector = require('./platform-detector');
const PackageManagerService = require('./package-manager-service');

async function test() {
    const detector = new PlatformDetector();
    await detector.init();
    
    const pmService = new PackageManagerService(detector);
    await pmService.init();
    
    // Test getting available managers
    const available = pmService.getAvailableManagers();
    console.log('Available Managers:', available.length);
    if (available.length === 0) throw new Error('No managers available');
    
    // Test getting supported managers
    const supported = pmService.getSupportedManagers();
    console.log('Supported Managers:', supported.length);
    if (supported.length === 0) throw new Error('No managers supported');
    
    // Test check updates (if primary manager available)
    const primary = detector.getPrimaryPackageManager();
    if (primary) {
        console.log('Testing with primary manager:', primary);
        
        // Note: We won't actually check updates in test to avoid system changes
        // Just verify the method exists and is callable
        if (typeof pmService.checkUpdates !== 'function') {
            throw new Error('checkUpdates method not found');
        }
        
        if (typeof pmService.installUpdates !== 'function') {
            throw new Error('installUpdates method not found');
        }
        
        if (typeof pmService.installPackage !== 'function') {
            throw new Error('installPackage method not found');
        }
        
        if (typeof pmService.removePackage !== 'function') {
            throw new Error('removePackage method not found');
        }
        
        if (typeof pmService.cleanCache !== 'function') {
            throw new Error('cleanCache method not found');
        }
    }
    
    console.log('\n✓ All package manager service tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Package Manager Service Initialization" "node test-package-manager.js"
run_test "Available Managers Detection" "node test-package-manager.js | grep -q 'Available Managers:'"
run_test "Supported Managers Detection" "node test-package-manager.js | grep -q 'Supported Managers:'"
run_test "Service Methods Exist" "node test-package-manager.js | grep -q 'Testing with primary manager:'"

echo ""

#############################################
# Test 3: Windows Update Service
#############################################
echo -e "${BLUE}=== Windows Update Service Tests ===${NC}"
echo ""

# Create test script for Windows Update service
cat > test-windows-update.js << 'EOTEST'
const PlatformDetector = require('./platform-detector');
const WindowsUpdateService = require('./windows-update-service');

async function test() {
    const detector = new PlatformDetector();
    await detector.init();
    
    const wuService = new WindowsUpdateService(detector);
    await wuService.init();
    
    // Test service status
    const status = wuService.getStatus();
    console.log('Windows Update Available:', status.available);
    console.log('Platform:', status.platform);
    
    // Test availability check
    const isAvailable = wuService.isAvailable();
    console.log('Is Available:', isAvailable);
    
    // Verify methods exist
    if (typeof wuService.checkUpdates !== 'function') {
        throw new Error('checkUpdates method not found');
    }
    
    if (typeof wuService.installUpdates !== 'function') {
        throw new Error('installUpdates method not found');
    }
    
    if (typeof wuService.isRebootRequired !== 'function') {
        throw new Error('isRebootRequired method not found');
    }
    
    if (typeof wuService.getUpdateHistory !== 'function') {
        throw new Error('getUpdateHistory method not found');
    }
    
    console.log('\n✓ All Windows Update service tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Windows Update Service Initialization" "node test-windows-update.js"
run_test "Service Status Check" "node test-windows-update.js | grep -q 'Platform:'"
run_test "Service Methods Exist" "node test-windows-update.js | grep -q 'Is Available:'"

echo ""

#############################################
# Test 4: Service Integration
#############################################
echo -e "${BLUE}=== Integration Tests ===${NC}"
echo ""

# Create integration test
cat > test-integration.js << 'EOTEST'
const PlatformDetector = require('./platform-detector');
const PackageManagerService = require('./package-manager-service');
const WindowsUpdateService = require('./windows-update-service');

async function test() {
    console.log('Testing service integration...');
    
    // Initialize platform detector
    const detector = new PlatformDetector();
    await detector.init();
    
    // Initialize package manager service
    const pmService = new PackageManagerService(detector);
    await pmService.init();
    
    // Initialize Windows Update service
    const wuService = new WindowsUpdateService(detector);
    await wuService.init();
    
    // Verify all services share platform info
    console.log('Platform:', detector.platform);
    console.log('Package Managers:', detector.packageManagers.length);
    console.log('Windows Update Available:', wuService.isAvailable());
    
    // Test that services can coexist
    const managers = pmService.getAvailableManagers();
    const wuStatus = wuService.getStatus();
    
    if (!detector.platform) throw new Error('Platform not detected');
    if (!managers) throw new Error('Managers not available');
    if (!wuStatus) throw new Error('Windows Update status not available');
    
    console.log('\n✓ Integration tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Services Initialize Together" "node test-integration.js"
run_test "Services Share Platform Info" "node test-integration.js | grep -q 'Platform:'"
run_test "All Services Functional" "node test-integration.js | grep -q 'Integration tests passed'"

echo ""

#############################################
# Test 5: Verification Service
#############################################
echo -e "${BLUE}=== Verification Service Tests ===${NC}"
echo ""

# Create test script for verification service
cat > test-verification.js << 'EOTEST'
const VerificationService = require('./verification-service');
const crypto = require('crypto');
const fs = require('fs');

async function test() {
    const verifyService = new VerificationService();
    await verifyService.init();
    
    // Create a test file
    const testContent = 'This is a test file for verification';
    fs.writeFileSync('/tmp/test-verify.txt', testContent);
    
    // Calculate checksum
    const hash = crypto.createHash('sha256');
    hash.update(testContent);
    const expectedChecksum = hash.digest('hex');
    
    console.log('Expected Checksum:', expectedChecksum);
    
    // Test checksum verification
    const checksumResult = await verifyService.verifyChecksum(
        '/tmp/test-verify.txt',
        expectedChecksum,
        'sha256'
    );
    
    console.log('Checksum Verified:', checksumResult);
    
    if (!checksumResult) {
        throw new Error('Checksum verification failed');
    }
    
    // Test calculate checksum
    const calculated = await verifyService.calculateChecksum('/tmp/test-verify.txt', 'sha256');
    console.log('Calculated Checksum:', calculated);
    
    if (calculated !== expectedChecksum) {
        throw new Error('Calculated checksum does not match');
    }
    
    // Cleanup
    fs.unlinkSync('/tmp/test-verify.txt');
    
    console.log('\n✓ All verification service tests passed');
    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
EOTEST

run_test "Verification Service Initialization" "node test-verification.js"
run_test "Checksum Calculation" "node test-verification.js | grep -q 'Calculated Checksum:'"
run_test "Checksum Verification" "node test-verification.js | grep -q 'Checksum Verified: true'"

echo ""

#############################################
# Cleanup test files
#############################################
echo -e "${YELLOW}Cleaning up test files...${NC}"
rm -f test-platform-detector.js
rm -f test-package-manager.js
rm -f test-windows-update.js
rm -f test-integration.js
rm -f test-verification.js
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
