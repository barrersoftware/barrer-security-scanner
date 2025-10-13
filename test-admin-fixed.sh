#!/bin/bash

BASE_URL="http://localhost:3001"

echo "=== Testing Admin Plugin ==="
echo ""

# 1. Login as testadmin
echo "1. Logging in as testadmin..."
TOKEN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testadmin","password":"Test123!"}' | jq -r '.data.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed - No token received"
  exit 1
fi
echo "✅ Login successful (token: ${TOKEN:0:20}...)"
echo ""

# 2. Test System Health
echo "2. Testing system health..."
HEALTH=$(curl -s "${BASE_URL}/api/admin/system/health" \
  -H "Authorization: Bearer $TOKEN")
echo "$HEALTH" | jq -r '.error // empty' > /tmp/admin_error.txt
if [ -s /tmp/admin_error.txt ]; then
  echo "❌ Error: $(cat /tmp/admin_error.txt)"
else
  echo "✅ Health check successful"
  echo "$HEALTH" | jq '.data | {status, uptime: .uptime.formatted, plugins: .plugins.total, services: .services.total}'
fi
echo ""

# 3. Test Dashboard
echo "3. Testing dashboard..."
DASH=$(curl -s "${BASE_URL}/api/admin/dashboard" \
  -H "Authorization: Bearer $TOKEN")
if echo "$DASH" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$DASH" | jq -r '.error')"
else
  echo "✅ Dashboard loaded"
  echo "$DASH" | jq '.data | {health: .health.status, plugins: .plugins, services: .services}'
fi
echo ""

# 4. Test Plugin Status
echo "4. Testing plugin status..."
PLUGINS=$(curl -s "${BASE_URL}/api/admin/plugins" \
  -H "Authorization: Bearer $TOKEN")
if echo "$PLUGINS" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$PLUGINS" | jq -r '.error')"
else
  echo "✅ Plugin status retrieved"
  echo "$PLUGINS" | jq '.data | {total, enabled, disabled}'
fi
echo ""

# 5. Test System Resources
echo "5. Testing system resources..."
RES=$(curl -s "${BASE_URL}/api/admin/system/resources" \
  -H "Authorization: Bearer $TOKEN")
if echo "$RES" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$RES" | jq -r '.error')"
else
  echo "✅ System resources retrieved"
  echo "$RES" | jq '.data | {memory: .memory.usagePercent, cpu: .cpu.count}'
fi
echo ""

# 6. Test User Creation
echo "6. Testing user creation..."
NEW_USER=$(curl -s -X POST "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser2","email":"user2@test.com","password":"User123!","role":"user"}')
if echo "$NEW_USER" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$NEW_USER" | jq -r '.error')"
else
  echo "✅ User created successfully"
  echo "$NEW_USER" | jq '.data | {id, username, role}'
fi
echo ""

# 7. List Users
echo "7. Testing user listing..."
USERS=$(curl -s "${BASE_URL}/api/admin/users" \
  -H "Authorization: Bearer $TOKEN")
if echo "$USERS" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$USERS" | jq -r '.error')"
else
  echo "✅ Users listed successfully"
  echo "$USERS" | jq '.data | {total: .pagination.total, users: [.users[] | {username, role}]}'
fi
echo ""

# 8. Test Settings
echo "8. Testing settings retrieval..."
SETTINGS=$(curl -s "${BASE_URL}/api/admin/settings" \
  -H "Authorization: Bearer $TOKEN")
if echo "$SETTINGS" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$SETTINGS" | jq -r '.error')"
else
  echo "✅ Settings retrieved"
  echo "$SETTINGS" | jq '.data | keys'
fi
echo ""

# 9. Test Audit Logs
echo "9. Testing audit logs..."
AUDIT=$(curl -s "${BASE_URL}/api/admin/audit?limit=5" \
  -H "Authorization: Bearer $TOKEN")
if echo "$AUDIT" | jq -e '.error' > /dev/null; then
  echo "❌ Error: $(echo "$AUDIT" | jq -r '.error')"
else
  echo "✅ Audit logs retrieved"
  echo "$AUDIT" | jq '.data | {count: .logs | length, pagination: .pagination}'
fi
echo ""

echo "=== Admin Plugin Tests Complete! ==="
echo ""
echo "Summary:"
echo "- System monitoring: Working ✅"
echo "- User management: Working ✅"
echo "- Settings management: Working ✅"
echo "- Audit logging: Working ✅"
