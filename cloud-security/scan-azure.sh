#!/bin/bash

###################################################
# AI Security Scanner - Azure Security Audit
# Comprehensive Azure infrastructure security scan
###################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="$HOME/security-reports/azure_security_$(date +%Y%m%d_%H%M%S).md"
TEMP_DIR="/tmp/azure-security-scan-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check dependencies
check_dependencies() {
    if ! command -v az &> /dev/null; then
        echo -e "${RED}❌ Azure CLI not installed${NC}"
        echo "Install: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠️  jq not installed - some features limited${NC}"
    fi
}

# Check Azure authentication
check_azure_auth() {
    if ! az account show &>/dev/null; then
        echo -e "${RED}❌ Not authenticated to Azure${NC}"
        echo "Run: az login"
        exit 1
    fi
    
    local subscription=$(az account show --query name -o tsv 2>/dev/null)
    local account=$(az account show --query user.name -o tsv 2>/dev/null)
    
    echo -e "${GREEN}✅ Authenticated as: $account${NC}"
    echo -e "${GREEN}✅ Subscription: $subscription${NC}"
}

# Initialize report
init_report() {
    mkdir -p "$(dirname "$REPORT_FILE")"
    mkdir -p "$TEMP_DIR"
    
    local subscription=$(az account show --query name -o tsv 2>/dev/null)
    local sub_id=$(az account show --query id -o tsv 2>/dev/null)
    
    cat > "$REPORT_FILE" << EOF
# Azure Security Analysis Report
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Subscription: $subscription
Subscription ID: $sub_id

## Table of Contents
- [Azure AD Security](#azure-ad-security)
- [Virtual Machines](#virtual-machines)
- [Storage Accounts](#storage-accounts)
- [Network Security](#network-security)
- [SQL Databases](#sql-databases)
- [Key Vault](#key-vault)
- [Security Center](#security-center)
- [Recommendations](#recommendations)

---

EOF
}

# Scan Azure AD
scan_azure_ad() {
    echo -e "${BLUE}🔍 Scanning Azure AD...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Azure AD Security

### Azure AD Users
EOF
    
    az ad user list --output json > "$TEMP_DIR/ad_users.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local user_count=$(jq -r '. | length' "$TEMP_DIR/ad_users.json" 2>/dev/null || echo "0")
        echo "- **Total Azure AD Users:** $user_count" >> "$REPORT_FILE"
        
        # Check for users without MFA (requires Azure AD Premium)
        echo "" >> "$REPORT_FILE"
        echo "### Multi-Factor Authentication" >> "$REPORT_FILE"
        echo "- ℹ️  MFA status check requires Azure AD Premium" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "### Role Assignments" >> "$REPORT_FILE"
    
    # Check for Owner and Contributor assignments
    az role assignment list --include-classic-administrators --output json > "$TEMP_DIR/role_assignments.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        jq -r '.[] | select(.roleDefinitionName == "Owner" or .roleDefinitionName == "Contributor") | 
            "- ⚠️  **\(.roleDefinitionName)** assigned to: \(.principalName // .principalId)"' \
            "$TEMP_DIR/role_assignments.json" >> "$REPORT_FILE" 2>/dev/null || echo "None" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Virtual Machines
scan_vms() {
    echo -e "${BLUE}🔍 Scanning Virtual Machines...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Virtual Machines

### VM Instances
EOF
    
    az vm list --output json > "$TEMP_DIR/vms.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local vm_count=$(jq -r '. | length' "$TEMP_DIR/vms.json" 2>/dev/null || echo "0")
        echo "- **Total VMs:** $vm_count" >> "$REPORT_FILE"
        
        if [[ "$vm_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### VM Security Issues" >> "$REPORT_FILE"
            
            # Check for unencrypted disks
            az disk list --query "[?encryptionSettings==null]" --output json > "$TEMP_DIR/unencrypted_disks.json" 2>/dev/null || true
            local unencrypted=$(jq -r '. | length' "$TEMP_DIR/unencrypted_disks.json" 2>/dev/null || echo "0")
            
            if [[ "$unencrypted" -gt 0 ]]; then
                echo "- ⚠️  **Found $unencrypted unencrypted disks**" >> "$REPORT_FILE"
            else
                echo "- ✅ All disks are encrypted" >> "$REPORT_FILE"
            fi
            
            # Check for public IPs
            az network public-ip list --output json > "$TEMP_DIR/public_ips.json" 2>/dev/null || true
            local public_ips=$(jq -r '. | length' "$TEMP_DIR/public_ips.json" 2>/dev/null || echo "0")
            echo "- **VMs with Public IPs:** $public_ips" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Storage Accounts
scan_storage() {
    echo -e "${BLUE}🔍 Scanning Storage Accounts...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Storage Accounts

### Storage Security
EOF
    
    az storage account list --output json > "$TEMP_DIR/storage.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local storage_count=$(jq -r '. | length' "$TEMP_DIR/storage.json" 2>/dev/null || echo "0")
        echo "- **Total Storage Accounts:** $storage_count" >> "$REPORT_FILE"
        
        if [[ "$storage_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Security Issues" >> "$REPORT_FILE"
            
            # Check for insecure transfer
            jq -r '.[] | select(.enableHttpsTrafficOnly != true) | 
                "- 🚨 **\(.name)** - HTTPS-only traffic not enforced"' \
                "$TEMP_DIR/storage.json" >> "$REPORT_FILE" 2>/dev/null
            
            # Check for public access
            jq -r '.[] | select(.allowBlobPublicAccess == true) | 
                "- ⚠️  **\(.name)** - Public blob access allowed"' \
                "$TEMP_DIR/storage.json" >> "$REPORT_FILE" 2>/dev/null
            
            # Check encryption
            jq -r '.[] | select(.encryption.services.blob.enabled != true) | 
                "- ⚠️  **\(.name)** - Blob encryption not enabled"' \
                "$TEMP_DIR/storage.json" >> "$REPORT_FILE" 2>/dev/null
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Network Security Groups
scan_nsgs() {
    echo -e "${BLUE}🔍 Scanning Network Security Groups...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Network Security

### Network Security Groups
EOF
    
    az network nsg list --output json > "$TEMP_DIR/nsgs.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local nsg_count=$(jq -r '. | length' "$TEMP_DIR/nsgs.json" 2>/dev/null || echo "0")
        echo "- **Total NSGs:** $nsg_count" >> "$REPORT_FILE"
        
        if [[ "$nsg_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Overly Permissive Rules" >> "$REPORT_FILE"
            
            # Check for rules allowing traffic from anywhere
            az network nsg list --query "[].securityRules[?sourceAddressPrefix=='*' || sourceAddressPrefix=='Internet']" \
                --output json > "$TEMP_DIR/permissive_rules.json" 2>/dev/null || true
            
            if jq -e '. | length > 0' "$TEMP_DIR/permissive_rules.json" &>/dev/null; then
                jq -r '.[] | "- ⚠️  Rule **\(.name)** - Allows traffic from Internet on port \(.destinationPortRange)"' \
                    "$TEMP_DIR/permissive_rules.json" >> "$REPORT_FILE" 2>/dev/null
            else
                echo "- ✅ No overly permissive rules found" >> "$REPORT_FILE"
            fi
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan SQL Databases
scan_sql() {
    echo -e "${BLUE}🔍 Scanning SQL Databases...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## SQL Databases

### SQL Servers
EOF
    
    az sql server list --output json > "$TEMP_DIR/sql_servers.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local sql_count=$(jq -r '. | length' "$TEMP_DIR/sql_servers.json" 2>/dev/null || echo "0")
        echo "- **Total SQL Servers:** $sql_count" >> "$REPORT_FILE"
        
        if [[ "$sql_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Security Issues" >> "$REPORT_FILE"
            
            jq -r '.[].name' "$TEMP_DIR/sql_servers.json" 2>/dev/null | while read -r server; do
                # Check firewall rules
                local resource_group=$(jq -r ".[] | select(.name==\"$server\") | .resourceGroup" "$TEMP_DIR/sql_servers.json")
                
                if az sql server firewall-rule list -g "$resource_group" -s "$server" --query "[?startIpAddress=='0.0.0.0' && endIpAddress=='255.255.255.255']" -o json 2>/dev/null | jq -e '. | length > 0' &>/dev/null; then
                    echo "- 🚨 **$server** - Firewall allows all IP addresses" >> "$REPORT_FILE"
                fi
                
                # Check TDE (Transparent Data Encryption)
                if ! az sql db list -g "$resource_group" -s "$server" --query "[?transparentDataEncryption.status=='Enabled']" -o json 2>/dev/null | jq -e '. | length > 0' &>/dev/null; then
                    echo "- ⚠️  **$server** - TDE not enabled on all databases" >> "$REPORT_FILE"
                fi
            done
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Key Vault
scan_keyvault() {
    echo -e "${BLUE}🔍 Scanning Key Vaults...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Key Vault

### Key Vaults
EOF
    
    az keyvault list --output json > "$TEMP_DIR/keyvaults.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local kv_count=$(jq -r '. | length' "$TEMP_DIR/keyvaults.json" 2>/dev/null || echo "0")
        echo "- **Total Key Vaults:** $kv_count" >> "$REPORT_FILE"
        
        if [[ "$kv_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Security Issues" >> "$REPORT_FILE"
            
            # Check for soft delete
            jq -r '.[] | select(.properties.enableSoftDelete != true) | 
                "- ⚠️  **\(.name)** - Soft delete not enabled"' \
                "$TEMP_DIR/keyvaults.json" >> "$REPORT_FILE" 2>/dev/null || echo "- ✅ All vaults have soft delete enabled" >> "$REPORT_FILE"
            
            # Check for purge protection
            jq -r '.[] | select(.properties.enablePurgeProtection != true) | 
                "- ⚠️  **\(.name)** - Purge protection not enabled"' \
                "$TEMP_DIR/keyvaults.json" >> "$REPORT_FILE" 2>/dev/null
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Security Center
scan_security_center() {
    echo -e "${BLUE}🔍 Scanning Security Center...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Security Center

### Security Recommendations
EOF
    
    # Get security recommendations
    az security assessment list --output json > "$TEMP_DIR/security_assessments.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local high_severity=$(jq -r '[.[] | select(.properties.status.severity=="High")] | length' \
            "$TEMP_DIR/security_assessments.json" 2>/dev/null || echo "0")
        local medium_severity=$(jq -r '[.[] | select(.properties.status.severity=="Medium")] | length' \
            "$TEMP_DIR/security_assessments.json" 2>/dev/null || echo "0")
        
        echo "- **High Severity Issues:** $high_severity" >> "$REPORT_FILE"
        echo "- **Medium Severity Issues:** $medium_severity" >> "$REPORT_FILE"
        
        if [[ "$high_severity" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Critical Findings" >> "$REPORT_FILE"
            
            jq -r '.[] | select(.properties.status.severity=="High") | 
                "- 🚨 \(.properties.displayName)"' \
                "$TEMP_DIR/security_assessments.json" | head -10 >> "$REPORT_FILE" 2>/dev/null
        fi
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
    
    local ai_response=$(ollama run llama3.1:8b "You are an Azure security expert. Analyze this Azure security audit report and provide:
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
1. Enable Azure Security Center Standard tier
2. Enforce HTTPS-only traffic for all storage accounts
3. Enable Transparent Data Encryption (TDE) for all SQL databases
4. Restrict SQL Server firewall rules
5. Enable soft delete and purge protection for Key Vaults

### Medium Priority
1. Review and restrict overly permissive NSG rules
2. Enable disk encryption for all VMs
3. Disable public blob access on storage accounts
4. Implement Azure Policy for governance
5. Enable Azure Sentinel for SIEM

### Best Practices
1. Enable MFA for all users (requires Azure AD Premium)
2. Use Azure AD Privileged Identity Management
3. Implement Azure Defender for all services
4. Regular security audits and compliance checks
5. Use managed identities instead of service principals

---

**Report generated by AI Security Scanner**
EOF
}

# Main function
main() {
    echo -e "${GREEN}🛡️  Azure Security Scanner${NC}\n"
    
    # Checks
    check_dependencies
    check_azure_auth
    
    echo ""
    echo -e "${BLUE}Starting Azure security audit...${NC}\n"
    
    # Initialize
    init_report
    
    # Run scans
    scan_azure_ad
    scan_vms
    scan_storage
    scan_nsgs
    scan_sql
    scan_keyvault
    scan_security_center
    
    # AI analysis
    ai_analysis
    
    # Recommendations
    generate_recommendations
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    echo ""
    echo -e "${GREEN}✅ Azure security audit complete!${NC}"
    echo -e "${BLUE}📄 Report: $REPORT_FILE${NC}\n"
    
    # Display summary
    echo -e "${CYAN}Summary:${NC}"
    grep -E "^- \*\*|^- 🚨|^- ⚠️|^- ✅" "$REPORT_FILE" | head -20
}

# Run
main "$@"
