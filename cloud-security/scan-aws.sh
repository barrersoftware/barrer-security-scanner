#!/bin/bash

###################################################
# AI Security Scanner - AWS Security Audit
# Comprehensive AWS infrastructure security scan
###################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="$HOME/security-reports/aws_security_$(date +%Y%m%d_%H%M%S).md"
TEMP_DIR="/tmp/aws-security-scan-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check dependencies
check_dependencies() {
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not installed${NC}"
        echo "Install: https://aws.amazon.com/cli/"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠️  jq not installed - some features limited${NC}"
        echo "Install: sudo apt install jq"
    fi
    
    if ! command -v ollama &> /dev/null; then
        echo -e "${YELLOW}⚠️  Ollama not installed - AI analysis disabled${NC}"
    fi
}

# Check AWS credentials
check_aws_credentials() {
    if ! aws sts get-caller-identity &>/dev/null; then
        echo -e "${RED}❌ AWS credentials not configured${NC}"
        echo "Configure with: aws configure"
        exit 1
    fi
    
    local account=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
    local user=$(aws sts get-caller-identity --query Arn --output text 2>/dev/null)
    
    echo -e "${GREEN}✅ Authenticated as: $user${NC}"
    echo -e "${GREEN}✅ Account: $account${NC}"
}

# Initialize report
init_report() {
    mkdir -p "$(dirname "$REPORT_FILE")"
    mkdir -p "$TEMP_DIR"
    
    cat > "$REPORT_FILE" << EOF
# AWS Security Analysis Report
Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Account: $(aws sts get-caller-identity --query Account --output text 2>/dev/null)
Region: $(aws configure get region)

## Table of Contents
- [IAM Security](#iam-security)
- [EC2 Security](#ec2-security)
- [S3 Security](#s3-security)
- [VPC Security](#vpc-security)
- [RDS Security](#rds-security)
- [CloudTrail](#cloudtrail)
- [Security Groups](#security-groups)
- [Recommendations](#recommendations)

---

EOF
}

# Scan IAM
scan_iam() {
    echo -e "${BLUE}🔍 Scanning IAM...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## IAM Security

### IAM Users
EOF
    
    # List users
    aws iam list-users --output json > "$TEMP_DIR/iam_users.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local user_count=$(jq -r '.Users | length' "$TEMP_DIR/iam_users.json" 2>/dev/null || echo "0")
        echo "- **Total IAM Users:** $user_count" >> "$REPORT_FILE"
        
        # Check for users without MFA
        echo "" >> "$REPORT_FILE"
        echo "### Users Without MFA" >> "$REPORT_FILE"
        
        local users_without_mfa=0
        jq -r '.Users[].UserName' "$TEMP_DIR/iam_users.json" 2>/dev/null | while read -r username; do
            if ! aws iam list-mfa-devices --user-name "$username" 2>/dev/null | jq -e '.MFADevices | length > 0' >/dev/null; then
                echo "- ⚠️  **$username** - No MFA enabled" >> "$REPORT_FILE"
                ((users_without_mfa++))
            fi
        done
        
        # Check for root account usage
        echo "" >> "$REPORT_FILE"
        echo "### Root Account" >> "$REPORT_FILE"
        
        local root_keys=$(aws iam get-account-summary --query 'SummaryMap.AccountAccessKeysPresent' --output text 2>/dev/null)
        if [[ "$root_keys" == "1" ]]; then
            echo "- 🚨 **CRITICAL:** Root account has active access keys" >> "$REPORT_FILE"
        else
            echo "- ✅ No root account access keys" >> "$REPORT_FILE"
        fi
        
        # Check password policy
        echo "" >> "$REPORT_FILE"
        echo "### Password Policy" >> "$REPORT_FILE"
        
        if aws iam get-account-password-policy &>/dev/null; then
            aws iam get-account-password-policy --output json > "$TEMP_DIR/password_policy.json" 2>/dev/null
            echo "- ✅ Password policy configured" >> "$REPORT_FILE"
            echo "\`\`\`json" >> "$REPORT_FILE"
            jq '.' "$TEMP_DIR/password_policy.json" >> "$REPORT_FILE"
            echo "\`\`\`" >> "$REPORT_FILE"
        else
            echo "- ⚠️  **No password policy configured**" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan EC2
scan_ec2() {
    echo -e "${BLUE}🔍 Scanning EC2 instances...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## EC2 Security

### EC2 Instances
EOF
    
    aws ec2 describe-instances --output json > "$TEMP_DIR/ec2_instances.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local instance_count=$(jq -r '.Reservations[].Instances | length' "$TEMP_DIR/ec2_instances.json" 2>/dev/null | awk '{s+=$1} END {print s}')
        echo "- **Total EC2 Instances:** ${instance_count:-0}" >> "$REPORT_FILE"
        
        # Check for public instances
        echo "" >> "$REPORT_FILE"
        echo "### Public Instances" >> "$REPORT_FILE"
        
        jq -r '.Reservations[].Instances[] | select(.PublicIpAddress != null) | "- \(.InstanceId) - \(.PublicIpAddress) - \(.State.Name)"' \
            "$TEMP_DIR/ec2_instances.json" 2>/dev/null >> "$REPORT_FILE" || echo "None" >> "$REPORT_FILE"
        
        # Check for unencrypted volumes
        echo "" >> "$REPORT_FILE"
        echo "### Unencrypted EBS Volumes" >> "$REPORT_FILE"
        
        aws ec2 describe-volumes --filters Name=encrypted,Values=false --output json > "$TEMP_DIR/unencrypted_volumes.json" 2>/dev/null || true
        local unencrypted=$(jq -r '.Volumes | length' "$TEMP_DIR/unencrypted_volumes.json" 2>/dev/null || echo "0")
        
        if [[ "$unencrypted" -gt 0 ]]; then
            echo "- ⚠️  **Found $unencrypted unencrypted volumes**" >> "$REPORT_FILE"
            jq -r '.Volumes[] | "  - \(.VolumeId) (\(.Size)GB)"' "$TEMP_DIR/unencrypted_volumes.json" >> "$REPORT_FILE"
        else
            echo "- ✅ All volumes are encrypted" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan S3
scan_s3() {
    echo -e "${BLUE}🔍 Scanning S3 buckets...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## S3 Security

### S3 Buckets
EOF
    
    aws s3api list-buckets --output json > "$TEMP_DIR/s3_buckets.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local bucket_count=$(jq -r '.Buckets | length' "$TEMP_DIR/s3_buckets.json" 2>/dev/null || echo "0")
        echo "- **Total S3 Buckets:** $bucket_count" >> "$REPORT_FILE"
        
        echo "" >> "$REPORT_FILE"
        echo "### Public Buckets" >> "$REPORT_FILE"
        
        jq -r '.Buckets[].Name' "$TEMP_DIR/s3_buckets.json" 2>/dev/null | while read -r bucket; do
            # Check public access block
            if aws s3api get-public-access-block --bucket "$bucket" &>/dev/null; then
                local block=$(aws s3api get-public-access-block --bucket "$bucket" 2>/dev/null | jq -r '.PublicAccessBlockConfiguration.BlockPublicAcls')
                if [[ "$block" != "true" ]]; then
                    echo "- ⚠️  **$bucket** - Public access not fully blocked" >> "$REPORT_FILE"
                fi
            else
                echo "- 🚨 **$bucket** - No public access block configured" >> "$REPORT_FILE"
            fi
            
            # Check encryption
            if ! aws s3api get-bucket-encryption --bucket "$bucket" &>/dev/null; then
                echo "- ⚠️  **$bucket** - No default encryption" >> "$REPORT_FILE"
            fi
        done
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan Security Groups
scan_security_groups() {
    echo -e "${BLUE}🔍 Scanning Security Groups...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## Security Groups

### Overly Permissive Rules
EOF
    
    aws ec2 describe-security-groups --output json > "$TEMP_DIR/security_groups.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        # Check for 0.0.0.0/0 ingress
        jq -r '.SecurityGroups[] | select(.IpPermissions[].IpRanges[].CidrIp == "0.0.0.0/0") | 
            "- ⚠️  **\(.GroupId)** (\(.GroupName)) - Allows traffic from anywhere on port \(.IpPermissions[].FromPort // "all")"' \
            "$TEMP_DIR/security_groups.json" 2>/dev/null >> "$REPORT_FILE" || echo "None found" >> "$REPORT_FILE"
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan VPC
scan_vpc() {
    echo -e "${BLUE}🔍 Scanning VPCs...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## VPC Security

### VPCs
EOF
    
    aws ec2 describe-vpcs --output json > "$TEMP_DIR/vpcs.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local vpc_count=$(jq -r '.Vpcs | length' "$TEMP_DIR/vpcs.json" 2>/dev/null || echo "0")
        echo "- **Total VPCs:** $vpc_count" >> "$REPORT_FILE"
        
        # Check flow logs
        echo "" >> "$REPORT_FILE"
        echo "### VPC Flow Logs" >> "$REPORT_FILE"
        
        jq -r '.Vpcs[].VpcId' "$TEMP_DIR/vpcs.json" 2>/dev/null | while read -r vpc; do
            if ! aws ec2 describe-flow-logs --filter Name=resource-id,Values="$vpc" 2>/dev/null | jq -e '.FlowLogs | length > 0' >/dev/null; then
                echo "- ⚠️  **$vpc** - No flow logs enabled" >> "$REPORT_FILE"
            fi
        done
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan RDS
scan_rds() {
    echo -e "${BLUE}🔍 Scanning RDS instances...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## RDS Security

### RDS Instances
EOF
    
    aws rds describe-db-instances --output json > "$TEMP_DIR/rds_instances.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local rds_count=$(jq -r '.DBInstances | length' "$TEMP_DIR/rds_instances.json" 2>/dev/null || echo "0")
        echo "- **Total RDS Instances:** $rds_count" >> "$REPORT_FILE"
        
        if [[ "$rds_count" -gt 0 ]]; then
            echo "" >> "$REPORT_FILE"
            echo "### Security Issues" >> "$REPORT_FILE"
            
            # Check public accessibility
            jq -r '.DBInstances[] | select(.PubliclyAccessible == true) | 
                "- 🚨 **\(.DBInstanceIdentifier)** - Publicly accessible"' \
                "$TEMP_DIR/rds_instances.json" >> "$REPORT_FILE" 2>/dev/null
            
            # Check encryption
            jq -r '.DBInstances[] | select(.StorageEncrypted == false) | 
                "- ⚠️  **\(.DBInstanceIdentifier)** - Storage not encrypted"' \
                "$TEMP_DIR/rds_instances.json" >> "$REPORT_FILE" 2>/dev/null
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
}

# Scan CloudTrail
scan_cloudtrail() {
    echo -e "${BLUE}🔍 Scanning CloudTrail...${NC}"
    
    cat >> "$REPORT_FILE" << EOF
## CloudTrail

### Trail Status
EOF
    
    aws cloudtrail describe-trails --output json > "$TEMP_DIR/cloudtrail.json" 2>/dev/null || true
    
    if command -v jq &>/dev/null; then
        local trail_count=$(jq -r '.trailList | length' "$TEMP_DIR/cloudtrail.json" 2>/dev/null || echo "0")
        
        if [[ "$trail_count" -eq 0 ]]; then
            echo "- 🚨 **CRITICAL: No CloudTrail trails configured**" >> "$REPORT_FILE"
        else
            echo "- ✅ CloudTrail trails found: $trail_count" >> "$REPORT_FILE"
            
            # Check if multi-region
            local multi_region=$(jq -r '.trailList[] | select(.IsMultiRegionTrail == true) | .Name' "$TEMP_DIR/cloudtrail.json" 2>/dev/null | wc -l)
            if [[ "$multi_region" -eq 0 ]]; then
                echo "- ⚠️  No multi-region trails configured" >> "$REPORT_FILE"
            fi
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
    
    local ai_response=$(ollama run llama3.1:8b "You are an AWS security expert. Analyze this AWS security audit report and provide:
1. Top 3 critical security issues that need immediate attention
2. Compliance concerns (GDPR, PCI-DSS, SOC2)
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
1. Enable MFA for all IAM users
2. Remove root account access keys if present
3. Enable encryption for all unencrypted EBS volumes and RDS instances
4. Configure VPC flow logs for all VPCs
5. Enable CloudTrail in all regions

### Medium Priority
1. Review and restrict overly permissive security group rules
2. Block public access to S3 buckets unless required
3. Configure password policy with strong requirements
4. Enable S3 bucket encryption by default
5. Review IAM policies and follow principle of least privilege

### Best Practices
1. Regularly rotate access keys
2. Use AWS Organizations for multi-account management
3. Enable AWS Config for compliance monitoring
4. Set up AWS GuardDuty for threat detection
5. Implement automated backup strategies

---

**Report generated by AI Security Scanner**
EOF
}

# Main function
main() {
    echo -e "${GREEN}🛡️  AWS Security Scanner${NC}\n"
    
    # Checks
    check_dependencies
    check_aws_credentials
    
    echo ""
    echo -e "${BLUE}Starting AWS security audit...${NC}\n"
    
    # Initialize
    init_report
    
    # Run scans
    scan_iam
    scan_ec2
    scan_s3
    scan_security_groups
    scan_vpc
    scan_rds
    scan_cloudtrail
    
    # AI analysis
    ai_analysis
    
    # Recommendations
    generate_recommendations
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    echo ""
    echo -e "${GREEN}✅ AWS security audit complete!${NC}"
    echo -e "${BLUE}📄 Report: $REPORT_FILE${NC}\n"
    
    # Display summary
    if command -v jq &>/dev/null; then
        echo -e "${CYAN}Summary:${NC}"
        grep -E "^- \*\*|^- 🚨|^- ⚠️|^- ✅" "$REPORT_FILE" | head -20
    fi
}

# Run
main "$@"
