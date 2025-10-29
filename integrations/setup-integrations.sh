#!/bin/bash

###################################################
# AI Security Scanner - Integration Setup Wizard
# Interactive setup for Slack/Discord/Teams
###################################################

set -e

CONFIG_DIR="$HOME/.ai-security-scanner"
CONFIG_FILE="$CONFIG_DIR/integrations.conf"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}"
cat << "EOF"
╔════════════════════════════════════════════════════╗
║   AI Security Scanner - Integration Setup          ║
║   Configure Slack, Discord, and Teams              ║
╚════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# Create config directory
mkdir -p "$CONFIG_DIR"

# Check if config already exists
if [[ -f "$CONFIG_FILE" ]]; then
    echo -e "${YELLOW}⚠️  Configuration file already exists${NC}"
    echo -e "Current config: $CONFIG_FILE\n"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}ℹ️  Setup cancelled${NC}"
        exit 0
    fi
fi

echo -e "${BLUE}📋 Integration Setup${NC}\n"
echo "Leave blank to skip any platform"
echo ""

# Slack setup
echo -e "${GREEN}━━━ SLACK ━━━${NC}"
echo "Get webhook URL from: https://api.slack.com/apps"
read -p "Slack Webhook URL: " SLACK_WEBHOOK

# Discord setup
echo -e "\n${GREEN}━━━ DISCORD ━━━${NC}"
echo "Get webhook URL from: Server Settings → Integrations → Webhooks"
read -p "Discord Webhook URL: " DISCORD_WEBHOOK

# Teams setup
echo -e "\n${GREEN}━━━ MICROSOFT TEAMS ━━━${NC}"
echo "Get webhook URL from: Channel → ... → Connectors → Incoming Webhook"
read -p "Teams Webhook URL: " TEAMS_WEBHOOK

# Default platform
echo -e "\n${GREEN}━━━ PREFERENCES ━━━${NC}"
echo "Choose default platform (used when not specified):"
echo "  1) Slack"
echo "  2) Discord"
echo "  3) Teams"
echo "  4) All"
read -p "Default platform [1]: " PLATFORM_CHOICE
PLATFORM_CHOICE=${PLATFORM_CHOICE:-1}

case "$PLATFORM_CHOICE" in
    1) DEFAULT_PLATFORM="slack" ;;
    2) DEFAULT_PLATFORM="discord" ;;
    3) DEFAULT_PLATFORM="teams" ;;
    4) DEFAULT_PLATFORM="all" ;;
    *) DEFAULT_PLATFORM="slack" ;;
esac

# Enable notifications
read -p "Enable notifications by default? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    NOTIFICATIONS_ENABLED="false"
else
    NOTIFICATIONS_ENABLED="true"
fi

# Write configuration
echo -e "\n${BLUE}💾 Saving configuration...${NC}"

cat > "$CONFIG_FILE" << EOF
# AI Security Scanner - Integration Configuration
# Generated: $(date)

# Slack webhook URL
SLACK_WEBHOOK_URL="$SLACK_WEBHOOK"

# Discord webhook URL
DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK"

# Microsoft Teams webhook URL
TEAMS_WEBHOOK_URL="$TEAMS_WEBHOOK"

# Default platform (slack|discord|teams|all)
DEFAULT_PLATFORM="$DEFAULT_PLATFORM"

# Enable/disable notifications (true|false)
NOTIFICATIONS_ENABLED="$NOTIFICATIONS_ENABLED"
EOF

chmod 600 "$CONFIG_FILE"

echo -e "${GREEN}✅ Configuration saved to $CONFIG_FILE${NC}\n"

# Test configuration
if [[ "$NOTIFICATIONS_ENABLED" == "true" ]]; then
    echo -e "${BLUE}🧪 Testing configuration...${NC}\n"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if [[ -n "$SLACK_WEBHOOK" ]] || [[ -n "$DISCORD_WEBHOOK" ]] || [[ -n "$TEAMS_WEBHOOK" ]]; then
        "$SCRIPT_DIR/notify.sh" \
            --platform "$DEFAULT_PLATFORM" \
            --title "Integration Test" \
            --message "AI Security Scanner notifications are now configured and working!" \
            --severity "success" || true
    fi
fi

# Show usage examples
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  SETUP COMPLETE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}📚 Usage Examples:${NC}\n"
echo "Send a test message:"
echo "  ./notify.sh --platform slack --message \"Test message\""
echo ""
echo "Send scan report:"
echo "  ./notify.sh --platform all --file ~/security-reports/latest.md --severity warning"
echo ""
echo "Run scan with auto-notification:"
echo "  ./auto-notify.sh comprehensive"
echo ""
echo "Add to crontab for scheduled notifications:"
echo "  30 3 * * * cd $(dirname "$SCRIPT_DIR") && ./integrations/auto-notify.sh comprehensive"
echo ""

echo -e "${GREEN}✅ All set! Enjoy your security notifications!${NC}\n"
