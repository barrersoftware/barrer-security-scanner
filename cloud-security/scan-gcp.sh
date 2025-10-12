#!/bin/bash

###################################################
# AI Security Scanner - GCP Security Audit
# Comprehensive GCP infrastructure security scan
###################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="$HOME/security-reports/gcp_security_$(date +%Y%m%d_%H%M%S).md"
TEMP_DIR="/tmp/gcp-security-scan-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check dependencies
check_dependencies() {
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not installed${NC}"
        echo "Install: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠️  jq not installed - some features limited${NC}"
    fi
}

# Check GCP authentication
check_gcp_auth() {
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
        echo -e "${RED}❌ Not authenticated to GCP${NC}"
        echo "Run: gcloud auth login"
        exit 1
    fi
    
    local project=$(gcloud config get-value project 2>/dev/null)
    local account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
    
    echo -e "${GREEN}✅ Authenticated as: $account${NC}"
    echo -e "${GREEN}✅ Project: $project${NC}"
}

# Initialize report
init_report() {
    mkdir -p "$(dirname "$REPORT_FILE")"
    mkdir -p "$TEMP_DIR"
    
    local project=$(gcloud config get-value project 2>/dev/null)
    
    cat > "$REPORT_FILE" << EOF
# GCP Security Analysis Report
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Project: $project

## Table of Contents
- [IAM Security](#iam-security)
- [Compute Engine](#compute-engine)
- [Cloud Storage](#cloud-storage)
- [VPC Security](#vpc-security)
- [Cloud SQL](#cloud-sql)
- [Logging & Monitoring](#logging--monitoring)
- [Recommendations](#recommendations)

---

EOF
}

# Scan IAM
scan_iam() {
    echo -e "${BLUE}🔍 Scanning IAM...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## IAM Security

### IAM Policy Bindings
EOF
    
    local project=$(gcloud config get-value project 2>/dev/null)
    gcloud projects get-iam-policy "$project" --format=json > "$TEMP_DIR/iam_policy.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        # Check for overly permissive roles
        echo "" >> "$REPORT_FILE"
        echo "### Privileged Role Assignments" >> "$REPORT_FILE"
        
        jq -r '.bindings[] | select(.role | contains("roles/owner") or contains("roles/editor")) | 
            "- ⚠️  **\(.role)** assigned to: \(.members | join(", "))"' \
            "$TEMP_DIR/iam_policy.json" 2>/dev/null >> "$REPORT_FILE" || echo "None" >> "$REPORT_FILE"
        
        # Check for allUsers or allAuthenticatedUsers
        echo "" >> "$REPORT_FILE"
        echo "### Public Access" >> "$REPORT_FILE"
        
        if jq -e '.bindings[].members[] | select(. == "allUsers" or . == "allAuthenticatedUsers")' \
            "$TEMP_DIR/iam_policy.json" &>/dev/null; then
            echo "- 🚨 **CRITICAL: Public access granted in IAM policy**" >> "$REPORT_FILE"
            jq -r '.bindings[] | select(.members[] | . == "allUsers" or . == "allAuthenticatedUsers") | 
                "  - Role: \(.role)"' "$TEMP_DIR/iam_policy.json" >> "$REPORT_FILE"
        else
            echo "- ✅ No public access in IAM policies" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Compute Engine
scan_compute() {
    echo -e "${BLUE}🔍 Scanning Compute Engine...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Compute Engine

### VM Instances
EOF
    
    gcloud compute instances list --format=json > "$TEMP_DIR/instances.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local instance_count=$(jq -r '. | length' "$TEMP_DIR/instances.json" 2>/dev/null || echo "0")
        echo "- **Total Instances:** $instance_count" >> "$REPORT_FILE"
        
        if [[ "$instance_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Public IP Addresses" >> "$REPORT_FILE"
            
            jq -r '.[] | select(.networkInterfaces[].accessConfigs != null) | 
                "- \(.name) - \(.networkInterfaces[].accessConfigs[].natIP // "N/A")"' \
                "$TEMP_DIR/instances.json" >> "$REPORT_FILE" 2>/dev/null || echo "None" >> "$REPORT_FILE"
            
            echo "" >> "$REPORT_FILE"
            echo "### Instances Without Secure Boot" >> "$REPORT_FILE"
            
            jq -r '.[] | select(.shieldedInstanceConfig.enableSecureBoot != true) | 
                "- ⚠️  **\(.name)** - Secure boot not enabled"' \
                "$TEMP_DIR/instances.json" >> "$REPORT_FILE" 2>/dev/null || echo "All instances have secure boot" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Cloud Storage
scan_storage() {
    echo -e "${BLUE}🔍 Scanning Cloud Storage...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Cloud Storage

### Storage Buckets
EOF
    
    gsutil ls -L -b gs://* 2>/dev/null > "$TEMP_DIR/buckets.txt" || true
    
    local bucket_count=$(grep -c "gs://" "$TEMP_DIR/buckets.txt" 2>/dev/null || echo "0")
    echo "- **Total Buckets:** $bucket_count" >> "$REPORT_FILE"
    
    echo "" >> "$REPORT_FILE"
    echo "### Public Buckets" >> "$REPORT_FILE"
    
    gsutil ls 2>/dev/null | while read -r bucket; do
        if gsutil iam get "$bucket" 2>/dev/null | grep -q "allUsers\|allAuthenticatedUsers"; then
            echo "- 🚨 **$bucket** - Publicly accessible" >> "$REPORT_FILE"
        fi
        
        # Check encryption
        if ! gsutil encryption get "$bucket" 2>/dev/null | grep -q "Encryption"; then
            echo "- ⚠️  **$bucket** - No default encryption configured" >> "$REPORT_FILE"
        fi
    done
    
    echo "" >> "$REPORT_FILE"
}

# Scan Firewall Rules
scan_firewall() {
    echo -e "${BLUE}🔍 Scanning Firewall Rules...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## VPC Security

### Firewall Rules
EOF
    
    gcloud compute firewall-rules list --format=json > "$TEMP_DIR/firewall.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        echo "" >> "$REPORT_FILE"
        echo "### Overly Permissive Rules" >> "$REPORT_FILE"
        
        jq -r '.[] | select(.sourceRanges[] == "0.0.0.0/0") | 
            "- ⚠️  **\(.name)** - Allows traffic from anywhere on ports: \(.allowed[].ports // ["all"] | join(", "))"' \
            "$TEMP_DIR/firewall.json" 2>/dev/null >> "$REPORT_FILE" || echo "None found" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Cloud SQL
scan_sql() {
    echo -e "${BLUE}🔍 Scanning Cloud SQL...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Cloud SQL

### SQL Instances
EOF
    
    gcloud sql instances list --format=json > "$TEMP_DIR/sql.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local sql_count=$(jq -r '. | length' "$TEMP_DIR/sql.json" 2>/dev/null || echo "0")
        echo "- **Total SQL Instances:** $sql_count" >> "$REPORT_FILE"
        
        if [[ "$sql_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Security Issues" >> "$REPORT_FILE"
            
            # Check SSL requirement
            jq -r '.[] | select(.settings.ipConfiguration.requireSsl != true) | 
                "- ⚠️  **\(.name)** - SSL not required"' \
                "$TEMP_DIR/sql.json" >> "$REPORT_FILE" 2>/dev/null
            
            # Check public IP
            jq -r '.[] | select(.ipAddresses[].type == "PRIMARY") | 
                "- ⚠️  **\(.name)** - Has public IP address"' \
                "$TEMP_DIR/sql.json" >> "$REPORT_FILE" 2>/dev/null
            
            # Check backup
            jq -r '.[] | select(.settings.backupConfiguration.enabled != true) | 
                "- 🚨 **\(.name)** - Automated backups not enabled"' \
                "$TEMP_DIR/sql.json" >> "$REPORT_FILE" 2>/dev/null
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Logging
scan_logging() {
    echo -e "${BLUE}🔍 Scanning Logging & Monitoring...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Logging & Monitoring

### Audit Logs
EOF
    
    local project=$(gcloud config get-value project 2>/dev/null)
    
    # Check if Cloud Logging is enabled
    if gcloud logging read "resource.type=project" --limit=1 &>/dev/null; then
        echo "- ✅ Cloud Logging is enabled" >> "$REPORT_FILE"
    else
        echo "- ⚠️  Cloud Logging may not be configured" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# AI Analysis
ai_analysis() {
    if ! command -v ollama &>/dev/null; then
        echo -e "${YELLOW}⚠️  Skipping AI analysis - Ollama not available${NC}"
        return
    fi
    
    echo -e "${BLUE}🤖 Running AI security analysis...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## AI Security Analysis

EOF
    
    local analysis_input=$(cat "$REPORT_FILE")
    
    local ai_response=$(ollama run llama3.1:8b "You are a GCP security expert. Analyze this GCP security audit report and provide:
1. Top 3 critical security issues
2. Compliance concerns
3. Recommended remediation steps
4. Security score (1-10)

Report:
$analysis_input

Provide a concise analysis." 2>/dev/null | head -100)
    
    echo "$ai_response" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
}

# Generate recommendations
generate_recommendations() {
    cat >> "$REPORT_FILE" << EOF

## Recommendations

### High Priority
1. Remove public access from IAM policies, buckets, and databases
2. Enable SSL/TLS for all Cloud SQL instances
3. Enable automated backups for Cloud SQL
4. Review and restrict overly permissive firewall rules
5. Enable secure boot on all VM instances

### Medium Priority
1. Follow principle of least privilege for IAM roles
2. Enable default encryption for Cloud Storage buckets
3. Use private IPs for Cloud SQL instances
4. Implement VPC Service Controls
5. Enable Security Command Center

### Best Practices
1. Use Cloud Identity-Aware Proxy for access control
2. Enable Binary Authorization for container security
3. Implement organization policies for governance
4. Regular security audits and compliance checks
5. Use Cloud KMS for encryption key management

---

**Report generated by AI Security Scanner**
EOF
}

# Main function
main() {
    echo -e "${GREEN}🛡️  GCP Security Scanner${NC}\n"
    
    # Checks
    check_dependencies
    check_gcp_auth
    
    echo ""
    echo -e "${BLUE}Starting GCP security audit...${NC}\n"
    
    # Initialize
    init_report
    
    # Run scans
    scan_iam
    scan_compute
    scan_storage
    scan_firewall
    scan_sql
    scan_logging
    
    # AI analysis
    ai_analysis
    
    # Recommendations
    generate_recommendations
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    echo ""
    echo -e "${GREEN}✅ GCP security audit complete!${NC}"
    echo -e "${BLUE}📄 Report: $REPORT_FILE${NC}\n"
    
    # Display summary
    echo -e "${CYAN}Summary:${NC}"
    grep -E "^- \*\*|^- 🚨|^- ⚠️|^- ✅" "$REPORT_FILE" | head -20
}

# Run
main "$@"
