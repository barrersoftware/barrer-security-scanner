#!/bin/bash

BASE_URL="http://localhost:3001"

echo "=== Testing Admin Plugin ==="
echo ""

# 1. Login as admin
echo "1. Logging in as admin..."
TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi
echo "✅ Login successful, token: ${TOKEN:0:20}..."
echo ""

# 2. Test Dashboard
echo "2. Getting admin dashboard..."
curl -s "${BASE_URL}/api/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 3. Test System Health
echo "3. Getting system health..."
curl -s "${BASE_URL}/api/admin/system/health" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.status, .data.plugins, .data.services'
echo ""

# 4. Test User Management
echo "4. Listing users..."
curl -s "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.users[] | {id, username, role, active}'
echo ""

# 5. Test User Stats
echo "5. Getting user statistics..."
curl -s "${BASE_URL}/api/admin/users/stats" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
echo ""

# 6. Test Plugin Status
echo "6. Getting plugin status..."
curl -s "${BASE_URL}/api/admin/plugins" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total, enabled, disabled, plugins: .plugins[:3]}'
echo ""

# 7. Test Settings
echo "7. Getting settings..."
curl -s "${BASE_URL}/api/admin/settings" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | keys'
echo ""

# 8. Test Audit Logs
echo "8. Getting audit logs..."
curl -s "${BASE_URL}/api/admin/audit?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.logs[] | {timestamp, username, action, status}'
echo ""

# 9. Test System Resources
echo "9. Getting system resources..."
curl -s "${BASE_URL}/api/admin/system/resources" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {memory: .memory.usagePercent, cpu: .cpu.count, uptime: .uptime.formatted}'
echo ""

# 10. Test Service Status
echo "10. Getting service status..."
curl -s "${BASE_URL}/api/admin/plugins/services" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total, services: .services[:5]}'
echo ""

echo "=== All Admin Plugin Tests Complete! ==="
