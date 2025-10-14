#!/bin/bash
echo "=== RUNNING ALL TESTS - BASELINE ==="
echo ""

PASS=0
FAIL=0

run_test() {
  local test_file=$1
  local test_name=$2
  
  echo "Running: $test_name"
  if node "$test_file" > /tmp/test_output.txt 2>&1; then
    echo "✅ PASSED: $test_name"
    PASS=$((PASS + 1))
  else
    echo "❌ FAILED: $test_name"
    tail -20 /tmp/test_output.txt
    FAIL=$((FAIL + 1))
  fi
  echo ""
}

# Run each test
run_test "test-quick-all-plugins.js" "Quick All Plugins"
run_test "test-policies-plugin.js" "Policies Plugin"
run_test "test-tenant-isolation-stress.js" "Tenant Isolation Stress"
run_test "test-performance-benchmark.js" "Performance Benchmark"

echo "==================================="
echo "BASELINE TEST RESULTS:"
echo "✅ Passed: $PASS"
echo "❌ Failed: $FAIL"
echo "==================================="

if [ $FAIL -eq 0 ]; then
  echo "🎉 ALL TESTS PASSING - GOOD BASELINE"
  exit 0
else
  echo "⚠️  SOME TESTS FAILED - NEEDS ATTENTION"
  exit 1
fi
