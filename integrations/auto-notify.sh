#!/bin/bash

##########################################################
# AI Security Scanner - Automatic Notification Wrapper
# Wraps scan scripts to automatically send notifications
##########################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOTIFY_SCRIPT="$SCRIPT_DIR/notify.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $0 <scan-type> [scan-arguments]

Automatically run a security scan and send notifications upon completion

SCAN TYPES:
    comprehensive   Run full system security scan
    code-review     Run code security review
    monitor         Start security monitoring

EXAMPLES:
    # Run comprehensive scan with auto-notification
    $0 comprehensive
    
    # Run code review with auto-notification
    $0 code-review /path/to/code
    
    # Start monitoring with alerts
    $0 monitor

ENVIRONMENT VARIABLES:
    NOTIFY_PLATFORM     Platform to send to (default: from config)
    NOTIFY_ON_SUCCESS   Send notification on success (default: true)
    NOTIFY_ON_ERROR     Send notification on error (default: true)

EOF
    exit 0
}

# Check if notify script exists
if [[ ! -f "$NOTIFY_SCRIPT" ]]; then
    echo -e "${RED}❌ Notification script not found: $NOTIFY_SCRIPT${NC}"
    exit 1
fi

# Check arguments
if [[ $# -lt 1 ]]; then
    usage
fi

SCAN_TYPE="$1"
shift

# Set defaults
NOTIFY_ON_SUCCESS="${NOTIFY_ON_SUCCESS:-true}"
NOTIFY_ON_ERROR="${NOTIFY_ON_ERROR:-true}"
PLATFORM="${NOTIFY_PLATFORM:-all}"

# Get script paths
SCRIPTS_DIR="$SCRIPT_DIR/../scripts"

case "$SCAN_TYPE" in
    comprehensive)
        SCAN_SCRIPT="$SCRIPTS_DIR/security-scanner.sh"
        SCAN_NAME="Comprehensive Security Scan"
        ;;
    code-review)
        SCAN_SCRIPT="$SCRIPTS_DIR/code-review.sh"
        SCAN_NAME="Code Security Review"
        ;;
    monitor)
        SCAN_SCRIPT="$SCRIPTS_DIR/security-monitor.sh"
        SCAN_NAME="Security Monitoring"
        ;;
    *)
        echo -e "${RED}❌ Invalid scan type: $SCAN_TYPE${NC}"
        usage
        ;;
esac

# Check if scan script exists
if [[ ! -f "$SCAN_SCRIPT" ]]; then
    echo -e "${RED}❌ Scan script not found: $SCAN_SCRIPT${NC}"
    exit 1
fi

# Run the scan
echo -e "${GREEN}🔍 Starting $SCAN_NAME...${NC}\n"
START_TIME=$(date +%s)

if bash "$SCAN_SCRIPT" "$@"; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo -e "\n${GREEN}✅ Scan completed successfully in ${DURATION}s${NC}"
    
    if [[ "$NOTIFY_ON_SUCCESS" == "true" ]]; then
        # Find the latest report
        LATEST_REPORT=$(ls -t ~/security-reports/*.md 2>/dev/null | head -1)
        
        if [[ -n "$LATEST_REPORT" ]]; then
            # Extract summary from report (first 500 chars)
            SUMMARY=$(head -c 500 "$LATEST_REPORT")
            
            "$NOTIFY_SCRIPT" \
                --platform "$PLATFORM" \
                --title "$SCAN_NAME Completed" \
                --message "Scan completed successfully in ${DURATION}s. Report: $(basename "$LATEST_REPORT")" \
                --severity "success" \
                --file "$LATEST_REPORT"
        else
            "$NOTIFY_SCRIPT" \
                --platform "$PLATFORM" \
                --title "$SCAN_NAME Completed" \
                --message "Scan completed successfully in ${DURATION}s" \
                --severity "success"
        fi
    fi
    
    exit 0
else
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    echo -e "\n${RED}❌ Scan failed with exit code $EXIT_CODE after ${DURATION}s${NC}"
    
    if [[ "$NOTIFY_ON_ERROR" == "true" ]]; then
        "$NOTIFY_SCRIPT" \
            --platform "$PLATFORM" \
            --title "$SCAN_NAME Failed" \
            --message "Scan failed with exit code $EXIT_CODE after ${DURATION}s. Check logs for details." \
            --severity "critical"
    fi
    
    exit $EXIT_CODE
fi
