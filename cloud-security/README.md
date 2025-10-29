# Cloud Security Scanning ☁️

Comprehensive security audits for AWS, GCP, and Azure. Scan your cloud infrastructure for misconfigurations, security issues, and compliance violations.

## Features

- ☁️ **Multi-Cloud Support** - AWS, GCP, Azure
- 🔍 **Comprehensive Audits** - IAM, compute, storage, networking, databases
- 🤖 **AI Analysis** - Powered by local LLMs for intelligent recommendations
- 📊 **Detailed Reports** - Markdown reports with prioritized findings
- 🎨 **Color-Coded Issues** - Critical, warning, info severity levels
- 🔔 **Integration Ready** - Works with notification system

## Supported Services

### AWS
- IAM (users, roles, policies, MFA)
- EC2 (instances, security groups, volumes)
- S3 (buckets, encryption, public access)
- VPC (networking, flow logs)
- RDS (databases, encryption, public access)
- CloudTrail (audit logging)

### GCP
- IAM (policies, roles, public access)
- Compute Engine (VMs, secure boot)
- Cloud Storage (buckets, encryption, ACLs)
- VPC (firewall rules, networking)
- Cloud SQL (databases, SSL, backups)
- Cloud Logging (audit logs)

### Azure
- Azure AD (users, roles, MFA)
- Virtual Machines (instances, encryption)
- Storage Accounts (encryption, public access)
- Network Security Groups (firewall rules)
- SQL Databases (TDE, firewall, backups)
- Key Vault (secret management)
- Security Center (recommendations)

## Quick Start

### Prerequisites

Install cloud CLIs:

**AWS CLI:**
```bash
# Install
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure
aws configure
```

**GCP gcloud:**
```bash
# Install
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT
```

**Azure CLI:**
```bash
# Install
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Authenticate
az login
```

### Install jq (Required)

```bash
# Ubuntu/Debian
sudo apt install jq

# RHEL/CentOS
sudo yum install jq

# macOS
brew install jq
```

## Usage

### Scan Individual Clouds

```bash
cd cloud-security

# Scan AWS
./scan-aws.sh

# Scan GCP
./scan-gcp.sh

# Scan Azure
./scan-azure.sh
```

### Scan All Clouds

```bash
# Scan all configured cloud providers
./scan-all-clouds.sh --all

# Scan specific clouds
./scan-all-clouds.sh --aws --gcp

# Scan with notifications
./scan-all-clouds.sh --all --notify
```

## Reports

Reports are generated in:
`~/security-reports/`

- `aws_security_YYYYMMDD_HHMMSS.md`
- `gcp_security_YYYYMMDD_HHMMSS.md`
- `azure_security_YYYYMMDD_HHMMSS.md`

### Report Structure

1. **Executive Summary** - Overview of findings
2. **Service-by-Service Analysis** - Detailed checks
3. **AI Security Analysis** - AI-powered insights
4. **Recommendations** - Prioritized remediation steps

## Examples

### Example 1: AWS Security Audit

```bash
#!/bin/bash
# aws-audit.sh

cd /path/to/cloud-security

# Run AWS scan
./scan-aws.sh

# Get latest report
REPORT=$(ls -t ~/security-reports/aws_security_*.md | head -1)

# Send to team
../integrations/notify.sh \
    --platform slack \
    --title "AWS Security Audit Complete" \
    --file "$REPORT" \
    --severity warning
```

### Example 2: Multi-Cloud Compliance

```bash
#!/bin/bash
# multi-cloud-compliance.sh

# Scan all clouds
./scan-all-clouds.sh --all --notify

# Archive reports
DATE=$(date +%Y%m%d)
mkdir -p ~/compliance-archives/$DATE
cp ~/security-reports/*_security_*.md ~/compliance-archives/$DATE/

# Generate summary
cat ~/security-reports/*_security_*.md | \
    grep -E "CRITICAL|🚨" > ~/compliance-archives/$DATE/critical-findings.txt
```

### Example 3: Automated Daily Scan

```bash
#!/bin/bash
# daily-cloud-scan.sh

cd /path/to/cloud-security

# Scan AWS (most frequently used)
./scan-aws.sh

# Get latest report
REPORT=$(ls -t ~/security-reports/aws_security_*.md | head -1)

# Count critical findings
CRITICAL=$(grep -c "🚨" "$REPORT" || echo "0")

# Notify based on findings
if [ "$CRITICAL" -gt 0 ]; then
    SEVERITY="critical"
    MESSAGE="Found $CRITICAL critical security issues in AWS"
else
    SEVERITY="success"
    MESSAGE="AWS security audit complete - no critical issues"
fi

../integrations/notify.sh \
    --platform all \
    --title "Daily AWS Security Scan" \
    --message "$MESSAGE" \
    --severity "$SEVERITY"
```

## What Gets Scanned

### AWS Scanning Details

**IAM Security:**
- Users without MFA
- Root account access keys
- Password policy
- Overly permissive roles

**EC2 Security:**
- Public instances
- Unencrypted volumes
- Security groups with 0.0.0.0/0

**S3 Security:**
- Public buckets
- Unencrypted buckets
- Public access blocks

**RDS Security:**
- Publicly accessible databases
- Unencrypted storage
- Missing backups

**VPC Security:**
- Missing flow logs
- Overly permissive routing

**CloudTrail:**
- Missing trails
- Non-multi-region trails

### GCP Scanning Details

**IAM:**
- Public access (allUsers, allAuthenticatedUsers)
- Privileged role assignments (Owner, Editor)

**Compute:**
- Public IP addresses
- Instances without secure boot

**Storage:**
- Public buckets
- Unencrypted buckets

**Networking:**
- Firewall rules allowing 0.0.0.0/0

**Cloud SQL:**
- SSL not required
- Public IP addresses
- Missing backups

### Azure Scanning Details

**Azure AD:**
- MFA status
- Privileged role assignments

**VMs:**
- Unencrypted disks
- Public IPs

**Storage:**
- HTTPS not enforced
- Public blob access
- Unencrypted storage

**Networking:**
- Overly permissive NSG rules

**SQL:**
- Firewall allowing all IPs
- TDE not enabled

**Key Vault:**
- Soft delete not enabled
- Purge protection disabled

## AI Analysis

If Ollama is installed, each scan includes AI-powered analysis:

- **Critical Issue Identification** - AI highlights top 3 critical issues
- **Compliance Assessment** - GDPR, PCI-DSS, SOC2 concerns
- **Remediation Steps** - Detailed fix recommendations
- **Security Score** - Overall security rating (1-10)

## Scheduled Scans

### Daily AWS Scan

```cron
0 3 * * * cd /path/to/cloud-security && ./scan-aws.sh && ./scan-all-clouds.sh --aws --notify
```

### Weekly Multi-Cloud Audit

```cron
0 2 * * 0 cd /path/to/cloud-security && ./scan-all-clouds.sh --all --notify
```

### Monthly Compliance Report

```cron
0 1 1 * * cd /path/to/cloud-security && ./scan-all-clouds.sh --all && ../integrations/notify.sh --platform all --file ~/security-reports/*_security_*.md --severity info
```

## Troubleshooting

### AWS: Credentials Not Found

```bash
# Configure AWS credentials
aws configure

# Or use environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1
```

### GCP: Not Authenticated

```bash
# Login to GCP
gcloud auth login

# Set project
gcloud config set project your-project-id

# Verify
gcloud auth list
```

### Azure: Subscription Not Set

```bash
# Login
az login

# List subscriptions
az account list --output table

# Set subscription
az account set --subscription "subscription-name"
```

### jq: Command Not Found

```bash
sudo apt install jq
```

### Permission Denied

Ensure your cloud account has read permissions:

**AWS:** ReadOnlyAccess or SecurityAudit policy  
**GCP:** Viewer role or Security Reviewer  
**Azure:** Reader role or Security Reader

## Security & Compliance

### Read-Only Access

All scans are **read-only**:
- No resources are modified
- No data is deleted
- No configurations are changed

### Data Privacy

- Scans run entirely locally
- No data sent to third parties
- Reports stored on your system
- AI analysis uses local Ollama

### Compliance Mappings

**PCI-DSS:**
- Encryption requirements
- Access control
- Network segmentation

**HIPAA:**
- Encryption at rest/transit
- Audit logging
- Access controls

**SOC 2:**
- Security monitoring
- Access management
- Change management

**GDPR:**
- Data encryption
- Access controls
- Audit trails

## Integration

### With Web UI

Reports automatically appear in the Web UI dashboard:

```bash
# Start Web UI
cd ../web-ui
./start-web-ui.sh

# View reports at http://localhost:3000/reports
```

### With Notifications

```bash
# Automatic notification on scan completion
./scan-all-clouds.sh --all --notify
```

### With CI/CD

```yaml
# GitLab CI example
cloud-security-scan:
  script:
    - cd cloud-security
    - ./scan-aws.sh
    - ./scan-gcp.sh
    - ./scan-azure.sh
  artifacts:
    paths:
      - ~/security-reports/
```

## Performance

| Cloud | Services Scanned | Typical Duration |
|-------|------------------|------------------|
| AWS | 7+ services | 2-5 minutes |
| GCP | 6+ services | 2-4 minutes |
| Azure | 7+ services | 3-6 minutes |
| All 3 | 20+ services | 8-15 minutes |

*Duration depends on number of resources and API rate limits*

## Best Practices

1. **Schedule Regular Scans** - Weekly or daily automation
2. **Review Reports Promptly** - Address critical findings immediately
3. **Track Progress** - Compare reports over time
4. **Use Service Accounts** - Dedicated accounts for scanning
5. **Enable All Logging** - CloudTrail, Cloud Logging, Activity Log
6. **Implement Least Privilege** - Minimal permissions for resources
7. **Rotate Credentials** - Regular key rotation
8. **Multi-Region Coverage** - Scan all regions

## Advanced Usage

### Custom AWS Regions

```bash
# Set specific region
AWS_DEFAULT_REGION=eu-west-1 ./scan-aws.sh

# Scan multiple regions
for region in us-east-1 us-west-2 eu-west-1; do
    AWS_DEFAULT_REGION=$region ./scan-aws.sh
done
```

### GCP Multiple Projects

```bash
# Scan multiple projects
for project in project-1 project-2 project-3; do
    gcloud config set project $project
    ./scan-gcp.sh
done
```

### Azure Multiple Subscriptions

```bash
# Scan all subscriptions
az account list --query "[].id" -o tsv | while read sub; do
    az account set --subscription $sub
    ./scan-azure.sh
done
```

## Roadmap

Future enhancements:

- [ ] Multi-region scanning (AWS)
- [ ] Organization-wide scanning
- [ ] Cost optimization recommendations
- [ ] Terraform/CloudFormation integration
- [ ] Real-time monitoring mode
- [ ] Custom compliance frameworks
- [ ] Remediation automation
- [ ] Comparison with CIS benchmarks

## Contributing

Want to add cloud providers or services?

- [ ] Oracle Cloud Infrastructure (OCI)
- [ ] DigitalOcean
- [ ] Alibaba Cloud
- [ ] IBM Cloud

## License

MIT License - see LICENSE file

## Support

- Issues: [GitHub Issues](https://github.com/ssfdre38/ai-security-scanner/issues)
- Discussions: [GitHub Discussions](https://github.com/ssfdre38/ai-security-scanner/discussions)

---

**Secure your cloud infrastructure!** ☁️🔐
