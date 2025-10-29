# Multi-Server Security Scanning 🖥️

Scan multiple servers from a central location using SSH. Perfect for managing security across your infrastructure from a single control point.

## Features

- 🔄 **Parallel Scanning** - Scan multiple servers simultaneously
- 📋 **YAML Inventory** - Easy server management with groups and tags
- 🎯 **Flexible Targeting** - Scan by server name, group, or tags
- 📊 **Consolidated Reports** - Aggregate results from all servers
- 🔔 **Auto-Notifications** - Integrates with Slack/Discord/Teams
- 🔐 **SSH Key Authentication** - Secure remote access
- ⚡ **GNU Parallel** - Efficient parallel execution

## Quick Start

### 1. Setup

```bash
cd multi-server

# Copy example inventory
cp servers.yaml.example servers.yaml

# Edit with your servers
nano servers.yaml
```

### 2. Configure SSH Keys

Ensure you have SSH key access to your servers:

```bash
# Generate SSH key if needed
ssh-keygen -t rsa -b 4096

# Copy to servers
ssh-copy-id user@server1
ssh-copy-id user@server2
```

### 3. Install Dependencies

```bash
# Ubuntu/Debian
sudo apt install openssh-client parallel

# RHEL/CentOS
sudo yum install openssh-clients parallel
```

### 4. Run Your First Scan

```bash
# Scan all production servers
./scan-servers.sh --group production

# Scan specific servers
./scan-servers.sh --servers web-prod-01,db-prod-01

# Scan with notifications
./scan-servers.sh --group production --notify --consolidated
```

## Server Inventory Configuration

### Basic Server Definition

```yaml
servers:
  - name: web-server-01
    host: 192.168.1.10
    user: ubuntu
    ssh_key: ~/.ssh/id_rsa
    port: 22
    tags:
      - production
      - web
    description: Production web server
```

### Server Groups

```yaml
groups:
  production:
    - web-server-01
    - api-server-01
    - db-server-01
  
  development:
    - dev-server-01
    - test-server-01
```

### Scan Configuration

```yaml
scan_config:
  parallel: true
  max_concurrent: 4
  ssh_timeout: 30
  reports_dir: ~/security-reports/multi-server
  consolidated_report: true
  notify_on_completion: true
```

## Usage

### Scan All Servers

```bash
./scan-servers.sh
```

### Scan by Group

```bash
# Production servers
./scan-servers.sh --group production

# Development servers
./scan-servers.sh --group development
```

### Scan by Tags

```bash
# All critical servers
./scan-servers.sh --tags critical

# All web servers
./scan-servers.sh --tags web
```

### Scan Specific Servers

```bash
./scan-servers.sh --servers web-01,web-02,db-01
```

### Parallel Execution

```bash
# Scan 8 servers concurrently
./scan-servers.sh --group production --parallel 8

# Quick scan mode
./scan-servers.sh --group all --quick
```

### With Notifications

```bash
# Send notification on completion
./scan-servers.sh --group production --notify

# Generate consolidated report
./scan-servers.sh --group all --consolidated --notify
```

## Advanced Usage

### Custom Reports Directory

```bash
./scan-servers.sh --group production --reports /custom/path
```

### Environment Variables

```bash
# Custom inventory file
INVENTORY_FILE=~/my-servers.yaml ./scan-servers.sh --group production

# Custom reports directory
REPORTS_DIR=~/my-reports ./scan-servers.sh --all
```

### Scheduled Scans

Add to crontab for automated scanning:

```cron
# Daily scan of production servers at 2 AM
0 2 * * * cd /path/to/multi-server && ./scan-servers.sh --group production --notify

# Weekly comprehensive scan on Sunday at 3 AM
0 3 * * 0 cd /path/to/multi-server && ./scan-servers.sh --all --consolidated --notify
```

## Reports

### Individual Server Reports

Each server generates its own report:
- `~/security-reports/multi-server/servername_report.md`
- `~/security-reports/multi-server/servername_scan.log`

### Consolidated Report

When using `--consolidated`, generates:
- Aggregate summary of all scans
- Success/failure statistics
- Key findings from each server
- Recommendations across infrastructure

### Scan Status Log

`scan_status.log` tracks:
- SUCCESS:servername:duration
- FAILED:servername:reason

## Examples

### Example 1: Production Infrastructure Audit

```bash
#!/bin/bash
# production-audit.sh

cd /path/to/multi-server

# Scan all production servers
./scan-servers.sh \
    --group production \
    --parallel 6 \
    --consolidated \
    --notify

# Email reports to security team
LATEST_REPORT=$(ls -t ~/security-reports/multi-server/consolidated_*.md | head -1)
mail -s "Production Security Audit" security@company.com < "$LATEST_REPORT"
```

### Example 2: Weekly Compliance Check

```bash
#!/bin/bash
# weekly-compliance.sh

# Scan all servers with comprehensive reports
./scan-servers.sh \
    --all \
    --parallel 10 \
    --consolidated \
    --notify

# Upload to compliance dashboard
cp ~/security-reports/multi-server/consolidated_*.md /compliance/reports/
```

### Example 3: Emergency Security Scan

```bash
#!/bin/bash
# emergency-scan.sh

# Quick scan of all critical servers
./scan-servers.sh \
    --tags critical \
    --quick \
    --parallel 12 \
    --notify \
    --reports /tmp/emergency-scan
```

## Troubleshooting

### SSH Connection Failures

```bash
# Test connectivity manually
ssh -i ~/.ssh/id_rsa user@host "echo ok"

# Check SSH key permissions
chmod 600 ~/.ssh/id_rsa

# Verify server in known_hosts
ssh-keyscan host >> ~/.ssh/known_hosts
```

### Permission Denied

Ensure your user has sudo privileges on remote servers:

```bash
# Add to sudoers on remote server
echo "username ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/username
```

### Parallel Not Working

```bash
# Install GNU Parallel
sudo apt install parallel

# Accept citation notice
parallel --citation
```

### Report Not Generated

Check scan logs:

```bash
cat ~/security-reports/multi-server/servername_scan.log
```

## Security Best Practices

1. **Use SSH Keys** - Never use password authentication
2. **Restrict SSH Access** - Limit source IPs in firewall
3. **Dedicated Scan User** - Create specific user for security scans
4. **Key Rotation** - Regularly rotate SSH keys
5. **Audit Logging** - Enable audit logs on scanned servers
6. **Secure Reports** - Encrypt reports directory
7. **Network Segmentation** - Run scanner from isolated management network

## Integration

### With Notifications

```bash
# Automatic Slack notification on completion
./scan-servers.sh --group production --notify
```

### With Web UI

The Web UI can display multi-server scan results:

```bash
# Reports automatically appear in Web UI dashboard
# Access at http://localhost:3000/reports
```

### With SIEM

Forward reports to SIEM:

```bash
#!/bin/bash
# Forward to Splunk
for report in ~/security-reports/multi-server/*_report.md; do
    curl -k https://splunk:8088/services/collector \
        -H "Authorization: Splunk $TOKEN" \
        -d "{\"event\": $(cat $report | jq -Rs .)}"
done
```

## Performance

- **Small Environment** (10 servers): ~5-10 minutes with 4 parallel jobs
- **Medium Environment** (50 servers): ~15-30 minutes with 8 parallel jobs
- **Large Environment** (200+ servers): ~1-2 hours with 16 parallel jobs

### Optimization Tips

1. Increase parallel jobs: `--parallel 16`
2. Use quick scan mode: `--quick`
3. Scan by priority groups first
4. Use local LAN connections when possible
5. Schedule during off-peak hours

## Architecture

```
┌─────────────────┐
│ Control Server  │
│  (Scanner runs  │
│   here)         │
└────────┬────────┘
         │
         ├─────SSH────┐
         │            │
    ┌────▼─────┐  ┌──▼────────┐
    │ Server 1 │  │ Server 2  │
    │          │  │           │
    └──────────┘  └───────────┘
         │            │
         └──Reports───┘
              │
         Consolidated
```

## Comparison

| Feature | Single Server | Multi-Server |
|---------|--------------|--------------|
| Servers | 1 | Unlimited |
| Parallel | No | Yes |
| Groups | N/A | Yes |
| Tags | N/A | Yes |
| Consolidated | No | Yes |
| Time (10 servers) | 50min | 12min |

## Contributing

Want to add features?

- [ ] Support for Windows servers (WinRM)
- [ ] Agent-based scanning (no SSH needed)
- [ ] Real-time monitoring dashboard
- [ ] Diff reports (compare over time)
- [ ] Ansible integration
- [ ] Terraform inventory import

## License

MIT License - see LICENSE file

## Support

- Issues: [GitHub Issues](https://github.com/barrersoftware/ai-security-scanner/issues)
- Discussions: [GitHub Discussions](https://github.com/barrersoftware/ai-security-scanner/discussions)

---

**Centralize your security scanning!** 🖥️🔐
