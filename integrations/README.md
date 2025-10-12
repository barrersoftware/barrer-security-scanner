# AI Security Scanner - Integrations 🔔

Send security scan notifications and alerts to Slack, Discord, and Microsoft Teams. Keep your team informed about security status in real-time.

## Features

- 🔔 **Multi-Platform Support** - Slack, Discord, and Microsoft Teams
- 🎨 **Rich Formatting** - Color-coded severity levels with emojis
- 📄 **Report Attachments** - Send full security reports directly
- ⚡ **Automatic Notifications** - Auto-notify on scan completion
- ⚙️ **Flexible Configuration** - Per-platform or broadcast to all
- 🛡️ **Severity Levels** - Critical, warning, info, success

## Quick Start

### 1. Setup

Run the interactive setup wizard:

```bash
cd integrations
./setup-integrations.sh
```

This will guide you through configuring webhooks for each platform.

### 2. Send Your First Notification

```bash
./notify.sh --platform slack --message "Security scanner is now integrated!"
```

### 3. Enable Automatic Notifications

Run scans with auto-notification:

```bash
./auto-notify.sh comprehensive
```

## Manual Configuration

Create `~/.ai-security-scanner/integrations.conf`:

```bash
# Slack webhook URL
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"

# Discord webhook URL
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY"

# Microsoft Teams webhook URL
TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/XXX/YYY"

# Default platform (slack|discord|teams|all)
DEFAULT_PLATFORM="slack"

# Enable/disable notifications
NOTIFICATIONS_ENABLED="true"
```

## Getting Webhook URLs

### Slack

1. Go to https://api.slack.com/apps
2. Create a new app or select existing
3. Navigate to "Incoming Webhooks"
4. Activate and add new webhook
5. Copy the webhook URL

### Discord

1. Open Discord → Server Settings
2. Click "Integrations" → "Webhooks"
3. Click "Create Webhook"
4. Choose channel and copy URL

### Microsoft Teams

1. Open Teams → Channel
2. Click "..." → "Connectors"
3. Search "Incoming Webhook"
4. Configure and copy URL

## Usage

### Basic Notification

```bash
./notify.sh \
    --platform slack \
    --message "Security scan completed successfully"
```

### With Severity Level

```bash
./notify.sh \
    --platform discord \
    --title "Critical Alert" \
    --message "Intrusion attempt detected from IP 192.168.1.100" \
    --severity critical
```

### Send Report File

```bash
./notify.sh \
    --platform all \
    --title "Daily Security Report" \
    --file ~/security-reports/security_analysis_20250112.md \
    --severity warning
```

### Multiple Platforms

```bash
# Send to all configured platforms
./notify.sh --platform all --message "System update completed"
```

## Automatic Notifications

Wrap your scans to automatically send notifications:

```bash
# Comprehensive scan with auto-notification
./auto-notify.sh comprehensive

# Code review with auto-notification
./auto-notify.sh code-review /path/to/code

# Security monitoring with alerts
./auto-notify.sh monitor
```

### Environment Variables

```bash
# Choose platform
NOTIFY_PLATFORM=discord ./auto-notify.sh comprehensive

# Disable success notifications
NOTIFY_ON_SUCCESS=false ./auto-notify.sh comprehensive

# Disable error notifications
NOTIFY_ON_ERROR=false ./auto-notify.sh comprehensive
```

## Scheduled Notifications

Add to crontab for automated security alerts:

```bash
crontab -e
```

Add these lines:

```cron
# Daily comprehensive scan at 3:30 AM with Slack notification
30 3 * * * cd /path/to/ai-security-scanner && ./integrations/auto-notify.sh comprehensive

# Hourly monitoring alerts to Discord
0 * * * * cd /path/to/ai-security-scanner && NOTIFY_PLATFORM=discord ./integrations/auto-notify.sh monitor

# Weekly code review (Sundays at 8 PM) to all platforms
0 20 * * 0 cd /path/to/ai-security-scanner && NOTIFY_PLATFORM=all ./integrations/auto-notify.sh code-review /var/www
```

## Severity Levels

Notifications support different severity levels with color coding:

| Severity | Color | Emoji | Use Case |
|----------|-------|-------|----------|
| `critical` | Red | 🚨 | Security breaches, intrusions |
| `warning` | Orange | ⚠️ | Vulnerabilities, misconfigurations |
| `info` | Blue | ℹ️ | General information, updates |
| `success` | Green | ✅ | Successful scans, fixes applied |

## Examples

### Daily Security Summary

```bash
#!/bin/bash
# daily-security-summary.sh

cd /path/to/ai-security-scanner

# Run comprehensive scan
./scripts/security-scanner.sh

# Find latest report
LATEST_REPORT=$(ls -t ~/security-reports/security_analysis_*.md | head -1)

# Extract critical findings count
CRITICAL_COUNT=$(grep -c "CRITICAL" "$LATEST_REPORT" || echo "0")

# Determine severity
if [ "$CRITICAL_COUNT" -gt 0 ]; then
    SEVERITY="critical"
    TITLE="⚠️ Daily Security Report - $CRITICAL_COUNT Critical Issues"
elif [ "$CRITICAL_COUNT" -gt 5 ]; then
    SEVERITY="warning"
    TITLE="⚠️ Daily Security Report - Issues Found"
else
    SEVERITY="success"
    TITLE="✅ Daily Security Report - All Clear"
fi

# Send notification
./integrations/notify.sh \
    --platform all \
    --title "$TITLE" \
    --file "$LATEST_REPORT" \
    --severity "$SEVERITY"
```

### Failed Login Alert

```bash
#!/bin/bash
# monitor-failed-logins.sh

FAILED_LOGINS=$(grep "Failed password" /var/log/auth.log | tail -10)

if [ -n "$FAILED_LOGINS" ]; then
    ./integrations/notify.sh \
        --platform slack \
        --title "🚨 Failed Login Attempts Detected" \
        --message "$FAILED_LOGINS" \
        --severity critical
fi
```

### System Update Notification

```bash
#!/bin/bash
# after-system-update.sh

./integrations/notify.sh \
    --platform teams \
    --title "System Updated" \
    --message "Server $(hostname) has been updated and rebooted. Running security scan..." \
    --severity info

# Run post-update security scan
./integrations/auto-notify.sh comprehensive
```

## Integration with Web UI

The Web UI can also trigger notifications. Add webhook support in the Web UI by:

1. Install the integration module in web-ui:
```bash
cd web-ui
npm install
```

2. Configure webhooks in the Web UI settings
3. Enable auto-notifications for scan completions

## Troubleshooting

### Notifications Not Sending

1. **Check configuration**:
```bash
cat ~/.ai-security-scanner/integrations.conf
```

2. **Test webhook manually**:
```bash
curl -X POST YOUR_WEBHOOK_URL \
    -H "Content-Type: application/json" \
    -d '{"text":"Test message"}'
```

3. **Check notifications are enabled**:
```bash
grep NOTIFICATIONS_ENABLED ~/.ai-security-scanner/integrations.conf
```

### Webhook URL Invalid

- Ensure no extra spaces or quotes in webhook URL
- Verify webhook is still active in platform settings
- Regenerate webhook if necessary

### Message Too Long

Reports are automatically truncated:
- Slack: 2000 characters
- Discord: 4000 characters
- Teams: 3000 characters

For full reports, use file attachments or link to Web UI.

## Security Best Practices

1. **Protect Configuration File**:
```bash
chmod 600 ~/.ai-security-scanner/integrations.conf
```

2. **Rotate Webhooks Regularly** - Regenerate webhook URLs periodically

3. **Use Private Channels** - Send security alerts to private/restricted channels

4. **Limit Webhook Permissions** - Only grant necessary permissions

5. **Monitor Webhook Usage** - Check for unauthorized usage

## Advanced Usage

### Custom Formatting

Edit `notify.sh` to customize message format:

```bash
# Around line 150 in notify.sh
local payload=$(cat <<EOF
{
    "text": "Custom formatted message",
    "attachments": [...]
}
EOF
)
```

### Conditional Notifications

```bash
# Only notify on critical findings
CRITICAL_FOUND=$(grep -c "CRITICAL" report.md)
if [ "$CRITICAL_FOUND" -gt 0 ]; then
    ./notify.sh --platform all --message "Critical issues found!" --severity critical
fi
```

### Multiple Webhooks

Create separate config files:

```bash
# Production team
INTEGRATIONS_CONF=~/.ai-security-scanner/prod-team.conf ./notify.sh --message "Prod scan"

# Dev team
INTEGRATIONS_CONF=~/.ai-security-scanner/dev-team.conf ./notify.sh --message "Dev scan"
```

## Rate Limits

Be aware of platform rate limits:

- **Slack**: 1 message per second
- **Discord**: 30 messages per 60 seconds
- **Teams**: 4 messages per second

For high-frequency monitoring, consider batching notifications.

## API Reference

### notify.sh Options

| Option | Required | Description |
|--------|----------|-------------|
| `-p, --platform` | Yes | Platform (slack\|discord\|teams\|all) |
| `-m, --message` | Yes* | Message text |
| `-f, --file` | No | File to attach/send |
| `-s, --severity` | No | Severity level (default: info) |
| `-t, --title` | No | Notification title |
| `-c, --config` | No | Show configuration guide |
| `-h, --help` | No | Show help |

*Required unless file is provided

### auto-notify.sh Arguments

```bash
./auto-notify.sh <scan-type> [scan-arguments]
```

Scan types: `comprehensive`, `code-review`, `monitor`

## Contributing

Want to add more platforms? Check [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Possible additions:
- Email notifications
- PagerDuty integration
- SMS via Twilio
- Custom webhooks
- Telegram bot

## License

MIT License - see [LICENSE](../LICENSE) file

## Support

- Issues: [GitHub Issues](https://github.com/ssfdre38/ai-security-scanner/issues)
- Discussions: [GitHub Discussions](https://github.com/ssfdre38/ai-security-scanner/discussions)

---

**Stay secure and stay notified!** 🔔🛡️
