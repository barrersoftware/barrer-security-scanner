#!/bin/bash

#############################################
# AI Security Scanner - Notification Script
# Send security alerts to Slack/Discord/Teams
#############################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$HOME/.ai-security-scanner/integrations.conf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Send security scan notifications to team communication platforms

OPTIONS:
    -p, --platform PLATFORM    Platform to send to (slack|discord|teams|all)
    -m, --message MESSAGE      Message to send
    -f, --file FILE           File to send (report, summary, etc)
    -s, --severity LEVEL      Severity level (info|warning|critical)
    -t, --title TITLE         Notification title
    -c, --config              Show configuration guide
    -h, --help                Show this help message

EXAMPLES:
    # Send a message to Slack
    $0 --platform slack --message "Security scan completed"
    
    # Send report to all platforms
    $0 --platform all --file ~/security-reports/latest.md --severity warning
    
    # Send critical alert to Discord
    $0 --platform discord --title "Critical Alert" --message "Intrusion detected" --severity critical

CONFIGURATION:
    Create ~/.ai-security-scanner/integrations.conf with your webhook URLs:
    
    SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
    DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR/WEBHOOK/URL"
    TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/YOUR/WEBHOOK/URL"

EOF
    exit 0
}

# Show configuration guide
show_config() {
    cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INTEGRATION CONFIGURATION GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 SLACK SETUP
1. Go to https://api.slack.com/apps
2. Create a new app or select existing one
3. Navigate to "Incoming Webhooks"
4. Activate Incoming Webhooks
5. Add New Webhook to Workspace
6. Copy the webhook URL

📋 DISCORD SETUP
1. Open Discord and go to Server Settings
2. Click on "Integrations"
3. Click "Create Webhook" or edit existing one
4. Choose a channel for notifications
5. Copy the webhook URL

📋 MICROSOFT TEAMS SETUP
1. Open Teams and go to the channel
2. Click on "..." menu → Connectors
3. Search for "Incoming Webhook"
4. Click "Configure"
5. Provide a name and upload an icon (optional)
6. Copy the webhook URL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CONFIGURATION FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create: ~/.ai-security-scanner/integrations.conf

# Slack webhook URL
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"

# Discord webhook URL
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY"

# Microsoft Teams webhook URL
TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/XXX/YYY"

# Optional: Default platform (slack|discord|teams|all)
DEFAULT_PLATFORM="slack"

# Optional: Enable/disable notifications (true|false)
NOTIFICATIONS_ENABLED="true"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To create the config file automatically, run:
    mkdir -p ~/.ai-security-scanner
    cat > ~/.ai-security-scanner/integrations.conf << 'CONF'
    SLACK_WEBHOOK_URL=""
    DISCORD_WEBHOOK_URL=""
    TEAMS_WEBHOOK_URL=""
    DEFAULT_PLATFORM="slack"
    NOTIFICATIONS_ENABLED="true"
CONF

Then edit the file and add your webhook URLs:
    nano ~/.ai-security-scanner/integrations.conf

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
    exit 0
}

# Load configuration
load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${YELLOW}⚠️  Configuration file not found${NC}"
        echo -e "Run: $0 --config for setup instructions"
        exit 1
    fi
    
    source "$CONFIG_FILE"
    
    if [[ "$NOTIFICATIONS_ENABLED" == "false" ]]; then
        echo -e "${YELLOW}⚠️  Notifications are disabled in config${NC}"
        exit 0
    fi
}

# Get color for severity
get_severity_color() {
    local severity="$1"
    case "$severity" in
        critical) echo "#dc2626" ;;  # Red
        warning)  echo "#f59e0b" ;;  # Orange
        info)     echo "#3b82f6" ;;  # Blue
        success)  echo "#10b981" ;;  # Green
        *)        echo "#6b7280" ;;  # Gray
    esac
}

# Get emoji for severity
get_severity_emoji() {
    local severity="$1"
    case "$severity" in
        critical) echo "🚨" ;;
        warning)  echo "⚠️" ;;
        info)     echo "ℹ️" ;;
        success)  echo "✅" ;;
        *)        echo "📊" ;;
    esac
}

# Send to Slack
send_to_slack() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local file_content="$4"
    
    if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        echo -e "${YELLOW}⚠️  Slack webhook not configured${NC}"
        return 1
    fi
    
    local color=$(get_severity_color "$severity")
    local emoji=$(get_severity_emoji "$severity")
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Build JSON payload
    local payload
    if [[ -n "$file_content" ]]; then
        # Truncate file content if too long (Slack has limits)
        local truncated_content="${file_content:0:2000}"
        [[ ${#file_content} -gt 2000 ]] && truncated_content="$truncated_content\n\n...(truncated)"
        
        payload=$(cat <<EOF
{
    "attachments": [{
        "color": "$color",
        "title": "$emoji $title",
        "text": "$message",
        "fields": [{
            "title": "Report Content",
            "value": "\`\`\`$truncated_content\`\`\`",
            "short": false
        }],
        "footer": "AI Security Scanner",
        "ts": $(date +%s)
    }]
}
EOF
)
    else
        payload=$(cat <<EOF
{
    "attachments": [{
        "color": "$color",
        "title": "$emoji $title",
        "text": "$message",
        "footer": "AI Security Scanner",
        "ts": $(date +%s)
    }]
}
EOF
)
    fi
    
    local response=$(curl -s -X POST "$SLACK_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    if [[ "$response" == "ok" ]]; then
        echo -e "${GREEN}✅ Sent to Slack${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to send to Slack: $response${NC}"
        return 1
    fi
}

# Send to Discord
send_to_discord() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local file_content="$4"
    
    if [[ -z "$DISCORD_WEBHOOK_URL" ]]; then
        echo -e "${YELLOW}⚠️  Discord webhook not configured${NC}"
        return 1
    fi
    
    local color_hex=$(get_severity_color "$severity" | sed 's/#//')
    local color_dec=$((16#$color_hex))
    local emoji=$(get_severity_emoji "$severity")
    
    # Build JSON payload
    local payload
    if [[ -n "$file_content" ]]; then
        # Discord allows longer messages
        local truncated_content="${file_content:0:4000}"
        [[ ${#file_content} -gt 4000 ]] && truncated_content="$truncated_content\n\n...(truncated)"
        
        payload=$(cat <<EOF
{
    "embeds": [{
        "title": "$emoji $title",
        "description": "$message",
        "color": $color_dec,
        "fields": [{
            "name": "Report Content",
            "value": "\`\`\`$truncated_content\`\`\`"
        }],
        "footer": {
            "text": "AI Security Scanner"
        },
        "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    }]
}
EOF
)
    else
        payload=$(cat <<EOF
{
    "embeds": [{
        "title": "$emoji $title",
        "description": "$message",
        "color": $color_dec,
        "footer": {
            "text": "AI Security Scanner"
        },
        "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    }]
}
EOF
)
    fi
    
    local response=$(curl -s -X POST "$DISCORD_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    if [[ -z "$response" ]]; then
        echo -e "${GREEN}✅ Sent to Discord${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to send to Discord: $response${NC}"
        return 1
    fi
}

# Send to Microsoft Teams
send_to_teams() {
    local title="$1"
    local message="$2"
    local severity="$3"
    local file_content="$4"
    
    if [[ -z "$TEAMS_WEBHOOK_URL" ]]; then
        echo -e "${YELLOW}⚠️  Teams webhook not configured${NC}"
        return 1
    fi
    
    local color=$(get_severity_color "$severity")
    local emoji=$(get_severity_emoji "$severity")
    
    # Build JSON payload (Teams MessageCard format)
    local payload
    if [[ -n "$file_content" ]]; then
        local truncated_content="${file_content:0:3000}"
        [[ ${#file_content} -gt 3000 ]] && truncated_content="$truncated_content\n\n...(truncated)"
        
        payload=$(cat <<EOF
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "${color#\#}",
    "summary": "$title",
    "sections": [{
        "activityTitle": "$emoji $title",
        "activitySubtitle": "AI Security Scanner",
        "text": "$message",
        "facts": [{
            "name": "Severity:",
            "value": "$severity"
        }, {
            "name": "Timestamp:",
            "value": "$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        }]
    }, {
        "title": "Report Content",
        "text": "\`\`\`\n$truncated_content\n\`\`\`"
    }]
}
EOF
)
    else
        payload=$(cat <<EOF
{
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    "themeColor": "${color#\#}",
    "summary": "$title",
    "sections": [{
        "activityTitle": "$emoji $title",
        "activitySubtitle": "AI Security Scanner",
        "text": "$message",
        "facts": [{
            "name": "Severity:",
            "value": "$severity"
        }, {
            "name": "Timestamp:",
            "value": "$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
        }]
    }]
}
EOF
)
    fi
    
    local response=$(curl -s -X POST "$TEAMS_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    if [[ "$response" == "1" ]]; then
        echo -e "${GREEN}✅ Sent to Teams${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to send to Teams: $response${NC}"
        return 1
    fi
}

# Main function
main() {
    local platform=""
    local message=""
    local file=""
    local severity="info"
    local title="Security Alert"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--platform)
                platform="$2"
                shift 2
                ;;
            -m|--message)
                message="$2"
                shift 2
                ;;
            -f|--file)
                file="$2"
                shift 2
                ;;
            -s|--severity)
                severity="$2"
                shift 2
                ;;
            -t|--title)
                title="$2"
                shift 2
                ;;
            -c|--config)
                show_config
                ;;
            -h|--help)
                usage
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                usage
                ;;
        esac
    done
    
    # Validate inputs
    if [[ -z "$platform" ]] && [[ -z "$message" ]]; then
        echo -e "${RED}❌ Platform and message are required${NC}"
        usage
    fi
    
    # Load configuration
    load_config
    
    # Use default platform if not specified
    [[ -z "$platform" ]] && platform="${DEFAULT_PLATFORM:-slack}"
    
    # Read file content if provided
    local file_content=""
    if [[ -n "$file" ]] && [[ -f "$file" ]]; then
        file_content=$(cat "$file")
        [[ -z "$message" ]] && message="Security report attached"
    fi
    
    # Send notifications
    echo -e "${BLUE}📡 Sending notifications...${NC}\n"
    
    local success=0
    local failed=0
    
    case "$platform" in
        slack)
            send_to_slack "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            ;;
        discord)
            send_to_discord "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            ;;
        teams)
            send_to_teams "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            ;;
        all)
            send_to_slack "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            send_to_discord "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            send_to_teams "$title" "$message" "$severity" "$file_content" && ((success++)) || ((failed++))
            ;;
        *)
            echo -e "${RED}❌ Invalid platform: $platform${NC}"
            echo "Valid platforms: slack, discord, teams, all"
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}✅ Sent: $success${NC}"
    [[ $failed -gt 0 ]] && echo -e "${RED}❌ Failed: $failed${NC}"
    
    exit 0
}

# Run main function
main "$@"
