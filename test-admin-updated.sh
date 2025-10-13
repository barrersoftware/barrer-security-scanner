#!/bin/bash

BASE_URL="http://localhost:3001"

echo "=== Testing Admin Plugin ==="
echo ""

# 1. Login as testadmin
echo "1. Logging in as testadmin..."
TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin","password":"Test123!"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"testadmin","password":"Test123!"}'
  exit 1
fi
echo "✅ Login successful"
echo ""

# 2. Test System Health
echo "2. Getting system health..."
curl -s "${BASE_URL}/api/admin/system/health" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {status, uptime: .uptime.formatted, plugins: .plugins.total, services: .services.total}'
echo ""

# 3. Test Dashboard
echo "3. Getting admin dashboard..."
curl -s "${BASE_URL}/api/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {timestamp, health: .health.status, plugins: .plugins, services: .services}'
echo ""

# 4. Test Plugin Status
echo "4. Getting plugin status..."
curl -s "${BASE_URL}/api/admin/plugins" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total, enabled, disabled}'
echo ""

# 5. Test Service Status
echo "5. Getting service status..."
curl -s "${BASE_URL}/api/admin/plugins/services" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.total'
echo ""

# 6. Test System Resources
echo "6. Getting system resources..."
curl -s "${BASE_URL}/api/admin/system/resources" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {memory: .memory.usagePercent, cpu: .cpu.count, uptime: .uptime.formatted}'
echo ""

# 7. Test User Management
echo "7. Creating a new user..."
curl -s -X POST "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"user@test.com","password":"User123!","role":"user"}' | jq '.data | {id, username, role, active}'
echo ""

# 8. List users
echo "8. Listing all users..."
curl -s "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.users[] | {id, username, role, active}'
echo ""

# 9. Get user stats
echo "9. Getting user statistics..."
curl -s "${BASE_URL}/api/admin/users/stats" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total, active, byRole}'
echo ""

# 10. Test Settings
echo "10. Getting settings..."
curl -s "${BASE_URL}/api/admin/settings" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | keys'
echo ""

# 11. Test Audit Logs
echo "11. Getting audit logs..."
curl -s "${BASE_URL}/api/admin/audit?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.logs | length'
echo ""

# 12. Test Audit Stats
echo "12. Getting audit statistics..."
curl -s "${BASE_URL}/api/admin/audit/stats?days=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total, recent}'
echo ""

echo "=== Admin Plugin Tests Complete! ==="
