#!/bin/bash

###################################################
# AI Security Scanner - Multi-Cloud Scanner
# Scan AWS, GCP, and Azure in one command
###################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Scan multiple cloud providers in one command

OPTIONS:
    --aws           Scan AWS
    --gcp           Scan GCP
    --azure         Scan Azure
    --all           Scan all configured cloud providers
    -n, --notify    Send notifications on completion
    -h, --help      Show this help

EXAMPLES:
    # Scan all clouds
    $0 --all
    
    # Scan specific clouds
    $0 --aws --gcp
    
    # Scan with notifications
    $0 --all --notify

EOF
    exit 0
}

# Main function
main() {
    local scan_aws=false
    local scan_gcp=false
    local scan_azure=false
    local scan_all=false
    local notify=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --aws)
                scan_aws=true
                shift
                ;;
            --gcp)
                scan_gcp=true
                shift
                ;;
            --azure)
                scan_azure=true
                shift
                ;;
            --all)
                scan_all=true
                shift
                ;;
            -n|--notify)
                notify=true
                shift
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
    
    # If --all, enable all scans
    if [[ "$scan_all" == "true" ]]; then
        scan_aws=true
        scan_gcp=true
        scan_azure=true
    fi
    
    # If no scans selected, show usage
    if [[ "$scan_aws" == "false" ]] && [[ "$scan_gcp" == "false" ]] && [[ "$scan_azure" == "false" ]]; then
        echo -e "${RED}❌ No cloud providers selected${NC}\n"
        usage
    fi
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Multi-Cloud Security Scanner${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    local start_time=$(date +%s)
    local success=0
    local failed=0
    local reports=()
    
    # Scan AWS
    if [[ "$scan_aws" == "true" ]]; then
        echo -e "${CYAN}═══════════════════════════════════════════${NC}"
        echo -e "${CYAN}  Scanning AWS${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"
        
        if "$SCRIPT_DIR/scan-aws.sh"; then
            echo -e "${GREEN}✅ AWS scan completed${NC}\n"
            ((success++))
            reports+=($(ls -t ~/security-reports/aws_security_*.md | head -1))
        else
            echo -e "${RED}❌ AWS scan failed${NC}\n"
            ((failed++))
        fi
    fi
    
    # Scan GCP
    if [[ "$scan_gcp" == "true" ]]; then
        echo -e "${CYAN}═══════════════════════════════════════════${NC}"
        echo -e "${CYAN}  Scanning GCP${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"
        
        if "$SCRIPT_DIR/scan-gcp.sh"; then
            echo -e "${GREEN}✅ GCP scan completed${NC}\n"
            ((success++))
            reports+=($(ls -t ~/security-reports/gcp_security_*.md | head -1))
        else
            echo -e "${RED}❌ GCP scan failed${NC}\n"
            ((failed++))
        fi
    fi
    
    # Scan Azure
    if [[ "$scan_azure" == "true" ]]; then
        echo -e "${CYAN}═══════════════════════════════════════════${NC}"
        echo -e "${CYAN}  Scanning Azure${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"
        
        if "$SCRIPT_DIR/scan-azure.sh"; then
            echo -e "${GREEN}✅ Azure scan completed${NC}\n"
            ((success++))
            reports+=($(ls -t ~/security-reports/azure_security_*.md | head -1))
        else
            echo -e "${RED}❌ Azure scan failed${NC}\n"
            ((failed++))
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Scan Complete${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    echo -e "${BLUE}📊 Summary:${NC}"
    echo -e "  ${GREEN}Successful: $success${NC}"
    [[ $failed -gt 0 ]] && echo -e "  ${RED}Failed: $failed${NC}"
    echo -e "  Duration: ${duration}s"
    echo ""
    
    if [[ ${#reports[@]} -gt 0 ]]; then
        echo -e "${BLUE}📄 Reports Generated:${NC}"
        for report in "${reports[@]}"; do
            echo -e "  • $report"
        done
        echo ""
    fi
    
    # Send notification
    if [[ "$notify" == "true" ]] && [[ -f "$SCRIPT_DIR/../integrations/notify.sh" ]]; then
        local severity="success"
        [[ $failed -gt 0 ]] && severity="warning"
        
        "$SCRIPT_DIR/../integrations/notify.sh" \
            --platform all \
            --title "Multi-Cloud Security Scan Complete" \
            --message "Scanned cloud providers: $success successful, $failed failed (${duration}s)" \
            --severity "$severity" || true
    fi
    
    echo -e "${GREEN}✅ All done!${NC}"
}

# Run main
main "$@"
