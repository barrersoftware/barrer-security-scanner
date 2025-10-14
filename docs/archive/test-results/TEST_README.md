# AI Security Scanner - Testing Guide

## Quick Start

### Run All Tests (Interactive Mode)
```bash
./test-all-plugins.sh
```

### Run Tests (No Pauses)
```bash
PAUSE_BETWEEN=no ./test-all-plugins.sh
```

### Run Tests (Silent Mode)
```bash
INTERACTIVE=no PAUSE_BETWEEN=no SHOW_RESPONSES=no ./test-all-plugins.sh
```

## Configuration

Control test behavior with environment variables:

- `INTERACTIVE=yes|no` - Require ENTER to start (default: yes)
- `PAUSE_BETWEEN=yes|no` - Pause between tests (default: yes)
- `SHOW_REQUESTS=yes|no` - Show API requests (default: yes)
- `SHOW_RESPONSES=yes|no` - Show API responses (default: yes)
- `API_URL=http://...` - Server URL (default: http://localhost:3001)

## Interactive Controls

When paused between tests, you can:
- Press **ENTER** - Continue to next test
- Press **s** + ENTER - Skip remaining pauses (auto-continue)
- Press **q** + ENTER - Quit testing

## Test Coverage

### Phase 1: Authentication (5 tests)
1. User Registration
2. User Login
3. Get Session
4. CSRF Token Generation
5. Protected Route Enforcement

### Phase 2: Multi-Factor Authentication (3 tests)
6. MFA Setup
7. MFA Backup Codes
8. MFA Disable

### Phase 3: Security Plugin (5 tests)
9. Rate Limit Status
10. CSRF Token
11. Input Validation (SQL Injection)
12. Data Encryption
13. Data Hashing

### Phase 4: Scanner Plugin (3 tests)
14. Scanner Status
15. Platform Detection
16. Available Scans

### Phase 5: Storage Plugin (3 tests)
17. List Backups
18. List Reports
19. Storage Status

### Phase 6: Admin Plugin (5 tests)
20. System Health
21. Resource Usage
22. Plugin Status
23. List Users
24. Audit Logs

### Phase 7: VPN Plugin (3 tests)
25. VPN Status
26. WireGuard Status
27. OpenVPN Status

**Total: 27 automated tests**

## Test Results

Latest run:
- ✅ **24 tests passed** (88%)
- ❌ **3 tests failed** (authentication issues)
- ⏭️ **0 tests skipped**

Failed tests are typically due to:
- Token expiration
- Permission requirements (admin-only endpoints)
- Service not configured

## Log Files

Each test run creates a log file:
- Format: `test-results-YYYYMMDD_HHMMSS.log`
- Location: Current directory
- Contains: Full request/response details

## Troubleshooting

### Server Not Running
```bash
cd web-ui && node server-new.js
```

### Tests Failing
1. Check server is running: `curl http://localhost:3001`
2. Check log file for details
3. Run with full visibility: `./test-all-plugins.sh`

### Permission Errors
Some tests require admin role. The test creates a regular user, so admin endpoints may fail with "Unauthorized".

## Examples

### Full Visibility
```bash
# See everything
SHOW_REQUESTS=yes SHOW_RESPONSES=yes ./test-all-plugins.sh
```

### CI/CD Mode
```bash
# Automated, no pauses, minimal output
INTERACTIVE=no PAUSE_BETWEEN=no SHOW_RESPONSES=no ./test-all-plugins.sh
```

### Debug Mode
```bash
# Save all output to file
./test-all-plugins.sh 2>&1 | tee full-test-output.log
```

## Next Steps

1. Review test results
2. Fix any failed tests
3. Add more tests as needed
4. Integrate with CI/CD

## Test Script Features

✅ Interactive mode with pauses  
✅ Color-coded output  
✅ Request/response visibility  
✅ Automatic logging  
✅ Progress tracking  
✅ Summary statistics  
✅ Exit codes (0=pass, 1=fail)  
✅ Fixed routes (uses correct API endpoints)  
✅ All 7 plugins tested  
