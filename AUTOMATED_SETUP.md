# Automated Setup Guide

The AI Security Scanner now supports fully automated, non-interactive deployment with command-line flags.

## Quick Start

### Basic Automated Installation
```bash
sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix
```

### With Let's Encrypt SSL
```bash
sudo bash setup-noninteractive.sh --auto \
  --ssl-mode letsencrypt \
  --domain your-domain.com \
  --email admin@your-domain.com \
  --postfix-mode internet
```

### With Self-Signed SSL
```bash
sudo bash setup-noninteractive.sh --auto \
  --ssl-mode selfsigned \
  --skip-postfix
```

## Command-Line Options

| Flag | Description | Example |
|------|-------------|---------|
| `-a, --auto` | Enable automatic mode (no prompts) | `--auto` |
| `-s, --skip-ssl` | Skip SSL setup | `--skip-ssl` |
| `-p, --skip-postfix` | Skip Postfix mail server setup | `--skip-postfix` |
| `--ssl-mode MODE` | SSL configuration mode | `--ssl-mode letsencrypt` |
| `--domain DOMAIN` | Domain name for Let's Encrypt | `--domain example.com` |
| `--email EMAIL` | Email for Let's Encrypt | `--email admin@example.com` |
| `--port PORT` | Server port (default: 3001) | `--port 8080` |
| `--postfix-mode MODE` | Postfix configuration mode | `--postfix-mode local` |
| `-h, --help` | Show help message | `--help` |

## SSL Modes

- **letsencrypt**: Automatic SSL with Let's Encrypt (requires domain and email)
- **selfsigned**: Self-signed certificate for testing
- **existing**: Use existing certificates
- **skip**: No SSL configuration

## Postfix Modes

- **local**: Local mail delivery only (default)
- **internet**: Full internet mail server
- **smarthost**: Relay through another mail server
- **satellite**: Send all mail to another server
- **none**: Skip Postfix installation

## Deployment Examples

### Production Deployment
```bash
sudo bash setup-noninteractive.sh --auto \
  --ssl-mode letsencrypt \
  --domain scanner.example.com \
  --email security@example.com \
  --postfix-mode internet \
  --port 443
```

### Testing/Development
```bash
sudo bash setup-noninteractive.sh --auto \
  --skip-ssl \
  --skip-postfix \
  --port 3001
```

### Docker/Container Deployment
```bash
# Minimal setup for containerized environments
sudo bash setup-noninteractive.sh --auto \
  --skip-ssl \
  --skip-postfix
```

### CI/CD Pipeline
```bash
#!/bin/bash
# Automated deployment script for CI/CD

# Install dependencies
apt-get update
apt-get install -y curl git

# Run automated setup
curl -fsSL https://raw.githubusercontent.com/your-repo/ai-security-scanner/main/setup-noninteractive.sh | \
  sudo bash -s -- --auto --skip-ssl --skip-postfix
```

## Remote Deployment

### SSH Deployment
```bash
# Deploy to remote server
ssh user@remote-server 'bash -s' < setup-noninteractive.sh -- --auto --skip-ssl --skip-postfix
```

### With rsync
```bash
# Copy files first
rsync -avz --exclude 'node_modules' ai-security-scanner/ user@remote:/opt/scanner/

# Run setup
ssh user@remote 'cd /opt/scanner && sudo bash setup-noninteractive.sh --auto --skip-ssl --skip-postfix'
```

## Environment Variables

You can also use environment variables instead of flags:

```bash
export AUTO_MODE=true
export SKIP_SSL=true
export SKIP_POSTFIX=true
export PORT=3001

sudo -E bash setup-noninteractive.sh
```

## Systemd Service

The script automatically creates a systemd service:

```bash
# Check status
systemctl status ai-security-scanner

# Start/Stop/Restart
systemctl start ai-security-scanner
systemctl stop ai-security-scanner
systemctl restart ai-security-scanner

# Enable/Disable autostart
systemctl enable ai-security-scanner
systemctl disable ai-security-scanner

# View logs
journalctl -u ai-security-scanner -f
```

## Troubleshooting

### Check Installation Logs
```bash
# View service logs
journalctl -u ai-security-scanner -n 100

# Check server log
tail -f /home/ubuntu/ai-security-scanner/web-ui/server.log
```

### Manual Start (for debugging)
```bash
cd /home/ubuntu/ai-security-scanner/web-ui
node server.js
```

### Verify Installation
```bash
# Check if service is running
systemctl status ai-security-scanner

# Test API endpoint
curl http://localhost:3001/

# Check open ports
netstat -tlnp | grep 3001
```

## Security Notes

1. **Change default credentials immediately** after installation
2. **Use Let's Encrypt** for production deployments
3. **Configure firewall** to restrict access
4. **Enable Postfix** only if you need mail functionality
5. **Run security audit** after installation

## Integration with Configuration Management

### Ansible
```yaml
- name: Deploy AI Security Scanner
  shell: |
    bash /tmp/setup-noninteractive.sh --auto \
      --ssl-mode selfsigned \
      --skip-postfix
  become: yes
```

### Terraform
```hcl
resource "null_resource" "ai_scanner" {
  provisioner "remote-exec" {
    inline = [
      "curl -fsSL https://your-repo/setup-noninteractive.sh | sudo bash -s -- --auto --skip-ssl --skip-postfix"
    ]
  }
}
```

### Chef/Puppet
Similar patterns can be applied for other configuration management tools.

## Comparison: Interactive vs Non-Interactive

| Feature | Interactive (`setup.sh`) | Non-Interactive (`setup-noninteractive.sh`) |
|---------|-------------------------|---------------------------------------------|
| User Prompts | Yes | No |
| Command-line Flags | No | Yes |
| CI/CD Friendly | No | Yes |
| Postfix Config | Interactive | Pre-configured |
| SSL Setup | Interactive | Automated |
| Best For | Manual setup | Automation, Testing |

## Support

For issues or questions:
- Check logs: `journalctl -u ai-security-scanner`
- Review documentation: `/docs`
- Open an issue on GitHub
