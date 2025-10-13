#!/bin/bash

API_URL="http://localhost:3001"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  Testing Admin Endpoints${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

# Login as admin
echo "Logging in as admin..."
RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

ADMIN_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Failed to login as admin${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Admin logged in${NC}"
echo "Token: ${ADMIN_TOKEN:0:30}..."
echo ""

# Test admin endpoints
echo -e "${CYAN}Testing Admin Endpoints:${NC}"
echo ""

# Test 1: System Health
echo "1. System Health"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/system/health" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 2: Resource Usage
echo "2. Resource Usage"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/system/resources" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 3: Plugin Status
echo "3. Plugin Status"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/system/plugins" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 4: List Users
echo "4. List Users"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '. | if type=="array" then .[0:2] else . end' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 5: Audit Logs
echo "5. Audit Logs"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/audit/logs?limit=3" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '. | if type=="array" then .[0:2] else . end' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 6: Settings
echo "6. Get Settings"
RESPONSE=$(curl -s -X GET "$API_URL/api/admin/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$RESPONSE" | jq -C '. | if type=="object" then {security, backup, system} else . end' 2>/dev/null || echo "$RESPONSE"
echo ""

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Admin token: $ADMIN_TOKEN${NC}"
echo ""
echo "Run full tests with admin token:"
echo "  ADMIN_TOKEN=\"$ADMIN_TOKEN\" ./test-all-plugins.sh"
echo ""
