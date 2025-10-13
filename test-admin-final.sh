#!/bin/bash

BASE_URL="http://localhost:3001"

echo "=== Testing Admin Plugin ==="
echo ""

# 1. Login as default admin
echo "1. Logging in as default admin (admin/admin123)..."
TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed"
  exit 1
fi
echo "✅ Login successful"
echo ""

# 2. Test Dashboard
echo "2. Testing admin dashboard..."
curl -s "${BASE_URL}/api/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {status: "success", health: .data.health.status, plugins: .data.plugins, services: .data.services} end'
echo ""

# 3. Test System Health
echo "3. Testing system health..."
curl -s "${BASE_URL}/api/admin/system/health" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {status: .data.status, uptime: .data.uptime.formatted, plugins: .data.plugins.total, services: .data.services.total} end'
echo ""

# 4. Test Plugin Status
echo "4. Testing plugin status..."
curl -s "${BASE_URL}/api/admin/plugins" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {total: .data.total, enabled: .data.enabled, plugins: [.data.plugins[] | {name, version, enabled}]} end'
echo ""

# 5. Test System Resources
echo "5. Testing system resources..."
curl -s "${BASE_URL}/api/admin/system/resources" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {memory: .data.memory.usagePercent, cpu: .data.cpu.count, uptime: .data.uptime.formatted} end'
echo ""

# 6. Test User Listing
echo "6. Testing user listing..."
curl -s "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {total: .data.pagination.total, users: [.data.users[] | {username, role, active}]} end'
echo ""

# 7. Test User Stats
echo "7. Testing user statistics..."
curl -s "${BASE_URL}/api/admin/users/stats" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {total: .data.total, active: .data.active, byRole: .data.byRole} end'
echo ""

# 8. Test Settings Retrieval
echo "8. Testing settings..."
curl -s "${BASE_URL}/api/admin/settings" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {categories: (.data | keys)} end'
echo ""

# 9. Test Audit Logs
echo "9. Testing audit logs..."
curl -s "${BASE_URL}/api/admin/audit?limit=3" \
  -H "Authorization: Bearer $TOKEN" | jq '. | if .error then {error} else {count: (.data.logs | length), recentActions: [.data.logs[] | {username, action, status}]} end'
echo ""

# 10. Test User Creation
echo "10. Testing user creation..."
curl -s -X POST "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","email":"newuser@test.com","password":"Test123!","role":"user"}' | jq '. | if .error then {error} else {created: .data.username, role: .data.role} end'
echo ""

echo "=== Admin Plugin Test Complete! ✅ ==="
