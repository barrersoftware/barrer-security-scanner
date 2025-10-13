#!/bin/bash

# Complete test suite with admin token

API_URL="http://localhost:3001"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}Creating test users...${NC}"

# Create admin user
ADMIN_USER="testadmin_$(date +%s)"
ADMIN_PASS="Admin123!@#"

echo "Creating admin: $ADMIN_USER"
curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"email\":\"admin_$(date +%s)@test.com\",\"password\":\"$ADMIN_PASS\"}" > /dev/null

echo "Logging in as admin..."
RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$ADMIN_TOKEN" ]; then
    echo -e "${GREEN}✓ Admin token obtained${NC}"
    echo ""
    
    # Export for test script
    export ADMIN_TOKEN
    export INTERACTIVE=no
    export PAUSE_BETWEEN=no
    export SHOW_RESPONSES=no
    
    # Run tests
    ./test-all-plugins.sh
else
    echo -e "${YELLOW}⚠ Could not get admin token, running without it${NC}"
    export INTERACTIVE=no
    export PAUSE_BETWEEN=no
    ./test-all-plugins.sh
fi
