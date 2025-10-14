#!/bin/bash

echo "========================================"
echo "Backup & Recovery Plugin Test Suite"
echo "========================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

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

cd "$(dirname "$0")/web-ui/plugins/backup-recovery"

echo "Testing Backup & Recovery Plugin..."
echo ""

# Backup Service Tests
echo -e "${BLUE}=== Backup Service Tests ===${NC}"
echo ""
run_test "Backup Service exists" "test -f backup-service.js"
run_test "Backup Service has valid syntax" "node -c backup-service.js"

# Encryption Service Tests
echo ""
echo -e "${BLUE}=== Encryption Service Tests ===${NC}"
echo ""
run_test "Encryption Service exists" "test -f encryption-service.js"
run_test "Encryption Service has valid syntax" "node -c encryption-service.js"

# Restore Service Tests
echo ""
echo -e "${BLUE}=== Restore Service Tests ===${NC}"
echo ""
run_test "Restore Service exists" "test -f restore-service.js"
run_test "Restore Service has valid syntax" "node -c restore-service.js"

# Integrity Checker Tests
echo ""
echo -e "${BLUE}=== Integrity Checker Tests ===${NC}"
echo ""
run_test "Integrity Checker exists" "test -f integrity-checker.js"
run_test "Integrity Checker has valid syntax" "node -c integrity-checker.js"

# Schedule Manager Tests
echo ""
echo -e "${BLUE}=== Schedule Manager Tests ===${NC}"
echo ""
run_test "Schedule Manager exists" "test -f schedule-manager.js"
run_test "Schedule Manager has valid syntax" "node -c schedule-manager.js"

# Storage Manager Tests
echo ""
echo -e "${BLUE}=== Storage Manager Tests ===${NC}"
echo ""
run_test "Storage Manager exists" "test -f storage-manager.js"
run_test "Storage Manager has valid syntax" "node -c storage-manager.js"

# Main Plugin Tests
echo ""
echo -e "${BLUE}=== Main Plugin Tests ===${NC}"
echo ""
run_test "Main Plugin exists" "test -f index.js"
run_test "Main Plugin has valid syntax" "node -c index.js"
run_test "Plugin config exists" "test -f plugin.json"
run_test "Plugin config is valid JSON" "python3 -m json.tool plugin.json > /dev/null"

# Documentation Tests
echo ""
echo -e "${BLUE}=== Documentation Tests ===${NC}"
echo ""
run_test "README exists" "test -f README.md"
run_test "README has content" "test \$(wc -l < README.md) -gt 50"

echo ""
echo "========================================"
echo -e "${BLUE}Test Results Summary${NC}"
echo "========================================"
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed:       ${PASSED_TESTS}${NC}"

if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed:       ${FAILED_TESTS}${NC}"
    echo ""
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
else
    echo -e "${GREEN}Failed:       0${NC}"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
fi
